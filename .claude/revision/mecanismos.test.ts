import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// FR-013 y FR-003: los mecanismos de revisión existen con la configuración que exige el enunciado.

const RAIZ = fileURLToPath(new URL("../../", import.meta.url));

/** Campos de primer nivel del frontmatter YAML (`clave: valor`), sin comillas. */
function frontmatter(archivo: string): Record<string, string> {
  const texto = readFileSync(join(RAIZ, archivo), "utf8");
  const bloque = /^---\r?\n([\s\S]*?)\r?\n---/.exec(texto);
  assert.ok(bloque, `${archivo} no tiene frontmatter`);
  const campos: Record<string, string> = {};
  for (const linea of bloque[1]!.split(/\r?\n/)) {
    const par = /^([\w-]+):\s*(.*)$/.exec(linea);
    if (par) campos[par[1]!] = par[2]!.replace(/^"(.*)"$/, "$1").trim();
  }
  return campos;
}

const lista = (valor: string | undefined) => (valor ?? "").split(",").map((s) => s.trim());

const AGENTES = ["revisor-codigo", "revisor-cumplimiento"];
const SKILLS = ["revisar-codigo", "revisar-cumplimiento"];
const PROHIBIDAS = ["Write", "Edit", "Bash", "PowerShell", "Agent", "mcp__*"];

describe("mecanismos: al menos 2 subagentes revisores de solo lectura", () => {
  it("existen al menos 2 subagentes en .claude/agents/", () => {
    const agentes = readdirSync(join(RAIZ, ".claude", "agents")).filter((a) => a.endsWith(".md"));
    assert.ok(agentes.length >= 2, agentes.join(", "));
  });

  for (const agente of AGENTES) {
    it(`${agente}: solo Read, Grep y Glob, y niega las herramientas con efectos`, () => {
      const campos = frontmatter(`.claude/agents/${agente}.md`);
      assert.equal(campos["name"], agente);
      assert.deepEqual(lista(campos["tools"]), ["Read", "Grep", "Glob"]);
      const negadas = lista(campos["disallowedTools"]);
      for (const herramienta of PROHIBIDAS) assert.ok(negadas.includes(herramienta), herramienta);
      assert.match(campos["maxTurns"] ?? "", /^\d+$/);
    });
  }
});

describe("mecanismos: al menos 2 skills con context: fork, allowed-tools y argument-hint", () => {
  for (const skill of SKILLS) {
    it(`${skill}: corre aislada en un revisor que existe y no está en el menú`, () => {
      const campos = frontmatter(`.claude/skills/${skill}/SKILL.md`);
      assert.equal(campos["name"], skill);
      assert.equal(campos["context"], "fork");
      assert.equal(campos["user-invocable"], "false");
      assert.equal(campos["background"], "false");
      assert.ok((campos["argument-hint"] ?? "") !== "", "falta argument-hint");
      assert.deepEqual(lista(campos["allowed-tools"]), ["Read", "Grep", "Glob"]);
      const negadas = lista(campos["disallowed-tools"]);
      for (const herramienta of PROHIBIDAS) assert.ok(negadas.includes(herramienta), herramienta);
      const agente = campos["agent"] ?? "";
      assert.ok(AGENTES.includes(agente), agente);
      assert.ok(existsSync(join(RAIZ, ".claude", "agents", `${agente}.md`)));
    });
  }
});
