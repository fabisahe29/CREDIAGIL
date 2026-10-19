// La lógica determinista no necesita credenciales del modelo ni red (#17, HU4, SC-004): las pruebas de las
// cuatro piezas (bloqueo por hook, cálculo de la cuota, consistencia entre documentos y contrato de
// errores) corren completas y pasan con ANTHROPIC_API_KEY ausente.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

const PIEZAS: Readonly<Record<string, readonly string[]>> = {
  "bloqueo por hook": [
    "src/agente/control-identidad.test.ts",
    "src/agente/control-preaprobacion.test.ts",
  ],
  "cálculo de la cuota": ["src/politica/cuota.test.ts", "src/politica/preaprobacion.test.ts"],
  "consistencia entre documentos": [
    "src/politica/consistencia.test.ts",
    "src/politica/ingreso.test.ts",
  ],
  "contrato de errores": ["src/compartido/errores.test.ts"],
};

describe("sin credenciales: la lógica determinista corre completa", () => {
  const entorno = { ...process.env };
  delete entorno["ANTHROPIC_API_KEY"];
  delete entorno["CREDIAGIL_MODELO"];
  // Dentro de `node --test`, el hijo heredaría el modo de reporte del padre y no imprimiría el resumen.
  delete entorno["NODE_TEST_CONTEXT"];

  for (const [pieza, archivos] of Object.entries(PIEZAS)) {
    it(`${pieza}: sus pruebas pasan sin ANTHROPIC_API_KEY`, () => {
      const r = spawnSync(process.execPath, ["--test", ...archivos], {
        env: entorno,
        encoding: "utf8",
      });
      assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`);
      assert.match(r.stdout, /ℹ fail 0/);
    });
  }
});
