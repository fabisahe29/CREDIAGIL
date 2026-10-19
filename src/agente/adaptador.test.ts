import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  cerrarTurnoDocumentos,
  DESCRIPCION_SOLICITAR_ANALISTA,
  dejarSenal,
  cerrarTurnoIdentidad,
  crearAdaptador,
  crearEstado,
  emitirEvento,
  MOTIVOS_QUE_ADMITEN_REGISTRO,
  ORDEN_REGLA,
  SIGUIENTE_PASO_REGISTRO,
  REGLA_NO_CUBIERTO,
  REGLA_NO_EXTRAIBLE,
  REGLA_5_DOCUMENTOS,
  type InfoHerramienta,
  type SenalEscalamiento,
} from "./adaptador.ts";
import {
  crearClienteCore,
  type ClienteCore,
  type EntradaRegistroExtraccion,
  type RespuestaBusqueda,
  type RespuestaCapacidadPago,
  type RespuestaConsulta,
  type RespuestaIdentidad,
} from "./cliente-core.ts";
import {
  errorNegocio,
  errorTransitorio,
  errorValidacion,
  exito,
  fallo,
} from "../compartido/errores.ts";
import {
  ID_EN_ESTUDIO,
  ID_HOMONIMO_1,
  ID_HOMONIMO_2,
  ID_SOLICITANTE_UNICO,
  SOLICITANTES_EJEMPLO,
} from "../mcp/datos-ejemplo.ts";
import { CORE_NO_SIMULADO } from "./core-no-simulado.ts";
import type { DocumentoConversacion } from "./agente.ts";
import type {
  ClasificarDocumento,
  RespuestaClasificacion,
  EjecutarSubagente,
  EntradaSubagente,
  RespuestaSubagente,
} from "./extraccion.ts";
import { crearCore } from "../mcp/core-simulado.ts";
import { fijarDestino } from "../compartido/logs.ts";
import {
  construirResultado,
  validarSalida,
  type RegistroExtraccion,
  type SalidaSubagente,
} from "../compartido/extraccion.ts";
import { REGLA_3 } from "../politica/ingreso.ts";
import { REGLA_2 } from "../politica/preaprobacion.ts";
import { claveIdempotenciaSolicitud, esquemaSolicitudRegistrada } from "../compartido/solicitud.ts";
import {
  ejemploCertificado,
  ejemploExtracto,
  extractoConLecturaErrada,
  nominaDelMes,
  extractosTrimestre,
  type Ejemplo,
} from "../compartido/ingreso-ejemplos.ts";
import {
  CONTENIDO_CERTIFICADO,
  CONTENIDO_CERTIFICADO_SIN_SALARIO,
  CONTENIDO_CERTIFICADO_USD,
  CONTENIDO_EXTRACTO,
  CONTENIDO_OTRO,
  HOY_EJEMPLO,
  salidaCertificado,
  salidaCertificadoSinSalario,
  salidaCertificadoUsd,
  salidaExtracto,
  salidaOtro,
} from "../compartido/extraccion-ejemplos.ts";
import { REGLA_PRINCIPIO_V } from "../politica/documentos.ts";
import { MAX_INTENTOS_EXTRACCION } from "../politica/politica.ts";

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

  /** Lo que `conversar` hace al cerrar un turno y empezar el siguiente. */
  const nuevoTurno = (estado: ReturnType<typeof crearEstado>) => {
    cerrarTurnoIdentidad(estado);
    estado.ambiguaEnTurno = false;
  };
  const porNombre = { nombre: "Elena Martínez Inventada" };

  it("dos búsquedas ambiguas en el mismo turno cuentan una sola vez y no escalan", async (t) => {
    capturarStderr(t);
    const { core } = coreIdentidad({ busquedas: [HOMONIMOS, HOMONIMOS] });
    const estado = crearEstado(randomUUID());
    const adaptador = crearAdaptador({ core, estado });
    await adaptador.herramientas.buscar_solicitante.manejar(porNombre);
    await adaptador.herramientas.buscar_solicitante.manejar(porNombre);
    assert.equal(estado.busquedasAmbiguas, 1);
    assert.equal(estado.escalamiento, null);
    assert.equal(estado.eventos.length, 1, "no vuelve a pedir el dato en el mismo turno");
  });

  it("la búsqueda ambigua del turno siguiente escala con identidad_ambigua y las coincidencias", async (t) => {
    capturarStderr(t);
    const { core } = coreIdentidad({ busquedas: [HOMONIMOS, HOMONIMOS] });
    const estado = crearEstado(randomUUID());
    const adaptador = crearAdaptador({ core, estado });
    await adaptador.herramientas.buscar_solicitante.manejar(porNombre);
    nuevoTurno(estado);
    await adaptador.herramientas.buscar_solicitante.manejar(porNombre);
    assert.equal(estado.busquedasAmbiguas, 2);
    assert.equal(estado.eventos.length, 1, "la segunda no vuelve a pedir el dato");
    assert.equal(
      estado.escalamiento,
      null,
      "no escala en la llamada: se decide al cerrar el turno",
    );
    cerrarTurnoIdentidad(estado);
    // Se relee: TypeScript estrechó escalamiento a null con la aserción anterior.
    const senal = (estado as { escalamiento: SenalEscalamiento | null }).escalamiento;
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
    await adaptador.herramientas.buscar_solicitante.manejar(porNombre);
    nuevoTurno(estado);
    await adaptador.herramientas.buscar_solicitante.manejar({ documento: "0002020202" });
    assert.equal(estado.busquedasAmbiguas, 0);
    assert.equal(estado.desambiguada, true);
    await adaptador.herramientas.buscar_solicitante.manejar(porNombre);
    nuevoTurno(estado);
    assert.equal(estado.escalamiento, null, "no escala: ya se había desambiguado");
    assert.equal(estado.busquedasAmbiguas, 0);
    assert.equal(estado.eventos.length, 1, "no vuelve a pedir el documento ya entregado");
  });

  it("en el turno siguiente, nombre y después documento no escala (orden inverso)", async (t) => {
    capturarStderr(t);
    const { core } = coreIdentidad({ busquedas: [HOMONIMOS, HOMONIMOS, UNA] });
    const estado = crearEstado(randomUUID());
    const adaptador = crearAdaptador({ core, estado });
    await adaptador.herramientas.buscar_solicitante.manejar(porNombre);
    nuevoTurno(estado);
    await adaptador.herramientas.buscar_solicitante.manejar(porNombre);
    await adaptador.herramientas.buscar_solicitante.manejar({ documento: "0002020202" });
    nuevoTurno(estado);
    assert.equal(estado.escalamiento, null);
    assert.equal(estado.busquedasAmbiguas, 0);
    assert.equal(estado.eventos.length, 1, "no vuelve a pedir el documento");
  });

  it("sin coincidencias no reinicia el contador: dos ambiguas en turnos seguidos escalan", async (t) => {
    capturarStderr(t);
    const { core } = coreIdentidad({ busquedas: [HOMONIMOS, NINGUNA, HOMONIMOS] });
    const estado = crearEstado(randomUUID());
    const adaptador = crearAdaptador({ core, estado });
    for (let i = 0; i < 3; i++) {
      await adaptador.herramientas.buscar_solicitante.manejar(porNombre);
      nuevoTurno(estado);
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

  it("los reintentos repiten el idIntento y un dato distinto usa otro", async (t) => {
    capturarStderr(t);
    const correlationId = randomUUID();
    const caido = fallo<never>(errorTransitorio("tiempo_agotado", "Sin respuesta."));
    const { core, llamadas } = coreIdentidad({
      verificaciones: [caido, negocio("dato_no_coincide"), negocio("dato_no_coincide")],
    });
    const adaptador = crearAdaptador({
      core,
      estado: crearEstado(correlationId),
      dormir: async () => {},
      generarIdIntento: generador(),
    });
    await adaptador.herramientas.verificar_identidad.manejar({
      idSolicitante: ID_SOLICITANTE_UNICO,
      fechaExpedicion: FECHA,
    });
    await adaptador.herramientas.verificar_identidad.manejar({
      idSolicitante: ID_SOLICITANTE_UNICO,
      fechaExpedicion: "2001-01-02",
    });
    assert.deepEqual(
      llamadas.map((l) => l.argumentos[2]),
      ["intento-1", "intento-1", "intento-2"],
    );
  });

  it("el mismo dato repetido en el turno reutiliza el idIntento: el core no cuenta dos fallos", async (t) => {
    capturarStderr(t);
    const correlationId = randomUUID();
    const { core, llamadas } = coreIdentidad({
      verificaciones: [negocio("dato_no_coincide")],
    });
    const adaptador = crearAdaptador({
      core,
      estado: crearEstado(correlationId),
      generarIdIntento: generador(),
    });
    const entrada = { idSolicitante: ID_SOLICITANTE_UNICO, fechaExpedicion: FECHA };
    await adaptador.herramientas.verificar_identidad.manejar(entrada);
    await adaptador.herramientas.verificar_identidad.manejar(entrada);
    assert.deepEqual(
      llamadas.map((l) => l.argumentos[2]),
      ["intento-1", "intento-1"],
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
      "solicitar_analista",
      "extraer_documento",
      "verificar_ingreso",
      "consultar_extracciones",
      "calcular_capacidad_pago",
      "registrar_solicitud",
      "preaprobar_credito",
    ]);
  });
});
describe("adaptador: solicitar_analista, reglas 4 y 5 por código (#9, revisión de cumplimiento)", () => {
  it("expone solicitar_analista con motivo y causa, y monto y plazo solo con su cita (#15)", () => {
    const { core } = coreIdentidad();
    const adaptador = crearAdaptador({
      core,
      estado: crearEstado(randomUUID()),
    });
    assert.deepEqual(Object.keys(adaptador.herramientas.solicitar_analista.esquema), [
      "motivo",
      "causa",
      "monto",
      "plazoMeses",
      "origen",
    ]);
  });

  it("pide_persona escala de inmediato con la Regla 4, sin llamar al core", async (t) => {
    const logs = capturarStderr(t);
    const { core, llamadas } = coreIdentidad();
    const estado = crearEstado(randomUUID());
    const adaptador = crearAdaptador({ core, estado });
    const resultado = await adaptador.herramientas.solicitar_analista.manejar({
      motivo: "pide_persona",
    });
    assert.equal(resultado.isError, false);
    assert.deepEqual(resultado.structuredContent, {
      ok: true,
      datos: { escalada: true },
    });
    assert.equal(llamadas.length, 0);
    const senal = estado.escalamiento;
    assert.ok(senal, "no quedó la señal");
    assert.equal(senal.motivo, "pide_persona");
    assert.equal(senal.regla, "Regla 4 · el solicitante pide hablar con una persona");
    assert.equal(senal.herramienta, "solicitar_analista");
    assert.ok(logs().some((l) => l["evento"] === "escalamiento" && l["motivo"] === "pide_persona"));
  });

  it("caso_no_cubierto escala con la Regla 5 y la causa", async (t) => {
    capturarStderr(t);
    const { core } = coreIdentidad();
    const estado = crearEstado(randomUUID());
    const adaptador = crearAdaptador({ core, estado });
    await adaptador.herramientas.solicitar_analista.manejar({
      motivo: "caso_no_cubierto",
      causa: "moneda_extranjera",
    });
    assert.equal(estado.escalamiento?.motivo, "caso_no_cubierto");
    assert.equal(estado.escalamiento?.regla, "Regla 5 · caso no cubierto por la política");
    assert.equal(estado.escalamiento?.causa, "moneda_extranjera");
  });

  it("si ya hubo otro escalamiento, la primera señal prevalece", async (t) => {
    capturarStderr(t);
    const { core } = coreIdentidad();
    const estado = crearEstado(randomUUID());
    const adaptador = crearAdaptador({ core, estado });
    await adaptador.herramientas.solicitar_analista.manejar({
      motivo: "pide_persona",
    });
    await adaptador.herramientas.solicitar_analista.manejar({
      motivo: "caso_no_cubierto",
    });
    assert.equal(estado.escalamiento?.motivo, "pide_persona");
  });
});

describe("adaptador: solicitar_analista en el modo de demostración", () => {
  it("avisa al observador una vez, como ok", async (t) => {
    capturarStderr(t);
    const { core } = coreIdentidad();
    const infos: unknown[] = [];
    const adaptador = crearAdaptador({
      core,
      estado: crearEstado(randomUUID()),
      alUsarHerramienta: (info) => void infos.push(info),
    });
    await adaptador.herramientas.solicitar_analista.manejar({ motivo: "pide_persona" });
    assert.deepEqual(infos, [{ herramienta: "solicitar_analista", intento: 1, resultado: "ok" }]);
  });
});

// ── Extracción de documentos (#10) ─────────────────────────────────────────────

/** Cliente del core sobre el core simulado en memoria: identidad y extracciones reales. */
function coreEnMemoria() {
  const core = crearCore({ ahora: () => HOY_EJEMPLO });
  const registros: EntradaRegistroExtraccion[] = [];
  let consultas = 0;
  const cliente: ClienteCore = {
    ...CORE_NO_SIMULADO,
    async consultarSolicitud(idSolicitud) {
      return core.consultarSolicitud(idSolicitud);
    },
    async consultarIdentidad(correlationId) {
      return core.consultarIdentidad(correlationId);
    },
    async registrarExtraccion(entrada, correlationId) {
      registros.push(entrada);
      return core.registrarExtraccion({ ...entrada, correlationId }).respuesta;
    },
    async consultarExtracciones(correlationId) {
      consultas++;
      return core.consultarExtracciones(correlationId);
    },
    async verificarIngreso(entrada, correlationId) {
      return core.verificarIngreso({ ...entrada, correlationId }).respuesta;
    },
    async consultarVerificacionIngreso(correlationId) {
      return core.consultarVerificacionIngreso(correlationId);
    },
    async calcularCapacidadPago(entrada, correlationId) {
      return core.calcularCapacidadPago({ ...entrada, correlationId });
    },
    async cerrar() {},
  };
  const verificar = (correlationId: string) => {
    const unico = SOLICITANTES_EJEMPLO.find((s) => s.idSolicitante === ID_SOLICITANTE_UNICO)!;
    core.verificarIdentidad({
      idSolicitante: unico.idSolicitante,
      fechaExpedicion: unico.fechaExpedicion,
      idIntento: "intento-1",
      correlationId,
    });
  };
  return { cliente, core, registros, consultas: () => consultas, verificar };
}

/** Subagente falso: cada llamada usa la siguiente respuesta (la última se repite). */
function subagenteFalso(respuestas: RespuestaSubagente[]) {
  const entradas: EntradaSubagente[] = [];
  const fn: EjecutarSubagente = async (entrada) => {
    entradas.push(entrada);
    return respuestas[Math.min(entradas.length - 1, respuestas.length - 1)]!;
  };
  return { fn, entradas };
}

const doc = (
  adjunto: number,
  contenido: string,
  nombre = "certificado.md",
): DocumentoConversacion => ({ adjunto, nombre, soportado: true, contenido });

function prepararExtraccion(
  documentos: DocumentoConversacion[],
  respuestas: RespuestaSubagente[],
  opciones: { verificar?: boolean; core?: ClienteCore; clasificar?: ClasificarDocumento } = {},
) {
  const correlationId = randomUUID();
  const estado = crearEstado(correlationId);
  const enMemoria = coreEnMemoria();
  if (opciones.verificar !== false) enMemoria.verificar(correlationId);
  const subagente = subagenteFalso(respuestas);
  const infos: InfoHerramienta[] = [];
  const adaptador = crearAdaptador({
    core: opciones.core ?? enMemoria.cliente,
    estado,
    documentos,
    ejecutarSubagente: subagente.fn,
    // Nunca el clasificador real: las pruebas no llaman al modelo.
    clasificarDocumento:
      opciones.clasificar ??
      (async () => ({ ok: false, causa: "error_sdk", detalle: "no simulado" })),
    hoy: () => HOY_EJEMPLO,
    dormir: async () => {},
    azar: () => 0.5,
    alUsarHerramienta: (info) => void infos.push(info),
  });
  const extraer = (adjunto: number) =>
    adaptador.herramientas.extraer_documento.manejar({ adjunto });
  return { adaptador, estado, extraer, subagente, enMemoria, infos, correlationId };
}

type Contenido = {
  ok: boolean;
  datos?: Record<string, unknown>;
  error?: { codigo: string; campo?: string; categoria: string };
};
const contenidoDe = (r: { structuredContent?: unknown }) => r.structuredContent as Contenido;
const resultadoDe = (r: { structuredContent?: unknown }) =>
  contenidoDe(r).datos?.["resultado"] as RegistroExtraccion;

const valida = (salida: SalidaSubagente): RespuestaSubagente => ({ ok: true, salida });
const salarioInvalido = (): RespuestaSubagente => {
  const salida = salidaCertificado();
  salida.certificado!.salario!.valor = 9_800_000;
  return { ok: true, salida };
};
const tiempoAgotado: RespuestaSubagente = { ok: false, causa: "tiempo_agotado", detalle: "x" };

describe("adaptador: extraer_documento (#10, US1)", () => {
  let logs: Record<string, unknown>[];
  beforeEach(() => {
    logs = [];
    fijarDestino({ write: (t: string) => logs.push(JSON.parse(t) as Record<string, unknown>) });
  });
  afterEach(() => fijarDestino(null));

  it("expone extraer_documento con solo el número de adjunto, y consultar_extracciones sin entrada", () => {
    const { adaptador } = prepararExtraccion([], []);
    assert.deepEqual(Object.keys(adaptador.herramientas.extraer_documento.esquema), ["adjunto"]);
    assert.deepEqual(Object.keys(adaptador.herramientas.consultar_extracciones.esquema), []);
  });

  it("extrae un certificado completo con montos enteros y fechas AAAA-MM-DD, y lo registra con el contenido exacto", async () => {
    const p = prepararExtraccion([doc(1, CONTENIDO_CERTIFICADO)], [valida(salidaCertificado())]);
    const r = await p.extraer(1);
    assert.equal(r.isError, false);
    const resultado = resultadoDe(r);
    assert.equal(resultado.estado, "extraido");
    if (resultado.estado !== "extraido" || resultado.documento.tipo !== "certificado_laboral") {
      return assert.fail("debía ser un certificado extraído");
    }
    assert.equal(resultado.documento.salario?.valor, 3_800_000);
    assert.equal(resultado.documento.fechaIngreso?.valor, "2022-02-01");
    assert.equal(p.enMemoria.registros[0]?.contenido, CONTENIDO_CERTIFICADO);
    assert.equal(p.estado.escalamiento, null);
    assert.deepEqual(p.estado.eventos, []);
  });

  it("extrae un extracto con sus movimientos", async () => {
    const p = prepararExtraccion(
      [doc(1, CONTENIDO_EXTRACTO, "extracto.md")],
      [valida(salidaExtracto())],
    );
    const resultado = resultadoDe(await p.extraer(1));
    if (resultado.estado !== "extraido" || resultado.documento.tipo !== "extracto_bancario") {
      return assert.fail("debía ser un extracto extraído");
    }
    assert.equal(resultado.documento.movimientos.length, 2);
  });

  it("un adjunto inexistente es validación adjunto_inexistente y no llama al subagente", async () => {
    const p = prepararExtraccion([doc(1, CONTENIDO_CERTIFICADO)], [valida(salidaCertificado())]);
    const r = await p.extraer(4);
    assert.equal(r.isError, true);
    assert.equal(contenidoDe(r).error?.codigo, "adjunto_inexistente");
    assert.equal(contenidoDe(r).error?.campo, "adjunto");
    assert.equal(p.subagente.entradas.length, 0);
  });

  it("el subagente recibe solo el documento pedido, con su número y nombre", async () => {
    const p = prepararExtraccion(
      [doc(1, CONTENIDO_EXTRACTO, "extracto.md"), doc(2, CONTENIDO_CERTIFICADO)],
      [valida(salidaCertificado())],
    );
    await p.extraer(2);
    assert.deepEqual(p.subagente.entradas[0]?.documento, {
      adjunto: 2,
      nombre: "certificado.md",
      contenido: CONTENIDO_CERTIFICADO,
    });
    assert.equal(p.subagente.entradas[0]?.correlationId, p.correlationId);
  });

  it("deja un log extraccion con metadatos, sin el contenido ni los fragmentos", async () => {
    const p = prepararExtraccion([doc(1, CONTENIDO_CERTIFICADO)], [valida(salidaCertificado())]);
    await p.extraer(1);
    const registro = logs.find((l) => l["evento"] === "extraccion");
    assert.ok(registro, "falta el log extraccion");
    assert.equal(registro["correlationId"], p.correlationId);
    assert.equal(registro["adjunto"], 1);
    assert.equal(registro["nombre"], "certificado.md");
    assert.equal(registro["estado"], "extraido");
    assert.equal(registro["tipo"], "certificado_laboral");
    assert.equal(registro["intentos"], 1);
    assert.equal(String(registro["huella"]).length, 12);
    assert.deepEqual(registro["faltantes"], []);
    const texto = JSON.stringify(logs);
    assert.equal(texto.includes("Certificado laboral ficticio"), false);
    assert.equal(texto.includes("trabaja como analista"), false);
  });

  it("si el core rechaza el registro por no coincidir con el documento, escala como no extraíble", async () => {
    const enMemoria = coreEnMemoria();
    const core: ClienteCore = {
      ...enMemoria.cliente,
      async registrarExtraccion() {
        return fallo(errorValidacion("extraccion_invalida", "No coincide.", "resultado.huella"));
      },
    };
    const p = prepararExtraccion([doc(1, CONTENIDO_CERTIFICADO)], [valida(salidaCertificado())], {
      core,
    });
    const r = await p.extraer(1);
    assert.equal(r.isError, true);
    assert.equal(p.estado.escalamiento?.motivo, "documento_no_extraible");
  });
});

describe("adaptador: datos faltantes (#10, US2)", () => {
  beforeEach(() => fijarDestino({ write: () => true }));
  afterEach(() => fijarDestino(null));

  it("un certificado sin salario queda extraído, sin reintento, y pide un documento con el salario", async () => {
    const p = prepararExtraccion(
      [doc(2, CONTENIDO_CERTIFICADO_SIN_SALARIO)],
      [valida(salidaCertificadoSinSalario())],
    );
    const resultado = resultadoDe(await p.extraer(2));
    assert.equal(resultado.estado, "extraido");
    if (resultado.estado !== "extraido") return;
    assert.deepEqual(resultado.faltantes, ["salario"]);
    assert.equal(p.subagente.entradas.length, 1);
    assert.equal(p.estado.eventos.length, 1);
    const evento = p.estado.eventos[0]!;
    assert.equal(evento.tipo, "solicitud_de_dato");
    if (evento.tipo !== "solicitud_de_dato") return;
    assert.equal(evento.motivo, "dato_faltante_en_documento");
    assert.equal(evento.dato, "salario");
    assert.equal(evento.regla, REGLA_PRINCIPIO_V);
    assert.deepEqual(evento.valores, {
      adjunto: 2,
      documento: "certificado.md",
      faltantes: "salario",
    });
    assert.match(evento.descripcion, /adjunto 2/);
    assert.match(evento.descripcion, /documento/);
    assert.equal(/escr[ií]b/i.test(evento.descripcion), false, "no pide escribir el dato");
  });

  it("dos campos nulos dan un solo evento con los dos", async () => {
    const salida = salidaCertificadoSinSalario();
    salida.certificado!.cargo = null;
    const p = prepararExtraccion([doc(1, CONTENIDO_CERTIFICADO_SIN_SALARIO)], [valida(salida)]);
    await p.extraer(1);
    assert.equal(p.estado.eventos.length, 1);
    const evento = p.estado.eventos[0]!;
    assert.equal(evento.tipo === "solicitud_de_dato" && evento.dato, "cargo, salario");
  });

  it("un extracto sin movimientos no pide nada", async () => {
    const salida = salidaExtracto();
    salida.extracto!.movimientos = [];
    const p = prepararExtraccion([doc(1, CONTENIDO_EXTRACTO, "extracto.md")], [valida(salida)]);
    await p.extraer(1);
    assert.deepEqual(p.estado.eventos, []);
  });
});

describe("adaptador: procedencia y consultar_extracciones (#10, US3)", () => {
  beforeEach(() => fijarDestino({ write: () => true }));
  afterEach(() => fijarDestino(null));

  it("cada campo no nulo trae el número, el nombre y el fragmento; un nulo no trae procedencia", async () => {
    const p = prepararExtraccion(
      [doc(3, CONTENIDO_CERTIFICADO_SIN_SALARIO)],
      [valida(salidaCertificadoSinSalario())],
    );
    const resultado = resultadoDe(await p.extraer(3));
    if (resultado.estado !== "extraido" || resultado.documento.tipo !== "certificado_laboral") {
      return assert.fail("debía ser un certificado extraído");
    }
    assert.deepEqual(resultado.documento.cargo?.procedencia, {
      adjunto: 3,
      nombre: "certificado.md",
      fragmento: "trabaja como analista de operaciones",
    });
    assert.equal(resultado.documento.salario, null);
  });

  it("dos documentos con el mismo nombre mantienen cada procedencia en su número", async () => {
    const p = prepararExtraccion(
      [doc(1, CONTENIDO_CERTIFICADO, "doc.md"), doc(2, CONTENIDO_EXTRACTO, "doc.md")],
      [valida(salidaCertificado()), valida(salidaExtracto())],
    );
    const primero = resultadoDe(await p.extraer(1));
    const segundo = resultadoDe(await p.extraer(2));
    if (primero.estado !== "extraido" || segundo.estado !== "extraido") {
      return assert.fail("debían quedar extraídos");
    }
    if (primero.documento.tipo !== "certificado_laboral") return assert.fail("certificado");
    if (segundo.documento.tipo !== "extracto_bancario") return assert.fail("extracto");
    assert.equal(primero.documento.cargo?.procedencia.adjunto, 1);
    assert.equal(segundo.documento.titular?.procedencia.adjunto, 2);
  });

  it("consultar_extracciones devuelve las extracciones de la conversación por adjunto", async () => {
    const p = prepararExtraccion(
      [doc(1, CONTENIDO_EXTRACTO, "extracto.md"), doc(2, CONTENIDO_CERTIFICADO)],
      // El subagente falso responde en el orden de las llamadas: primero el adjunto 2.
      [valida(salidaCertificado()), valida(salidaExtracto())],
    );
    await p.extraer(2);
    await p.extraer(1);
    assert.equal(p.estado.escalamiento, null);
    const r = await p.adaptador.herramientas.consultar_extracciones.manejar({});
    const lista = contenidoDe(r).datos?.["extracciones"] as RegistroExtraccion[];
    assert.deepEqual(
      lista.map((e) => e.adjuntos[0]),
      [1, 2],
    );
  });
});

describe("adaptador: intentos acotados y no extraíble (#10, US4)", () => {
  let logs: Record<string, unknown>[];
  beforeEach(() => {
    logs = [];
    fijarDestino({ write: (t: string) => logs.push(JSON.parse(t) as Record<string, unknown>) });
  });
  afterEach(() => fijarDestino(null));

  it("inválida y luego válida: éxito con intentos 2, y el segundo intento recibe el error", async () => {
    const p = prepararExtraccion(
      [doc(1, CONTENIDO_CERTIFICADO)],
      [salarioInvalido(), valida(salidaCertificado())],
    );
    const resultado = resultadoDe(await p.extraer(1));
    assert.equal(resultado.estado, "extraido");
    assert.equal(resultado.intentos, 2);
    assert.deepEqual(p.subagente.entradas[1]?.erroresPrevios, [
      { campo: "salario", motivo: "valor_no_coincide_con_fragmento" },
    ]);
  });

  it(`tras ${MAX_INTENTOS_EXTRACCION} inválidas escala como documento no extraíble, sin devolver datos`, async () => {
    const p = prepararExtraccion([doc(1, CONTENIDO_CERTIFICADO)], [salarioInvalido()]);
    const r = await p.extraer(1);
    assert.equal(p.subagente.entradas.length, MAX_INTENTOS_EXTRACCION);
    const senal = p.estado.escalamiento;
    assert.equal(senal?.motivo, "documento_no_extraible");
    assert.equal(senal?.regla, REGLA_NO_EXTRAIBLE);
    assert.equal(senal?.adjunto, 1);
    assert.match(senal?.ultimoError ?? "", /salario: valor_no_coincide_con_fragmento/);
    assert.equal(p.enMemoria.registros[0]?.resultado.estado, "no_extraible");
    assert.equal(contenidoDe(r).datos?.["resultado"], undefined);
    assert.equal(contenidoDe(r).datos?.["escalada"], true);
  });

  it("valores en conflicto dejan el documento como no extraíble sin reintentar", async () => {
    const salida = { ...salidaCertificado(), conflictos: ["salario"] };
    const p = prepararExtraccion([doc(1, CONTENIDO_CERTIFICADO)], [valida(salida)]);
    await p.extraer(1);
    assert.equal(p.subagente.entradas.length, 1);
    assert.equal(p.estado.escalamiento?.motivo, "documento_no_extraible");
  });

  it("si ningún intento responde, escala por falla transitoria y no registra nada", async () => {
    const p = prepararExtraccion([doc(1, CONTENIDO_CERTIFICADO)], [tiempoAgotado]);
    const r = await p.extraer(1);
    assert.equal(r.isError, true);
    assert.equal(p.estado.escalamiento?.motivo, "falla_transitoria_persistente");
    assert.equal(p.estado.escalamiento?.intentos, MAX_INTENTOS_EXTRACCION);
    assert.equal(p.enMemoria.registros.length, 0);
  });

  it("el mismo contenido en otro adjunto reutiliza la extracción sin llamar otra vez al subagente", async () => {
    const p = prepararExtraccion(
      [doc(1, CONTENIDO_CERTIFICADO), doc(2, CONTENIDO_CERTIFICADO, "copia.md")],
      [valida(salidaCertificado())],
    );
    await p.extraer(1);
    const segundo = resultadoDe(await p.extraer(2));
    assert.equal(p.subagente.entradas.length, 1);
    assert.deepEqual(segundo.adjuntos, [1, 2]);
    assert.equal(logs.filter((l) => l["evento"] === "extraccion").at(-1)?.["reutilizada"], true);
  });

  it("deja un log intento_extraccion por intento, con su número y resultado", async () => {
    const p = prepararExtraccion(
      [doc(1, CONTENIDO_CERTIFICADO)],
      [tiempoAgotado, salarioInvalido(), valida(salidaCertificado())],
    );
    await p.extraer(1);
    const intentos = logs.filter((l) => l["evento"] === "intento_extraccion");
    assert.deepEqual(
      intentos.map((l) => [l["numero"], l["resultado"], l["adjunto"]]),
      [
        [1, "tiempo_agotado", 1],
        [2, "invalida", 1],
        [3, "valida", 1],
      ],
    );
    assert.ok(intentos.every((l) => typeof l["duracionMs"] === "number"));
  });

  it("el modo de demostración muestra cada intento del subagente", async () => {
    const p = prepararExtraccion(
      [doc(1, CONTENIDO_CERTIFICADO)],
      [salarioInvalido(), valida(salidaCertificado())],
    );
    await p.extraer(1);
    assert.deepEqual(
      p.infos.filter((i) => i.herramienta === "extraer_documento").map((i) => i.resultado),
      ["invalida", "valida"],
    );
  });
});

describe("adaptador: casos no cubiertos (#10, US5)", () => {
  beforeEach(() => fijarDestino({ write: () => true }));
  afterEach(() => fijarDestino(null));

  it("un certificado en dólares escala con la Regla 5 por código, sin llamar al subagente ni registrar", async () => {
    const p = prepararExtraccion(
      [doc(1, CONTENIDO_CERTIFICADO_USD)],
      [valida(salidaCertificadoUsd())],
    );
    const r = await p.extraer(1);
    assert.deepEqual(
      {
        motivo: p.estado.escalamiento?.motivo,
        regla: p.estado.escalamiento?.regla,
        causa: p.estado.escalamiento?.causa,
        herramienta: p.estado.escalamiento?.herramienta,
        adjunto: p.estado.escalamiento?.adjunto,
      },
      {
        motivo: "caso_no_cubierto",
        regla: REGLA_NO_CUBIERTO,
        causa: "moneda_extranjera",
        herramienta: "extraer_documento",
        adjunto: 1,
      },
    );
    assert.equal(p.subagente.entradas.length, 0);
    assert.equal(p.enMemoria.registros.length, 0);
    assert.equal(contenidoDe(r).datos?.["resultado"], undefined);
  });

  it("un documento en pesos de otro país escala por moneda extranjera (revisión de 0aa8c2a)", async () => {
    const contenido = "Certificado ficticio\nSalario mensual: 950.000 pesos argentinos";
    const p = prepararExtraccion([doc(1, contenido)], [valida(salidaCertificado())]);
    await p.extraer(1);
    assert.equal(p.estado.escalamiento?.causa, "moneda_extranjera");
    assert.equal(p.subagente.entradas.length, 0);
  });

  it("un documento de otro tipo escala por documento no soportado", async () => {
    const p = prepararExtraccion(
      [doc(1, CONTENIDO_OTRO, "desprendible.md")],
      [valida(salidaOtro())],
    );
    await p.extraer(1);
    assert.equal(p.estado.escalamiento?.causa, "documento_no_soportado");
  });

  it("un adjunto que el chat marcó como no soportado escala sin llamar al subagente ni al core", async () => {
    const p = prepararExtraccion(
      [{ adjunto: 1, nombre: "foto.png", soportado: false }],
      [valida(salidaCertificado())],
    );
    const r = await p.extraer(1);
    assert.equal(r.isError, false);
    assert.equal(p.estado.escalamiento?.motivo, "caso_no_cubierto");
    assert.equal(p.estado.escalamiento?.causa, "documento_no_soportado");
    assert.equal(p.subagente.entradas.length, 0);
    assert.equal(p.enMemoria.registros.length, 0);
    assert.equal(p.enMemoria.consultas(), 0);
  });
});

describe("adaptador: Regla 5 antes que la Regla 1 (revisión de 0aa8c2a)", () => {
  beforeEach(() => fijarDestino({ write: () => true }));
  afterEach(() => fijarDestino(null));

  const clasificadorQueDice = (tipo: "certificado_laboral" | "extracto_bancario" | "otro") => {
    const llamadas: number[] = [];
    const fn: ClasificarDocumento = async ({ documento }) => {
      llamadas.push(documento.adjunto);
      return { ok: true, tipo };
    };
    return { fn, llamadas };
  };

  it("sin identidad, un documento de otro tipo escala por la Regla 5 tras clasificarlo, sin extraer", async () => {
    const clasificador = clasificadorQueDice("otro");
    const p = prepararExtraccion([doc(1, CONTENIDO_OTRO, "desprendible.md")], [], {
      verificar: false,
      clasificar: clasificador.fn,
    });
    assert.equal(await p.adaptador.evaluarRegla5AntesDeIdentidad(1), true);
    assert.equal(p.estado.escalamiento?.causa, "documento_no_soportado");
    assert.equal(p.estado.escalamiento?.regla, REGLA_NO_CUBIERTO);
    assert.deepEqual(clasificador.llamadas, [1]);
    assert.equal(p.subagente.entradas.length, 0);
    assert.equal(p.enMemoria.registros.length, 0);
  });

  it("sin identidad, un documento en dólares escala sin llamar al modelo", async () => {
    const clasificador = clasificadorQueDice("certificado_laboral");
    const p = prepararExtraccion([doc(1, CONTENIDO_CERTIFICADO_USD)], [], {
      verificar: false,
      clasificar: clasificador.fn,
    });
    assert.equal(await p.adaptador.evaluarRegla5AntesDeIdentidad(1), true);
    assert.equal(p.estado.escalamiento?.causa, "moneda_extranjera");
    assert.deepEqual(clasificador.llamadas, []);
  });

  it("sin identidad, un tipo soportado no escala: queda para la Regla 1", async () => {
    const clasificador = clasificadorQueDice("certificado_laboral");
    const p = prepararExtraccion([doc(1, CONTENIDO_CERTIFICADO)], [], {
      verificar: false,
      clasificar: clasificador.fn,
    });
    assert.equal(await p.adaptador.evaluarRegla5AntesDeIdentidad(1), false);
    assert.equal(p.estado.escalamiento, null);
  });

  it(`si el clasificador no responde en ${MAX_INTENTOS_EXTRACCION} intentos, escala por falla transitoria (revisión de 5d28165)`, async () => {
    let llamadas = 0;
    const p = prepararExtraccion([doc(1, CONTENIDO_OTRO)], [], {
      verificar: false,
      clasificar: async () => {
        llamadas++;
        return { ok: false, causa: "tiempo_agotado", detalle: "x" };
      },
    });
    assert.equal(await p.adaptador.evaluarRegla5AntesDeIdentidad(1), true);
    assert.equal(llamadas, MAX_INTENTOS_EXTRACCION);
    assert.equal(p.estado.escalamiento?.motivo, "falla_transitoria_persistente");
    assert.equal(p.estado.escalamiento?.herramienta, "clasificar_documento");
  });

  it("si el clasificador falla una vez y luego responde, decide con esa respuesta", async () => {
    const respuestas: RespuestaClasificacion[] = [
      { ok: false, causa: "error_sdk", detalle: "x" },
      { ok: true, tipo: "otro" },
    ];
    const p = prepararExtraccion([doc(1, CONTENIDO_OTRO)], [], {
      verificar: false,
      clasificar: async () => respuestas.shift()!,
    });
    assert.equal(await p.adaptador.evaluarRegla5AntesDeIdentidad(1), true);
    assert.equal(p.estado.escalamiento?.causa, "documento_no_soportado");
  });

  it("un texto pegado que no es un documento no escala: es conversación", async () => {
    const p = prepararExtraccion(
      [
        {
          adjunto: 1,
          nombre: "texto pegado",
          soportado: true,
          contenido: "Quisiera saber la tasa",
        },
      ],
      [],
      { verificar: false, clasificar: async () => ({ ok: true, tipo: "no_es_documento" }) },
    );
    assert.equal(await p.adaptador.evaluarRegla5AntesDeIdentidad(1), false);
    assert.equal(p.estado.escalamiento, null);
  });

  it("un archivo adjunto que no es un documento sí escala como no soportado", async () => {
    const p = prepararExtraccion([doc(1, "Notas sueltas", "notas.md")], [], {
      verificar: false,
      clasificar: async () => ({ ok: true, tipo: "no_es_documento" }),
    });
    assert.equal(await p.adaptador.evaluarRegla5AntesDeIdentidad(1), true);
    assert.equal(p.estado.escalamiento?.causa, "documento_no_soportado");
  });

  it("un adjunto inexistente no escala", async () => {
    const p = prepararExtraccion([], [], { verificar: false });
    assert.equal(await p.adaptador.evaluarRegla5AntesDeIdentidad(9), false);
  });

  it("al cerrar el turno, un archivo no soportado escala aunque el modelo no hiciera nada", () => {
    const estado = crearEstado(randomUUID());
    cerrarTurnoDocumentos(estado, [
      doc(1, CONTENIDO_CERTIFICADO),
      { adjunto: 2, nombre: "foto.png", soportado: false },
    ]);
    assert.equal(estado.escalamiento?.motivo, "caso_no_cubierto");
    assert.equal(estado.escalamiento?.causa, "documento_no_soportado");
    assert.equal(estado.escalamiento?.adjunto, 2);
    assert.equal(estado.escalamiento?.herramienta, REGLA_5_DOCUMENTOS);
  });

  it("al cerrar el turno, una moneda extranjera en un documento escala", () => {
    const estado = crearEstado(randomUUID());
    cerrarTurnoDocumentos(estado, [doc(3, CONTENIDO_CERTIFICADO_USD)]);
    assert.equal(estado.escalamiento?.causa, "moneda_extranjera");
    assert.equal(estado.escalamiento?.adjunto, 3);
  });

  it("al cerrar el turno, documentos cubiertos no escalan, y una señal previa (Regla 4) prevalece", () => {
    const estado = crearEstado(randomUUID());
    cerrarTurnoDocumentos(estado, [doc(1, CONTENIDO_CERTIFICADO), doc(2, CONTENIDO_EXTRACTO)]);
    assert.equal(estado.escalamiento, null);
    estado.escalamiento = {
      motivo: "pide_persona",
      regla: "Regla 4 · el solicitante pide hablar con una persona",
      resultado: "escalada",
      correlationId: estado.correlationId,
      ts: new Date().toISOString(),
    };
    cerrarTurnoDocumentos(estado, [doc(3, CONTENIDO_CERTIFICADO_USD)]);
    assert.equal(estado.escalamiento.motivo, "pide_persona");
  });
});

describe("adaptador: Regla 5 al cerrar el turno y prioridad de señales (revisión de 5d28165)", () => {
  beforeEach(() => fijarDestino({ write: () => true }));
  afterEach(() => fijarDestino(null));

  it("un documento nuevo de tipo no soportado en COP escala al cerrar el turno, aunque el modelo no hiciera nada", async () => {
    const p = prepararExtraccion(
      [doc(1, "Desprendible ficticio. Neto: 3.496.000 COP", "d.md")],
      [],
      {
        verificar: false,
        clasificar: async () => ({ ok: true, tipo: "otro" }),
      },
    );
    assert.equal(await p.adaptador.revisarRegla5AlCerrarTurno(0), 1);
    assert.equal(p.estado.escalamiento?.causa, "documento_no_soportado");
    assert.equal(p.estado.escalamiento?.herramienta, REGLA_5_DOCUMENTOS);
  });

  it("solo clasifica los documentos nuevos: los ya revisados en turnos anteriores no", async () => {
    const vistos: number[] = [];
    const p = prepararExtraccion(
      [doc(1, CONTENIDO_CERTIFICADO), doc(2, CONTENIDO_EXTRACTO, "extracto.md")],
      [],
      {
        verificar: false,
        clasificar: async ({ documento }) => {
          vistos.push(documento.adjunto);
          return { ok: true, tipo: "certificado_laboral" };
        },
      },
    );
    assert.equal(await p.adaptador.revisarRegla5AlCerrarTurno(1), 2);
    assert.deepEqual(vistos, [2]);
    assert.equal(p.estado.escalamiento, null);
  });

  it("no vuelve a clasificar un documento que ya se extrajo en el mismo turno", async () => {
    const vistos: number[] = [];
    const p = prepararExtraccion([doc(1, CONTENIDO_CERTIFICADO)], [valida(salidaCertificado())], {
      clasificar: async ({ documento }) => {
        vistos.push(documento.adjunto);
        return { ok: true, tipo: "certificado_laboral" };
      },
    });
    await p.extraer(1);
    await p.adaptador.revisarRegla5AlCerrarTurno(0);
    assert.deepEqual(vistos, []);
  });

  it("una señal de la Regla 5 reemplaza a una de la Regla 1 del mismo turno", async () => {
    const p = prepararExtraccion([doc(1, CONTENIDO_CERTIFICADO_USD)], [], { verificar: false });
    dejarSenal(p.estado, {
      motivo: "identidad_no_verificable",
      regla: "Regla 1 · 3 intentos fallidos de verificación",
      herramienta: "verificar_identidad",
    });
    await p.adaptador.revisarRegla5AlCerrarTurno(0);
    assert.equal(p.estado.escalamiento?.motivo, "caso_no_cubierto");
    assert.equal(p.estado.escalamiento?.causa, "moneda_extranjera");
  });

  it("una señal de la Regla 4 nunca la reemplaza la Regla 5, y la 5 no la reemplaza la 1", () => {
    const estado = crearEstado(randomUUID());
    dejarSenal(estado, {
      motivo: "pide_persona",
      regla: "Regla 4",
      herramienta: "solicitar_analista",
    });
    dejarSenal(estado, { motivo: "caso_no_cubierto", regla: "Regla 5", herramienta: "x" });
    assert.equal(estado.escalamiento?.motivo, "pide_persona");
    const otro = crearEstado(randomUUID());
    dejarSenal(otro, { motivo: "caso_no_cubierto", regla: "Regla 5", herramienta: "x" });
    dejarSenal(otro, { motivo: "identidad_ambigua", regla: "Regla 1", herramienta: "y" });
    assert.equal(otro.escalamiento?.motivo, "caso_no_cubierto");
  });

  it("una señal técnica no se reemplaza ni reemplaza", () => {
    const estado = crearEstado(randomUUID());
    dejarSenal(estado, {
      motivo: "falla_transitoria_persistente",
      regla: "Principio VI",
      herramienta: "z",
    });
    dejarSenal(estado, { motivo: "caso_no_cubierto", regla: "Regla 5", herramienta: "x" });
    assert.equal(estado.escalamiento?.motivo, "falla_transitoria_persistente");
  });
});

describe("adaptador: orden de reglas con la Regla 3 (#11)", () => {
  const MOTIVOS_REGLA_3 = ["discrepancia_de_ingreso", "inconsistencia_documental"] as const;
  const otraSenal = {
    pide_persona: "Regla 4",
    caso_no_cubierto: "Regla 5",
    identidad_no_verificable: "Regla 1",
  } as const;

  it("ORDEN_REGLA marca ambos motivos como Regla 3", () => {
    for (const motivo of MOTIVOS_REGLA_3) assert.equal(ORDEN_REGLA[motivo], 3);
  });

  it("una señal de la Regla 4, 5 o 1 reemplaza a una de la Regla 3", () => {
    for (const previa of MOTIVOS_REGLA_3) {
      for (const [motivo, regla] of Object.entries(otraSenal)) {
        const estado = crearEstado(randomUUID());
        dejarSenal(estado, { motivo: previa, regla: "Regla 3", herramienta: "verificar_ingreso" });
        dejarSenal(estado, {
          motivo: motivo as keyof typeof otraSenal,
          regla,
          herramienta: "x",
        });
        assert.equal(estado.escalamiento?.motivo, motivo, `${motivo} sobre ${previa}`);
      }
    }
  });

  it("una señal de la Regla 3 no reemplaza a una de la Regla 4, 5 ni 1", () => {
    for (const nueva of MOTIVOS_REGLA_3) {
      for (const [motivo, regla] of Object.entries(otraSenal)) {
        const estado = crearEstado(randomUUID());
        dejarSenal(estado, { motivo: motivo as keyof typeof otraSenal, regla, herramienta: "x" });
        dejarSenal(estado, { motivo: nueva, regla: "Regla 3", herramienta: "verificar_ingreso" });
        assert.equal(estado.escalamiento?.motivo, motivo, `${nueva} bajo ${motivo}`);
      }
    }
  });

  it("entre dos señales de la Regla 3 prevalece la primera", () => {
    const estado = crearEstado(randomUUID());
    dejarSenal(estado, {
      motivo: "inconsistencia_documental",
      regla: "Regla 3",
      herramienta: "extraer_documento",
    });
    dejarSenal(estado, {
      motivo: "discrepancia_de_ingreso",
      regla: "Regla 3",
      herramienta: "verificar_ingreso",
    });
    assert.equal(estado.escalamiento?.motivo, "inconsistencia_documental");
  });

  it("una señal técnica ni reemplaza a una de la Regla 3 ni es reemplazada por ella", () => {
    const estado = crearEstado(randomUUID());
    dejarSenal(estado, {
      motivo: "discrepancia_de_ingreso",
      regla: "Regla 3",
      herramienta: "verificar_ingreso",
    });
    dejarSenal(estado, {
      motivo: "falla_transitoria_persistente",
      regla: "Principio VI",
      herramienta: "z",
    });
    assert.equal(estado.escalamiento?.motivo, "discrepancia_de_ingreso");
    const otro = crearEstado(randomUUID());
    dejarSenal(otro, {
      motivo: "falla_transitoria_persistente",
      regla: "Principio VI",
      herramienta: "z",
    });
    dejarSenal(otro, {
      motivo: "inconsistencia_documental",
      regla: "Regla 3",
      herramienta: "extraer_documento",
    });
    assert.equal(otro.escalamiento?.motivo, "falla_transitoria_persistente");
  });

  it("la señal conserva los valores de la discrepancia", () => {
    const estado = crearEstado(randomUUID());
    dejarSenal(estado, {
      motivo: "discrepancia_de_ingreso",
      regla: "Regla 3",
      herramienta: "verificar_ingreso",
      ingresoDeclarado: 4300000,
      ingresoVerificado: 3800000,
      umbralPorcentaje: 10,
    });
    assert.equal(estado.escalamiento?.ingresoDeclarado, 4300000);
    assert.equal(estado.escalamiento?.ingresoVerificado, 3800000);
    assert.equal(estado.escalamiento?.umbralPorcentaje, 10);
  });
});

// ── Ingreso verificado (#11) ───────────────────────────────────────────────────

/** Registra directamente en el core en memoria los documentos ficticios, sin pasar por el subagente. */
async function registrarEjemplos(p: ReturnType<typeof prepararExtraccion>, ejemplos: Ejemplo[]) {
  for (const e of ejemplos) {
    const validada = validarSalida(e.salida, e, HOY_EJEMPLO);
    if (!validada.ok) assert.fail(JSON.stringify(validada.errores));
    const r = await p.enMemoria.cliente.registrarExtraccion(
      {
        adjunto: e.adjunto,
        nombre: e.nombre,
        contenido: e.contenido,
        resultado: construirResultado(validada.salida, e, 1),
      },
      p.correlationId,
    );
    assert.equal(r.ok, true, JSON.stringify(r));
  }
}

const verificarIngreso = (p: ReturnType<typeof prepararExtraccion>, ingresoDeclarado?: number) =>
  p.adaptador.herramientas.verificar_ingreso.manejar(
    ingresoDeclarado === undefined ? {} : { ingresoDeclarado },
  );

const documentosDeIngreso = () => [ejemploCertificado(), ...extractosTrimestre()];

describe("adaptador: verificar_ingreso (#11, US1, US2 y US4)", () => {
  let logs: Record<string, unknown>[];
  beforeEach(() => {
    logs = [];
    fijarDestino({ write: (t: string) => logs.push(JSON.parse(t) as Record<string, unknown>) });
  });
  afterEach(() => fijarDestino(null));

  it("expone verificar_ingreso con solo el ingreso declarado, opcional", () => {
    const { adaptador } = prepararExtraccion([], []);
    assert.deepEqual(Object.keys(adaptador.herramientas.verificar_ingreso.esquema), [
      "ingresoDeclarado",
    ]);
    const esquema = adaptador.herramientas.verificar_ingreso.esquema.ingresoDeclarado;
    assert.equal(esquema.safeParse(undefined).success, true);
    assert.equal(esquema.safeParse(3_800_000).success, true);
    assert.equal(esquema.safeParse(-1).success, false);
    assert.equal(esquema.safeParse(1.5).success, false);
    assert.equal(esquema.safeParse("3800000").success, false);
  });

  it("verificado: devuelve el ingreso y el origen, sin eventos ni escalamiento", async () => {
    const p = prepararExtraccion([], []);
    await registrarEjemplos(p, documentosDeIngreso());
    const r = await verificarIngreso(p, 3_800_000);
    assert.equal(r.isError, false);
    assert.deepEqual(contenidoDe(r).datos, {
      estado: "verificado",
      ingresoVerificado: 3_800_000,
      origen: "ambos",
    });
    assert.equal(p.estado.escalamiento, null);
    assert.deepEqual(p.estado.eventos, []);
  });

  it("falta_declarado: pide el ingreso con un solo evento por turno y no escala", async () => {
    const p = prepararExtraccion([], []);
    await registrarEjemplos(p, documentosDeIngreso());
    const r = await verificarIngreso(p);
    assert.deepEqual(contenidoDe(r).datos, { estado: "falta_declarado", faltaDeclarado: true });
    await verificarIngreso(p);
    assert.equal(p.estado.eventos.length, 1);
    const evento = p.estado.eventos[0];
    assert.equal(evento?.tipo, "solicitud_de_dato");
    if (evento?.tipo !== "solicitud_de_dato") return;
    assert.equal(evento.motivo, "ingreso_declarado_faltante");
    assert.equal(evento.dato, "ingreso mensual declarado");
    assert.equal(evento.regla, REGLA_3);
    assert.equal(p.estado.escalamiento, null);
  });

  it("sin_ingreso: pide documentos de ingreso y no escala", async () => {
    const p = prepararExtraccion([], []);
    const r = await verificarIngreso(p, 3_800_000);
    assert.deepEqual(contenidoDe(r).datos, { estado: "sin_ingreso", faltanDocumentos: true });
    const evento = p.estado.eventos[0];
    assert.equal(evento?.tipo, "solicitud_de_dato");
    if (evento?.tipo !== "solicitud_de_dato") return;
    assert.equal(evento.motivo, "ingreso_no_verificable");
    assert.equal(evento.dato, "certificado laboral con salario o extractos con abonos de nómina");
    assert.equal(p.estado.escalamiento, null);
  });

  it("al modelo no le llegan inconsistencias, diferencias ni valores de documentos", async () => {
    const p = prepararExtraccion([], []);
    await registrarEjemplos(p, documentosDeIngreso());
    const texto = JSON.stringify((await verificarIngreso(p, 3_800_000)).structuredContent);
    for (const dato of ["inconsistencias", "diferencia", "Industrias", "Ficticia", "fragmento"]) {
      assert.equal(texto.includes(dato), false, dato);
    }
  });

  it("discrepancia: escala con la Regla 3 y los valores, sin darle al modelo la diferencia", async () => {
    const p = prepararExtraccion([], []);
    await registrarEjemplos(p, documentosDeIngreso());
    const r = await verificarIngreso(p, 4_300_000);
    assert.deepEqual(contenidoDe(r).datos, {
      escalada: true,
      estado: "discrepancia",
      siguientePaso: SIGUIENTE_PASO_REGISTRO,
    });
    const senal = p.estado.escalamiento;
    assert.equal(senal?.motivo, "discrepancia_de_ingreso");
    assert.equal(senal?.regla, REGLA_3);
    assert.equal(senal?.herramienta, "verificar_ingreso");
    assert.equal(senal?.ingresoDeclarado, 4_300_000);
    assert.equal(senal?.ingresoVerificado, 3_800_000);
    assert.equal(senal?.umbralPorcentaje, 10);
  });

  it("exactamente el 10% no escala; un peso más sí", async () => {
    const limite = prepararExtraccion([], []);
    await registrarEjemplos(limite, documentosDeIngreso());
    const r = await verificarIngreso(limite, 4_180_000);
    assert.equal(contenidoDe(r).datos?.["estado"], "verificado");
    assert.equal(limite.estado.escalamiento, null);

    const encima = prepararExtraccion([], []);
    await registrarEjemplos(encima, documentosDeIngreso());
    await verificarIngreso(encima, 4_180_001);
    assert.equal(encima.estado.escalamiento?.motivo, "discrepancia_de_ingreso");
  });

  it("una señal de la Regla 4 previa prevalece sobre la de la Regla 3", async () => {
    const p = prepararExtraccion([], []);
    await registrarEjemplos(p, documentosDeIngreso());
    dejarSenal(p.estado, { motivo: "pide_persona", regla: "Regla 4", herramienta: "x" });
    await verificarIngreso(p, 4_300_000).catch(() => undefined);
    assert.equal(p.estado.escalamiento?.motivo, "pide_persona");
  });

  it("una señal de la Regla 5 posterior reemplaza a la de la Regla 3", async () => {
    const p = prepararExtraccion([], []);
    await registrarEjemplos(p, documentosDeIngreso());
    await verificarIngreso(p, 4_300_000);
    assert.equal(p.estado.escalamiento?.motivo, "discrepancia_de_ingreso");
    dejarSenal(p.estado, {
      motivo: "caso_no_cubierto",
      regla: REGLA_NO_CUBIERTO,
      herramienta: "solicitar_analista",
      causa: "moneda_extranjera",
    });
    assert.equal(p.estado.escalamiento?.motivo, "caso_no_cubierto");
  });

  it("con la conversación ya escalada no llama al core", async () => {
    const p = prepararExtraccion([], []);
    await registrarEjemplos(p, documentosDeIngreso());
    dejarSenal(p.estado, { motivo: "pide_persona", regla: "Regla 4", herramienta: "x" });
    const r = await verificarIngreso(p, 3_800_000);
    assert.equal(r.isError, true);
    assert.equal(p.estado.eventos.length, 0);
  });

  it("no_cubierto: confirma la escalada de la Regla 5 sin calcular ni convertir", async () => {
    const p = prepararExtraccion([], []);
    await registrarEjemplos(p, documentosDeIngreso());
    const usd = { adjunto: 8, nombre: "certificado-usd.md", contenido: CONTENIDO_CERTIFICADO_USD };
    const validada = validarSalida(salidaCertificadoUsd(), usd, HOY_EJEMPLO);
    assert.ok(validada.ok);
    if (!validada.ok) return;
    const registro = await p.enMemoria.cliente.registrarExtraccion(
      { ...usd, resultado: construirResultado(validada.salida, usd, 1) },
      p.correlationId,
    );
    assert.ok(registro.ok);
    const r = await verificarIngreso(p, 4_300_000);
    assert.deepEqual(contenidoDe(r).datos, { escalada: true, estado: "no_cubierto" });
    const senal = p.estado.escalamiento;
    assert.equal(senal?.motivo, "caso_no_cubierto");
    assert.equal(senal?.regla, REGLA_NO_CUBIERTO);
    assert.equal(senal?.causa, "moneda_extranjera");
    assert.equal(senal?.adjunto, 8);
  });

  it("si la Regla 5 ya escaló en la extracción, verificar no cambia ni el motivo ni la causa", async () => {
    const p = prepararExtraccion([], []);
    dejarSenal(p.estado, {
      motivo: "caso_no_cubierto",
      regla: REGLA_NO_CUBIERTO,
      herramienta: "extraer_documento",
      causa: "documento_no_soportado",
      adjunto: 3,
    });
    await verificarIngreso(p, 4_300_000);
    assert.equal(p.estado.escalamiento?.causa, "documento_no_soportado");
    assert.equal(p.estado.escalamiento?.adjunto, 3);
  });

  it("moneda extranjera y discrepancia a la vez: queda la Regla 5 y no se evalúa la discrepancia", async () => {
    const p = prepararExtraccion([], []);
    await registrarEjemplos(p, documentosDeIngreso());
    const usd = { adjunto: 8, nombre: "certificado-usd.md", contenido: CONTENIDO_CERTIFICADO_USD };
    const validada = validarSalida(salidaCertificadoUsd(), usd, HOY_EJEMPLO);
    if (!validada.ok) return assert.fail("salida inválida");
    await p.enMemoria.cliente.registrarExtraccion(
      { ...usd, resultado: construirResultado(validada.salida, usd, 1) },
      p.correlationId,
    );
    await verificarIngreso(p, 9_000_000);
    assert.equal(p.estado.escalamiento?.motivo, "caso_no_cubierto");
    assert.notEqual(p.estado.escalamiento?.motivo, "discrepancia_de_ingreso");
  });

  it("una falla del core que se agota escala por falla_transitoria_persistente", async () => {
    const enMemoria = coreEnMemoria();
    const p = prepararExtraccion([], [], {
      core: {
        ...enMemoria.cliente,
        verificarIngreso: async () =>
          fallo(errorTransitorio("core_no_disponible", "No se pudo hablar con el core.")),
      },
    });
    const r = await verificarIngreso(p, 3_800_000);
    assert.equal(r.isError, true);
    assert.equal(p.estado.escalamiento?.motivo, "falla_transitoria_persistente");
    assert.equal(p.estado.escalamiento?.herramienta, "verificar_ingreso");
  });

  it("un error de negocio del core pasa tal cual, sin escalar", async () => {
    const enMemoria = coreEnMemoria();
    const p = prepararExtraccion([], [], {
      core: {
        ...enMemoria.cliente,
        verificarIngreso: async () =>
          fallo(errorNegocio("identidad_no_verificada", "No hay identidad verificada.")),
      },
    });
    const r = await verificarIngreso(p, 3_800_000);
    assert.equal(r.isError, true);
    assert.equal(contenidoDe(r).error?.codigo, "identidad_no_verificada");
    assert.equal(p.estado.escalamiento, null);
  });

  it("el log verificacion_ingreso lleva estado, origen y reglas, sin valores de documentos", async () => {
    const p = prepararExtraccion([], []);
    await registrarEjemplos(p, documentosDeIngreso());
    await verificarIngreso(p, 3_800_000);
    const log = logs.find((l) => l["evento"] === "verificacion_ingreso");
    assert.ok(log, "falta el log");
    assert.equal(log["correlationId"], p.correlationId);
    assert.equal(log["estado"], "verificado");
    assert.equal(log["origen"], "ambos");
    assert.deepEqual(log["inconsistencias"], []);
    assert.equal(log["declarado"], true);
    const texto = JSON.stringify(logs);
    for (const dato of ["Industrias", "Ficticia", "Salario básico", "Certificado laboral"]) {
      assert.equal(texto.includes(dato), false, dato);
    }
  });

  it("avisa al observador de cada intento de llamada al core", async () => {
    const p = prepararExtraccion([], []);
    await registrarEjemplos(p, documentosDeIngreso());
    await verificarIngreso(p, 3_800_000);
    assert.ok(
      p.infos.some((i) => i.herramienta === "verificar_ingreso" && i.resultado === "ok"),
      JSON.stringify(p.infos),
    );
  });
});

describe("adaptador: verificación interna tras extraer_documento (#11, US3)", () => {
  let logs: Record<string, unknown>[];
  beforeEach(() => {
    logs = [];
    fijarDestino({ write: (t: string) => logs.push(JSON.parse(t) as Record<string, unknown>) });
  });
  afterEach(() => fijarDestino(null));

  const comoDocumento = (e: Ejemplo): DocumentoConversacion => ({
    adjunto: e.adjunto,
    nombre: e.nombre,
    soportado: true,
    contenido: e.contenido,
  });
  const conEjemplos = (
    ejemplos: Ejemplo[],
    opciones: Parameters<typeof prepararExtraccion>[2] = {},
  ) =>
    prepararExtraccion(
      ejemplos.map(comoDocumento),
      ejemplos.map((e) => valida(e.salida)),
      opciones,
    );

  it("un extracto de otro titular escala por inconsistencia_documental con las reglas, sin valores", async () => {
    const ajeno = ejemploExtracto({ titular: "Otra Persona Inventada" });
    const p = conEjemplos([ajeno]);
    const r = await p.extraer(ajeno.adjunto);
    assert.deepEqual(contenidoDe(r).datos, {
      escalada: true,
      estado: "inconsistencia",
      siguientePaso: SIGUIENTE_PASO_REGISTRO,
    });
    const senal = p.estado.escalamiento;
    assert.equal(senal?.motivo, "inconsistencia_documental");
    assert.equal(senal?.regla, REGLA_3);
    assert.equal(senal?.herramienta, "extraer_documento");
    assert.equal(senal?.reglas, "titular_vs_solicitante");
    assert.equal(JSON.stringify(logs).includes("Otra Persona Inventada"), false);
  });

  it("no le devuelve al modelo el resultado ni los valores del documento contradictorio", async () => {
    const ajeno = ejemploExtracto({ titular: "Otra Persona Inventada" });
    const p = conEjemplos([ajeno]);
    const texto = JSON.stringify((await p.extraer(ajeno.adjunto)).structuredContent);
    assert.equal(texto.includes("Otra Persona Inventada"), false);
    assert.equal(texto.includes("resultado"), false);
  });

  it("empleador distinto del pagador escala por empleador_vs_pagador", async () => {
    const certificado = ejemploCertificado({ empleador: "Compañía Inventada del Norte" });
    const [julio] = extractosTrimestre();
    const p = conEjemplos([certificado, julio!]);
    await p.extraer(certificado.adjunto);
    assert.equal(p.estado.escalamiento === null, true, "un certificado solo no contradice nada");
    await p.extraer(julio!.adjunto);
    assert.equal(p.estado.escalamiento?.motivo, "inconsistencia_documental");
    assert.equal(p.estado.escalamiento?.reglas, "empleador_vs_pagador");
  });

  it("documentos consistentes no escalan y devuelven el resultado de siempre", async () => {
    const ejemplos = documentosDeIngreso();
    const p = conEjemplos(ejemplos);
    for (const e of ejemplos) {
      const r = await p.extraer(e.adjunto);
      assert.equal(r.isError, false);
      assert.equal(resultadoDe(r).estado, "extraido");
    }
    assert.equal(p.estado.escalamiento, null);
  });

  it("una inconsistencia que no detiene (hueco entre periodos) no escala", async () => {
    const [julio, , septiembre] = extractosTrimestre();
    const p = conEjemplos([ejemploCertificado(), julio!, septiembre!]);
    for (const e of [ejemploCertificado(), julio!, septiembre!]) await p.extraer(e.adjunto);
    assert.equal(p.estado.escalamiento, null);
  });

  it("un documento reutilizado no vuelve a verificar el ingreso", async () => {
    const e = ejemploCertificado();
    const enMemoria = coreEnMemoria();
    let llamadas = 0;
    const core: ClienteCore = {
      ...enMemoria.cliente,
      async verificarIngreso(entrada, correlationId) {
        llamadas++;
        return enMemoria.cliente.verificarIngreso(entrada, correlationId);
      },
    };
    const p = prepararExtraccion([comoDocumento(e)], [valida(e.salida)], { core });
    enMemoria.verificar(p.correlationId);
    await p.extraer(e.adjunto);
    assert.equal(llamadas, 1);
    await p.extraer(e.adjunto);
    assert.equal(llamadas, 1);
  });

  it("deja el log verificacion_ingreso con las reglas y sin valores de documentos", async () => {
    const ajeno = ejemploExtracto({ titular: "Otra Persona Inventada" });
    const p = conEjemplos([ajeno]);
    await p.extraer(ajeno.adjunto);
    const log = logs.find((l) => l["evento"] === "verificacion_ingreso");
    assert.ok(log, "falta el log");
    assert.equal(log["estado"], "inconsistencia");
    assert.deepEqual(log["inconsistencias"], ["titular_vs_solicitante"]);
    assert.equal(log["declarado"], false);
  });

  it("si el core falla al verificar, el error pasa al modelo y no se decide nada", async () => {
    const e = ejemploCertificado();
    const enMemoria = coreEnMemoria();
    const core: ClienteCore = {
      ...enMemoria.cliente,
      verificarIngreso: async () =>
        fallo(errorNegocio("identidad_no_verificada", "No hay identidad verificada.")),
    };
    const p = prepararExtraccion([comoDocumento(e)], [valida(e.salida)], { core });
    enMemoria.verificar(p.correlationId);
    const r = await p.extraer(e.adjunto);
    assert.equal(r.isError, true);
    assert.equal(p.estado.escalamiento, null);
  });
});

describe("adaptador: moneda extranjera y la Regla 5 sobre la Regla 3 (#11, US4)", () => {
  beforeEach(() => fijarDestino({ write: () => true }));
  afterEach(() => fijarDestino(null));

  const comoDocumento = (e: Ejemplo): DocumentoConversacion => ({
    adjunto: e.adjunto,
    nombre: e.nombre,
    soportado: true,
    contenido: e.contenido,
  });
  const usd: DocumentoConversacion = {
    adjunto: 8,
    nombre: "certificado-usd.md",
    soportado: true,
    contenido: CONTENIDO_CERTIFICADO_USD,
  };

  it("un documento en dólares junto a documentos en pesos es no cubierto, no una inconsistencia", async () => {
    const ejemplos = documentosDeIngreso();
    const p = prepararExtraccion(
      [...ejemplos.map(comoDocumento), usd],
      [...ejemplos.map((e) => valida(e.salida)), valida(salidaCertificadoUsd())],
    );
    for (const e of ejemplos) await p.extraer(e.adjunto);
    const r = await p.extraer(usd.adjunto);
    assert.deepEqual(contenidoDe(r).datos, { escalada: true, causa: "moneda_extranjera" });
    assert.equal(p.estado.escalamiento?.motivo, "caso_no_cubierto");
    assert.equal(p.estado.escalamiento?.causa, "moneda_extranjera");
  });

  it("la verificación interna no reemplaza una señal de la Regla 5 por una de la Regla 3", async () => {
    const ajeno = ejemploExtracto({ titular: "Otra Persona Inventada" });
    const p = prepararExtraccion([comoDocumento(ajeno)], [valida(ajeno.salida)]);
    dejarSenal(p.estado, {
      motivo: "caso_no_cubierto",
      regla: REGLA_NO_CUBIERTO,
      herramienta: "extraer_documento",
      causa: "moneda_extranjera",
      adjunto: 8,
    });
    await p.extraer(ajeno.adjunto).catch(() => undefined);
    assert.equal(p.estado.escalamiento?.motivo, "caso_no_cubierto");
    assert.equal(p.estado.escalamiento?.causa, "moneda_extranjera");
  });
});

describe("adaptador: reextracción de inconsistencias corregibles (#11, US5)", () => {
  let logs: Record<string, unknown>[];
  beforeEach(() => {
    logs = [];
    fijarDestino({ write: (t: string) => logs.push(JSON.parse(t) as Record<string, unknown>) });
  });
  afterEach(() => fijarDestino(null));

  const comoDocumento = (e: Ejemplo): DocumentoConversacion => ({
    adjunto: e.adjunto,
    nombre: e.nombre,
    soportado: true,
    contenido: e.contenido,
  });
  const lecturaErrada = () => {
    const { errada, correcta } = extractoConLecturaErrada();
    return { errada, correcta, documento: comoDocumento(correcta) };
  };
  const registrosDelCore = (p: ReturnType<typeof prepararExtraccion>) => {
    const r = p.enMemoria.core.consultarExtracciones(p.correlationId);
    assert.ok(r.ok);
    return r.ok ? r.datos.extracciones : [];
  };

  it("corrige: la segunda lectura del titular reemplaza el registro, no queda inconsistencia y no escala", async () => {
    const { errada, correcta, documento } = lecturaErrada();
    const p = prepararExtraccion([documento], [valida(errada.salida), valida(correcta.salida)]);
    const r = await p.extraer(documento.adjunto);
    assert.equal(r.isError, false);
    assert.equal(resultadoDe(r).estado, "extraido");
    assert.equal(p.estado.escalamiento === null, true);
    assert.deepEqual(registrosDelCore(p)[0]?.reextraidaPor, ["titular_vs_solicitante"]);
    assert.equal(p.subagente.entradas.length, 2);
  });

  it("al subagente de la reextracción le da la regla y el valor extraído, sin el nombre del solicitante", async () => {
    const { errada, correcta, documento } = lecturaErrada();
    const p = prepararExtraccion([documento], [valida(errada.salida), valida(correcta.salida)]);
    await p.extraer(documento.adjunto);
    const segunda = p.subagente.entradas[1];
    assert.equal(segunda?.erroresPrevios[0]?.motivo, "inconsistencia_entre_documentos");
    const detalle = segunda?.erroresPrevios[0]?.detalle ?? "";
    assert.ok(detalle.includes("Regla titular_vs_solicitante"));
    assert.ok(detalle.includes("Luis Gómez Inventado"));
    assert.equal(JSON.stringify(segunda?.erroresPrevios).includes("Ana"), false);
    assert.equal(p.subagente.entradas[0]?.erroresPrevios.length, 0);
  });

  it("persiste: si la inconsistencia sigue tras la ronda, escala por inconsistencia_documental", async () => {
    const { errada, documento } = lecturaErrada();
    const p = prepararExtraccion([documento], [valida(errada.salida)]);
    const r = await p.extraer(documento.adjunto);
    assert.deepEqual(contenidoDe(r).datos, {
      escalada: true,
      estado: "inconsistencia",
      siguientePaso: SIGUIENTE_PASO_REGISTRO,
    });
    assert.equal(p.estado.escalamiento?.motivo, "inconsistencia_documental");
    assert.equal(p.estado.escalamiento?.reglas, "titular_vs_solicitante");
    // Una extracción y una ronda: la lectura sigue siendo válida pero errada, así que no hay más intentos.
    assert.equal(p.subagente.entradas.length, 2);
  });

  it("una sola ronda por adjunto y regla: entregar el mismo documento otra vez no reextrae de nuevo", async () => {
    const { errada, documento } = lecturaErrada();
    const p = prepararExtraccion([documento], [valida(errada.salida)]);
    await p.extraer(documento.adjunto);
    const antes = p.subagente.entradas.length;
    await p.extraer(documento.adjunto).catch(() => undefined);
    assert.equal(p.subagente.entradas.length, antes);
  });

  it("una inconsistencia no corregible (periodos superpuestos) no se reextrae", async () => {
    const a = ejemploExtracto({ adjunto: 2, nombre: "a.md" });
    const b = ejemploExtracto({
      adjunto: 3,
      nombre: "b.md",
      desde: "2026-08-15",
      hasta: "2026-09-14",
      movimientos: [{ ...nominaDelMes("2026-08-01"), fecha: "2026-08-20" }],
    });
    const p = prepararExtraccion(
      [a, b].map(comoDocumento),
      [a, b].map((e) => valida(e.salida)),
    );
    await p.extraer(a.adjunto);
    await p.extraer(b.adjunto);
    assert.equal(p.estado.escalamiento?.motivo, "inconsistencia_documental");
    assert.equal(p.estado.escalamiento?.reglas, "periodos_superpuestos");
    assert.equal(p.subagente.entradas.length, 2, "ninguna reextracción");
  });

  it("empleador_vs_pagador reextrae todos los documentos involucrados", async () => {
    const certificado = ejemploCertificado({ empleador: "Compañía Inventada del Norte" });
    const [julio] = extractosTrimestre();
    const docs = [certificado, julio!];
    const p = prepararExtraccion(
      docs.map(comoDocumento),
      docs.map((e) => valida(e.salida)),
    );
    await p.extraer(certificado.adjunto);
    await p.extraer(julio!.adjunto);
    const reextraidos = p.subagente.entradas
      .filter((e) => e.erroresPrevios.some((x) => x.motivo === "inconsistencia_entre_documentos"))
      .map((e) => e.documento.adjunto);
    assert.ok(reextraidos.includes(certificado.adjunto), "el certificado");
    assert.ok(reextraidos.includes(julio!.adjunto), "el extracto");
    assert.equal(p.estado.escalamiento?.motivo, "inconsistencia_documental");
  });

  it("si el subagente no responde en la ronda conserva el registro y no escala por esa falla", async () => {
    const { errada, documento } = lecturaErrada();
    const p = prepararExtraccion([documento], [valida(errada.salida), tiempoAgotado]);
    await p.extraer(documento.adjunto);
    assert.equal(p.estado.escalamiento?.motivo, "inconsistencia_documental");
    assert.deepEqual(registrosDelCore(p)[0]?.reextraidaPor, []);
  });

  it("reextraccion_no_aplica y reextraccion_agotada del core se conservan y la inconsistencia decide", async () => {
    for (const codigo of ["reextraccion_no_aplica", "reextraccion_agotada"]) {
      const { errada, correcta, documento } = lecturaErrada();
      const enMemoria = coreEnMemoria();
      const core: ClienteCore = {
        ...enMemoria.cliente,
        async registrarExtraccion(entrada, correlationId) {
          if (entrada.reextraccion !== undefined) {
            return fallo(errorNegocio(codigo, "El core no acepta el reemplazo."));
          }
          return enMemoria.cliente.registrarExtraccion(entrada, correlationId);
        },
      };
      const p = prepararExtraccion([documento], [valida(errada.salida), valida(correcta.salida)], {
        core,
      });
      enMemoria.verificar(p.correlationId);
      const r = await p.extraer(documento.adjunto);
      assert.deepEqual(
        contenidoDe(r).datos,
        { escalada: true, estado: "inconsistencia", siguientePaso: SIGUIENTE_PASO_REGISTRO },
        codigo,
      );
      assert.equal(p.estado.escalamiento?.motivo, "inconsistencia_documental", codigo);
    }
  });

  it("el log intento_extraccion lleva la regla de la reextracción y ningún valor", async () => {
    const { errada, correcta, documento } = lecturaErrada();
    const p = prepararExtraccion([documento], [valida(errada.salida), valida(correcta.salida)]);
    await p.extraer(documento.adjunto);
    const intentos = logs.filter((l) => l["evento"] === "intento_extraccion");
    assert.equal(intentos.length, 2);
    assert.equal(intentos[0]?.["reextraccion"], undefined);
    assert.equal(intentos[1]?.["reextraccion"], "titular_vs_solicitante");
    const texto = JSON.stringify(logs);
    for (const dato of ["Luis Gómez", "Ana Pérez", "Autorizado"]) {
      assert.equal(texto.includes(dato), false, dato);
    }
  });

  it("el log verificacion_ingreso cuenta las reextracciones", async () => {
    const { errada, correcta, documento } = lecturaErrada();
    const p = prepararExtraccion([documento], [valida(errada.salida), valida(correcta.salida)]);
    await p.extraer(documento.adjunto);
    const verificaciones = logs.filter((l) => l["evento"] === "verificacion_ingreso");
    assert.equal(verificaciones.at(-1)?.["reextracciones"], 1);
  });
});

describe("adaptador: calcular_capacidad_pago (#12, US1)", () => {
  const entrada = { monto: 4_000_000, plazoMeses: 24, ingresoMensual: 3_800_000 };
  const simulacion = {
    tipo: "simulacion",
    vinculante: false,
    ...entrada,
    fuenteIngreso: "declarado",
    tasaMensualPuntosBase: 180,
    cuotaMensual: 206_723,
    relacionCuotaIngresoPorcentaje: 5.44,
    aviso: "Simulación no vinculante.",
    versionPolitica: "2026-10-18.2",
  } as const;

  /** Core falso que responde a la simulación con las respuestas dadas y registra cada llamada. */
  function coreConCapacidad(respuestas: RespuestaCapacidadPago[]) {
    const llamadas: { entrada: unknown; correlationId: string }[] = [];
    const core: ClienteCore = {
      ...coreFalso([exito({ solicitud: null })]).core,
      async calcularCapacidadPago(entradaCore, correlationId) {
        llamadas.push({ entrada: entradaCore, correlationId });
        return respuestas[Math.min(llamadas.length - 1, respuestas.length - 1)]!;
      },
    };
    return { core, llamadas };
  }

  it("expone calcular_capacidad_pago con monto, plazo e ingreso, sin correlationId", () => {
    const { core } = coreConCapacidad([exito({ simulacion })]);
    const adaptador = crearAdaptador({ core, estado: crearEstado(randomUUID()) });
    const { esquema } = adaptador.herramientas.calcular_capacidad_pago;
    assert.deepEqual(Object.keys(esquema), ["monto", "plazoMeses", "ingresoMensual"]);
    assert.equal(esquema.ingresoMensual.safeParse(undefined).success, true);
    // Un valor inválido llega al core, que lo rechaza con su campo y su motivo (FR-010).
    for (const invalido of [0, -1, 1.5]) {
      assert.equal(esquema.monto.safeParse(invalido).success, true, String(invalido));
      assert.equal(esquema.plazoMeses.safeParse(invalido).success, true, String(invalido));
    }
    assert.equal(esquema.monto.safeParse("4000000").success, false);
  });

  it("llama al core con el correlationId del estado y devuelve la respuesta tal cual", async () => {
    const correlationId = randomUUID();
    const respuesta = exito({ simulacion });
    const { core, llamadas } = coreConCapacidad([respuesta]);
    const adaptador = crearAdaptador({ core, estado: crearEstado(correlationId) });
    const resultado = await adaptador.herramientas.calcular_capacidad_pago.manejar(entrada);
    assert.deepEqual(llamadas, [{ entrada, correlationId }]);
    assert.deepEqual(resultado.structuredContent, respuesta);
    assert.equal(resultado.isError, false);
  });

  it("sin ingresoMensual no lo completa: lo envía ausente al core", async () => {
    const { core, llamadas } = coreConCapacidad([
      fallo(errorValidacion("ingreso_invalido", "Falta el ingreso.", "ingresoMensual")),
    ]);
    const adaptador = crearAdaptador({ core, estado: crearEstado(randomUUID()) });
    await adaptador.herramientas.calcular_capacidad_pago.manejar({
      monto: 1_000_000,
      plazoMeses: 12,
    });
    assert.deepEqual(llamadas[0]?.entrada, { monto: 1_000_000, plazoMeses: 12 });
  });

  it("ante un error transitorio reintenta y, agotados los intentos, deja la señal de escalamiento", async () => {
    const transitorio = fallo<never>(
      errorTransitorio("core_no_disponible", "El core no responde."),
    );
    const { core, llamadas } = coreConCapacidad([transitorio]);
    const estado = crearEstado(randomUUID());
    const esperas: number[] = [];
    const adaptador = crearAdaptador({
      core,
      estado,
      dormir: async (ms) => void esperas.push(ms),
      azar: () => 0.5,
    });
    const resultado = await adaptador.herramientas.calcular_capacidad_pago.manejar(entrada);
    const contenido = resultado.structuredContent as { error: { codigo: string } };
    assert.equal(llamadas.length, 3);
    assert.deepEqual(esperas, [500, 1000]);
    assert.equal(contenido.error.codigo, "transitorio_agotado");
    assert.equal(estado.escalamiento?.motivo, "falla_transitoria_persistente");
    assert.equal(estado.escalamiento?.herramienta, "calcular_capacidad_pago");
  });

  it("US2: una simulación correcta no deja señal, ni eventos, ni llama a otra herramienta del core", async () => {
    const base = coreConCapacidad([exito({ simulacion })]).core;
    const otras: string[] = [];
    const core = Object.fromEntries(
      Object.entries(base).map(([nombre, metodo]) => [
        nombre,
        nombre === "calcularCapacidadPago"
          ? metodo
          : (...args: unknown[]) => {
              otras.push(nombre);
              return (metodo as (...a: unknown[]) => unknown)(...args);
            },
      ]),
    ) as unknown as ClienteCore;
    const estado = crearEstado(randomUUID());
    const adaptador = crearAdaptador({ core, estado });
    const resultado = await adaptador.herramientas.calcular_capacidad_pago.manejar(entrada);
    assert.equal(resultado.isError, false);
    assert.equal(estado.escalamiento, null);
    assert.deepEqual(estado.eventos, []);
    assert.deepEqual(otras, []);
  });

  it("contra el core simulado, la simulación de referencia llega con su cuota", async () => {
    const adaptador = crearAdaptador({
      core: coreEnMemoria().cliente,
      estado: crearEstado(randomUUID()),
    });
    const resultado = await adaptador.herramientas.calcular_capacidad_pago.manejar(entrada);
    const contenido = resultado.structuredContent as {
      ok: boolean;
      datos: { simulacion: { cuotaMensual: number } };
    };
    assert.equal(contenido.ok, true);
    assert.equal(contenido.datos.simulacion.cuotaMensual, 206_723);
  });
});

describe("adaptador: calcular_capacidad_pago con entradas inválidas (#12, US4)", () => {
  const errorMonto = errorValidacion(
    "monto_invalido",
    "El monto debe ser un entero de pesos mayor que 0.",
    "monto",
  );

  it("un error de validación del core pasa tal cual al modelo, sin cuota", async () => {
    const respuesta = fallo<never>(errorMonto);
    let llamadas = 0;
    const core: ClienteCore = {
      ...coreFalso([exito({ solicitud: null })]).core,
      async calcularCapacidadPago() {
        llamadas++;
        return respuesta;
      },
    };
    const estado = crearEstado(randomUUID());
    const adaptador = crearAdaptador({ core, estado, dormir: async () => {}, azar: () => 0.5 });
    const resultado = await adaptador.herramientas.calcular_capacidad_pago.manejar({
      monto: 0,
      plazoMeses: 12,
      ingresoMensual: 3_000_000,
    });
    assert.equal(resultado.isError, true);
    assert.deepEqual(resultado.structuredContent, respuesta);
    assert.equal(JSON.stringify(resultado.structuredContent).includes("cuotaMensual"), false);
    // No es reintentable: el core se llama una sola vez, y no se escala por esto.
    assert.equal(llamadas, 1);
    assert.equal(estado.escalamiento, null);
  });

  it("contra el core simulado, cada dato inválido vuelve con su código y su campo", async () => {
    const adaptador = crearAdaptador({
      core: coreEnMemoria().cliente,
      estado: crearEstado(randomUUID()),
    });
    const { manejar } = adaptador.herramientas.calcular_capacidad_pago;
    const casos: Array<[Parameters<typeof manejar>[0], string, string]> = [
      [{ monto: 0, plazoMeses: 12, ingresoMensual: 3_000_000 }, "monto_invalido", "monto"],
      [
        { monto: 1_000_000, plazoMeses: -3, ingresoMensual: 3_000_000 },
        "plazo_invalido",
        "plazoMeses",
      ],
      [
        { monto: 1_000_000, plazoMeses: 12, ingresoMensual: 0 },
        "ingreso_invalido",
        "ingresoMensual",
      ],
      [{ monto: 1_000_000, plazoMeses: 12 }, "ingreso_invalido", "ingresoMensual"],
      [{ monto: 1.5, plazoMeses: 12, ingresoMensual: 3_000_000 }, "monto_invalido", "monto"],
    ];
    for (const [entrada, codigo, campo] of casos) {
      const resultado = await manejar(entrada);
      const contenido = resultado.structuredContent as {
        ok: boolean;
        error?: { codigo: string; campo?: string; reintentable: boolean };
      };
      assert.equal(resultado.isError, true, JSON.stringify(entrada));
      assert.equal(contenido.error?.codigo, codigo, JSON.stringify(entrada));
      assert.equal(contenido.error?.campo, campo, JSON.stringify(entrada));
      assert.equal(contenido.error?.reintentable, false);
    }
  });
});
describe("adaptador: registrar_solicitud (#13, US1)", () => {
  const CITA_MONTO = "quiero 4 millones";
  const CITA_PLAZO = "a 24 meses";
  const MENSAJES = [`Hola, ${CITA_MONTO} ${CITA_PLAZO}, por favor`];

  const solicitudDeEjemplo = esquemaSolicitudRegistrada.parse({
    idSolicitud: "SOL-0002000001",
    correlationId: "0b0b6b6e-5f0e-4a39-9d57-6a0c1c1f0a11",
    claveIdempotencia: "x",
    estado: "en_estudio",
    registradaEn: "2026-10-18T12:00:00.000Z",
    solicitante: {
      idSolicitante: ID_SOLICITANTE_UNICO,
      nombre: "Ana Pérez Ficticia",
      documentoEnmascarado: "******4567",
    },
    monto: {
      valor: 4_000_000,
      procedencia: { tipo: "afirmacion", fragmento: CITA_MONTO },
    },
    plazoMeses: {
      valor: 24,
      procedencia: { tipo: "afirmacion", fragmento: CITA_PLAZO },
    },
    ingresoDeclarado: null,
    verificacionIngreso: null,
    datosExtraidos: [],
    preaprobacion: null,
    versionPolitica: "2026-10-18.3",
  });

  type EntradaCore = Parameters<ClienteCore["registrarSolicitud"]>[0];

  function coreRegistro(respuesta?: Awaited<ReturnType<ClienteCore["registrarSolicitud"]>>) {
    const llamadas: { entrada: EntradaCore; correlationId: string }[] = [];
    const core: ClienteCore = {
      ...CORE_NO_SIMULADO,
      async consultarSolicitud() {
        return exito({ solicitud: null });
      },
      async registrarSolicitud(entrada, correlationId) {
        llamadas.push({ entrada, correlationId });
        return respuesta ?? exito({ solicitud: solicitudDeEjemplo, repetida: false });
      },
      async cerrar() {},
    };
    return { core, llamadas };
  }

  const argumentos = {
    idSolicitante: ID_SOLICITANTE_UNICO,
    monto: 4_000_000,
    plazoMeses: 24,
    origen: {
      monto: { fragmento: CITA_MONTO },
      plazoMeses: { fragmento: CITA_PLAZO },
    },
  };

  const documentos: DocumentoConversacion[] = [
    {
      adjunto: 1,
      nombre: "certificado.md",
      soportado: true,
      contenido: CONTENIDO_CERTIFICADO,
    },
  ];

  function adaptadorCon(
    core: ClienteCore,
    opciones: {
      estado?: ReturnType<typeof crearEstado>;
      mensajes?: readonly string[];
      docs?: readonly DocumentoConversacion[];
      alUsarHerramienta?: (info: InfoHerramienta) => void;
    } = {},
  ) {
    const estado = opciones.estado ?? crearEstado(randomUUID());
    const adaptador = crearAdaptador({
      core,
      estado,
      dormir: async () => {},
      azar: () => 0.5,
      mensajesSolicitante: opciones.mensajes ?? MENSAJES,
      documentos: opciones.docs ?? documentos,
      ...(opciones.alUsarHerramienta !== undefined
        ? { alUsarHerramienta: opciones.alUsarHerramienta }
        : {}),
    });
    return { adaptador, estado };
  }

  function senal(estado: ReturnType<typeof crearEstado>, motivo: SenalEscalamiento["motivo"]) {
    estado.escalamiento = {
      motivo,
      regla: "regla de prueba",
      resultado: "escalada",
      correlationId: estado.correlationId,
      ts: new Date().toISOString(),
    };
  }

  it("expone registrar_solicitud sin correlationId ni clave de idempotencia en su entrada", () => {
    const { core } = coreRegistro();
    const { adaptador } = adaptadorCon(core);
    assert.deepEqual(Object.keys(adaptador.herramientas.registrar_solicitud.esquema), [
      "idSolicitante",
      "monto",
      "plazoMeses",
      "origen",
    ]);
  });

  it("arma la afirmación del solicitante y llama al core con la clave calculada por el código", async () => {
    const { core, llamadas } = coreRegistro();
    const { adaptador, estado } = adaptadorCon(core);
    await adaptador.herramientas.registrar_solicitud.manejar(argumentos);
    assert.equal(llamadas.length, 1);
    assert.equal(llamadas[0]?.correlationId, estado.correlationId);
    assert.deepEqual(llamadas[0]?.entrada, {
      idSolicitante: ID_SOLICITANTE_UNICO,
      monto: 4_000_000,
      plazoMeses: 24,
      claveIdempotencia: claveIdempotenciaSolicitud(ID_SOLICITANTE_UNICO, 4_000_000, 24),
      procedencia: {
        monto: { tipo: "afirmacion", fragmento: CITA_MONTO },
        plazoMeses: { tipo: "afirmacion", fragmento: CITA_PLAZO },
      },
    });
  });

  it("con adjunto arma el documento con su nombre real, tomado de la conversación", async () => {
    const { core, llamadas } = coreRegistro();
    const { adaptador } = adaptadorCon(core);
    await adaptador.herramientas.registrar_solicitud.manejar({
      ...argumentos,
      origen: {
        monto: { fragmento: "Salario básico mensual", adjunto: 1 },
        plazoMeses: { fragmento: CITA_PLAZO },
      },
    });
    assert.deepEqual(llamadas[0]?.entrada.procedencia.monto, {
      tipo: "documento",
      adjunto: 1,
      nombre: "certificado.md",
      fragmento: "Salario básico mensual",
    });
  });

  it("incluye la procedencia del ingreso declarado solo si el modelo la dio", async () => {
    const { core, llamadas } = coreRegistro();
    const { adaptador } = adaptadorCon(core, {
      mensajes: [...MENSAJES, "gano 3.800.000"],
    });
    await adaptador.herramientas.registrar_solicitud.manejar(argumentos);
    assert.equal("ingresoDeclarado" in (llamadas[0]?.entrada.procedencia ?? {}), false);
    await adaptador.herramientas.registrar_solicitud.manejar({
      ...argumentos,
      origen: {
        ...argumentos.origen,
        ingresoDeclarado: { fragmento: "gano 3.800.000" },
      },
    });
    assert.deepEqual(llamadas[1]?.entrada.procedencia.ingresoDeclarado, {
      tipo: "afirmacion",
      fragmento: "gano 3.800.000",
    });
  });

  it("la clave es la misma con otro adaptador (otro turno) y cambia con el monto, el plazo o el solicitante", async () => {
    const { core, llamadas } = coreRegistro();
    await adaptadorCon(core).adaptador.herramientas.registrar_solicitud.manejar(argumentos);
    await adaptadorCon(core).adaptador.herramientas.registrar_solicitud.manejar(argumentos);
    await adaptadorCon(core).adaptador.herramientas.registrar_solicitud.manejar({
      ...argumentos,
      monto: 3_000_000,
    });
    await adaptadorCon(core).adaptador.herramientas.registrar_solicitud.manejar({
      ...argumentos,
      plazoMeses: 12,
    });
    await adaptadorCon(core).adaptador.herramientas.registrar_solicitud.manejar({
      ...argumentos,
      idSolicitante: ID_HOMONIMO_1,
    });
    const claves = llamadas.map((l) => l.entrada.claveIdempotencia);
    assert.equal(claves[0], claves[1]);
    assert.equal(new Set(claves).size, 4);
  });

  it("al modelo le devuelve solo el identificador, el estado y si fue una repetición", async () => {
    const { core } = coreRegistro();
    const { adaptador } = adaptadorCon(core);
    const resultado = await adaptador.herramientas.registrar_solicitud.manejar(argumentos);
    assert.equal(resultado.isError, false);
    assert.deepEqual(resultado.structuredContent, {
      ok: true,
      datos: {
        idSolicitud: "SOL-0002000001",
        estado: "en_estudio",
        repetida: false,
      },
    });
    assert.doesNotMatch(JSON.stringify(resultado), /quiero 4 millones|Ficticia|procedencia/);
  });

  it("una repetición se informa como repetida", async () => {
    const { core } = coreRegistro(exito({ solicitud: solicitudDeEjemplo, repetida: true }));
    const { adaptador } = adaptadorCon(core);
    const resultado = await adaptador.herramientas.registrar_solicitud.manejar(argumentos);
    const contenido = resultado.structuredContent as {
      datos: { repetida: boolean };
    };
    assert.equal(contenido.datos.repetida, true);
  });

  it("un error del core pasa tal cual al modelo, sin reintentar si no es transitorio", async () => {
    const error = errorNegocio("solicitud_abierta", "Ya hay una abierta: SOL-0002000001.");
    const { core, llamadas } = coreRegistro(fallo(error));
    const { adaptador, estado } = adaptadorCon(core);
    const resultado = await adaptador.herramientas.registrar_solicitud.manejar(argumentos);
    assert.equal(resultado.isError, true);
    assert.deepEqual(resultado.structuredContent, { ok: false, error });
    assert.equal(llamadas.length, 1);
    assert.equal(estado.escalamiento, null);
  });

  it("si los reintentos se agotan deja la señal de falla transitoria persistente", async () => {
    const { core, llamadas } = coreRegistro(
      fallo(errorTransitorio("core_no_disponible", "El core no está disponible.")),
    );
    const { adaptador, estado } = adaptadorCon(core);
    const resultado = await adaptador.herramientas.registrar_solicitud.manejar(argumentos);
    assert.equal(resultado.isError, true);
    assert.equal(estado.escalamiento?.motivo, "falla_transitoria_persistente");
    assert.equal(estado.escalamiento?.herramienta, "registrar_solicitud");
    assert.ok(llamadas.length > 1);
  });

  it("tras una señal de la Regla 3 la llamada sí llega al core, para que el analista reciba la solicitud", async () => {
    for (const motivo of MOTIVOS_QUE_ADMITEN_REGISTRO) {
      const { core, llamadas } = coreRegistro();
      const { adaptador, estado } = adaptadorCon(core);
      senal(estado, motivo);
      const resultado = await adaptador.herramientas.registrar_solicitud.manejar(argumentos);
      assert.equal(resultado.isError, false, motivo);
      assert.equal(llamadas.length, 1, motivo);
      assert.equal(estado.escalamiento?.motivo, motivo, "la señal no se pierde");
    }
  });

  it("los motivos que admiten el registro son solo los de la Regla 3", () => {
    assert.deepEqual([...MOTIVOS_QUE_ADMITEN_REGISTRO].sort(), [
      "discrepancia_de_ingreso",
      "inconsistencia_documental",
    ]);
    for (const motivo of MOTIVOS_QUE_ADMITEN_REGISTRO) assert.equal(ORDEN_REGLA[motivo], 3);
  });

  it("tras la Regla 4, la Regla 5 o una falla técnica no llega al core: transitorio_agotado", async () => {
    const motivos: SenalEscalamiento["motivo"][] = [
      "pide_persona",
      "caso_no_cubierto",
      "falla_transitoria_persistente",
      "identidad_ambigua",
      "identidad_no_verificable",
      "documento_no_extraible",
    ];
    for (const motivo of motivos) {
      const { core, llamadas } = coreRegistro();
      const { adaptador, estado } = adaptadorCon(core);
      senal(estado, motivo);
      const resultado = await adaptador.herramientas.registrar_solicitud.manejar(argumentos);
      const contenido = resultado.structuredContent as {
        error: { codigo: string };
      };
      assert.equal(llamadas.length, 0, motivo);
      assert.equal(contenido.error.codigo, "transitorio_agotado", motivo);
    }
  });

  it("la excepción es solo del registro: con la señal de la Regla 3 las demás herramientas siguen cortando", async () => {
    const { core, llamadas } = coreFalso([exito({ solicitud: null })]);
    const estado = crearEstado(randomUUID());
    senal(estado, "discrepancia_de_ingreso");
    const adaptador = crearAdaptador({ core, estado, dormir: async () => {} });
    const resultado = await adaptador.herramientas.consultar_solicitud.manejar({
      idSolicitud: ID_EN_ESTUDIO,
    });
    const contenido = resultado.structuredContent as {
      error: { codigo: string };
    };
    assert.equal(llamadas.length, 0);
    assert.equal(contenido.error.codigo, "transitorio_agotado");
  });

  it("no emite eventos de negocio y el modo de demostración la muestra", async () => {
    const { core } = coreRegistro();
    const vistas: InfoHerramienta[] = [];
    const { adaptador, estado } = adaptadorCon(core, {
      alUsarHerramienta: (info) => vistas.push(info),
    });
    await adaptador.herramientas.registrar_solicitud.manejar(argumentos);
    assert.deepEqual(estado.eventos, []);
    assert.deepEqual(vistas, [{ herramienta: "registrar_solicitud", intento: 1, resultado: "ok" }]);
  });
});

describe("adaptador: registrar_solicitud comprueba las citas antes de llamar al core (#13, US3)", () => {
  const CITA_MONTO = "quiero 4 millones";
  const CITA_PLAZO = "a 24 meses";

  type EntradaCore = Parameters<ClienteCore["registrarSolicitud"]>[0];

  function coreRegistro() {
    const llamadas: EntradaCore[] = [];
    const core: ClienteCore = {
      ...CORE_NO_SIMULADO,
      async consultarSolicitud() {
        return exito({ solicitud: null });
      },
      async registrarSolicitud(entrada) {
        llamadas.push(entrada);
        return fallo(errorNegocio("no_simulado", "el core falso no registra"));
      },
      async cerrar() {},
    };
    return { core, llamadas };
  }

  const documentos: DocumentoConversacion[] = [
    {
      adjunto: 1,
      nombre: "certificado.md",
      soportado: true,
      contenido: CONTENIDO_CERTIFICADO,
    },
    { adjunto: 2, nombre: "foto.png", soportado: false },
  ];

  const argumentos = {
    idSolicitante: ID_SOLICITANTE_UNICO,
    monto: 4_000_000,
    plazoMeses: 24,
    origen: {
      monto: { fragmento: CITA_MONTO },
      plazoMeses: { fragmento: CITA_PLAZO },
    },
  };

  async function registrar(
    mensajes: readonly string[],
    origen: Record<string, unknown>,
    docs: readonly DocumentoConversacion[] = documentos,
  ) {
    const { core, llamadas } = coreRegistro();
    const adaptador = crearAdaptador({
      core,
      estado: crearEstado(randomUUID()),
      dormir: async () => {},
      mensajesSolicitante: mensajes,
      documentos: docs,
    });
    const resultado = await adaptador.herramientas.registrar_solicitud.manejar({
      ...argumentos,
      origen,
    } as never);
    return { resultado, llamadas };
  }

  const rechazo = (resultado: { structuredContent: unknown }) =>
    (
      resultado.structuredContent as {
        error: { codigo: string; campo?: string; mensaje: string };
      }
    ).error;

  it("una afirmación que el solicitante no dijo es procedencia_invalida y no llama al core", async () => {
    const { resultado, llamadas } = await registrar(["Hola, quiero un crédito"], argumentos.origen);
    assert.equal(resultado.isError, true);
    const error = rechazo(resultado);
    assert.equal(error.codigo, "procedencia_invalida");
    assert.equal(error.campo, "procedencia.monto");
    assert.equal(llamadas.length, 0);
  });

  it("la cita del plazo y la del ingreso declarado también se comprueban, en ese orden", async () => {
    const soloMonto = await registrar([CITA_MONTO], argumentos.origen);
    assert.equal(rechazo(soloMonto.resultado).campo, "procedencia.plazoMeses");
    const conIngreso = await registrar([CITA_MONTO, CITA_PLAZO], {
      ...argumentos.origen,
      ingresoDeclarado: { fragmento: "gano 3.800.000" },
    });
    assert.equal(rechazo(conIngreso.resultado).campo, "procedencia.ingresoDeclarado");
    assert.equal(conIngreso.llamadas.length, 0);
  });

  it("una afirmación presente, con otras tildes, mayúsculas y espacios, pasa al core", async () => {
    const { llamadas } = await registrar(["QUIERO   4 MILLONES", "A 24 Meses"], argumentos.origen);
    assert.equal(llamadas.length, 1);
  });

  it("una cita que solo está en un mensaje del agente no cuenta: solo valen los del solicitante", async () => {
    const { resultado, llamadas } = await registrar([], argumentos.origen);
    assert.equal(rechazo(resultado).codigo, "procedencia_invalida");
    assert.equal(llamadas.length, 0);
  });

  it("un adjunto que no existe, o que no es soportado, es procedencia_invalida", async () => {
    for (const adjunto of [9, 2]) {
      const { resultado, llamadas } = await registrar([CITA_PLAZO], {
        ...argumentos.origen,
        monto: { fragmento: "Salario", adjunto },
      });
      const error = rechazo(resultado);
      assert.equal(error.codigo, "procedencia_invalida", `adjunto ${adjunto}`);
      assert.equal(error.campo, "procedencia.monto");
      assert.equal(llamadas.length, 0);
    }
  });

  it("un fragmento que no está en el contenido del documento es procedencia_invalida", async () => {
    const { resultado, llamadas } = await registrar([CITA_PLAZO], {
      ...argumentos.origen,
      monto: { fragmento: "texto que el documento no tiene", adjunto: 1 },
    });
    assert.equal(rechazo(resultado).codigo, "procedencia_invalida");
    assert.equal(llamadas.length, 0);
  });

  it("un fragmento del documento, con su adjunto, pasa y toma el nombre real", async () => {
    const { llamadas } = await registrar([CITA_PLAZO], {
      ...argumentos.origen,
      monto: { fragmento: "Salario básico mensual", adjunto: 1 },
    });
    assert.equal(llamadas.length, 1);
    assert.deepEqual(llamadas[0]?.procedencia.monto, {
      tipo: "documento",
      adjunto: 1,
      nombre: "certificado.md",
      fragmento: "Salario básico mensual",
    });
  });

  it("un fragmento vacío o de más de 300 caracteres no llega al core", async () => {
    for (const fragmento of ["", "x".repeat(301)]) {
      const { resultado, llamadas } = await registrar([CITA_PLAZO, fragmento], {
        ...argumentos.origen,
        monto: { fragmento },
      });
      assert.equal(rechazo(resultado).codigo, "procedencia_invalida");
      assert.equal(llamadas.length, 0);
    }
  });

  it("el error nombra el dato y no repite el fragmento", async () => {
    const { resultado } = await registrar([], {
      ...argumentos.origen,
      monto: { fragmento: "frase secreta del modelo" },
    });
    const error = rechazo(resultado);
    assert.equal(error.mensaje.includes("frase secreta del modelo"), false);
    assert.match(error.mensaje, /monto/);
    assert.equal(JSON.stringify(resultado).includes("frase secreta del modelo"), false);
  });

  it("si falta el origen de un dato, el core lo decide: llega sin esa clave", async () => {
    const { llamadas } = await registrar([CITA_MONTO], {
      monto: { fragmento: CITA_MONTO },
    });
    assert.equal(llamadas.length, 1);
    assert.equal("plazoMeses" in llamadas[0]!.procedencia, false);
  });
});

describe("adaptador: tras la Regla 3 el modelo debe registrar antes de responder (#13, escenario 5)", () => {
  it("la indicación nombra registrar_solicitud, pide monto y plazo ya dichos y aclara que no decide", () => {
    assert.match(SIGUIENTE_PASO_REGISTRO, /llama a registrar_solicitud/);
    assert.match(SIGUIENTE_PASO_REGISTRO, /si el solicitante ya dijo monto y plazo/);
    assert.match(SIGUIENTE_PASO_REGISTRO, /Registrar no preaprueba ni decide\./);
    assert.doesNotMatch(SIGUIENTE_PASO_REGISTRO, /30\s?%|10\s?%|5\.000\.000/);
  });

  it("no la recibe el modelo cuando el ingreso queda verificado, porque no hay nada que registrar para un analista", async () => {
    const p = prepararExtraccion([], []);
    await registrarEjemplos(p, documentosDeIngreso());
    const verificado = await verificarIngreso(p, 3_800_000);
    assert.equal("siguientePaso" in (contenidoDe(verificado).datos ?? {}), false);
  });
});
describe("adaptador: preaprobar_credito (#14, US1 y US2)", () => {
  const valoresDecision = {
    monto: 4_000_000,
    plazoMeses: 24,
    cuotaMensual: 206_723,
    ingresoVerificado: 3_800_000,
    topeMonto: 5_000_000,
    porcentajeMaximo: 30,
  };

  const solicitudPreaprobada = esquemaSolicitudRegistrada.parse({
    idSolicitud: "SOL-0002000001",
    correlationId: "0b0b6b6e-5f0e-4a39-9d57-6a0c1c1f0a11",
    claveIdempotencia: "x",
    estado: "preaprobada",
    registradaEn: "2026-10-18T12:00:00.000Z",
    solicitante: {
      idSolicitante: ID_SOLICITANTE_UNICO,
      nombre: "Ana Pérez Ficticia",
      documentoEnmascarado: "******4567",
    },
    monto: {
      valor: 4_000_000,
      procedencia: { tipo: "afirmacion", fragmento: "quiero el monto" },
    },
    plazoMeses: {
      valor: 24,
      procedencia: { tipo: "afirmacion", fragmento: "a ese plazo" },
    },
    ingresoDeclarado: null,
    verificacionIngreso: null,
    datosExtraidos: [],
    preaprobacion: {
      preaprobadaEn: "2026-10-18T12:30:00.000Z",
      decision: {
        regla: REGLA_2,
        permitido: true,
        motivo: "La solicitud cumple la política.",
        valores: valoresDecision,
        versionPolitica: "2026-10-18.3",
      },
    },
    versionPolitica: "2026-10-18.3",
  });

  type RespuestaCore = Awaited<ReturnType<ClienteCore["preaprobarSolicitud"]>>;

  function corePreaprobacion(respuesta?: RespuestaCore) {
    const llamadas: string[] = [];
    const core: ClienteCore = {
      ...CORE_NO_SIMULADO,
      async consultarSolicitud() {
        return exito({ solicitud: null });
      },
      async preaprobarSolicitud(correlationId) {
        llamadas.push(correlationId);
        return respuesta ?? exito({ solicitud: solicitudPreaprobada, repetida: false });
      },
      async cerrar() {},
    };
    return { core, llamadas };
  }

  function adaptadorCon(core: ClienteCore, alUsarHerramienta?: (info: InfoHerramienta) => void) {
    const estado = crearEstado(randomUUID());
    const adaptador = crearAdaptador({
      core,
      estado,
      dormir: async () => {},
      azar: () => 0.5,
      ...(alUsarHerramienta !== undefined ? { alUsarHerramienta } : {}),
    });
    return { adaptador, estado };
  }

  it("expone preaprobar_credito con un esquema de entrada vacío: el modelo no envía ningún dato", () => {
    const { core } = corePreaprobacion();
    const { adaptador } = adaptadorCon(core);
    assert.deepEqual(Object.keys(adaptador.herramientas.preaprobar_credito.esquema), []);
  });

  it("llama al core con el correlationId de la conversación", async () => {
    const { core, llamadas } = corePreaprobacion();
    const { adaptador, estado } = adaptadorCon(core);
    await adaptador.herramientas.preaprobar_credito.manejar({});
    assert.deepEqual(llamadas, [estado.correlationId]);
  });

  it("una preaprobación nueva emite el evento preaprobacion desde el código, con la Regla 2 y los valores", async () => {
    const { core } = corePreaprobacion();
    const { adaptador, estado } = adaptadorCon(core);
    await adaptador.herramientas.preaprobar_credito.manejar({});
    assert.equal(estado.eventos.length, 1);
    const evento = estado.eventos[0]!;
    assert.equal(evento.tipo, "preaprobacion");
    assert.equal(evento.regla, REGLA_2);
    assert.deepEqual(evento.valores, valoresDecision);
    assert.equal(evento.correlationId, estado.correlationId);
    assert.equal(estado.escalamiento, null);
  });

  it("una repetición no emite otro evento", async () => {
    const { core } = corePreaprobacion(exito({ solicitud: solicitudPreaprobada, repetida: true }));
    const { adaptador, estado } = adaptadorCon(core);
    const resultado = await adaptador.herramientas.preaprobar_credito.manejar({});
    assert.deepEqual(estado.eventos, []);
    const contenido = resultado.structuredContent as {
      datos: { repetida: boolean };
    };
    assert.equal(contenido.datos.repetida, true);
  });

  it("al modelo le devuelve solo el identificador, el estado y si fue una repetición", async () => {
    const { core } = corePreaprobacion();
    const { adaptador } = adaptadorCon(core);
    const resultado = await adaptador.herramientas.preaprobar_credito.manejar({});
    assert.equal(resultado.isError, false);
    assert.deepEqual(resultado.structuredContent, {
      ok: true,
      datos: {
        idSolicitud: "SOL-0002000001",
        estado: "preaprobada",
        repetida: false,
      },
    });
    assert.doesNotMatch(JSON.stringify(resultado), /decision|procedencia|Ficticia|cuotaMensual/);
  });

  it("un error del core pasa tal cual al modelo, sin reintentar si no es transitorio", async () => {
    const error = errorNegocio("solicitud_no_registrada", "No hay una solicitud registrada.");
    const { core, llamadas } = corePreaprobacion(fallo(error));
    const { adaptador, estado } = adaptadorCon(core);
    const resultado = await adaptador.herramientas.preaprobar_credito.manejar({});
    assert.equal(resultado.isError, true);
    assert.deepEqual(resultado.structuredContent, { ok: false, error });
    assert.equal(llamadas.length, 1);
    assert.equal(estado.escalamiento, null);
    assert.deepEqual(estado.eventos, []);
  });

  it("si los reintentos se agotan deja la señal de falla transitoria persistente", async () => {
    const { core, llamadas } = corePreaprobacion(
      fallo(errorTransitorio("core_no_disponible", "El core no está disponible.")),
    );
    const { adaptador, estado } = adaptadorCon(core);
    await adaptador.herramientas.preaprobar_credito.manejar({});
    assert.equal(estado.escalamiento?.motivo, "falla_transitoria_persistente");
    assert.equal(estado.escalamiento?.herramienta, "preaprobar_credito");
    assert.ok(llamadas.length > 1);
  });

  it("el modo de demostración la muestra con alUsarHerramienta", async () => {
    const { core } = corePreaprobacion();
    const vistas: InfoHerramienta[] = [];
    const { adaptador } = adaptadorCon(core, (info) => vistas.push(info));
    await adaptador.herramientas.preaprobar_credito.manejar({});
    assert.deepEqual(vistas, [{ herramienta: "preaprobar_credito", intento: 1, resultado: "ok" }]);
  });

  describe("un bloqueo del core deja la señal de escalamiento por la Regla 2", () => {
    const codigos = [
      "monto_sobre_tope",
      "cuota_sobre_porcentaje",
      "discrepancia_registrada",
      "ingreso_no_verificado",
      "cuota_no_calculable",
    ] as const;

    for (const codigo of codigos) {
      it(`${codigo}: señal preaprobacion_fuera_de_politica con la Regla 2 y el código`, async () => {
        const error = errorNegocio(codigo, "No cumple las condiciones.");
        const { core, llamadas } = corePreaprobacion(fallo(error));
        const { adaptador, estado } = adaptadorCon(core);
        const resultado = await adaptador.herramientas.preaprobar_credito.manejar({});
        assert.equal(resultado.isError, true);
        assert.deepEqual(resultado.structuredContent, { ok: false, error });
        assert.equal(estado.escalamiento?.motivo, "preaprobacion_fuera_de_politica");
        assert.equal(estado.escalamiento?.regla, REGLA_2);
        assert.equal(estado.escalamiento?.herramienta, "preaprobar_credito");
        assert.equal(estado.escalamiento?.codigo, codigo);
        assert.equal(llamadas.length, 1, "no reintenta un bloqueo");
        assert.equal(
          estado.eventos.some((e) => e.tipo === "preaprobacion"),
          false,
        );
      });
    }

    it("solicitud_no_registrada e identidad_no_verificada no dejan esa señal", async () => {
      for (const codigo of ["solicitud_no_registrada", "identidad_no_verificada"]) {
        const { core } = corePreaprobacion(fallo(errorNegocio(codigo, "No se puede.")));
        const { adaptador, estado } = adaptadorCon(core);
        await adaptador.herramientas.preaprobar_credito.manejar({});
        assert.equal(estado.escalamiento, null, codigo);
      }
    });
  });

  describe("orden de prevalencia de la Regla 2 (4 → 5 → 1 → 3 → 2)", () => {
    it("el motivo preaprobacion_fuera_de_politica es de la Regla 2", () => {
      assert.equal(ORDEN_REGLA["preaprobacion_fuera_de_politica"], 2);
    });

    const anteriores: SenalEscalamiento["motivo"][] = [
      "pide_persona",
      "caso_no_cubierto",
      "identidad_no_verificable",
      "discrepancia_de_ingreso",
    ];

    for (const motivo of anteriores) {
      it(`una señal de ${motivo} reemplaza a la de la Regla 2`, () => {
        const estado = crearEstado(randomUUID());
        dejarSenal(estado, {
          motivo: "preaprobacion_fuera_de_politica",
          regla: REGLA_2,
          herramienta: "preaprobar_credito",
        });
        dejarSenal(estado, {
          motivo,
          regla: "regla anterior",
          herramienta: "prueba",
        });
        assert.equal(estado.escalamiento?.motivo, motivo);
      });

      it(`la señal de la Regla 2 no reemplaza a una de ${motivo}`, () => {
        const estado = crearEstado(randomUUID());
        dejarSenal(estado, {
          motivo,
          regla: "regla anterior",
          herramienta: "prueba",
        });
        dejarSenal(estado, {
          motivo: "preaprobacion_fuera_de_politica",
          regla: REGLA_2,
          herramienta: "preaprobar_credito",
        });
        assert.equal(estado.escalamiento?.motivo, motivo);
      });
    }

    it("una señal técnica ni reemplaza a la de la Regla 2 ni es reemplazada por ella", () => {
      const estado = crearEstado(randomUUID());
      dejarSenal(estado, {
        motivo: "preaprobacion_fuera_de_politica",
        regla: REGLA_2,
        herramienta: "preaprobar_credito",
      });
      dejarSenal(estado, {
        motivo: "falla_transitoria_persistente",
        regla: "técnica",
        herramienta: "prueba",
      });
      assert.equal(estado.escalamiento?.motivo, "preaprobacion_fuera_de_politica");
    });
  });
});
// ── Escalamiento: señales acumuladas y datos declarados (#15, US1) ─────────────────────────

describe("adaptador: dejarSenal acumula todas las señales observadas (#15, R6)", () => {
  it("un estado nuevo no trae señales ni datos declarados", () => {
    const estado = crearEstado(randomUUID());
    assert.deepEqual(estado.senales, []);
    assert.deepEqual(estado.declarado, {});
  });

  it("la señal que no prevalece queda en senales y la principal sigue siendo la primera", (t) => {
    capturarStderr(t);
    const estado = crearEstado(randomUUID());
    dejarSenal(estado, {
      motivo: "pide_persona",
      regla: "Regla 4",
      herramienta: "x",
    });
    dejarSenal(estado, {
      motivo: "caso_no_cubierto",
      regla: "Regla 5",
      herramienta: "y",
    });
    assert.equal(estado.escalamiento?.motivo, "pide_persona");
    assert.deepEqual(estado.senales, [{ motivo: "pide_persona" }, { motivo: "caso_no_cubierto" }]);
  });

  it("una señal de una regla anterior reemplaza a la principal y las dos quedan en senales", (t) => {
    capturarStderr(t);
    const estado = crearEstado(randomUUID());
    dejarSenal(estado, {
      motivo: "identidad_ambigua",
      regla: "Regla 1",
      herramienta: "x",
    });
    dejarSenal(estado, {
      motivo: "caso_no_cubierto",
      regla: "Regla 5",
      herramienta: "y",
    });
    dejarSenal(estado, {
      motivo: "pide_persona",
      regla: "Regla 4",
      herramienta: "z",
    });
    assert.equal(estado.escalamiento?.motivo, "pide_persona");
    assert.deepEqual(
      estado.senales.map((s) => s.motivo),
      ["identidad_ambigua", "caso_no_cubierto", "pide_persona"],
    );
  });

  it("una señal técnica no reemplaza a la principal pero se registra", (t) => {
    capturarStderr(t);
    const estado = crearEstado(randomUUID());
    dejarSenal(estado, {
      motivo: "pide_persona",
      regla: "Regla 4",
      herramienta: "x",
    });
    dejarSenal(estado, {
      motivo: "falla_transitoria_persistente",
      regla: "Principio VI",
      herramienta: "y",
    });
    assert.equal(estado.escalamiento?.motivo, "pide_persona");
    assert.deepEqual(
      estado.senales.map((s) => s.motivo),
      ["pide_persona", "falla_transitoria_persistente"],
    );
  });

  it("no repite el mismo motivo y código, pero distingue los códigos de la Regla 2", (t) => {
    capturarStderr(t);
    const estado = crearEstado(randomUUID());
    const senal = (codigo: string) =>
      dejarSenal(estado, {
        motivo: "preaprobacion_fuera_de_politica",
        regla: REGLA_2,
        herramienta: "preaprobar_credito",
        codigo,
      });
    senal("monto_sobre_tope");
    senal("monto_sobre_tope");
    senal("cuota_sobre_porcentaje");
    assert.deepEqual(estado.senales, [
      { motivo: "preaprobacion_fuera_de_politica", codigo: "monto_sobre_tope" },
      {
        motivo: "preaprobacion_fuera_de_politica",
        codigo: "cuota_sobre_porcentaje",
      },
    ]);
    assert.equal(estado.escalamiento?.codigo, "monto_sobre_tope");
  });
});

describe("adaptador: solicitar_analista con monto y plazo citados (#15, R4)", () => {
  const MENSAJE = "Quiero 4 millones a 24 meses y mi sueldo me lo pagan en dólares";

  function preparar(opciones: { documentos?: readonly DocumentoConversacion[] } = {}) {
    const { core, llamadas } = coreIdentidad();
    const estado = crearEstado(randomUUID());
    const adaptador = crearAdaptador({
      core,
      estado,
      mensajesSolicitante: [MENSAJE],
      ...(opciones.documentos !== undefined ? { documentos: opciones.documentos } : {}),
    });
    return { adaptador, estado, llamadas };
  }

  const cita = (fragmento: string, adjunto?: number) => ({
    fragmento,
    ...(adjunto !== undefined ? { adjunto } : {}),
  });

  it("anuncia monto, plazoMeses y origen además del motivo y la causa", () => {
    const { adaptador } = preparar();
    assert.deepEqual(Object.keys(adaptador.herramientas.solicitar_analista.esquema), [
      "motivo",
      "causa",
      "monto",
      "plazoMeses",
      "origen",
    ]);
  });

  it("guarda el monto y el plazo con su procedencia si la cita está en lo que dijo el solicitante", async (t) => {
    capturarStderr(t);
    const { adaptador, estado, llamadas } = preparar();
    const resultado = await adaptador.herramientas.solicitar_analista.manejar({
      motivo: "caso_no_cubierto",
      causa: "moneda_extranjera",
      monto: 4_000_000,
      plazoMeses: 24,
      origen: { monto: cita("4 millones"), plazoMeses: cita("24 meses") },
    });
    assert.deepEqual(resultado.structuredContent, {
      ok: true,
      datos: { escalada: true },
    });
    assert.deepEqual(estado.declarado.monto, {
      valor: 4_000_000,
      procedencia: { tipo: "afirmacion", fragmento: "4 millones" },
    });
    assert.deepEqual(estado.declarado.plazoMeses, {
      valor: 24,
      procedencia: { tipo: "afirmacion", fragmento: "24 meses" },
    });
    assert.equal(estado.escalamiento?.motivo, "caso_no_cubierto");
    assert.equal(llamadas.length, 0, "no llama al core");
  });

  it("una cita con otras tildes y mayúsculas también está en lo que dijo el solicitante", async (t) => {
    capturarStderr(t);
    const { adaptador, estado } = preparar();
    await adaptador.herramientas.solicitar_analista.manejar({
      motivo: "caso_no_cubierto",
      plazoMeses: 24,
      origen: { plazoMeses: cita("24 MESES") },
    });
    assert.equal(estado.declarado.plazoMeses?.valor, 24);
  });

  it("una cita que el solicitante no dijo deja el dato pendiente y escala igual", async (t) => {
    capturarStderr(t);
    const { adaptador, estado } = preparar();
    const resultado = await adaptador.herramientas.solicitar_analista.manejar({
      motivo: "caso_no_cubierto",
      causa: "moneda_extranjera",
      monto: 4_000_000,
      origen: { monto: cita("quiero diez millones") },
    });
    assert.equal(resultado.isError, false);
    assert.equal(estado.declarado.monto, undefined);
    assert.equal(estado.escalamiento?.motivo, "caso_no_cubierto");
  });

  it("un dato sin cita queda pendiente, y una cita sin dato se ignora", async (t) => {
    capturarStderr(t);
    const { adaptador, estado } = preparar();
    await adaptador.herramientas.solicitar_analista.manejar({
      motivo: "caso_no_cubierto",
      monto: 4_000_000,
      origen: { plazoMeses: cita("24 meses") },
    });
    assert.equal(estado.declarado.monto, undefined);
    assert.equal(estado.declarado.plazoMeses, undefined);
  });

  it("un valor que no es un entero positivo queda pendiente, sin error", async (t) => {
    capturarStderr(t);
    for (const valor of [0, -1, 4.5]) {
      const { adaptador, estado } = preparar();
      const resultado = await adaptador.herramientas.solicitar_analista.manejar({
        motivo: "caso_no_cubierto",
        monto: valor,
        origen: { monto: cita("4 millones") },
      });
      assert.equal(resultado.isError, false, String(valor));
      assert.equal(estado.declarado.monto, undefined, String(valor));
      assert.ok(estado.escalamiento, String(valor));
    }
  });

  it("una cita de un documento soportado guarda la procedencia del documento", async (t) => {
    capturarStderr(t);
    const { adaptador, estado } = preparar({
      documentos: [
        {
          adjunto: 1,
          nombre: "certificado.md",
          soportado: true,
          contenido: CONTENIDO_CERTIFICADO,
        },
      ],
    });
    await adaptador.herramientas.solicitar_analista.manejar({
      motivo: "caso_no_cubierto",
      monto: 3_800_000,
      origen: { monto: cita("Salario básico mensual", 1) },
    });
    assert.deepEqual(estado.declarado.monto, {
      valor: 3_800_000,
      procedencia: {
        tipo: "documento",
        adjunto: 1,
        nombre: "certificado.md",
        fragmento: "Salario básico mensual",
      },
    });
  });

  it("un adjunto que no existe o no es soportado deja el dato pendiente", async (t) => {
    capturarStderr(t);
    const { adaptador, estado } = preparar({
      documentos: [{ adjunto: 1, nombre: "foto.png", soportado: false }],
    });
    for (const adjunto of [1, 9]) {
      await adaptador.herramientas.solicitar_analista.manejar({
        motivo: "caso_no_cubierto",
        monto: 3_800_000,
        origen: { monto: cita("Salario", adjunto) },
      });
      assert.equal(estado.declarado.monto, undefined, `adjunto ${adjunto}`);
    }
    assert.ok(estado.escalamiento);
  });

  it("sin esos campos funciona como antes: no guarda nada declarado", async (t) => {
    capturarStderr(t);
    const { adaptador, estado } = preparar();
    await adaptador.herramientas.solicitar_analista.manejar({
      motivo: "pide_persona",
    });
    assert.deepEqual(estado.declarado, {});
    assert.equal(estado.escalamiento?.motivo, "pide_persona");
  });
});
// ── Lo que el agente puede resolver no escala (#15, US4 · SC-003) ──────────────────────────

describe("adaptador: lo que el agente puede resolver no escala (#15, US4)", () => {
  beforeEach(() => fijarDestino({ write: () => true }));
  afterEach(() => fijarDestino(null));

  const sinEscalar = (estado: ReturnType<typeof crearEstado>) => {
    assert.equal(estado.escalamiento, null);
    assert.deepEqual(estado.senales, []);
  };

  it("un archivo al que le falta un dato pide el documento y no deja ninguna señal", async () => {
    const p = prepararExtraccion(
      [doc(2, CONTENIDO_CERTIFICADO_SIN_SALARIO)],
      [valida(salidaCertificadoSinSalario())],
    );
    await p.extraer(2);
    assert.equal(p.estado.eventos[0]?.tipo, "solicitud_de_dato");
    sinEscalar(p.estado);
  });

  it("falta_declarado pide el ingreso y no deja ninguna señal", async () => {
    const p = prepararExtraccion([], []);
    await registrarEjemplos(p, documentosDeIngreso());
    await verificarIngreso(p);
    assert.equal(p.estado.eventos[0]?.tipo, "solicitud_de_dato");
    sinEscalar(p.estado);
  });

  it("sin_ingreso pide documentos y no deja ninguna señal", async () => {
    const p = prepararExtraccion([], []);
    await verificarIngreso(p, 3_800_000);
    assert.equal(p.estado.eventos[0]?.tipo, "solicitud_de_dato");
    sinEscalar(p.estado);
  });

  it("la primera búsqueda con varias coincidencias pide el documento y no deja ninguna señal", async () => {
    const { core } = coreIdentidad({ busquedas: [HOMONIMOS] });
    const estado = crearEstado(randomUUID());
    const adaptador = crearAdaptador({ core, estado });
    await adaptador.herramientas.buscar_solicitante.manejar({
      nombre: "Elena Martínez Inventada",
    });
    assert.equal(estado.eventos[0]?.tipo, "solicitud_de_dato");
    cerrarTurnoIdentidad(estado);
    sinEscalar(estado);
  });

  it("una búsqueda ambigua repetida en el mismo turno cuenta una sola y no escala", async () => {
    const { core } = coreIdentidad({ busquedas: [HOMONIMOS] });
    const estado = crearEstado(randomUUID());
    const adaptador = crearAdaptador({ core, estado });
    await adaptador.herramientas.buscar_solicitante.manejar({
      nombre: "Elena Martínez Inventada",
    });
    await adaptador.herramientas.buscar_solicitante.manejar({
      nombre: "Elena Martínez Inventada",
    });
    assert.equal(estado.busquedasAmbiguas, 1);
    cerrarTurnoIdentidad(estado);
    sinEscalar(estado);
  });

  it("después de desambiguar, una búsqueda ambigua posterior no escala ni pide otra vez", async () => {
    const { core } = coreIdentidad({ busquedas: [UNA, HOMONIMOS] });
    const estado = crearEstado(randomUUID());
    const adaptador = crearAdaptador({ core, estado });
    await adaptador.herramientas.buscar_solicitante.manejar({
      documento: "0001234567",
    });
    await adaptador.herramientas.buscar_solicitante.manejar({
      nombre: "Elena Martínez Inventada",
    });
    assert.equal(estado.busquedasAmbiguas, 0);
    assert.deepEqual(estado.eventos, []);
    cerrarTurnoIdentidad(estado);
    sinEscalar(estado);
  });

  it("en contraste, la ambigüedad que sigue en un turno posterior sí escala", async () => {
    const { core } = coreIdentidad({ busquedas: [HOMONIMOS] });
    const estado = crearEstado(randomUUID());
    estado.busquedasAmbiguas = 1;
    const adaptador = crearAdaptador({ core, estado });
    await adaptador.herramientas.buscar_solicitante.manejar({
      nombre: "Elena Martínez Inventada",
    });
    cerrarTurnoIdentidad(estado);
    assert.equal(estado.escalamiento?.motivo, "identidad_ambigua");
    assert.deepEqual(estado.senales, [{ motivo: "identidad_ambigua" }]);
  });

  it("la descripción de solicitar_analista no da ningún literal de umbral al modelo", () => {
    for (const literal of ["5.000.000", "5_000_000", "30 %", "30%", "10 %", "10%"]) {
      assert.equal(DESCRIPCION_SOLICITAR_ANALISTA.includes(literal), false, literal);
    }
  });
});
