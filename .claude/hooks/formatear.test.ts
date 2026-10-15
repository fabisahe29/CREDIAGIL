import { after, describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const FORMATEAR = fileURLToPath(new URL("./formatear.ts", import.meta.url));

const raiz = mkdtempSync(join(tmpdir(), "formatear-"));
mkdirSync(join(raiz, "ignorado"));
writeFileSync(join(raiz, ".prettierignore"), "ignorado/\n");
after(() => rmSync(raiz, { recursive: true, force: true }));

/** Ejecuta el formateador como lo hace Claude Code tras una edición. */
function formatear(ruta: string) {
  const proceso = spawnSync(process.execPath, [FORMATEAR], {
    input: JSON.stringify({ tool_name: "Write", tool_input: { file_path: join(raiz, ruta) } }),
    env: { ...process.env, CLAUDE_PROJECT_DIR: raiz },
    encoding: "utf8",
  });
  return { codigo: proceso.status, stderr: proceso.stderr, stdout: proceso.stdout };
}

describe("formateador", () => {
  it("formatea un .ts mal indentado y sale con 0", () => {
    writeFileSync(join(raiz, "a.ts"), "const   x={a:1,\n        b:2}\n");
    const r = formatear("a.ts");
    assert.equal(r.codigo, 0);
    assert.equal(readFileSync(join(raiz, "a.ts"), "utf8"), "const x = { a: 1, b: 2 };\n");
  });

  it("no toca un .md ni informa nada", () => {
    const original = "#   Título\n\n*  item\n";
    writeFileSync(join(raiz, "b.md"), original);
    const r = formatear("b.md");
    assert.equal(r.codigo, 0);
    assert.equal(r.stderr, "");
    assert.equal(readFileSync(join(raiz, "b.md"), "utf8"), original);
  });

  it("conserva un .ts con error de sintaxis y avisa con código 2", () => {
    const original = "const x = {;\n";
    writeFileSync(join(raiz, "c.ts"), original);
    const r = formatear("c.ts");
    assert.equal(r.codigo, 2);
    assert.match(r.stderr, /^Formato omitido en c\.ts:/);
    assert.equal(readFileSync(join(raiz, "c.ts"), "utf8"), original);
  });

  it("respeta .prettierignore", () => {
    const original = "const   y=1\n";
    writeFileSync(join(raiz, "ignorado", "d.ts"), original);
    const r = formatear("ignorado/d.ts");
    assert.equal(r.codigo, 0);
    assert.equal(readFileSync(join(raiz, "ignorado", "d.ts"), "utf8"), original);
  });
});
