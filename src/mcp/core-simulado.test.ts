import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { crearCore } from "./core-simulado.ts";
import { ID_ANULADA, ID_EN_ESTUDIO, ID_INEXISTENTE, ID_RESERVADA } from "./datos-ejemplo.ts";

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
