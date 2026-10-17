import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { crearAdaptador, crearEstado, emitirEvento } from "./adaptador.ts";
import {
  crearClienteCore,
  type ClienteCore,
  type RespuestaBusqueda,
  type RespuestaConsulta,
  type RespuestaIdentidad,
} from "./cliente-core.ts";
import { errorNegocio, errorTransitorio, exito, fallo } from "../compartido/errores.ts";
import {
  ID_EN_ESTUDIO,
  ID_HOMONIMO_1,
  ID_HOMONIMO_2,
  ID_SOLICITANTE_UNICO,
} from "../mcp/datos-ejemplo.ts";
import { CORE_NO_SIMULADO } from "./core-no-simulado.ts";

/** Core falso que devuelve las respuestas dadas en orden y registra cada llamada. */
export function coreFalso(respuestas: RespuestaConsulta[]) {
  const llamadas: { idSolicitud: string; correlationId: string }[] = [];
  const core: ClienteCore = {
    ...CORE_NO_SIMULADO,
    async consultarSolicitud(idSolicitud, correlationId) {
      llamadas.push({ idSolicitud, correlationId });
      return respuestas[Math.min(llamadas.length - 1, respuestas.length - 1)]!;
    },
    async cerrar() {},
  };
  return { core, llamadas };
}

describe("adaptador: servidor MCP en el mismo proceso del agente", () => {
  it("expone consultar_solicitud sin correlationId en su entrada", () => {
    const { core } = coreFalso([exito({ solicitud: null })]);
    const adaptador = crearAdaptador({ core, estado: crearEstado(randomUUID()) });
    assert.equal(adaptador.servidor.type, "sdk");
    assert.equal(Object.keys(adaptador.herramientas)[0], "consultar_solicitud");
    assert.deepEqual(Object.keys(adaptador.herramientas.consultar_solicitud.esquema), [
      "idSolicitud",
    ]);
  });

  it("agrega el correlationId, llama al core y devuelve la respuesta en structuredContent", async () => {
    const correlationId = randomUUID();
    const respuesta = exito({ solicitud: null });
    const { core, llamadas } = coreFalso([respuesta]);
    const adaptador = crearAdaptador({ core, estado: crearEstado(correlationId) });
    const resultado = await adaptador.herramientas.consultar_solicitud.manejar({
      idSolicitud: ID_EN_ESTUDIO,
    });
    assert.deepEqual(llamadas, [{ idSolicitud: ID_EN_ESTUDIO, correlationId }]);
    assert.deepEqual(resultado.structuredContent, respuesta);
    assert.equal(resultado.isError, false);
  });

  it("con la conversación ya escalada no vuelve a llamar al core y devuelve transitorio_agotado", async () => {
    const correlationId = randomUUID();
    const estado = crearEstado(correlationId);
    estado.escalamiento = {
      motivo: "falla_transitoria_persistente",
      regla: "constitución, Principio VI · reintentos agotados",
      resultado: "escalada",
      correlationId,
      ts: new Date().toISOString(),
    };
    const esperas: number[] = [];
    const { core, llamadas } = coreFalso([exito({ solicitud: null })]);
    const adaptador = crearAdaptador({ core, estado, dormir: async (ms) => void esperas.push(ms) });
    const resultado = await adaptador.herramientas.consultar_solicitud.manejar({
      idSolicitud: ID_EN_ESTUDIO,
    });
    const contenido = resultado.structuredContent as { error: { codigo: string } };
    assert.equal(llamadas.length, 0);
    assert.deepEqual(esperas, []);
    assert.equal(resultado.isError, true);
    assert.equal(contenido.error.codigo, "transitorio_agotado");
  });
});

describe("adaptador: reintentos y escalamiento contra el servidor real (US3)", () => {
  async function conFalla(modo: string) {
    const core = await crearClienteCore({ env: { CREDIAGIL_FALLA: modo } });
    const estado = crearEstado(randomUUID());
    const esperas: number[] = [];
    const adaptador = crearAdaptador({
      core,
      estado,
      dormir: async (ms) => void esperas.push(ms),
      azar: () => 0.5,
    });
    return { core, estado, esperas, adaptador };
  }

  it("en una-vez: reintenta y devuelve la solicitud", async (t) => {
    const logs = capturarStderr(t);
    const { core, estado, esperas, adaptador } = await conFalla("una-vez");
    try {
      const resultado = await adaptador.herramientas.consultar_solicitud.manejar({
        idSolicitud: ID_EN_ESTUDIO,
      });
      const contenido = resultado.structuredContent as { ok: boolean };
      assert.equal(contenido.ok, true);
      assert.deepEqual(esperas, [500]);
      const llamadas = logs().filter((l) => l["evento"] === "llamada_core");
      assert.deepEqual(
        llamadas.map((l) => [l["intento"], l["resultado"]]),
        [
          [1, "core_no_disponible"],
          [2, "ok"],
        ],
      );
      assert.equal(estado.escalamiento, null);
    } finally {
      await core.cerrar();
    }
  });

  it("en siempre: 3 intentos, señal de escalamiento y transitorio_agotado no reintentable", async (t) => {
    const logs = capturarStderr(t);
    const { core, estado, esperas, adaptador } = await conFalla("siempre");
    try {
      const resultado = await adaptador.herramientas.consultar_solicitud.manejar({
        idSolicitud: ID_EN_ESTUDIO,
      });
      const contenido = resultado.structuredContent as {
        ok: boolean;
        error: { codigo: string; reintentable: boolean };
      };
      assert.equal(resultado.isError, true);
      assert.equal(contenido.error.codigo, "transitorio_agotado");
      assert.equal(contenido.error.reintentable, false);
      assert.deepEqual(esperas, [500, 1000]);
      assert.equal(logs().filter((l) => l["evento"] === "llamada_core").length, 3);

      const senal = estado.escalamiento;
      assert.ok(senal, "no quedó la señal en el estado");
      assert.equal(senal.motivo, "falla_transitoria_persistente");
      assert.equal(senal.herramienta, "consultar_solicitud");
      assert.equal(senal.intentos, 3);
      assert.equal(senal.ultimoError, "core_no_disponible");
      assert.equal(senal.resultado, "escalada");
      assert.equal(senal.correlationId, estado.correlationId);
      assert.match(senal.regla, /Principio VI/);

      const evento = logs().find((l) => l["evento"] === "escalamiento");
      assert.ok(evento, "no se registró el escalamiento");
      assert.equal(evento["motivo"], "falla_transitoria_persistente");
    } finally {
      await core.cerrar();
    }
  });
});

describe("adaptador: eventos de negocio (chat, US2)", () => {
  it("un estado nuevo empieza sin eventos", () => {
    assert.deepEqual(crearEstado(randomUUID()).eventos, []);
  });

  it("emitirEvento completa correlationId y ts, agrega el evento y lo registra", (t) => {
    const logs = capturarStderr(t);
    const correlationId = randomUUID();
    const estado = crearEstado(correlationId);
    const evento = emitirEvento(estado, {
      tipo: "bloqueo_por_regla",
      descripcion: "No podemos preaprobar automáticamente tu solicitud",
      motivo: "La cuota supera el máximo",
      regla: "Regla 2",
      valores: { cuota: 1250000 },
      siguientePaso: "Un analista revisará tu caso",
    });
    assert.equal(evento.correlationId, correlationId);
    assert.match(evento.ts, /^\d{4}-\d{2}-\d{2}T/);
    assert.deepEqual(estado.eventos, [evento]);
    const registro = logs().find((l) => l["evento"] === "evento_negocio");
    assert.ok(registro, "no se registró evento_negocio");
    assert.equal(registro["tipo"], "bloqueo_por_regla");
    assert.equal(registro["regla"], "Regla 2");
    assert.deepEqual(registro["valores"], { cuota: 1250000 });
    assert.equal(registro["correlationId"], correlationId);
  });

  it("emitirEvento lanza si el evento no cumple el catálogo, sin agregarlo", (t) => {
    capturarStderr(t);
    const estado = crearEstado(randomUUID());
    assert.throws(
      () =>
        emitirEvento(estado, {
          tipo: "preaprobacion",
          descripcion: "Preaprobada",
          motivo: "Cumple",
          regla: "Regla 2",
          valores: {},
        }),
      /evento inválido/,
    );
    assert.deepEqual(estado.eventos, []);
  });
});

describe("adaptador: observador de herramientas del modo de demostración (US2)", () => {
  it("recibe cada intento con herramienta, intento, resultado y categoría, sin argumentos", async (t) => {
    capturarStderr(t);
    const core = await crearClienteCore({ env: { CREDIAGIL_FALLA: "siempre" } });
    const infos: unknown[] = [];
    try {
      const adaptador = crearAdaptador({
        core,
        estado: crearEstado(randomUUID()),
        dormir: async () => {},
        azar: () => 0.5,
        alUsarHerramienta: (info) => void infos.push(info),
      });
      await adaptador.herramientas.consultar_solicitud.manejar({ idSolicitud: ID_EN_ESTUDIO });
    } finally {
      await core.cerrar();
    }
    assert.deepEqual(
      infos,
      [1, 2, 3].map((intento) => ({
        herramienta: "consultar_solicitud",
        intento,
        resultado: "core_no_disponible",
        categoria: "transitorio",
      })),
    );
  });

  it("un intento exitoso llega como ok, sin categoría", async (t) => {
    capturarStderr(t);
    const { core } = coreFalso([exito({ solicitud: null })]);
    const infos: unknown[] = [];
    const adaptador = crearAdaptador({
      core,
      estado: crearEstado(randomUUID()),
      alUsarHerramienta: (info) => void infos.push(info),
    });
    await adaptador.herramientas.consultar_solicitud.manejar({ idSolicitud: ID_EN_ESTUDIO });
    assert.deepEqual(infos, [{ herramienta: "consultar_solicitud", intento: 1, resultado: "ok" }]);
  });

  it("una excepción del observador se registra y no interrumpe la llamada", async (t) => {
    const logs = capturarStderr(t);
    const { core, llamadas } = coreFalso([exito({ solicitud: null })]);
    const adaptador = crearAdaptador({
      core,
      estado: crearEstado(randomUUID()),
      alUsarHerramienta: () => {
        throw new Error("pantalla rota");
      },
    });
    const resultado = await adaptador.herramientas.consultar_solicitud.manejar({
      idSolicitud: ID_EN_ESTUDIO,
    });
    assert.equal(resultado.isError, false);
    assert.equal(llamadas.length, 1);
    const error = logs().find((l) => l["evento"] === "error_observador");
    assert.ok(error, "no se registró el error del observador");
    assert.match(String(error["causa"]), /pantalla rota/);
  });
});

/** Core falso de identidad: devuelve las respuestas dadas en orden y registra cada llamada. */
function coreIdentidad({
  busquedas = [] as RespuestaBusqueda[],
  verificaciones = [] as RespuestaIdentidad[],
} = {}) {
  const llamadas: { metodo: string; argumentos: unknown[] }[] = [];
  const siguiente = <T>(lista: T[], metodo: string): T => {
    const n = llamadas.filter((l) => l.metodo === metodo).length;
    return lista[Math.min(n - 1, lista.length - 1)]!;
  };
  const core: ClienteCore = {
    ...CORE_NO_SIMULADO,
    async consultarSolicitud() {
      return exito({ solicitud: null });
    },
    async buscarSolicitante(...argumentos) {
      llamadas.push({ metodo: "buscarSolicitante", argumentos });
      return siguiente(busquedas, "buscarSolicitante");
    },
    async verificarIdentidad(...argumentos) {
      llamadas.push({ metodo: "verificarIdentidad", argumentos });
      return siguiente(verificaciones, "verificarIdentidad");
    },
    async cerrar() {},
  };
  return { core, llamadas };
}

const coincidenciaDe = (idSolicitante: string, nombre: string) => ({
  idSolicitante,
  nombre,
  documentoEnmascarado: "******0000",
});
const UNA = exito({ coincidencias: [coincidenciaDe(ID_SOLICITANTE_UNICO, "Ana Pérez Ficticia")] });
const NINGUNA = exito({ coincidencias: [] });
const HOMONIMOS = exito({
  coincidencias: [
    coincidenciaDe(ID_HOMONIMO_1, "Elena Martínez Inventada"),
    coincidenciaDe(ID_HOMONIMO_2, "Elena Martínez Inventada"),
  ],
});

describe("adaptador: buscar_solicitante (#9, US1)", () => {
  it("expone buscar_solicitante con documento y nombre, sin correlationId", () => {
    const { core } = coreIdentidad();
    const adaptador = crearAdaptador({ core, estado: crearEstado(randomUUID()) });
    assert.deepEqual(Object.keys(adaptador.herramientas.buscar_solicitante.esquema), [
      "documento",
      "nombre",
    ]);
  });

  it("llama al core con el criterio y el correlationId de la conversación", async (t) => {
    capturarStderr(t);
    const correlationId = randomUUID();
    const { core, llamadas } = coreIdentidad({ busquedas: [UNA] });
    const adaptador = crearAdaptador({ core, estado: crearEstado(correlationId) });
    const resultado = await adaptador.herramientas.buscar_solicitante.manejar({
      documento: "0001234567",
    });
    assert.deepEqual(llamadas, [
      { metodo: "buscarSolicitante", argumentos: [{ documento: "0001234567" }, correlationId] },
    ]);
    assert.deepEqual(resultado.structuredContent, UNA);
  });

  it("pasa el nombre cuando la búsqueda es por nombre", async (t) => {
    capturarStderr(t);
    const correlationId = randomUUID();
    const { core, llamadas } = coreIdentidad({ busquedas: [UNA] });
    const adaptador = crearAdaptador({ core, estado: crearEstado(correlationId) });
    await adaptador.herramientas.buscar_solicitante.manejar({ nombre: "Ana Pérez Ficticia" });
    assert.deepEqual(llamadas[0]?.argumentos, [{ nombre: "Ana Pérez Ficticia" }, correlationId]);
  });

  it("con 0 o 1 coincidencias no emite eventos ni escala", async (t) => {
    capturarStderr(t);
    const { core } = coreIdentidad({ busquedas: [NINGUNA, UNA] });
    const estado = crearEstado(randomUUID());
    const adaptador = crearAdaptador({ core, estado });
    await adaptador.herramientas.buscar_solicitante.manejar({
      nombre: "Nadie Registrado Ficticio",
    });
    await adaptador.herramientas.buscar_solicitante.manejar({ documento: "0001234567" });
    assert.deepEqual(estado.eventos, []);
    assert.equal(estado.escalamiento, null);
  });

  it("reintenta ante un transitorio y escala si se agotan los reintentos", async (t) => {
    capturarStderr(t);
    const caido = fallo<never>(errorTransitorio("core_no_disponible", "Caído."));
    const { core, llamadas } = coreIdentidad({ busquedas: [caido] });
    const estado = crearEstado(randomUUID());
    const infos: unknown[] = [];
    const adaptador = crearAdaptador({
      core,
      estado,
      dormir: async () => {},
      alUsarHerramienta: (info) => void infos.push(info),
    });
    const resultado = await adaptador.herramientas.buscar_solicitante.manejar({
      documento: "0001234567",
    });
    assert.equal(llamadas.length, 3);
    assert.equal(resultado.isError, true);
    assert.equal(estado.escalamiento?.motivo, "falla_transitoria_persistente");
    assert.equal(estado.escalamiento?.herramienta, "buscar_solicitante");
    assert.equal(infos.length, 3);
  });
});

describe("adaptador: desambiguación de homónimos por código (#9, US2)", () => {
  it("un estado nuevo empieza sin búsquedas ambiguas", () => {
    assert.equal(crearEstado(randomUUID()).busquedasAmbiguas, 0);
  });

  it("la primera búsqueda con homónimos pide el número de documento con un evento", async (t) => {
    capturarStderr(t);
    const { core } = coreIdentidad({ busquedas: [HOMONIMOS] });
    const estado = crearEstado(randomUUID());
    const adaptador = crearAdaptador({ core, estado });
    await adaptador.herramientas.buscar_solicitante.manejar({ nombre: "Elena Martínez Inventada" });
    assert.equal(estado.busquedasAmbiguas, 1);
    assert.equal(estado.escalamiento, null);
    assert.equal(estado.eventos.length, 1);
    const evento = estado.eventos[0]!;
    assert.equal(evento.tipo, "solicitud_de_dato");
    assert.deepEqual(
      {
        descripcion: evento.descripcion,
        motivo: evento.motivo,
        dato: evento.tipo === "solicitud_de_dato" ? evento.dato : null,
        regla: evento.regla,
        valores: evento.valores,
      },
      {
        descripcion:
          "Encontré varias personas con ese nombre. Necesito tu número de documento para continuar.",
        motivo: "varias_coincidencias",
        dato: "número de documento de identidad",
        regla: "Regla 1 · coincidencias sin desambiguar",
        valores: { coincidencias: 2 },
      },
    );
  });

  it("la segunda búsqueda ambigua escala con identidad_ambigua y el número de coincidencias", async (t) => {
    capturarStderr(t);
    const { core } = coreIdentidad({ busquedas: [HOMONIMOS, HOMONIMOS] });
    const estado = crearEstado(randomUUID());
    const adaptador = crearAdaptador({ core, estado });
    await adaptador.herramientas.buscar_solicitante.manejar({ nombre: "Elena Martínez Inventada" });
    await adaptador.herramientas.buscar_solicitante.manejar({ nombre: "Elena Martínez Inventada" });
    assert.equal(estado.busquedasAmbiguas, 2);
    assert.equal(estado.eventos.length, 1, "la segunda no vuelve a pedir el dato");
    const senal = estado.escalamiento;
    assert.ok(senal, "no quedó la señal de escalamiento");
    assert.equal(senal.motivo, "identidad_ambigua");
    assert.equal(senal.herramienta, "buscar_solicitante");
    assert.equal(senal.coincidencias, 2);
    assert.equal(senal.regla, "Regla 1 · coincidencias sin desambiguar");
  });

  it("una búsqueda con una sola coincidencia desambigua y reinicia el contador", async (t) => {
    capturarStderr(t);
    // Caso visto con --demo: el modelo repite la búsqueda en cada turno, también por nombre.
    const { core } = coreIdentidad({ busquedas: [HOMONIMOS, UNA, HOMONIMOS] });
    const estado = crearEstado(randomUUID());
    const adaptador = crearAdaptador({ core, estado });
    await adaptador.herramientas.buscar_solicitante.manejar({ nombre: "Elena Martínez Inventada" });
    await adaptador.herramientas.buscar_solicitante.manejar({ documento: "0002020202" });
    assert.equal(estado.busquedasAmbiguas, 0);
    await adaptador.herramientas.buscar_solicitante.manejar({ nombre: "Elena Martínez Inventada" });
    assert.equal(estado.escalamiento, null, "no escala: ya se había desambiguado");
    assert.equal(estado.busquedasAmbiguas, 1);
  });

  it("sin coincidencias no reinicia el contador: dos ambiguas seguidas igual escalan", async (t) => {
    capturarStderr(t);
    const { core } = coreIdentidad({ busquedas: [HOMONIMOS, NINGUNA, HOMONIMOS] });
    const estado = crearEstado(randomUUID());
    const adaptador = crearAdaptador({ core, estado });
    for (let i = 0; i < 3; i++) {
      await adaptador.herramientas.buscar_solicitante.manejar({
        nombre: "Elena Martínez Inventada",
      });
    }
    assert.equal(estado.escalamiento?.motivo, "identidad_ambigua");
  });
});

describe("adaptador: verificar_identidad (#9, US3)", () => {
  const FECHA = "2001-01-01";
  const identidadOk = (correlationId: string) =>
    exito({
      identidad: {
        correlationId,
        verificada: true,
        idSolicitante: ID_SOLICITANTE_UNICO,
        verificadaEn: "2026-10-17T12:00:00.000Z",
      },
    });
  const negocio = (codigo: string) => fallo<never>(errorNegocio(codigo, "Mensaje del core."));
  /** Generador de idIntento predecible para las pruebas. */
  const generador = () => {
    let n = 0;
    return () => `intento-${++n}`;
  };

  it("expone verificar_identidad con idSolicitante y fechaExpedicion, sin idIntento ni correlationId", () => {
    const { core } = coreIdentidad();
    const adaptador = crearAdaptador({
      core,
      estado: crearEstado(randomUUID()),
    });
    assert.deepEqual(Object.keys(adaptador.herramientas.verificar_identidad.esquema), [
      "idSolicitante",
      "fechaExpedicion",
    ]);
  });

  it("pasa idSolicitante, fechaExpedicion, un idIntento y el correlationId", async (t) => {
    capturarStderr(t);
    const correlationId = randomUUID();
    const { core, llamadas } = coreIdentidad({
      verificaciones: [identidadOk(correlationId)],
    });
    const adaptador = crearAdaptador({
      core,
      estado: crearEstado(correlationId),
      generarIdIntento: generador(),
    });
    const resultado = await adaptador.herramientas.verificar_identidad.manejar({
      idSolicitante: ID_SOLICITANTE_UNICO,
      fechaExpedicion: FECHA,
    });
    assert.deepEqual(llamadas, [
      {
        metodo: "verificarIdentidad",
        argumentos: [ID_SOLICITANTE_UNICO, FECHA, "intento-1", correlationId],
      },
    ]);
    assert.equal(resultado.isError, false);
  });

  it("los reintentos repiten el idIntento y dos llamadas del modelo usan dos distintos", async (t) => {
    capturarStderr(t);
    const correlationId = randomUUID();
    const caido = fallo<never>(errorTransitorio("tiempo_agotado", "Sin respuesta."));
    const { core, llamadas } = coreIdentidad({
      verificaciones: [caido, identidadOk(correlationId), negocio("dato_no_coincide")],
    });
    const adaptador = crearAdaptador({
      core,
      estado: crearEstado(correlationId),
      dormir: async () => {},
      generarIdIntento: generador(),
    });
    const entrada = {
      idSolicitante: ID_SOLICITANTE_UNICO,
      fechaExpedicion: FECHA,
    };
    await adaptador.herramientas.verificar_identidad.manejar(entrada);
    await adaptador.herramientas.verificar_identidad.manejar(entrada);
    assert.deepEqual(
      llamadas.map((l) => l.argumentos[2]),
      ["intento-1", "intento-1", "intento-2"],
    );
  });

  it("dato_no_coincide y la verificación exitosa no emiten eventos ni escalan", async (t) => {
    capturarStderr(t);
    const correlationId = randomUUID();
    const { core } = coreIdentidad({
      verificaciones: [negocio("dato_no_coincide"), identidadOk(correlationId)],
    });
    const estado = crearEstado(correlationId);
    const adaptador = crearAdaptador({ core, estado });
    const entrada = {
      idSolicitante: ID_SOLICITANTE_UNICO,
      fechaExpedicion: FECHA,
    };
    const r1 = await adaptador.herramientas.verificar_identidad.manejar(entrada);
    const r2 = await adaptador.herramientas.verificar_identidad.manejar(entrada);
    assert.equal(r1.isError, true);
    assert.equal(r2.isError, false);
    assert.deepEqual(estado.eventos, []);
    assert.equal(estado.escalamiento, null);
  });

  it("verificacion_bloqueada deja la señal identidad_no_verificable", async (t) => {
    const logs = capturarStderr(t);
    const { core } = coreIdentidad({
      verificaciones: [negocio("verificacion_bloqueada")],
    });
    const estado = crearEstado(randomUUID());
    const adaptador = crearAdaptador({ core, estado });
    const resultado = await adaptador.herramientas.verificar_identidad.manejar({
      idSolicitante: ID_SOLICITANTE_UNICO,
      fechaExpedicion: FECHA,
    });
    assert.equal(resultado.isError, true);
    const senal = estado.escalamiento;
    assert.ok(senal, "no quedó la señal");
    assert.equal(senal.motivo, "identidad_no_verificable");
    assert.equal(senal.herramienta, "verificar_identidad");
    assert.equal(senal.regla, "Regla 1 · 3 intentos fallidos de verificación");
    assert.ok(logs().some((l) => l["evento"] === "escalamiento"));
  });

  it("los logs de la llamada no contienen la fecha presentada", async (t) => {
    const logs = capturarStderr(t);
    const { core } = coreIdentidad({
      verificaciones: [negocio("dato_no_coincide")],
    });
    const adaptador = crearAdaptador({
      core,
      estado: crearEstado(randomUUID()),
    });
    await adaptador.herramientas.verificar_identidad.manejar({
      idSolicitante: ID_SOLICITANTE_UNICO,
      fechaExpedicion: FECHA,
    });
    const texto = JSON.stringify(logs());
    assert.ok(texto.includes("llamada_core"));
    assert.equal(texto.includes(FECHA), false);
  });
});
function capturarStderr(t: { mock: { method: Function } }) {
  const lineas: string[] = [];
  (t.mock.method as (o: object, m: string, f: Function) => unknown)(
    process.stderr,
    "write",
    (texto: string | Uint8Array) => {
      lineas.push(String(texto));
      return true;
    },
  );
  return () =>
    lineas
      .flatMap((l) => l.split("\n"))
      .filter((l) => l.startsWith("{"))
      .map((l) => JSON.parse(l) as Record<string, unknown>);
}

describe("adaptador: consultar_identidad no se expone al modelo (#9, US4)", () => {
  it("el servidor originacion no tiene consultar_identidad", () => {
    const { core } = coreFalso([exito({ solicitud: null })]);
    const adaptador = crearAdaptador({ core, estado: crearEstado(randomUUID()) });
    assert.deepEqual(Object.keys(adaptador.herramientas), [
      "consultar_solicitud",
      "buscar_solicitante",
      "verificar_identidad",
    ]);
  });
});
