import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  DESCRIPCION_REGISTRAR_SOLICITUD,
  claveIdempotenciaSolicitud,
  contieneFragmento,
  esquemaEntradaRegistroSolicitud,
  esquemaProcedenciaRegistro,
  esquemaSolicitudRegistrada,
  validarFormaRegistroSolicitud,
  validarProcedenciaDato,
} from "./solicitud.ts";
import { huella } from "./extraccion.ts";
import { VERSION_POLITICA } from "../politica/politica.ts";

const CORRELATION_ID = "0b0b6b6e-5f0e-4a39-9d57-6a0c1c1f0a11";
const ID_SOLICITANTE = "CLI-0001000001";

const afirmacion = (fragmento = "quiero 4 millones") => ({ tipo: "afirmacion", fragmento });

const entradaValida = {
  correlationId: CORRELATION_ID,
  idSolicitante: ID_SOLICITANTE,
  monto: 4_000_000,
  plazoMeses: 24,
  claveIdempotencia: "clave-1",
  procedencia: { monto: afirmacion(), plazoMeses: afirmacion("a 24 meses") },
};

const ingresoVerificado = {
  monto: 3_800_000,
  origen: "certificado",
  montoCertificado: 3_800_000,
  montoExtractos: null,
  extractosContados: 0,
  usos: [],
  noUsados: [],
};

const solicitudValida = {
  idSolicitud: "SOL-0002000001",
  correlationId: CORRELATION_ID,
  claveIdempotencia: "clave-1",
  estado: "en_estudio",
  registradaEn: "2026-10-18T12:00:00.000Z",
  solicitante: {
    idSolicitante: ID_SOLICITANTE,
    nombre: "Ana Pérez Ficticia",
    documentoEnmascarado: "******4567",
  },
  monto: { valor: 4_000_000, procedencia: afirmacion() },
  plazoMeses: { valor: 24, procedencia: afirmacion("a 24 meses") },
  ingresoDeclarado: { valor: 3_800_000, procedencia: afirmacion("gano 3.800.000") },
  verificacionIngreso: {
    estado: "verificado",
    ingresoVerificado,
    discrepancia: {
      declarado: 3_800_000,
      verificado: 3_800_000,
      diferencia: 0,
      umbralPorcentaje: 10,
      supera: false,
      diferenciaPorcentaje: 0,
    },
    inconsistencias: [],
    sinContrastar: [],
    calculadaEn: "2026-10-18T11:59:00.000Z",
  },
  datosExtraidos: [],
  preaprobacion: null,
  versionPolitica: VERSION_POLITICA,
};

const preaprobacionValida = {
  preaprobadaEn: "2026-10-18T12:30:00.000Z",
  decision: {
    regla: "Regla 2 · preaprobación dentro de la política",
    permitido: true,
    motivo: "La solicitud cumple la política.",
    valores: {
      monto: 4_000_000,
      plazoMeses: 24,
      cuotaMensual: 206_723,
      ingresoVerificado: 3_800_000,
    },
    versionPolitica: VERSION_POLITICA,
  },
};

const clon = <T>(valor: T): T => structuredClone(valor);

describe("compartido/solicitud: procedencia de dos clases (#13, R3)", () => {
  it("acepta una afirmación del solicitante", () => {
    assert.equal(esquemaProcedenciaRegistro.safeParse(afirmacion()).success, true);
  });

  it("acepta un documento con adjunto, nombre y fragmento", () => {
    const documento = { tipo: "documento", adjunto: 1, nombre: "certificado.md", fragmento: "x" };
    assert.equal(esquemaProcedenciaRegistro.safeParse(documento).success, true);
  });

  it("rechaza un campo de más, un tipo desconocido y un tipo ausente", () => {
    assert.equal(
      esquemaProcedenciaRegistro.safeParse({ ...afirmacion(), adjunto: 1 }).success,
      false,
    );
    assert.equal(
      esquemaProcedenciaRegistro.safeParse({ tipo: "otro", fragmento: "x" }).success,
      false,
    );
    assert.equal(esquemaProcedenciaRegistro.safeParse({ fragmento: "x" }).success, false);
  });

  it("el fragmento tiene de 1 a 300 caracteres", () => {
    assert.equal(esquemaProcedenciaRegistro.safeParse(afirmacion("x")).success, true);
    assert.equal(esquemaProcedenciaRegistro.safeParse(afirmacion("x".repeat(300))).success, true);
    assert.equal(esquemaProcedenciaRegistro.safeParse(afirmacion("")).success, false);
    assert.equal(esquemaProcedenciaRegistro.safeParse(afirmacion("x".repeat(301))).success, false);
  });

  it("el documento exige adjunto ≥ 1 y nombre de 1 a 255 caracteres", () => {
    const base = { tipo: "documento", adjunto: 1, nombre: "a.md", fragmento: "x" };
    assert.equal(esquemaProcedenciaRegistro.safeParse({ ...base, adjunto: 0 }).success, false);
    assert.equal(esquemaProcedenciaRegistro.safeParse({ ...base, adjunto: 1.5 }).success, false);
    assert.equal(esquemaProcedenciaRegistro.safeParse({ ...base, nombre: "" }).success, false);
    assert.equal(
      esquemaProcedenciaRegistro.safeParse({ ...base, nombre: "n".repeat(255) }).success,
      true,
    );
    assert.equal(
      esquemaProcedenciaRegistro.safeParse({ ...base, nombre: "n".repeat(256) }).success,
      false,
    );
  });
});

describe("compartido/solicitud: entrada de registrar_solicitud", () => {
  it("acepta la entrada válida, con y sin procedencia del ingreso declarado", () => {
    assert.equal(esquemaEntradaRegistroSolicitud.safeParse(entradaValida).success, true);
    const conIngreso = {
      ...entradaValida,
      procedencia: { ...entradaValida.procedencia, ingresoDeclarado: afirmacion("gano mucho") },
    };
    assert.equal(esquemaEntradaRegistroSolicitud.safeParse(conIngreso).success, true);
  });

  it("rechaza campos que el core debe tomar de su estado (R2)", () => {
    for (const campo of [
      "ingresoVerificado",
      "discrepancias",
      "datosExtraidos",
      "ingresoDeclarado",
      "solicitante",
    ]) {
      const entrada = { ...entradaValida, [campo]: 1 };
      assert.equal(esquemaEntradaRegistroSolicitud.safeParse(entrada).success, false, campo);
    }
  });

  it("la procedencia de monto y de plazo es obligatoria", () => {
    const sinMonto = { ...entradaValida, procedencia: { plazoMeses: afirmacion() } };
    const sinPlazo = { ...entradaValida, procedencia: { monto: afirmacion() } };
    assert.equal(esquemaEntradaRegistroSolicitud.safeParse(sinMonto).success, false);
    assert.equal(esquemaEntradaRegistroSolicitud.safeParse(sinPlazo).success, false);
  });
});

describe("compartido/solicitud: validarFormaRegistroSolicitud", () => {
  function rechazo(entrada: unknown) {
    const resultado = validarFormaRegistroSolicitud(entrada);
    assert.equal(resultado.ok, false);
    if (resultado.ok) throw new Error("se esperaba un rechazo");
    return resultado.error;
  }

  it("devuelve la entrada tipada, con la procedencia sin interpretar", () => {
    const resultado = validarFormaRegistroSolicitud(entradaValida);
    assert.equal(resultado.ok, true);
    if (!resultado.ok) return;
    assert.equal(resultado.entrada.monto, 4_000_000);
    assert.deepEqual(resultado.entrada.procedencia, entradaValida.procedencia);
  });

  it("monto y plazo: entero seguro mayor que 0, con su código y su campo", () => {
    for (const monto of [0, -1, 1.5, "4000000", null, Number.MAX_SAFE_INTEGER + 1]) {
      const error = rechazo({ ...entradaValida, monto });
      assert.equal(error.codigo, "monto_invalido");
      assert.equal(error.campo, "monto");
      assert.equal(error.categoria, "validacion");
      assert.equal(error.reintentable, false);
    }
    for (const plazoMeses of [0, -1, 1.5, "24", undefined]) {
      const error = rechazo({ ...entradaValida, plazoMeses });
      assert.equal(error.codigo, "plazo_invalido");
      assert.equal(error.campo, "plazoMeses");
    }
  });

  it("idSolicitante con la forma CLI- y 10 dígitos", () => {
    for (const idSolicitante of ["CLI-123", "cli-0001000001", "SOL-0001000001", 7, undefined]) {
      const error = rechazo({ ...entradaValida, idSolicitante });
      assert.equal(error.codigo, "formato_invalido");
      assert.equal(error.campo, "idSolicitante");
    }
  });

  it("la clave de idempotencia tiene de 1 a 64 caracteres", () => {
    for (const claveIdempotencia of ["", "c".repeat(65), 5, undefined]) {
      const error = rechazo({ ...entradaValida, claveIdempotencia });
      assert.equal(error.codigo, "formato_invalido");
      assert.equal(error.campo, "claveIdempotencia");
    }
    assert.equal(
      validarFormaRegistroSolicitud({ ...entradaValida, claveIdempotencia: "c".repeat(64) }).ok,
      true,
    );
  });

  it("correlationId UUID", () => {
    const error = rechazo({ ...entradaValida, correlationId: "no-es-uuid" });
    assert.equal(error.campo, "correlationId");
  });

  it("informa el primer problema en el orden del contrato", () => {
    const error = rechazo({
      ...entradaValida,
      correlationId: "x",
      idSolicitante: "x",
      monto: 0,
      plazoMeses: 0,
      claveIdempotencia: "",
    });
    assert.equal(error.campo, "correlationId");
    assert.equal(
      rechazo({ ...entradaValida, idSolicitante: "x", monto: 0 }).campo,
      "idSolicitante",
    );
    assert.equal(rechazo({ ...entradaValida, monto: 0, plazoMeses: 0 }).campo, "monto");
    assert.equal(
      rechazo({ ...entradaValida, plazoMeses: 0, claveIdempotencia: "" }).campo,
      "plazoMeses",
    );
  });

  it("un campo de más es formato_invalido con ese campo", () => {
    const error = rechazo({ ...entradaValida, ingresoVerificado: 3_800_000 });
    assert.equal(error.codigo, "formato_invalido");
    assert.equal(error.campo, "ingresoVerificado");
  });

  it("una entrada que no es un objeto es formato_invalido", () => {
    for (const entrada of [null, undefined, "x", 5, []]) {
      assert.equal(rechazo(entrada).codigo, "formato_invalido");
    }
  });
});

describe("compartido/solicitud: validarProcedenciaDato", () => {
  it("devuelve la procedencia válida", () => {
    const resultado = validarProcedenciaDato("monto", afirmacion());
    assert.equal(resultado.ok, true);
  });

  it("ausente o nula: procedencia_faltante con el campo procedencia.<dato>", () => {
    for (const dato of ["monto", "plazoMeses", "ingresoDeclarado"] as const) {
      for (const valor of [undefined, null]) {
        const resultado = validarProcedenciaDato(dato, valor);
        assert.equal(resultado.ok, false);
        if (resultado.ok) continue;
        assert.equal(resultado.error.codigo, "procedencia_faltante");
        assert.equal(resultado.error.campo, `procedencia.${dato}`);
        assert.equal(resultado.error.categoria, "validacion");
        assert.equal(resultado.error.reintentable, false);
      }
    }
  });

  it("mal formada: procedencia_invalida con el campo y sin repetir el fragmento", () => {
    const fragmento = "x".repeat(301);
    const resultado = validarProcedenciaDato("plazoMeses", afirmacion(fragmento));
    assert.equal(resultado.ok, false);
    if (resultado.ok) return;
    assert.equal(resultado.error.codigo, "procedencia_invalida");
    assert.equal(resultado.error.campo, "procedencia.plazoMeses");
    assert.equal(resultado.error.mensaje.includes(fragmento), false);
  });
});

describe("compartido/solicitud: SolicitudRegistrada", () => {
  it("acepta una solicitud válida", () => {
    assert.equal(esquemaSolicitudRegistrada.safeParse(solicitudValida).success, true);
  });

  it("acepta una sin ingreso declarado ni verificación", () => {
    const solicitud = {
      ...clon(solicitudValida),
      ingresoDeclarado: null,
      verificacionIngreso: null,
    };
    assert.equal(esquemaSolicitudRegistrada.safeParse(solicitud).success, true);
  });

  it("idSolicitud con la forma SOL-000 y 7 dígitos", () => {
    for (const idSolicitud of ["SOL-1", "SOL-0012345678", "CLI-0002000001"]) {
      assert.equal(
        esquemaSolicitudRegistrada.safeParse({ ...solicitudValida, idSolicitud }).success,
        false,
        idSolicitud,
      );
    }
  });

  it("el estado es en_estudio o preaprobada, y ningún otro", () => {
    for (const estado of ["anulada", "reservada", "aprobada", "rechazada"]) {
      assert.equal(
        esquemaSolicitudRegistrada.safeParse({ ...solicitudValida, estado }).success,
        false,
      );
    }
  });

  it("un dato sin procedencia no existe", () => {
    for (const dato of ["monto", "plazoMeses", "ingresoDeclarado"] as const) {
      const solicitud = clon(solicitudValida);
      const { procedencia: _quitada, ...sinProcedencia } = solicitud[dato] ?? { procedencia: null };
      assert.equal(
        esquemaSolicitudRegistrada.safeParse({ ...solicitud, [dato]: sinProcedencia }).success,
        false,
        dato,
      );
    }
  });

  it("datosExtraidos solo admite registros extraido", () => {
    const registro = {
      estado: "no_extraible",
      adjunto: 1,
      nombre: "a.md",
      huella: "a".repeat(64),
      intentos: 1,
      adjuntos: [1],
      registradoEn: "2026-10-18T12:00:00.000Z",
      reextraidaPor: [],
      conflictos: ["x"],
      ultimoError: [],
    };
    const solicitud = { ...clon(solicitudValida), datosExtraidos: [registro] };
    assert.equal(esquemaSolicitudRegistrada.safeParse(solicitud).success, false);
  });

  it("un estado con ingreso trae ingresoVerificado y los demás no", () => {
    const sinIngreso = clon(solicitudValida);
    sinIngreso.verificacionIngreso.ingresoVerificado = null as never;
    assert.equal(esquemaSolicitudRegistrada.safeParse(sinIngreso).success, false);

    const conIngresoSinEstado = clon(solicitudValida);
    conIngresoSinEstado.verificacionIngreso.estado = "sin_ingreso";
    assert.equal(esquemaSolicitudRegistrada.safeParse(conIngresoSinEstado).success, false);
  });

  it("una discrepancia trae el porcentaje de diferencia, no negativo", () => {
    const { diferenciaPorcentaje: _quitado, ...sinPorcentaje } =
      solicitudValida.verificacionIngreso.discrepancia;
    const sinCampo = clon(solicitudValida);
    sinCampo.verificacionIngreso.discrepancia = sinPorcentaje as never;
    assert.equal(esquemaSolicitudRegistrada.safeParse(sinCampo).success, false);

    const negativo = clon(solicitudValida);
    negativo.verificacionIngreso.discrepancia.diferenciaPorcentaje = -1;
    assert.equal(esquemaSolicitudRegistrada.safeParse(negativo).success, false);
  });

  it("rechaza campos de más", () => {
    assert.equal(
      esquemaSolicitudRegistrada.safeParse({ ...solicitudValida, preaprobada: true }).success,
      false,
    );
  });
});

describe("compartido/solicitud: descripción de la herramienta", () => {
  it("dice qué hace, qué exige y qué no decide", () => {
    const texto = DESCRIPCION_REGISTRAR_SOLICITUD;
    assert.match(texto, /Registra la solicitud/);
    assert.match(texto, /identidad verificada de ese solicitante/);
    assert.match(texto, /los toma el core/i);
    assert.match(texto, /idempotente/);
    assert.match(texto, /se rechaza/);
    assert.match(texto, /no aprueba ni rechaza/);
  });

  it("no da los umbrales de las reglas al modelo", () => {
    assert.doesNotMatch(DESCRIPCION_REGISTRAR_SOLICITUD, /30\s?%|10\s?%|5\.000\.000|5_000_000/);
  });
});

describe("compartido/solicitud: contieneFragmento", () => {
  const textos = ["Hola, quiero un crédito", "Necesito  4 millones\na 24 meses, por favor"];

  it("encuentra el fragmento sin importar tildes, mayúsculas ni espacios", () => {
    assert.equal(contieneFragmento(textos, "quiero un CREDITO"), true);
    assert.equal(contieneFragmento(textos, "4 millones a 24 meses"), true);
  });

  it("no encuentra un fragmento ausente", () => {
    assert.equal(contieneFragmento(textos, "gano 3.800.000"), false);
  });

  it("un fragmento vacío o de solo espacios no coincide", () => {
    assert.equal(contieneFragmento(textos, ""), false);
    assert.equal(contieneFragmento(textos, "   "), false);
  });

  it("con una lista vacía no coincide", () => {
    assert.equal(contieneFragmento([], "quiero"), false);
  });
});

describe("compartido/solicitud: clave de idempotencia (R6)", () => {
  it("es la huella de solicitante, monto y plazo", () => {
    assert.equal(
      claveIdempotenciaSolicitud(ID_SOLICITANTE, 4_000_000, 24),
      huella(JSON.stringify([ID_SOLICITANTE, 4_000_000, 24])),
    );
  });

  it("es la misma para los mismos datos y distinta si cambia el monto, el plazo o el solicitante", () => {
    const base = claveIdempotenciaSolicitud(ID_SOLICITANTE, 4_000_000, 24);
    assert.equal(claveIdempotenciaSolicitud(ID_SOLICITANTE, 4_000_000, 24), base);
    assert.notEqual(claveIdempotenciaSolicitud(ID_SOLICITANTE, 3_000_000, 24), base);
    assert.notEqual(claveIdempotenciaSolicitud(ID_SOLICITANTE, 4_000_000, 12), base);
    assert.notEqual(claveIdempotenciaSolicitud("CLI-0001000002", 4_000_000, 24), base);
  });

  it("cabe en el largo de la clave: 64 caracteres", () => {
    assert.equal(claveIdempotenciaSolicitud(ID_SOLICITANTE, 4_000_000, 24).length, 64);
  });
});

describe("compartido/solicitud: preaprobación de la solicitud registrada (#14, R6)", () => {
  const preaprobada = {
    ...solicitudValida,
    estado: "preaprobada",
    preaprobacion: preaprobacionValida,
  };

  it("una solicitud preaprobada trae su constancia", () => {
    assert.equal(esquemaSolicitudRegistrada.safeParse(preaprobada).success, true);
  });

  it("una solicitud en estudio no trae constancia: preaprobacion es null", () => {
    assert.equal(esquemaSolicitudRegistrada.safeParse(solicitudValida).success, true);
    assert.equal(
      esquemaSolicitudRegistrada.safeParse({
        ...solicitudValida,
        preaprobacion: preaprobacionValida,
      }).success,
      false,
    );
  });

  it("estado preaprobada sin constancia no pasa: el estado y la constancia van juntos", () => {
    assert.equal(
      esquemaSolicitudRegistrada.safeParse({ ...solicitudValida, estado: "preaprobada" }).success,
      false,
    );
  });

  it("la constancia no puede guardar una decisión bloqueada", () => {
    const bloqueada = {
      ...preaprobacionValida,
      decision: { ...preaprobacionValida.decision, permitido: false, codigo: "monto_sobre_tope" },
    };
    assert.equal(
      esquemaSolicitudRegistrada.safeParse({ ...preaprobada, preaprobacion: bloqueada }).success,
      false,
    );
  });

  it("la solicitud sin el campo preaprobacion no pasa: es obligatorio, con null si no hay", () => {
    const { preaprobacion: _quitado, ...sinCampo } = solicitudValida;
    assert.equal(esquemaSolicitudRegistrada.safeParse(sinCampo).success, false);
  });
});
