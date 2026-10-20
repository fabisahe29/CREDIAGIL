import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { EXCLUSIONES, PIEZAS } from "./piezas.ts";

const RAIZ = fileURLToPath(new URL("../../", import.meta.url));

describe("piezas del plugin", () => {
  it("cada fuente de la lista existe", () => {
    for (const pieza of PIEZAS) {
      assert.ok(existsSync(join(RAIZ, pieza.fuente)), `no existe la fuente ${pieza.fuente}`);
    }
  });

  it("cada destino es único", () => {
    const destinos = PIEZAS.map((p) => p.destino);
    assert.equal(new Set(destinos).size, destinos.length);
  });

  it("ninguna fuente está entre las exclusiones", () => {
    for (const pieza of PIEZAS) {
      const excluida = EXCLUSIONES.find((e) => pieza.fuente.startsWith(e));
      assert.equal(excluida, undefined, `${pieza.fuente} está excluida por ${String(excluida)}`);
    }
  });

  it("las exclusiones cubren lo propio del flujo y de originación", () => {
    for (const propio of [
      ".claude/hooks/lib/spec-primero",
      ".claude/hooks/lib/puerta-pr",
      ".claude/hooks/formatear",
      ".claude/revision/",
      ".claude/skills/ticket-",
      ".claude/skills/speckit-",
      "src/",
    ]) {
      assert.ok(EXCLUSIONES.includes(propio), `falta excluir ${propio}`);
    }
  });

  it("incluye al menos un hook, un subagente y una skill", () => {
    for (const clase of ["hook", "subagente", "skill"] as const) {
      assert.ok(
        PIEZAS.some((p) => p.clase === clase),
        `no hay ninguna pieza de clase ${clase}`,
      );
    }
  });

  it("las rutas son relativas y con barra normal", () => {
    for (const pieza of PIEZAS) {
      assert.doesNotMatch(pieza.fuente, /^[A-Za-z]:|^\/|\\/);
      assert.doesNotMatch(pieza.destino, /^[A-Za-z]:|^\/|\\/);
    }
  });
});
