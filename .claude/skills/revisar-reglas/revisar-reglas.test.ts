import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const contenido = readFileSync(fileURLToPath(new URL("./SKILL.md", import.meta.url)), "utf8");

describe("skill revisar-reglas", () => {
  it("tiene el nombre y delega en el subagente del plugin con su prefijo", () => {
    assert.match(contenido, /^name: revisar-reglas$/m);
    // Sin el prefijo, la skill no encuentra el subagente del plugin y corre como uno genérico sin restricciones.
    assert.match(contenido, /^agent: crediagil-controles:revisor-reglas$/m);
    assert.match(contenido, /^context: fork$/m);
  });

  it("solo pre-aprueba lectura y el diff de git", () => {
    const linea = /^allowed-tools: (.*)$/m.exec(contenido)?.[1] ?? "";
    assert.match(linea, /Read/);
    assert.match(linea, /Bash\(git diff \*\)/);
    assert.doesNotMatch(linea, /Write|Edit|Bash\((?!git diff)/);
  });

  it("entrega el diff al revisor con el argumento de la invocación", () => {
    assert.match(contenido, /!`git diff \$ARGUMENTS`/);
  });

  it("explica cómo declarar las reglas del equipo", () => {
    assert.match(contenido, /\.claude\/reglas-equipo\.md/);
    assert.match(contenido, /encabezado de segundo nivel/);
  });

  it("explica qué hace el revisor sin configuración", () => {
    assert.match(contenido, /sin_configuracion/);
  });

  it("explica cómo elegir qué revisar y cómo leer el informe", () => {
    assert.match(contenido, /Elegir qué revisar/);
    assert.match(contenido, /Leer el informe/);
  });
});
