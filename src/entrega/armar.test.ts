import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, before, describe, it } from "node:test";
import { armar } from "./armar.ts";
import { ErrorEntrega } from "./tipos.ts";
import { leerZip } from "./zip.ts";

let raiz = "";

const git = (...argumentos: string[]) =>
  execFileSync(
    "git",
    ["-c", "user.name=Prueba", "-c", "user.email=prueba@ejemplo.example", ...argumentos],
    {
      cwd: raiz,
      stdio: "ignore",
    },
  );

function escribir(ruta: string, texto: string) {
  mkdirSync(dirname(join(raiz, ruta)), { recursive: true });
  writeFileSync(join(raiz, ruta), texto);
}

describe("armado del .zip", () => {
  before(() => {
    raiz = mkdtempSync(join(tmpdir(), "crediagil-armar-"));
    git("init", "-q", "-b", "main");
    escribir(".gitignore", ".env\nnode_modules/\ndist/\n");
    escribir("src/a.ts", "export const a = 1;\n");
    escribir(".env.example", "VARIABLE=\n");
    git("add", ".");
    git("commit", "-q", "-m", "chore: base");
    // Archivos locales ignorados por git: no deben entrar al .zip.
    escribir(".env", "VARIABLE=valor-local\n");
    escribir("node_modules/x/index.js", "module.exports = 1;\n");
  });

  after(() => rmSync(raiz, { recursive: true, force: true }));

  it("incluye lo versionado y .git/, y deja fuera lo ignorado", () => {
    const { salida, archivos } = armar(raiz);
    const rutas = leerZip(salida).map((e) => e.ruta);
    assert.equal(archivos, rutas.length);
    assert.ok(rutas.includes("src/a.ts"));
    assert.ok(rutas.includes(".env.example"));
    assert.ok(rutas.includes(".git/HEAD"));
    assert.ok(!rutas.includes(".env"));
    assert.ok(!rutas.some((r) => r.startsWith("node_modules/")));
    assert.ok(!rutas.some((r) => r.startsWith("dist/")));
  });

  it("se niega a armar si hay un cambio sin commit", () => {
    escribir("src/a.ts", "export const a = 2;\n");
    assert.throws(
      () => armar(raiz),
      (error: unknown) => error instanceof ErrorEntrega && error.tipo === "arbol-sucio",
    );
    git("checkout", "--", "src/a.ts");
  });

  it("no cambia el historial: el mismo commit antes y después", () => {
    const antes = execFileSync("git", ["rev-parse", "HEAD"], { cwd: raiz, encoding: "utf8" });
    armar(raiz);
    const despues = execFileSync("git", ["rev-parse", "HEAD"], { cwd: raiz, encoding: "utf8" });
    assert.equal(despues, antes);
  });
});
