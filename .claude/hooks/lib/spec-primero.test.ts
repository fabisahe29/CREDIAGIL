import { after, describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { normalizarAccion } from "./accion.ts";
import { specPrimero } from "./spec-primero.ts";

const raiz = mkdtempSync(join(tmpdir(), "spec-primero-"));
mkdirSync(join(raiz, "specs", "003-x"), { recursive: true });
mkdirSync(join(raiz, "specs", "009-z"), { recursive: true });
writeFileSync(
  join(raiz, "specs", "003-x", "spec.md"),
  "# Spec\n\n**Issue de origen**: [fabisahe29/CREDIAGIL#5 — Título](https://github.com/fabisahe29/CREDIAGIL/issues/5)\n",
);
writeFileSync(join(raiz, "specs", "009-z", "spec.md"), "# Spec sin issue de origen\n");
after(() => rmSync(raiz, { recursive: true, force: true }));

function evaluar(rama: string, tool_name: string, tool_input: Record<string, unknown>) {
  return specPrimero(normalizarAccion({ tool_name, tool_input }, raiz), {
    raiz,
    obtenerRama: () => rama,
  });
}
const escribir = (rama: string, ruta: string) =>
  evaluar(rama, "Write", { file_path: ruta, content: "x" });
const shell = (rama: string, command: string, herramienta = "Bash") =>
  evaluar(rama, herramienta, { command });

describe("spec-primero: se bloquean", () => {
  it("escribir en src/ en una rama cuyo ticket no tiene spec", () => {
    const [bloqueo] = escribir("7-y", "src/a.ts");
    assert.ok(bloqueo);
    assert.match(bloqueo.detectado, /#7/);
    assert.match(bloqueo.correccion, /\/speckit-specify/);
  });

  it("un test bajo src/ también es código de producción (aclaración Q1)", () => {
    assert.equal(escribir("7-y", "src/politica/cuota.test.ts").length, 1);
  });

  it("escribir en src/ desde main o desde una rama sin número de ticket", () => {
    for (const rama of ["main", "003-x", ""]) {
      const [bloqueo] = escribir(rama, "src/a.ts");
      assert.ok(bloqueo, `debía bloquearse en "${rama}"`);
      assert.match(bloqueo.correccion, /\/ticket-tomar/);
    }
  });

  it("una spec sin la línea Issue de origen no habilita su ticket", () => {
    assert.equal(escribir("9-z", "src/a.ts").length, 1);
  });

  it("escrituras por shell hacia src/", () => {
    assert.equal(shell("7-y", "echo x > src/a.ts").length, 1);
    assert.equal(shell("7-y", "cat a >> src/a.ts").length, 1);
    assert.equal(shell("7-y", "cp a.ts src/").length, 1);
    assert.equal(shell("7-y", "echo x | tee src/a.ts").length, 1);
    assert.equal(shell("7-y", "Set-Content src/a.ts x", "PowerShell").length, 1);
    assert.equal(shell("7-y", "Out-File -FilePath src\\a.ts", "PowerShell").length, 1);
  });
});

describe("spec-primero: pasan", () => {
  it("escribir en src/ en la rama de un ticket con spec", () => {
    assert.deepEqual(escribir("5-x", "src/a.ts"), []);
    assert.deepEqual(shell("5-x", "echo x > src/a.ts"), []);
  });

  it("escribir fuera de src/ sin spec", () => {
    for (const ruta of ["docs/x.md", ".claude/hooks/x.ts", "specs/007-y/spec.md", "README.md"]) {
      assert.deepEqual(escribir("7-y", ruta), [], ruta);
    }
  });

  it("leer src/ sin spec", () => {
    assert.deepEqual(evaluar("7-y", "Read", { file_path: "src/a.ts" }), []);
    assert.deepEqual(shell("7-y", "cat src/a.ts"), []);
  });

  it("no confunde una carpeta que empieza por src con src/", () => {
    assert.deepEqual(escribir("7-y", "srcs/a.ts"), []);
  });
});
