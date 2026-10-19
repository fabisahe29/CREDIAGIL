import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { normalizarAccion } from "./accion.ts";
import { revisores } from "./revisores.ts";

const RAIZ = "/repo";

function evaluar(tool_name: string, agent_type?: string, tool_input: Record<string, unknown> = {}) {
  const entrada: Record<string, unknown> = { tool_name, tool_input };
  if (agent_type !== undefined) entrada["agent_type"] = agent_type;
  return revisores(normalizarAccion(entrada, RAIZ));
}

describe("revisores: un revisor solo lee (FR-003)", () => {
  for (const agente of ["revisor-codigo", "revisor-cumplimiento"]) {
    for (const herramienta of [
      "Write",
      "Edit",
      "MultiEdit",
      "NotebookEdit",
      "Bash",
      "PowerShell",
      "Agent",
      "WebFetch",
      "WebSearch",
      "mcp__github__add_issue_comment",
    ]) {
      it(`${agente} no puede usar ${herramienta}`, () => {
        const bloqueos = evaluar(herramienta, agente);
        assert.equal(bloqueos.length, 1);
        assert.equal(bloqueos[0]!.control, "revisores");
        assert.match(bloqueos[0]!.detectado, new RegExp(`${agente}.*${herramienta}`));
        assert.match(bloqueos[0]!.correccion, /solo informa/);
      });
    }

    for (const herramienta of ["Read", "Grep", "Glob"]) {
      it(`${agente} puede usar ${herramienta}`, () => {
        assert.deepEqual(evaluar(herramienta, agente, { file_path: "a.ts" }), []);
      });
    }
  }
});

describe("revisores: se reconocen por el prefijo del nombre", () => {
  for (const agente of ["revisor-reglas", "crediagil-controles:revisor-reglas", "revisor-otro"]) {
    it(`${agente} no puede escribir`, () => {
      const bloqueos = evaluar("Write", agente, { file_path: "a.ts", content: "x" });
      assert.equal(bloqueos.length, 1);
      assert.equal(bloqueos[0]!.control, "revisores");
    });

    it(`${agente} puede leer`, () => {
      assert.deepEqual(evaluar("Read", agente, { file_path: "a.ts" }), []);
    });
  }

  for (const agente of ["revisora", "no-revisor-reglas", "otro:analisis", "mi-revisor-reglas"]) {
    it(`${agente} no se restringe: su nombre no empieza por revisor-`, () => {
      assert.deepEqual(evaluar("Write", agente, { file_path: "a.ts", content: "x" }), []);
    });
  }
});

describe("revisores: no afecta a los demás", () => {
  it("la sesión principal puede escribir", () => {
    assert.deepEqual(evaluar("Write", undefined, { file_path: "a.ts", content: "x" }), []);
  });

  it("otro subagente puede escribir", () => {
    assert.deepEqual(evaluar("Write", "Explore", { file_path: "a.ts", content: "x" }), []);
  });
});
