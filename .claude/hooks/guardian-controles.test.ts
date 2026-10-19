import { after, describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const GUARDIAN = fileURLToPath(new URL("./guardian-controles.ts", import.meta.url));

// Ningún valor con forma real se escribe literal: se arma en tiempo de ejecución.
const cedulaReal = "10" + "4".repeat(8);
const cedulaFicticia = "000" + "4".repeat(7);

interface Resultado {
  salida: string;
  motivo: string | undefined;
}

/** Ejecuta el guardián del plugin como lo hace Claude Code: JSON por stdin, raíz en CLAUDE_PROJECT_DIR. */
function ejecutar(entrada: unknown, raiz: string): Resultado {
  const proceso = spawnSync(process.execPath, [GUARDIAN], {
    input: typeof entrada === "string" ? entrada : JSON.stringify(entrada),
    env: { ...process.env, CLAUDE_PROJECT_DIR: raiz },
    encoding: "utf8",
  });
  const salida = proceso.stdout.trim();
  if (salida === "") return { salida, motivo: undefined };
  const json = JSON.parse(salida) as {
    hookSpecificOutput: { permissionDecision: string; permissionDecisionReason: string };
  };
  assert.equal(json.hookSpecificOutput.permissionDecision, "deny");
  return { salida, motivo: json.hookSpecificOutput.permissionDecisionReason };
}

const escritura = (texto: string, ruta = "app/notas.md") => ({
  tool_name: "Write",
  tool_input: { file_path: ruta, content: texto },
});

describe("guardián del plugin, en un repositorio con otra estructura", () => {
  const raiz = mkdtempSync(join(tmpdir(), "guardian-controles-"));
  mkdirSync(join(raiz, "app"), { recursive: true });
  mkdirSync(join(raiz, "docs"), { recursive: true });
  after(() => rmSync(raiz, { recursive: true, force: true }));

  it("bloquea una cédula con forma real y la muestra enmascarada", () => {
    const r = ejecutar(escritura(`cédula ${cedulaReal}`), raiz);
    assert.match(r.motivo ?? "", /\[datos-reales\] cédula ••••4444 en app\/notas\.md, línea 1/);
    assert.ok(!r.salida.includes(cedulaReal));
  });

  it("no bloquea un número con el prefijo ficticio", () => {
    assert.equal(ejecutar(escritura(`cédula ${cedulaFicticia}`), raiz).salida, "");
  });

  it("dice que aplicó la convención por defecto cuando no hay configuración", () => {
    const r = ejecutar(escritura(`cédula ${cedulaReal}`), raiz);
    assert.match(r.motivo ?? "", /convención por defecto/);
  });

  it("bloquea la lectura de un .env", () => {
    const r = ejecutar({ tool_name: "Read", tool_input: { file_path: ".env" } }, raiz);
    assert.match(r.motivo ?? "", /\[secretos\]/);
  });

  it("permite un Read normal sin imprimir nada", () => {
    const r = ejecutar({ tool_name: "Read", tool_input: { file_path: "docs/guia.md" } }, raiz);
    assert.equal(r.salida, "");
  });

  it("restringe a un subagente revisor: no puede escribir", () => {
    const entrada = { ...escritura("sin datos"), agent_type: "crediagil-controles:revisor-reglas" };
    assert.match(ejecutar(entrada, raiz).motivo ?? "", /\[revisores\]/);
  });

  it("bloquea con el tipo y la causa una entrada que no es JSON", () => {
    const r = ejecutar("esto no es json", raiz);
    assert.match(r.motivo ?? "", /\[error-interno\] SyntaxError/);
  });

  it("bloquea con error-interno una entrada sin tool_name", () => {
    assert.match(ejecutar({}, raiz).motivo ?? "", /\[error-interno\] .*tool_name/);
  });

  it("no incluye controles propios de un flujo: escribir en src/ sin spec no se bloquea", () => {
    assert.equal(ejecutar(escritura("sin datos", "src/a.ts"), raiz).salida, "");
  });
});

describe("guardián del plugin: configuración del equipo", () => {
  const raiz = mkdtempSync(join(tmpdir(), "guardian-controles-cfg-"));
  mkdirSync(join(raiz, ".claude"), { recursive: true });
  after(() => rmSync(raiz, { recursive: true, force: true }));

  it("usa el prefijo del equipo", () => {
    writeFileSync(join(raiz, ".claude", "controles-equipo.json"), '{ "prefijoFicticio": "999" }');
    assert.equal(ejecutar(escritura("cédula 999" + "4".repeat(6)), raiz).salida, "");
    assert.match(
      ejecutar(escritura(`cédula ${cedulaFicticia}`), raiz).motivo ?? "",
      /\[datos-reales\]/,
    );
  });

  it("bloquea con un mensaje legible si la configuración no es válida", () => {
    writeFileSync(join(raiz, ".claude", "controles-equipo.json"), '{ "prefijoFicticio": "abc" }');
    const r = ejecutar(escritura("sin datos"), raiz);
    assert.match(r.motivo ?? "", /\[configuracion\]/);
    assert.match(r.motivo ?? "", /controles-equipo\.json no es válido/);
    assert.match(r.motivo ?? "", /"abc"/);
    assert.match(r.motivo ?? "", /Edita .*controles-equipo\.json o bórralo/);
  });
});
