import { after, describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { normalizarAccion } from "./accion.ts";
import { esProtegido, secretos } from "./secretos.ts";

const raiz = mkdtempSync(join(tmpdir(), "secretos-"));
mkdirSync(join(raiz, "config"));
mkdirSync(join(raiz, "src"));
writeFileSync(join(raiz, ".env"), "GIT_HUB=valor-de-prueba\n");
writeFileSync(join(raiz, "config", ".env.local"), "GIT_HUB=valor-de-prueba\n");
writeFileSync(join(raiz, ".env.example"), "GIT_HUB=\n");
writeFileSync(join(raiz, "src", "a.ts"), "export {};\n");
after(() => rmSync(raiz, { recursive: true, force: true }));

const contexto = { raiz, obtenerRama: () => "5-x" };

function evaluar(tool_name: string, tool_input: Record<string, unknown>) {
  return secretos(normalizarAccion({ tool_name, tool_input }, raiz), contexto);
}
const shell = (command: string, herramienta = "Bash") => evaluar(herramienta, { command });

describe("esProtegido", () => {
  it("reconoce .env y .env.* en cualquier carpeta, salvo .env.example", () => {
    assert.equal(esProtegido(".env"), true);
    assert.equal(esProtegido("config/.env.local"), true);
    assert.equal(esProtegido(".env.production"), true);
    assert.equal(esProtegido(".env.example"), false);
    assert.equal(esProtegido("src/env.ts"), false);
    assert.equal(esProtegido(".envrc"), false);
  });
});

describe("secretos: herramientas de archivos (FR-005)", () => {
  for (const herramienta of ["Read", "Write", "Edit"]) {
    it(`bloquea ${herramienta} sobre .env y config/.env.local`, () => {
      assert.equal(evaluar(herramienta, { file_path: ".env" }).length, 1);
      assert.equal(
        evaluar(herramienta, { file_path: join(raiz, "config", ".env.local") }).length,
        1,
      );
    });
  }

  it("bloquea Grep con path apuntando a .env", () => {
    assert.equal(evaluar("Grep", { pattern: "GIT_HUB", path: ".env" }).length, 1);
  });

  it("permite Read y Edit de .env.example (FR-007)", () => {
    assert.deepEqual(evaluar("Read", { file_path: ".env.example" }), []);
    assert.deepEqual(
      evaluar("Edit", { file_path: ".env.example", old_string: "a", new_string: "b" }),
      [],
    );
  });
});

describe("secretos: comandos que nombran el archivo (FR-006)", () => {
  const bloqueados: [string, string?][] = [
    ["cat .env"],
    ["cp .env /tmp/copia"],
    ["cat ./config/.env.local"],
    ["cat .env*"],
    ["cat .*"],
    ['echo hola && type ".env"'],
    ["less < .env"],
    ["Get-Content .env", "PowerShell"],
    ["Get-Content -Path .\\config\\.env.local", "PowerShell"],
    ["type .env", "PowerShell"],
  ];
  for (const [comando, herramienta] of bloqueados) {
    it(`bloquea: ${comando}`, () => {
      const bloqueos = shell(comando, herramienta);
      assert.ok(bloqueos.length > 0, "debía bloquearse");
      assert.match(bloqueos[0]!.regla, /nombrar un archivo \.env/);
    });
  }

  it("permite cat src/a.ts y leer .env.example por shell", () => {
    assert.deepEqual(shell("cat src/a.ts"), []);
    assert.deepEqual(shell("cat .env.example"), []);
  });

  it("no confunde un patrón de búsqueda con una ruta", () => {
    assert.deepEqual(shell("grep .env README.md"), []);
    assert.deepEqual(shell("git grep -n .env"), []);
    assert.deepEqual(shell("find . -name '.env*'"), []);
  });

  it("bloquea grep -f .env, que lee los patrones desde el archivo", () => {
    assert.ok(shell("grep -f .env README.md").length > 0);
  });
});

describe("secretos: comandos recursivos (FR-006a)", () => {
  const bloqueados = [
    "grep -r GIT_HUB .",
    "grep -rn GIT_HUB",
    "rg --no-ignore GIT_HUB",
    "rg -uu GIT_HUB",
    "find . -type f -exec cat {} +",
    "find . -type f | xargs cat",
    "cp -r . /tmp/respaldo",
  ];
  for (const comando of bloqueados) {
    it(`bloquea: ${comando}`, () => {
      const bloqueos = shell(comando);
      assert.ok(bloqueos.length > 0, "debía bloquearse");
      assert.match(bloqueos[0]!.regla, /recursivo no puede alcanzar/);
      assert.match(bloqueos[0]!.correccion, /--exclude='\.env\*'/);
    });
  }

  it("bloquea Get-ChildItem -Recurse | Get-Content en PowerShell", () => {
    assert.ok(shell("Get-ChildItem -Recurse | Get-Content", "PowerShell").length > 0);
  });

  const permitidos = [
    "grep -r cuota src/",
    "grep -r GIT_HUB . --exclude='.env*'",
    "rg GIT_HUB",
    "rg --hidden GIT_HUB",
    "rg -uu GIT_HUB -g '!.env*'",
    "git grep GIT_HUB",
    "find src -name '*.ts'",
    "find . -type f -not -name '.env*' -exec cat {} +",
  ];
  for (const comando of permitidos) {
    it(`permite: ${comando}`, () => assert.deepEqual(shell(comando), []));
  }
});
