import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = fileURLToPath(new URL("../../", import.meta.url));
const PLUGIN = "plugins/crediagil-controles";

function esObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === "object" && valor !== null && !Array.isArray(valor);
}

function leerJson(ruta: string): Record<string, unknown> {
  const valor: unknown = JSON.parse(readFileSync(join(RAIZ, ruta), "utf8"));
  assert.ok(esObjeto(valor), `${ruta} no es un objeto`);
  return valor;
}

describe("catálogo (.claude-plugin/marketplace.json)", () => {
  const catalogo = leerJson(".claude-plugin/marketplace.json");
  const plugins: unknown[] = Array.isArray(catalogo["plugins"]) ? catalogo["plugins"] : [];
  const entrada = plugins.find((p) => esObjeto(p) && p["name"] === "crediagil-controles");

  it("lista el plugin con nombre, ruta relativa y descripción", () => {
    assert.ok(esObjeto(entrada), "el catálogo no lista crediagil-controles");
    assert.equal(entrada["source"], "./plugins/crediagil-controles");
    assert.equal(typeof entrada["description"], "string");
    assert.notEqual(entrada["description"], "");
  });

  it("no repite la versión: vive solo en plugin.json", () => {
    assert.ok(esObjeto(entrada));
    assert.equal("version" in entrada, false);
  });

  it("nombra a un equipo como propietario, no a una cuenta personal", () => {
    const propietario = catalogo["owner"];
    assert.ok(esObjeto(propietario));
    assert.equal(typeof propietario["name"], "string");
    assert.doesNotMatch(String(propietario["name"]), /@|\//);
  });

  it("apunta a una carpeta que existe", () => {
    assert.ok(esObjeto(entrada));
    assert.ok(existsSync(join(RAIZ, String(entrada["source"]))));
  });
});

describe("manifiesto del plugin (plugin.json)", () => {
  const manifiesto = leerJson(`${PLUGIN}/.claude-plugin/plugin.json`);

  it("tiene el mismo nombre que la entrada del catálogo", () => {
    assert.equal(manifiesto["name"], "crediagil-controles");
  });

  it("declara una versión SemVer", () => {
    assert.match(String(manifiesto["version"]), /^\d+\.\d+\.\d+$/);
  });

  it("tiene descripción", () => {
    assert.equal(typeof manifiesto["description"], "string");
    assert.notEqual(manifiesto["description"], "");
  });
});

describe("registro del hook (hooks/hooks.json)", () => {
  const registro = leerJson(`${PLUGIN}/hooks/hooks.json`);

  function comandos(): string[] {
    const hooks = registro["hooks"];
    assert.ok(esObjeto(hooks));
    const preToolUse = hooks["PreToolUse"];
    assert.ok(Array.isArray(preToolUse), "falta PreToolUse");
    return preToolUse.flatMap((grupo: unknown) => {
      assert.ok(esObjeto(grupo));
      const lista = grupo["hooks"];
      assert.ok(Array.isArray(lista));
      return lista.map((hook: unknown) => {
        assert.ok(esObjeto(hook));
        return String(hook["command"]);
      });
    });
  }

  it("registra el guardián con la variable del plugin", () => {
    const lista = comandos();
    assert.equal(lista.length, 1);
    assert.match(lista[0] ?? "", /\$\{CLAUDE_PLUGIN_ROOT\}\/hooks\/guardian-controles\.ts/);
  });

  it("no usa ninguna ruta absoluta", () => {
    for (const comando of comandos()) {
      assert.doesNotMatch(comando, /[A-Za-z]:[\\/]|(^|\s|")\/(Users|home)\//);
    }
  });

  it("apunta a un guardián que existe en el plugin", () => {
    assert.ok(existsSync(join(RAIZ, PLUGIN, "hooks", "guardian-controles.ts")));
  });
});
