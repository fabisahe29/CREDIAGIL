import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { EntradaInvalida, normalizarAccion } from "./accion.ts";

const RAIZ = "C:\\repo\\crediagil";

describe("normalizarAccion", () => {
  it("conserva el agent_type de un subagente como agente", () => {
    const accion = normalizarAccion(
      { tool_name: "Read", tool_input: { file_path: "a.md" }, agent_type: "revisor-codigo" },
      RAIZ,
    );
    assert.equal(accion.agente, "revisor-codigo");
  });

  it("no define agente en la sesión principal ni con un agent_type vacío", () => {
    const principal = normalizarAccion({ tool_name: "Read", tool_input: {} }, RAIZ);
    const vacio = normalizarAccion({ tool_name: "Read", tool_input: {}, agent_type: "" }, RAIZ);
    assert.equal("agente" in principal, false);
    assert.equal("agente" in vacio, false);
  });

  it("rechaza una entrada sin tool_name", () => {
    assert.throws(() => normalizarAccion({ tool_input: {} }, RAIZ), EntradaInvalida);
  });

  it("rechaza una entrada cuyo tool_input no es un objeto", () => {
    assert.throws(
      () => normalizarAccion({ tool_name: "Write", tool_input: "x" }, RAIZ),
      EntradaInvalida,
    );
    assert.throws(() => normalizarAccion(null, RAIZ), EntradaInvalida);
  });

  it("extrae el contenido y la ruta de Write", () => {
    const accion = normalizarAccion(
      { tool_name: "Write", tool_input: { file_path: "src/a.ts", content: "hola" } },
      RAIZ,
    );
    assert.equal(accion.herramienta, "Write");
    assert.deepEqual(accion.rutas, ["src/a.ts"]);
    assert.deepEqual(accion.textos, [{ origen: "src/a.ts", texto: "hola" }]);
  });

  it("extrae new_string de Edit y cada edits[].new_string de MultiEdit", () => {
    const edit = normalizarAccion(
      {
        tool_name: "Edit",
        tool_input: { file_path: "a.md", old_string: "viejo", new_string: "nuevo" },
      },
      RAIZ,
    );
    assert.deepEqual(edit.textos, [{ origen: "a.md", texto: "nuevo" }]);

    const multi = normalizarAccion(
      {
        tool_name: "MultiEdit",
        tool_input: {
          file_path: "a.md",
          edits: [
            { old_string: "x", new_string: "uno" },
            { old_string: "y", new_string: "dos" },
          ],
        },
      },
      RAIZ,
    );
    assert.deepEqual(
      multi.textos.map((t) => t.texto),
      ["uno", "dos"],
    );
  });

  it("extrae new_source y notebook_path de NotebookEdit", () => {
    const accion = normalizarAccion(
      { tool_name: "NotebookEdit", tool_input: { notebook_path: "n.ipynb", new_source: "celda" } },
      RAIZ,
    );
    assert.deepEqual(accion.rutas, ["n.ipynb"]);
    assert.deepEqual(accion.textos, [{ origen: "n.ipynb", texto: "celda" }]);
  });

  it("toma el comando de Bash y de PowerShell como texto y como comando", () => {
    for (const herramienta of ["Bash", "PowerShell"]) {
      const accion = normalizarAccion(
        { tool_name: herramienta, tool_input: { command: "ls -la", description: "listar" } },
        RAIZ,
      );
      assert.equal(accion.comando, "ls -la");
      assert.deepEqual(accion.textos, [{ origen: "comando", texto: "ls -la" }]);
    }
  });

  it("toma todos los textos de una herramienta MCP, incluidos los anidados", () => {
    const accion = normalizarAccion(
      {
        tool_name: "mcp__github__add_issue_comment",
        tool_input: {
          owner: "o",
          body: "cuerpo",
          extra: { lista: ["a", { b: "c" }] },
          issue_number: 5,
        },
      },
      RAIZ,
    );
    assert.deepEqual(accion.textos.map((t) => t.texto).sort(), ["a", "c", "cuerpo", "o"]);
  });

  it("normaliza rutas absolutas de Windows a relativas con /", () => {
    const accion = normalizarAccion(
      {
        tool_name: "Read",
        tool_input: { file_path: "C:\\repo\\crediagil\\src\\politica\\cuota.ts" },
      },
      RAIZ,
    );
    assert.deepEqual(accion.rutas, ["src/politica/cuota.ts"]);
  });

  it("normaliza ./ y barras invertidas en rutas relativas", () => {
    const accion = normalizarAccion(
      { tool_name: "Grep", tool_input: { pattern: "x", path: ".\\config\\.env" } },
      RAIZ,
    );
    assert.deepEqual(accion.rutas, ["config/.env"]);
  });
});
