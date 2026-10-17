import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { conReintentos } from "./reintentos.ts";
import {
  errorNegocio,
  errorTransitorio,
  exito,
  fallo,
  type Respuesta,
} from "../compartido/errores.ts";

/** Operación falsa que devuelve las respuestas dadas en orden y cuenta los intentos. */
function operacion(respuestas: Respuesta<string>[]) {
  let intentos = 0;
  const fn = async () => respuestas[Math.min(intentos++, respuestas.length - 1)]!;
  return { fn, intentos: () => intentos };
}

const transitorio = fallo<string>(errorTransitorio("core_no_disponible", "Caído."));

function reloj() {
  const esperas: number[] = [];
  return { esperas, dormir: async (ms: number) => void esperas.push(ms) };
}

describe("política de reintentos", () => {
  it("un éxito al primer intento no espera", async () => {
    const { fn, intentos } = operacion([exito("dato")]);
    const r = reloj();
    const resultado = await conReintentos(fn, { dormir: r.dormir, azar: () => 0.5 });
    assert.deepEqual(resultado.respuesta, exito("dato"));
    assert.equal(intentos(), 1);
    assert.deepEqual(r.esperas, []);
  });

  it("un transitorio y después un éxito: 2 intentos y una espera de 500 ms", async () => {
    const { fn, intentos } = operacion([transitorio, exito("dato")]);
    const r = reloj();
    const resultado = await conReintentos(fn, { dormir: r.dormir, azar: () => 0.5 });
    assert.equal(resultado.respuesta.ok, true);
    assert.equal(resultado.intentos, 2);
    assert.equal(intentos(), 2);
    assert.deepEqual(r.esperas, [500]);
  });

  it("la variación es de ±20% según el azar", async () => {
    for (const [azar, esperada] of [
      [0, 400],
      [1, 600],
    ] as const) {
      const { fn } = operacion([transitorio, exito("dato")]);
      const r = reloj();
      await conReintentos(fn, { dormir: r.dormir, azar: () => azar });
      assert.deepEqual(r.esperas, [esperada]);
    }
  });

  it("un transitorio persistente: exactamente 3 intentos, esperas 500 y 1000 ms, y transitorio_agotado", async () => {
    const { fn, intentos } = operacion([transitorio]);
    const r = reloj();
    const resultado = await conReintentos(fn, { dormir: r.dormir, azar: () => 0.5 });
    assert.equal(intentos(), 3);
    assert.equal(resultado.intentos, 3);
    assert.deepEqual(r.esperas, [500, 1000]);
    assert.equal(resultado.respuesta.ok, false);
    if (!resultado.respuesta.ok) {
      assert.equal(resultado.respuesta.error.codigo, "transitorio_agotado");
      assert.equal(resultado.respuesta.error.reintentable, false);
    }
    assert.equal(resultado.agotado, true);
    assert.equal(resultado.ultimoError, "core_no_disponible");
  });

  it("en el peor caso la espera total no supera 1,8 s (SC-003a)", async () => {
    const { fn } = operacion([transitorio]);
    const r = reloj();
    await conReintentos(fn, { dormir: r.dormir, azar: () => 1 });
    assert.ok(r.esperas.reduce((a, b) => a + b, 0) <= 1800, String(r.esperas));
  });

  it("un error no reintentable no se reintenta", async () => {
    const { fn, intentos } = operacion([fallo(errorNegocio("solicitud_anulada", "Anulada."))]);
    const r = reloj();
    const resultado = await conReintentos(fn, { dormir: r.dormir, azar: () => 0.5 });
    assert.equal(intentos(), 1);
    assert.equal(resultado.agotado, false);
    assert.deepEqual(r.esperas, []);
  });

  it("cada intento se informa con su número y resultado", async () => {
    const { fn } = operacion([transitorio, exito("dato")]);
    const vistos: [number, string][] = [];
    await conReintentos(fn, {
      dormir: async () => {},
      azar: () => 0.5,
      alIntentar: (n, respuesta) => vistos.push([n, respuesta.ok ? "ok" : respuesta.error.codigo]),
    });
    assert.deepEqual(vistos, [
      [1, "core_no_disponible"],
      [2, "ok"],
    ]);
  });
});
