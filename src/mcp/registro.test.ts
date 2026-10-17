import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// FR-018 y SC-007: el core queda registrado para Claude Code sin credenciales.

const leer = (ruta: string) =>
  JSON.parse(readFileSync(fileURLToPath(new URL(ruta, import.meta.url)), "utf8")) as Record<
    string,
    unknown
  >;

describe("registro del core en la configuración MCP del proyecto", () => {
  const mcp = leer("../../.mcp.json") as { mcpServers: Record<string, Record<string, unknown>> };
  const core = mcp.mcpServers["crediagil-core"];

  it("crediagil-core es un servidor stdio que arranca src/mcp/principal.ts con node", () => {
    assert.ok(core, "falta crediagil-core en .mcp.json");
    assert.equal(core["type"], "stdio");
    assert.equal(core["command"], "node");
    const args = core["args"] as string[];
    assert.equal(args.length, 1);
    assert.match(args[0]!, /src\/mcp\/principal\.ts$/);
  });

  it("no declara env, headers ni ningún valor con forma de credencial", () => {
    assert.equal("env" in core!, false);
    assert.equal("headers" in core!, false);
    assert.doesNotMatch(
      JSON.stringify(core),
      /api[_-]?key|token|secret|password|bearer|ANTHROPIC|GIT_HUB/i,
    );
  });

  it("está habilitado en la configuración compartida de Claude Code", () => {
    const settings = leer("../../.claude/settings.json") as { enabledMcpjsonServers: string[] };
    assert.ok(settings.enabledMcpjsonServers.includes("crediagil-core"));
    assert.ok(settings.enabledMcpjsonServers.includes("github"));
  });
});
