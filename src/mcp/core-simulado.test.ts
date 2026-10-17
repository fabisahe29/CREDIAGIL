import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  crearCore,
  enmascararDocumento,
  normalizarDocumento,
  normalizarNombre,
} from "./core-simulado.ts";
import {
  DOCUMENTO_SIN_COINCIDENCIAS,
  ID_ANULADA,
  ID_EN_ESTUDIO,
  ID_HOMONIMO_1,
  ID_HOMONIMO_2,
  ID_INEXISTENTE,
  ID_RESERVADA,
  ID_SOLICITANTE_UNICO,
  NOMBRE_SIN_COINCIDENCIAS,
  SOLICITANTES_EJEMPLO,
} from "./datos-ejemplo.ts";

const solicitante = (id: string) => SOLICITANTES_EJEMPLO.find((s) => s.idSolicitante === id)!;

describe("core simulado: normalización de la búsqueda (R3)", () => {
  it("quita puntos, espacios y guiones del documento", () => {
    assert.equal(normalizarDocumento("000.123.4567"), "0001234567");
    assert.equal(normalizarDocumento("000 123-4567"), "0001234567");
    assert.equal(normalizarDocumento("000123"), "000123");
  });

  it("un documento sin 6 a 10 dígitos tras normalizar es inválido", () => {
    for (const valor of ["00012", "00012345678", "000ABC4567", "", 1234567, null]) {
      assert.equal(normalizarDocumento(valor), null, String(valor));
    }
  });

  it("el nombre se compara sin mayúsculas, sin tildes y con espacios colapsados", () => {
    assert.equal(normalizarNombre("  ELENA   Martínez  Inventada "), "elena martinez inventada");
    assert.equal(normalizarNombre("Ana Pérez Ficticia"), "ana perez ficticia");
  });

  it("un nombre con menos de 3 letras o con caracteres que no son letras es inválido", () => {
    for (const valor of ["Al", "Ana 3", "Ana@Pérez", "   ", "", 42, undefined]) {
      assert.equal(normalizarNombre(valor), null, String(valor));
    }
  });

  it("enmascara el documento salvo los 4 últimos dígitos", () => {
    assert.equal(enmascararDocumento("0001234567"), "******4567");
    assert.equal(enmascararDocumento("000123"), "**0123");
  });
});

describe("core simulado: buscarSolicitante (US1)", () => {
  const ids = (respuesta: ReturnType<ReturnType<typeof crearCore>["buscarSolicitante"]>) =>
    respuesta.ok ? respuesta.datos.coincidencias.map((c) => c.idSolicitante) : null;

  it("encuentra al solicitante único por su documento, con o sin separadores", () => {
    const core = crearCore();
    for (const documento of ["0001234567", "000.123.4567", "000 123-4567"]) {
      assert.deepEqual(ids(core.buscarSolicitante({ documento })), [ID_SOLICITANTE_UNICO]);
    }
  });

  it("encuentra al solicitante único por su nombre", () => {
    assert.deepEqual(ids(crearCore().buscarSolicitante({ nombre: "Ana Pérez Ficticia" })), [
      ID_SOLICITANTE_UNICO,
    ]);
  });

  it("devuelve los dos homónimos, ordenados, sin elegir uno", () => {
    const core = crearCore();
    for (const nombre of ["Elena Martínez Inventada", "ELENA MARTINEZ INVENTADA"]) {
      assert.deepEqual(ids(core.buscarSolicitante({ nombre })), [ID_HOMONIMO_1, ID_HOMONIMO_2]);
    }
  });

  it("sin coincidencias es un éxito con la lista vacía, no un error", () => {
    const core = crearCore();
    assert.deepEqual(core.buscarSolicitante({ documento: DOCUMENTO_SIN_COINCIDENCIAS }), {
      ok: true,
      datos: { coincidencias: [] },
    });
    assert.deepEqual(core.buscarSolicitante({ nombre: NOMBRE_SIN_COINCIDENCIAS }), {
      ok: true,
      datos: { coincidencias: [] },
    });
  });

  it("la coincidencia trae el documento enmascarado y nunca la fecha de expedición", () => {
    const respuesta = crearCore().buscarSolicitante({ documento: "0001234567" });
    assert.equal(respuesta.ok, true);
    if (!respuesta.ok) return;
    assert.deepEqual(respuesta.datos.coincidencias, [
      {
        idSolicitante: ID_SOLICITANTE_UNICO,
        nombre: "Ana Pérez Ficticia",
        documentoEnmascarado: "******4567",
      },
    ]);
    const texto = JSON.stringify(respuesta);
    assert.equal(texto.includes(solicitante(ID_SOLICITANTE_UNICO).fechaExpedicion), false);
    assert.equal(texto.includes("0001234567"), false);
  });

  it("ambos criterios o ninguno es validación en el campo criterio", () => {
    const core = crearCore();
    for (const criterio of [{}, { documento: "0001234567", nombre: "Ana Pérez Ficticia" }]) {
      const respuesta = core.buscarSolicitante(criterio);
      assert.equal(respuesta.ok, false);
      if (!respuesta.ok) {
        assert.equal(respuesta.error.categoria, "validacion");
        assert.equal(respuesta.error.campo, "criterio");
      }
    }
  });

  it("un documento o un nombre mal formados son validación con su campo", () => {
    const core = crearCore();
    const casos: [Record<string, unknown>, string][] = [
      [{ documento: "000ABC4567" }, "documento"],
      [{ documento: "00012" }, "documento"],
      [{ documento: "00012345678" }, "documento"],
      [{ nombre: "Al" }, "nombre"],
      [{ nombre: "Ana 3" }, "nombre"],
    ];
    for (const [criterio, campo] of casos) {
      const respuesta = core.buscarSolicitante(criterio);
      assert.equal(respuesta.ok, false, JSON.stringify(criterio));
      if (!respuesta.ok) {
        assert.equal(respuesta.error.categoria, "validacion");
        assert.equal(respuesta.error.codigo, "formato_invalido");
        assert.equal(respuesta.error.campo, campo);
      }
    }
  });

  it("con la falla simulada activa responde transitorio core_no_disponible", () => {
    const respuesta = crearCore({ falla: "siempre" }).buscarSolicitante({
      documento: "0001234567",
    });
    assert.equal(respuesta.ok, false);
    if (!respuesta.ok) assert.equal(respuesta.error.codigo, "core_no_disponible");
  });
});

describe("core simulado: consultarSolicitud", () => {
  it("devuelve la solicitud en estudio", () => {
    const respuesta = crearCore().consultarSolicitud(ID_EN_ESTUDIO);
    assert.equal(respuesta.ok, true);
    if (respuesta.ok) assert.equal(respuesta.datos.solicitud?.idSolicitud, ID_EN_ESTUDIO);
  });

  it("un identificador válido que no existe es un éxito vacío", () => {
    assert.deepEqual(crearCore().consultarSolicitud(ID_INEXISTENTE), {
      ok: true,
      datos: { solicitud: null },
    });
  });

  it("un formato inválido es validación con el campo", () => {
    for (const id of ["SOL-123", "SOL-1231234567", "otra cosa", 42]) {
      const respuesta = crearCore().consultarSolicitud(id);
      assert.equal(respuesta.ok, false);
      if (!respuesta.ok) {
        assert.equal(respuesta.error.categoria, "validacion");
        assert.equal(respuesta.error.campo, "idSolicitud");
        assert.equal(respuesta.error.reintentable, false);
      }
    }
  });

  it("una solicitud anulada es un error de negocio", () => {
    const respuesta = crearCore().consultarSolicitud(ID_ANULADA);
    assert.equal(respuesta.ok, false);
    if (!respuesta.ok) {
      assert.equal(respuesta.error.categoria, "negocio");
      assert.equal(respuesta.error.codigo, "solicitud_anulada");
    }
  });

  it("una solicitud reservada es un error de permisos", () => {
    const respuesta = crearCore().consultarSolicitud(ID_RESERVADA);
    assert.equal(respuesta.ok, false);
    if (!respuesta.ok) {
      assert.equal(respuesta.error.categoria, "permisos");
      assert.equal(respuesta.error.codigo, "solicitud_reservada");
    }
  });

  it("cada core tiene su propia copia de los datos", () => {
    const uno = crearCore();
    const respuesta = uno.consultarSolicitud(ID_EN_ESTUDIO);
    if (respuesta.ok && respuesta.datos.solicitud) respuesta.datos.solicitud.monto = 1;
    const otra = crearCore().consultarSolicitud(ID_EN_ESTUDIO);
    if (otra.ok) assert.equal(otra.datos.solicitud?.monto, 3_500_000);
  });
});

describe("core simulado: falla transitoria (US3)", () => {
  it("con la falla en siempre, toda consulta es transitorio core_no_disponible reintentable", () => {
    const core = crearCore({ falla: "siempre" });
    for (let i = 0; i < 3; i++) {
      const respuesta = core.consultarSolicitud(ID_EN_ESTUDIO);
      assert.equal(respuesta.ok, false);
      if (!respuesta.ok) {
        assert.equal(respuesta.error.categoria, "transitorio");
        assert.equal(respuesta.error.codigo, "core_no_disponible");
        assert.equal(respuesta.error.reintentable, true);
      }
    }
  });

  it("con la falla en una-vez, solo la primera consulta falla", () => {
    const core = crearCore({ falla: "una-vez" });
    assert.equal(core.consultarSolicitud(ID_EN_ESTUDIO).ok, false);
    assert.equal(core.consultarSolicitud(ID_EN_ESTUDIO).ok, true);
  });
});
describe("core simulado: verificarIdentidad (US3)", () => {
  const HOY = new Date("2026-10-17T12:00:00.000Z");
  const UNICO = solicitante(ID_SOLICITANTE_UNICO);
  let secuencia = 0;
  const nuevoIntento = () => `intento-${++secuencia}`;
  const conversacion = () => `00000000-0000-4000-8000-${String(++secuencia).padStart(12, "0")}`;

  function verificar(
    core: ReturnType<typeof crearCore>,
    correlationId: string,
    idSolicitante: unknown,
    fechaExpedicion: unknown,
    idIntento: unknown = nuevoIntento(),
  ) {
    return core.verificarIdentidad({
      idSolicitante,
      fechaExpedicion,
      idIntento,
      correlationId,
    });
  }

  const codigo = (r: ReturnType<typeof verificar>) =>
    r.respuesta.ok ? "ok" : `${r.respuesta.error.categoria}/${r.respuesta.error.codigo}`;

  it("una fecha mal formada, inexistente o futura es validación de fechaExpedicion y no suma intento", () => {
    const core = crearCore({ ahora: () => HOY });
    const cid = conversacion();
    for (const fecha of ["2020-1-5", "2020-13-40", "2021-02-29", "2026-10-18", 20200105, ""]) {
      const r = verificar(core, cid, ID_SOLICITANTE_UNICO, fecha);
      assert.equal(codigo(r), "validacion/formato_invalido", String(fecha));
      if (!r.respuesta.ok) assert.equal(r.respuesta.error.campo, "fechaExpedicion");
      assert.equal(r.auditoria?.resultado, "formato_invalido");
      assert.equal(r.auditoria?.campo, "fechaExpedicion");
      assert.equal(r.auditoria?.intentosFallidos, 0);
    }
    // Tras seis entradas mal formadas, la fecha correcta todavía verifica.
    assert.equal(codigo(verificar(core, cid, ID_SOLICITANTE_UNICO, UNICO.fechaExpedicion)), "ok");
  });

  it("la fecha de hoy es válida (borde de fecha futura)", () => {
    const core = crearCore({ ahora: () => HOY });
    const r = verificar(core, conversacion(), ID_SOLICITANTE_UNICO, "2026-10-17");
    assert.equal(codigo(r), "negocio/dato_no_coincide");
  });

  it("un idSolicitante sin formato es validación de idSolicitante", () => {
    const core = crearCore({ ahora: () => HOY });
    for (const id of ["CLI-123", "SOL-0001000001", 42]) {
      const r = verificar(core, conversacion(), id, UNICO.fechaExpedicion);
      assert.equal(codigo(r), "validacion/formato_invalido");
      if (!r.respuesta.ok) assert.equal(r.respuesta.error.campo, "idSolicitante");
    }
  });

  it("un idIntento vacío o de más de 64 caracteres es validación de idIntento", () => {
    const core = crearCore({ ahora: () => HOY });
    for (const idIntento of ["", "x".repeat(65), 7]) {
      const r = verificar(
        core,
        conversacion(),
        ID_SOLICITANTE_UNICO,
        UNICO.fechaExpedicion,
        idIntento,
      );
      assert.equal(codigo(r), "validacion/formato_invalido");
      if (!r.respuesta.ok) assert.equal(r.respuesta.error.campo, "idIntento");
    }
  });

  it("un solicitante inexistente es negocio solicitante_inexistente y no suma intento", () => {
    const core = crearCore({ ahora: () => HOY });
    const r = verificar(core, conversacion(), "CLI-0009999999", "2012-05-14");
    assert.equal(codigo(r), "negocio/solicitante_inexistente");
    assert.equal(r.auditoria?.resultado, "inexistente");
  });

  it("en el borde de 3 intentos: el 1.º y el 2.º no coinciden y el 3.º bloquea", () => {
    const core = crearCore({ ahora: () => HOY });
    const cid = conversacion();
    const r1 = verificar(core, cid, ID_SOLICITANTE_UNICO, "2001-01-01");
    const r2 = verificar(core, cid, ID_SOLICITANTE_UNICO, "2001-01-02");
    const r3 = verificar(core, cid, ID_SOLICITANTE_UNICO, "2001-01-03");
    assert.deepEqual(
      [codigo(r1), codigo(r2), codigo(r3)],
      ["negocio/dato_no_coincide", "negocio/dato_no_coincide", "negocio/verificacion_bloqueada"],
    );
    if (!r1.respuesta.ok) assert.match(r1.respuesta.error.mensaje, /2 intentos/);
    if (!r2.respuesta.ok) assert.match(r2.respuesta.error.mensaje, /1 intento\b/);
    assert.deepEqual(
      [r1, r2, r3].map((r) => [r.auditoria?.resultado, r.auditoria?.intentosFallidos]),
      [
        ["no_coincide", 1],
        ["no_coincide", 2],
        ["bloqueada", 3],
      ],
    );
  });

  it("con la verificación bloqueada, la fecha correcta también responde verificacion_bloqueada", () => {
    const core = crearCore({ ahora: () => HOY });
    const cid = conversacion();
    for (const fecha of ["2001-01-01", "2001-01-02", "2001-01-03"]) {
      verificar(core, cid, ID_SOLICITANTE_UNICO, fecha);
    }
    const r = verificar(core, cid, ID_SOLICITANTE_UNICO, UNICO.fechaExpedicion);
    assert.equal(codigo(r), "negocio/verificacion_bloqueada");
    assert.equal(r.auditoria?.resultado, "bloqueada");
  });

  it("la fecha correcta verifica, y repetirla devuelve la misma marca de tiempo sin auditar", () => {
    let reloj = HOY;
    const core = crearCore({ ahora: () => reloj });
    const cid = conversacion();
    const r1 = verificar(core, cid, ID_SOLICITANTE_UNICO, UNICO.fechaExpedicion);
    assert.equal(codigo(r1), "ok");
    assert.deepEqual(r1.respuesta.ok && r1.respuesta.datos.identidad, {
      correlationId: cid,
      verificada: true,
      idSolicitante: ID_SOLICITANTE_UNICO,
      verificadaEn: HOY.toISOString(),
    });
    assert.equal(r1.auditoria?.resultado, "verificada");
    reloj = new Date("2026-10-17T13:00:00.000Z");
    const r2 = verificar(core, cid, ID_SOLICITANTE_UNICO, UNICO.fechaExpedicion);
    assert.deepEqual(r2.respuesta, r1.respuesta);
    assert.equal(r2.auditoria, null);
  });

  it("verificar a otro solicitante en la misma conversación lo reemplaza", () => {
    const core = crearCore({ ahora: () => HOY });
    const cid = conversacion();
    verificar(core, cid, ID_HOMONIMO_1, solicitante(ID_HOMONIMO_1).fechaExpedicion);
    const r = verificar(core, cid, ID_HOMONIMO_2, solicitante(ID_HOMONIMO_2).fechaExpedicion);
    assert.equal(r.respuesta.ok && r.respuesta.datos.identidad.idSolicitante, ID_HOMONIMO_2);
  });

  it("los intentos son por conversación y por solicitante", () => {
    const core = crearCore({ ahora: () => HOY });
    const cid = conversacion();
    for (const fecha of ["2001-01-01", "2001-01-02", "2001-01-03"]) {
      verificar(core, cid, ID_HOMONIMO_1, fecha);
    }
    const otroSolicitante = verificar(
      core,
      cid,
      ID_HOMONIMO_2,
      solicitante(ID_HOMONIMO_2).fechaExpedicion,
    );
    assert.equal(codigo(otroSolicitante), "ok");
    const otraConversacion = verificar(
      core,
      conversacion(),
      ID_HOMONIMO_1,
      solicitante(ID_HOMONIMO_1).fechaExpedicion,
    );
    assert.equal(codigo(otraConversacion), "ok");
  });

  it("un idIntento repetido devuelve la misma respuesta sin sumar intento ni auditar", () => {
    const core = crearCore({ ahora: () => HOY });
    const cid = conversacion();
    const r1 = verificar(core, cid, ID_SOLICITANTE_UNICO, "2001-01-01", "repetido");
    const r2 = verificar(core, cid, ID_SOLICITANTE_UNICO, "2001-01-01", "repetido");
    assert.deepEqual(r2.respuesta, r1.respuesta);
    assert.equal(r2.auditoria, null);
    // Solo contó un fallo: el siguiente no coincide y el que sigue bloquea.
    const r3 = verificar(core, cid, ID_SOLICITANTE_UNICO, "2001-01-02");
    const r4 = verificar(core, cid, ID_SOLICITANTE_UNICO, "2001-01-03");
    assert.equal(codigo(r3), "negocio/dato_no_coincide");
    assert.equal(codigo(r4), "negocio/verificacion_bloqueada");
  });

  it("ningún mensaje de error contiene la fecha guardada ni la presentada", () => {
    const core = crearCore({ ahora: () => HOY });
    const cid = conversacion();
    const fechas = ["2001-01-01", "2001-01-02", "2001-01-03", UNICO.fechaExpedicion];
    const texto = JSON.stringify(
      fechas.map((fecha) => verificar(core, cid, ID_SOLICITANTE_UNICO, fecha)),
    );
    for (const fecha of fechas) assert.equal(texto.includes(fecha), false, fecha);
  });

  it("con la falla simulada activa responde transitorio sin tocar el estado ni auditar", () => {
    const r = crearCore({
      falla: "siempre",
      ahora: () => HOY,
    }).verificarIdentidad({
      idSolicitante: ID_SOLICITANTE_UNICO,
      fechaExpedicion: "2001-01-01",
      idIntento: "x",
      correlationId: conversacion(),
    });
    assert.equal(codigo(r), "transitorio/core_no_disponible");
    assert.equal(r.auditoria, null);
  });
});
describe("core simulado: consultarIdentidad (US4)", () => {
  const HOY = new Date("2026-10-17T12:00:00.000Z");
  const CID_A = "00000000-0000-4000-8000-00000000a001";
  const CID_B = "00000000-0000-4000-8000-00000000b001";

  it("una conversación desconocida no está verificada", () => {
    assert.deepEqual(crearCore().consultarIdentidad(CID_A), {
      ok: true,
      datos: {
        identidad: {
          correlationId: CID_A,
          verificada: false,
          idSolicitante: null,
          verificadaEn: null,
        },
      },
    });
  });

  it("tras verificar responde verificada con el solicitante y la marca de tiempo", () => {
    const core = crearCore({ ahora: () => HOY });
    core.verificarIdentidad({
      idSolicitante: ID_SOLICITANTE_UNICO,
      fechaExpedicion: solicitante(ID_SOLICITANTE_UNICO).fechaExpedicion,
      idIntento: "i-1",
      correlationId: CID_A,
    });
    assert.deepEqual(core.consultarIdentidad(CID_A), {
      ok: true,
      datos: {
        identidad: {
          correlationId: CID_A,
          verificada: true,
          idSolicitante: ID_SOLICITANTE_UNICO,
          verificadaEn: HOY.toISOString(),
        },
      },
    });
    const otra = core.consultarIdentidad(CID_B);
    assert.equal(otra.ok && otra.datos.identidad.verificada, false);
  });

  it("consultar no cambia el estado: una falla de verificación sigue sin verificar", () => {
    const core = crearCore({ ahora: () => HOY });
    core.verificarIdentidad({
      idSolicitante: ID_SOLICITANTE_UNICO,
      fechaExpedicion: "2001-01-01",
      idIntento: "i-2",
      correlationId: CID_A,
    });
    for (let i = 0; i < 2; i++) {
      const r = core.consultarIdentidad(CID_A);
      assert.equal(r.ok && r.datos.identidad.verificada, false);
    }
  });

  it("un correlationId que no es UUID es validación de ese campo", () => {
    const r = crearCore().consultarIdentidad("no-uuid");
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.error.campo, "correlationId");
  });

  it("con la falla simulada activa responde transitorio", () => {
    const r = crearCore({ falla: "siempre" }).consultarIdentidad(CID_A);
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.error.codigo, "core_no_disponible");
  });

  it("la respuesta es una copia: modificarla no cambia el estado guardado", () => {
    const core = crearCore({ ahora: () => HOY });
    core.verificarIdentidad({
      idSolicitante: ID_SOLICITANTE_UNICO,
      fechaExpedicion: solicitante(ID_SOLICITANTE_UNICO).fechaExpedicion,
      idIntento: "i-3",
      correlationId: CID_A,
    });
    const r = core.consultarIdentidad(CID_A);
    if (r.ok) r.datos.identidad.verificada = false;
    const otra = core.consultarIdentidad(CID_A);
    assert.equal(otra.ok && otra.datos.identidad.verificada, true);
  });
});
describe("core simulado: cambio de solicitante en la conversación (caso borde de la spec)", () => {
  const HOY = new Date("2026-10-17T12:00:00.000Z");
  const CID = "00000000-0000-4000-8000-00000000c001";
  const verificar = (
    core: ReturnType<typeof crearCore>,
    idSolicitante: string,
    fechaExpedicion: string,
    idIntento: string,
  ) =>
    core.verificarIdentidad({
      idSolicitante,
      fechaExpedicion,
      idIntento,
      correlationId: CID,
    });
  const verificada = (core: ReturnType<typeof crearCore>) => {
    const r = core.consultarIdentidad(CID);
    return r.ok ? r.datos.identidad : null;
  };

  it("un intento sobre otro solicitante invalida la verificación anterior", () => {
    const core = crearCore({ ahora: () => HOY });
    verificar(core, ID_HOMONIMO_1, solicitante(ID_HOMONIMO_1).fechaExpedicion, "c-1");
    assert.equal(verificada(core)?.verificada, true);
    const r = verificar(core, ID_HOMONIMO_2, "2001-01-01", "c-2");
    assert.equal(r.respuesta.ok, false);
    assert.deepEqual(verificada(core), {
      correlationId: CID,
      verificada: false,
      idSolicitante: null,
      verificadaEn: null,
    });
  });

  it("tras invalidar, el nuevo solicitante se verifica desde cero", () => {
    const core = crearCore({ ahora: () => HOY });
    verificar(core, ID_HOMONIMO_1, solicitante(ID_HOMONIMO_1).fechaExpedicion, "c-3");
    verificar(core, ID_HOMONIMO_2, "2001-01-01", "c-4");
    verificar(core, ID_HOMONIMO_2, solicitante(ID_HOMONIMO_2).fechaExpedicion, "c-5");
    assert.equal(verificada(core)?.idSolicitante, ID_HOMONIMO_2);
  });

  it("un intento mal formado o sobre un solicitante inexistente no invalida nada", () => {
    const core = crearCore({ ahora: () => HOY });
    verificar(core, ID_HOMONIMO_1, solicitante(ID_HOMONIMO_1).fechaExpedicion, "c-6");
    verificar(core, ID_HOMONIMO_2, "2020-13-40", "c-7");
    verificar(core, "CLI-0009999999", "2001-01-01", "c-8");
    assert.equal(verificada(core)?.idSolicitante, ID_HOMONIMO_1);
  });

  it("un intento fallido sobre el mismo solicitante verificado no invalida la verificación", () => {
    const core = crearCore({ ahora: () => HOY });
    verificar(core, ID_HOMONIMO_1, solicitante(ID_HOMONIMO_1).fechaExpedicion, "c-9");
    verificar(core, ID_HOMONIMO_1, "2001-01-01", "c-10");
    assert.equal(verificada(core)?.verificada, true);
  });
});

describe("core simulado: idempotencia solo de los fallos (revisión de código de dea0951)", () => {
  const HOY = new Date("2026-10-17T12:00:00.000Z");
  const CID = "00000000-0000-4000-8000-00000000d001";

  it("A correcto, B, y A otra vez con la misma clave: la respuesta refleja el estado actual", () => {
    const core = crearCore({ ahora: () => HOY });
    const fechaA = solicitante(ID_HOMONIMO_1).fechaExpedicion;
    const intentoA = {
      idSolicitante: ID_HOMONIMO_1,
      fechaExpedicion: fechaA,
      idIntento: "k-a",
      correlationId: CID,
    };
    assert.equal(core.verificarIdentidad(intentoA).respuesta.ok, true);
    core.verificarIdentidad({
      idSolicitante: ID_HOMONIMO_2,
      fechaExpedicion: "2001-01-01",
      idIntento: "k-b",
      correlationId: CID,
    });
    const otraVez = core.verificarIdentidad(intentoA);
    assert.equal(otraVez.respuesta.ok, true);
    const estado = core.consultarIdentidad(CID);
    assert.equal(estado.ok && estado.datos.identidad.verificada, true);
    assert.equal(estado.ok && estado.datos.identidad.idSolicitante, ID_HOMONIMO_1);
    assert.equal(otraVez.auditoria?.resultado, "verificada", "se volvió a verificar de verdad");
  });
});
