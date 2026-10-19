import { after, describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CopiasDesalineadas, ReferenciaPropia, generar } from "./generar.ts";
import { PIEZAS, type Pieza } from "./piezas.ts";

const temporales: string[] = [];
after(() => {
  for (const carpeta of temporales) rmSync(carpeta, { recursive: true, force: true });
});

function escribir(raiz: string, ruta: string, contenido: string): void {
  const completa = join(raiz, ruta);
  mkdirSync(dirname(completa), { recursive: true });
  writeFileSync(completa, contenido);
}

/** Raíz temporal con dos fuentes y el plugin con un manifiesto escrito a mano. */
function repositorio(): { raiz: string; piezas: Pieza[] } {
  const raiz = mkdtempSync(join(tmpdir(), "generar-"));
  temporales.push(raiz);
  escribir(raiz, "origen/uno.ts", "export const uno = 1;\n");
  escribir(raiz, "origen/sub/dos.md", "# Dos\n\ncon tildes: canción\n");
  escribir(raiz, "plugins/crediagil-controles/.claude-plugin/plugin.json", '{ "a": 1 }\n');
  const piezas: Pieza[] = [
    { fuente: "origen/uno.ts", destino: "hooks/uno.ts", clase: "hook" },
    { fuente: "origen/sub/dos.md", destino: "agents/sub/dos.md", clase: "subagente" },
  ];
  return { raiz, piezas };
}

const leer = (raiz: string, ruta: string) =>
  readFileSync(join(raiz, "plugins/crediagil-controles", ruta), "utf8");

describe("generar", () => {
  it("copia cada fuente a su destino con contenido idéntico", () => {
    const { raiz, piezas } = repositorio();
    generar(raiz, piezas);
    assert.equal(leer(raiz, "hooks/uno.ts"), "export const uno = 1;\n");
    assert.equal(leer(raiz, "agents/sub/dos.md"), "# Dos\n\ncon tildes: canción\n");
  });

  it("crea las carpetas que faltan e informa qué copió", () => {
    const { raiz, piezas } = repositorio();
    const resultado = generar(raiz, piezas);
    assert.deepEqual([...resultado.copiadas].sort(), ["agents/sub/dos.md", "hooks/uno.ts"]);
  });

  it("una segunda ejecución no cambia nada", () => {
    const { raiz, piezas } = repositorio();
    generar(raiz, piezas);
    const segunda = generar(raiz, piezas);
    assert.deepEqual(segunda.copiadas, []);
    assert.equal(leer(raiz, "hooks/uno.ts"), "export const uno = 1;\n");
  });

  it("actualiza una copia que quedó distinta de su fuente", () => {
    const { raiz, piezas } = repositorio();
    generar(raiz, piezas);
    escribir(raiz, "origen/uno.ts", "export const uno = 2;\n");
    const resultado = generar(raiz, piezas);
    assert.deepEqual(resultado.copiadas, ["hooks/uno.ts"]);
    assert.equal(leer(raiz, "hooks/uno.ts"), "export const uno = 2;\n");
  });

  it("no toca los manifiestos escritos a mano", () => {
    const { raiz, piezas } = repositorio();
    generar(raiz, piezas);
    assert.equal(leer(raiz, ".claude-plugin/plugin.json"), '{ "a": 1 }\n');
  });

  it("falla nombrando la fuente que no existe", () => {
    const { raiz } = repositorio();
    const rota: Pieza[] = [{ fuente: "origen/falta.ts", destino: "hooks/falta.ts", clase: "hook" }];
    assert.throws(() => generar(raiz, rota), /origen\/falta\.ts/);
  });
});

describe("generar: detección de deriva", () => {
  it("con las copias al día termina sin error y sin escribir", () => {
    const { raiz, piezas } = repositorio();
    generar(raiz, piezas);
    assert.deepEqual(generar(raiz, piezas, { verificar: true }).copiadas, []);
  });

  it("falla nombrando cada pieza cuya copia difiere de su fuente, sin escribir nada", () => {
    const { raiz, piezas } = repositorio();
    generar(raiz, piezas);
    escribir(raiz, "origen/uno.ts", "export const uno = 2;\n");
    escribir(raiz, "origen/sub/dos.md", "# Dos cambiado\n");
    assert.throws(
      () => generar(raiz, piezas, { verificar: true }),
      (error: unknown) => {
        assert.ok(error instanceof CopiasDesalineadas);
        assert.match(error.message, /hooks\/uno\.ts/);
        assert.match(error.message, /agents\/sub\/dos\.md/);
        return true;
      },
    );
    assert.equal(leer(raiz, "hooks/uno.ts"), "export const uno = 1;\n");
  });

  it("falla nombrando la pieza cuya copia no existe", () => {
    const { raiz, piezas } = repositorio();
    assert.throws(() => generar(raiz, piezas, { verificar: true }), /hooks\/uno\.ts.*falta/);
  });
});

describe("generar: referencias propias", () => {
  it("se detiene antes de copiar y señala pieza, línea y término", () => {
    const { raiz, piezas } = repositorio();
    escribir(raiz, "origen/uno.ts", "// ver specs/a.md\nexport const uno = 1;\n");
    assert.throws(
      () => generar(raiz, piezas),
      (error: unknown) => {
        assert.ok(error instanceof ReferenciaPropia);
        assert.match(error.message, /origen\/uno\.ts:1/);
        assert.match(error.message, /specs\//);
        return true;
      },
    );
  });

  it("no deja el plugin a medias: no copia ni las piezas limpias", () => {
    const { raiz, piezas } = repositorio();
    escribir(raiz, "origen/sub/dos.md", "# Dos\n\nver CLAUDE.md\n");
    assert.throws(() => generar(raiz, piezas), ReferenciaPropia);
    assert.throws(() => leer(raiz, "hooks/uno.ts"), /ENOENT/);
  });

  it("también se detiene en modo verificar", () => {
    const { raiz, piezas } = repositorio();
    generar(raiz, piezas);
    escribir(raiz, "origen/uno.ts", "// src/agente\n");
    assert.throws(() => generar(raiz, piezas, { verificar: true }), ReferenciaPropia);
  });
});

describe("generar: el repositorio real", () => {
  it("el plugin versionado coincide con sus fuentes", () => {
    const raiz = fileURLToPath(new URL("../../", import.meta.url));
    assert.doesNotThrow(
      () => generar(raiz, PIEZAS, { verificar: true }),
      "una copia del plugin difiere de su fuente: ejecuta npm run plugin:generar",
    );
  });
});
