import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  arrancarCore,
  FALTA_CLAVE,
  leerOpciones,
  USO,
  verificarConfiguracion,
} from "./arranque.ts";
import { fijarDestino } from "../compartido/logs.ts";
import type { ClienteCore } from "../agente/cliente-core.ts";

const PRINCIPAL = fileURLToPath(new URL("./principal.ts", import.meta.url));

/** Ejecuta principal.ts en un proceso aparte, con el entorno dado (sin heredar la clave). */
function ejecutar(argumentos: string[], entorno: Record<string, string> = {}) {
  const base = { ...process.env };
  delete base["ANTHROPIC_API_KEY"];
  return spawnSync(process.execPath, [PRINCIPAL, ...argumentos], {
    env: { ...base, ...entorno },
    encoding: "utf8",
    input: "",
    timeout: 20_000,
  });
}

describe("arranque: opciones de la línea de comandos", () => {
  it("sin opciones, sin demo ni caso", () => {
    assert.deepEqual(leerOpciones([]), { demo: false });
  });

  it("--demo y --caso <ruta>, en cualquier orden", () => {
    assert.deepEqual(leerOpciones(["--caso", "casos/demo-consulta", "--demo"]), {
      demo: true,
      caso: "casos/demo-consulta",
    });
  });

  for (const argumentos of [["--raro"], ["--caso"], ["--caso", "--demo"], ["demo"]]) {
    it(`${JSON.stringify(argumentos)} no es válido`, () => {
      assert.equal(leerOpciones(argumentos), null);
    });
  }
});

describe("arranque: configuración obligatoria (FR-017)", () => {
  it("sin ANTHROPIC_API_KEY devuelve el mensaje del contrato", () => {
    assert.equal(verificarConfiguracion({}), FALTA_CLAVE);
    assert.equal(verificarConfiguracion({ ANTHROPIC_API_KEY: "" }), FALTA_CLAVE);
  });

  it("con la clave no hay problema, y el mensaje nunca incluye valores", () => {
    assert.equal(verificarConfiguracion({ ANTHROPIC_API_KEY: "valor-de-prueba" }), null);
    assert.equal(FALTA_CLAVE.includes("valor-de-prueba"), false);
  });
});

describe("arranque: el core", () => {
  it("si el core no arranca, devuelve la causa, la registra y no lanza", async () => {
    const logs: Record<string, unknown>[] = [];
    fijarDestino({ write: (texto: string) => logs.push(JSON.parse(texto)) });
    try {
      const r = await arrancarCore(async () => {
        throw new Error("spawn falló");
      });
      assert.deepEqual(r, { ok: false, causa: "spawn falló" });
    } finally {
      fijarDestino(null);
    }
    const error = logs.find((l) => l["evento"] === "error_arranque");
    assert.equal(error?.["nivel"], "error");
    assert.equal(error?.["causa"], "spawn falló");
  });

  it("si arranca, devuelve el core", async () => {
    const core = { cerrar: async () => {} } as unknown as ClienteCore;
    assert.deepEqual(await arrancarCore(async () => core), { ok: true, core });
  });
});

describe("arranque: códigos de salida de principal.ts", () => {
  it("sin la clave sale con código 1 y el mensaje, sin arrancar nada", () => {
    const r = ejecutar([]);
    assert.equal(r.status, 1);
    assert.equal(r.stderr.trim(), FALTA_CLAVE);
    assert.equal(r.stdout, "");
  });

  it("con una opción inválida sale con código 2 y el uso, aunque haya clave", () => {
    for (const argumentos of [["--raro"], ["--caso", "--demo"]]) {
      const r = ejecutar(argumentos, { ANTHROPIC_API_KEY: "valor-de-prueba" });
      assert.equal(r.status, 2);
      assert.equal(r.stderr.trim(), USO);
      assert.equal(r.stdout, "");
    }
  });
});
