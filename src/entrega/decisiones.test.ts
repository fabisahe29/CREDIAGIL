import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const RAIZ = fileURLToPath(new URL("../../", import.meta.url));
const DECISIONES = readFileSync(join(RAIZ, "DECISIONES.md"), "utf8");
const MAXIMO_PALABRAS = 1000;
const ETIQUETAS = ["**Mecanismo**:", "**Por qué**:", "**Descartado**:", "**Detalle**:"];

/** Las secciones `## N. …`, con su número y su texto. */
function secciones(): Array<{ numero: number; texto: string }> {
  return [...DECISIONES.matchAll(/^## (\d+)\. .*$/gm)].map((m, i, todas) => {
    const fin = todas[i + 1]?.index ?? DECISIONES.length;
    return { numero: Number(m[1]), texto: DECISIONES.slice(m.index, fin) };
  });
}

describe("DECISIONES.md, el resumen de dos páginas", () => {
  it(`tiene como máximo ${MAXIMO_PALABRAS} palabras`, () => {
    const palabras = DECISIONES.split(/\s+/).filter(Boolean).length;
    assert.ok(palabras <= MAXIMO_PALABRAS, `tiene ${palabras} palabras`);
  });

  it("tiene exactamente las 11 secciones numeradas del 1 al 11", () => {
    assert.deepEqual(
      secciones().map((s) => s.numero),
      [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
    );
  });

  it("cada sección tiene mecanismo, por qué, descartado y detalle", () => {
    for (const { numero, texto } of secciones()) {
      for (const etiqueta of ETIQUETAS) {
        assert.ok(texto.includes(etiqueta), `la sección ${numero} no tiene ${etiqueta}`);
      }
    }
  });

  it("cada enlace de detalle apunta a un archivo que existe o a una dirección externa", () => {
    for (const { numero, texto } of secciones()) {
      const linea = texto.split("\n").find((l) => l.startsWith("**Detalle**:"))!;
      const enlaces = [...linea.matchAll(/\]\(([^)]+)\)/g)].map((m) => m[1]!);
      assert.ok(enlaces.length > 0, `la sección ${numero} no enlaza su detalle`);
      for (const enlace of enlaces) {
        if (/^https?:\/\//.test(enlace)) continue;
        assert.ok(
          existsSync(join(RAIZ, enlace)),
          `la sección ${numero} enlaza ${enlace}, que no existe`,
        );
      }
    }
  });

  it("todos los enlaces locales del documento existen", () => {
    for (const [, enlace] of DECISIONES.matchAll(/\]\(([^)#]+)(?:#[^)]*)?\)/g)) {
      if (/^https?:\/\//.test(enlace!)) continue;
      assert.ok(existsSync(join(RAIZ, enlace!)), `${enlace} no existe`);
    }
  });

  it("enlaza el registro detallado", () => {
    assert.ok(DECISIONES.includes("](docs/registro-decisiones.md)"));
  });
});

describe("docs/registro-decisiones.md, el registro detallado", () => {
  const REGISTRO = join(RAIZ, "docs", "registro-decisiones.md");

  it("existe y conserva el encabezado del registro de decisiones", () => {
    assert.ok(existsSync(REGISTRO));
    assert.ok(readFileSync(REGISTRO, "utf8").startsWith("# Registro de decisiones"));
  });

  it("sus enlaces locales siguen resolviendo desde docs/", () => {
    const texto = readFileSync(REGISTRO, "utf8");
    for (const [, enlace] of texto.matchAll(/\]\(([^)#]+)(?:#[^)]*)?\)/g)) {
      if (/^https?:\/\//.test(enlace!)) continue;
      assert.ok(existsSync(join(dirname(REGISTRO), enlace!)), `${enlace} no existe`);
    }
  });
});
