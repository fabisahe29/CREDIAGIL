import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import {
  aResultadoMcp,
  errorNegocio,
  errorPermisos,
  errorTransitorio,
  errorValidacion,
  esquemaRespuesta,
  exito,
  fallo,
  fueraDeContrato,
  transitorioAgotado,
} from "./errores.ts";

const respuestaCualquiera = esquemaRespuesta(z.unknown());

describe("contrato de errores: constructores", () => {
  it("solo un error transitorio es reintentable", () => {
    assert.equal(errorTransitorio("core_no_disponible", "El core no responde.").reintentable, true);
    assert.equal(
      errorValidacion("formato_invalido", "Mal formato.", "idSolicitud").reintentable,
      false,
    );
    assert.equal(errorNegocio("solicitud_anulada", "Está anulada.").reintentable, false);
    assert.equal(errorPermisos("solicitud_reservada", "Es de otro canal.").reintentable, false);
  });

  it("cada constructor fija su categoría", () => {
    assert.equal(errorTransitorio("c", "m").categoria, "transitorio");
    assert.equal(errorValidacion("c", "m", "campo").categoria, "validacion");
    assert.equal(errorNegocio("c", "m").categoria, "negocio");
    assert.equal(errorPermisos("c", "m").categoria, "permisos");
  });

  it("transitorioAgotado es transitorio pero ya no reintentable (excepción documentada)", () => {
    const error = transitorioAgotado("Se agotaron los reintentos.");
    assert.deepEqual(
      { categoria: error.categoria, reintentable: error.reintentable, codigo: error.codigo },
      { categoria: "transitorio", reintentable: false, codigo: "transitorio_agotado" },
    );
  });

  it("una respuesta fuera de contrato es negocio y no reintentable", () => {
    const error = fueraDeContrato("La respuesta del core no cumple el contrato.");
    assert.equal(error.categoria, "negocio");
    assert.equal(error.reintentable, false);
    assert.equal(error.codigo, "respuesta_fuera_de_contrato");
  });

  it("un error de validación exige el campo", () => {
    assert.throws(() => errorValidacion("formato_invalido", "Mal formato.", ""));
  });

  it("un mensaje vacío no se acepta", () => {
    assert.throws(() => errorNegocio("solicitud_anulada", ""));
  });
});

describe("contrato de errores: esquema de respuesta", () => {
  it("acepta un éxito y un fallo bien formados", () => {
    assert.equal(respuestaCualquiera.safeParse(exito({ solicitud: null })).success, true);
    assert.equal(
      respuestaCualquiera.safeParse(fallo(errorNegocio("solicitud_anulada", "Anulada."))).success,
      true,
    );
  });

  it("rechaza una categoría desconocida", () => {
    const malo = {
      ok: false,
      error: { categoria: "grave", reintentable: false, codigo: "x", mensaje: "m" },
    };
    assert.equal(respuestaCualquiera.safeParse(malo).success, false);
  });

  it("rechaza un mensaje vacío", () => {
    const malo = {
      ok: false,
      error: { categoria: "negocio", reintentable: false, codigo: "x", mensaje: "" },
    };
    assert.equal(respuestaCualquiera.safeParse(malo).success, false);
  });

  it("rechaza reintentable: true en una categoría que no es transitorio", () => {
    const malo = {
      ok: false,
      error: { categoria: "permisos", reintentable: true, codigo: "x", mensaje: "m" },
    };
    assert.equal(respuestaCualquiera.safeParse(malo).success, false);
  });

  it("rechaza una validación sin campo", () => {
    const malo = {
      ok: false,
      error: { categoria: "validacion", reintentable: false, codigo: "x", mensaje: "m" },
    };
    assert.equal(respuestaCualquiera.safeParse(malo).success, false);
  });

  it("valida los datos con el esquema dado", () => {
    const conNumero = esquemaRespuesta(z.object({ n: z.number() }));
    assert.equal(conNumero.safeParse(exito({ n: 1 })).success, true);
    assert.equal(conNumero.safeParse(exito({ n: "uno" })).success, false);
  });
});

describe("contrato de errores: resultado MCP", () => {
  it("un éxito va en structuredContent sin isError", () => {
    const resultado = aResultadoMcp(exito({ solicitud: null }));
    assert.deepEqual(resultado.structuredContent, { ok: true, datos: { solicitud: null } });
    assert.equal(resultado.isError, false);
    assert.equal(resultado.content[0]?.type, "text");
  });

  it("un fallo va en structuredContent con isError", () => {
    const resultado = aResultadoMcp(fallo(errorPermisos("solicitud_reservada", "Otro canal.")));
    assert.equal(resultado.isError, true);
    assert.equal((resultado.structuredContent as { ok: boolean }).ok, false);
  });
});
