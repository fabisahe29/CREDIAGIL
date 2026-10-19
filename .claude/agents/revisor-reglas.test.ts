import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const RUTA = fileURLToPath(new URL("./revisor-reglas.md", import.meta.url));
const contenido = readFileSync(RUTA, "utf8");

/** Separa el encabezado (entre `---`) del cuerpo. */
function partir(texto: string): { encabezado: Map<string, string>; cuerpo: string } {
  const coincidencia = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/.exec(texto);
  assert.ok(coincidencia, "el archivo no tiene encabezado");
  const encabezado = new Map<string, string>();
  for (const linea of (coincidencia[1] ?? "").split(/\r?\n/)) {
    const separador = linea.indexOf(":");
    if (separador > 0) {
      encabezado.set(linea.slice(0, separador).trim(), linea.slice(separador + 1).trim());
    }
  }
  return { encabezado, cuerpo: coincidencia[2] ?? "" };
}

const lista = (valor: string | undefined) =>
  (valor ?? "")
    .split(",")
    .map((x) => x.trim())
    .filter((x) => x !== "");

describe("subagente revisor-reglas", () => {
  const { encabezado, cuerpo } = partir(contenido);

  it("se llama revisor-reglas, para que el guardián lo trate como revisor", () => {
    assert.equal(encabezado.get("name"), "revisor-reglas");
  });

  it("solo puede usar Read, Grep y Glob", () => {
    assert.deepEqual(lista(encabezado.get("tools")), ["Read", "Grep", "Glob"]);
  });

  it("prohíbe de forma explícita las herramientas que escriben o ejecutan", () => {
    const prohibidas = lista(encabezado.get("disallowedTools"));
    for (const herramienta of ["Write", "Edit", "Bash", "PowerShell", "Agent", "mcp__*"]) {
      assert.ok(prohibidas.includes(herramienta), `no prohíbe ${herramienta}`);
    }
  });

  it("lee las reglas de la configuración del equipo", () => {
    assert.match(cuerpo, /\.claude\/reglas-equipo\.md/);
  });

  it("informa sin_configuracion y no audita cuando faltan las reglas", () => {
    assert.match(cuerpo, /sin_configuracion/);
    assert.match(cuerpo, /no audit/i);
  });

  it("exige evidencia con archivo y línea para marcar una regla como cumplida", () => {
    assert.match(cuerpo, /cumplida/);
    assert.match(cuerpo, /evidencia/i);
    assert.match(cuerpo, /archivo y línea/);
  });

  it("no interpreta por analogía una regla que no entiende", () => {
    assert.match(cuerpo, /no_aplicable/);
    assert.match(cuerpo, /analogía/);
  });

  it("pide un único bloque json de tipo reglas", () => {
    assert.match(cuerpo, /"tipo": "reglas"/);
  });

  it("no corrige nada: informa", () => {
    assert.match(cuerpo, /No corriges nada/);
  });
});
