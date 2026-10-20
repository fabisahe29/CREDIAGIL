import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { normalizarAccion } from "./accion.ts";
import { proteccionConfig } from "./proteccion-config.ts";

const RAIZ = "/repo";

function evaluar(tool_name: string, tool_input: Record<string, unknown>, agent_type?: string) {
  const entrada: Record<string, unknown> = { tool_name, tool_input };
  if (agent_type !== undefined) entrada["agent_type"] = agent_type;
  return proteccionConfig(normalizarAccion(entrada, RAIZ));
}

describe("proteccion-config: el agente no escribe la configuración de los controles", () => {
  for (const herramienta of ["Write", "Edit", "MultiEdit"]) {
    it(`bloquea ${herramienta} sobre .claude/controles-equipo.json`, () => {
      const bloqueos = evaluar(herramienta, {
        file_path: ".claude/controles-equipo.json",
        content: "{}",
        new_string: "{}",
      });
      assert.equal(bloqueos.length, 1);
      assert.equal(bloqueos[0]!.control, "configuracion-protegida");
      assert.match(bloqueos[0]!.detectado, /controles-equipo\.json/);
    });
  }

  it("bloquea la ruta absoluta dentro del repositorio", () => {
    const bloqueos = evaluar("Write", {
      file_path: "/repo/.claude/controles-equipo.json",
      content: "{}",
    });
    assert.equal(bloqueos.length, 1);
  });

  it("bloquea una ruta que intenta esquivar con segmentos ..", () => {
    const bloqueos = evaluar("Write", {
      file_path: "app/../.claude/controles-equipo.json",
      content: "{}",
    });
    assert.equal(bloqueos.length, 1);
  });

  it("bloquea el archivo de otro repositorio con el mismo nombre", () => {
    const bloqueos = evaluar("Edit", {
      file_path: "/otro/.claude/controles-equipo.json",
      new_string: "{}",
    });
    assert.equal(bloqueos.length, 1);
  });

  it("también se aplica a un subagente", () => {
    const bloqueos = evaluar(
      "Write",
      { file_path: ".claude/controles-equipo.json", content: "{}" },
      "otro-agente",
    );
    assert.equal(bloqueos.length, 1);
  });

  for (const herramienta of ["Bash", "PowerShell"]) {
    for (const comando of [
      `echo '{}' > .claude/controles-equipo.json`,
      `Set-Content .claude/controles-equipo.json '{}'`,
      `cp otro.json .claude/controles-equipo.json`,
      `sed -i s/a/b/ .claude/controles-equipo.json`,
      `node -e "fs.writeFileSync('.claude/controles-equipo.json','{}')"`,
    ]) {
      it(`bloquea ${herramienta} con «${comando.slice(0, 40)}»`, () => {
        const bloqueos = evaluar(herramienta, { command: comando });
        assert.equal(bloqueos.length, 1);
        assert.equal(bloqueos[0]!.control, "configuracion-protegida");
      });
    }
  }

  it("permite leer el archivo con la herramienta Read", () => {
    assert.deepEqual(evaluar("Read", { file_path: ".claude/controles-equipo.json" }), []);
  });

  it("permite Grep y Glob sobre el archivo", () => {
    assert.deepEqual(evaluar("Grep", { pattern: "prefijo", path: ".claude" }), []);
    assert.deepEqual(evaluar("Glob", { pattern: ".claude/controles-equipo.json" }), []);
  });

  it("no afecta a otros archivos de .claude ni a archivos de nombre parecido", () => {
    for (const ruta of [
      ".claude/settings.json",
      ".claude/reglas-equipo.md",
      ".claude/controles-equipo.json.bak",
      "app/controles-equipo.json.md",
    ]) {
      assert.deepEqual(evaluar("Write", { file_path: ruta, content: "x" }), [], ruta);
    }
  });

  it("no afecta a comandos que no nombran el archivo", () => {
    assert.deepEqual(evaluar("Bash", { command: "ls .claude" }), []);
  });

  it("dice dónde se edita la configuración: fuera de la sesión", () => {
    const [bloqueo] = evaluar("Write", {
      file_path: ".claude/controles-equipo.json",
      content: "{}",
    });
    assert.match(bloqueo!.correccion, /fuera de la sesión|persona/);
  });
});
