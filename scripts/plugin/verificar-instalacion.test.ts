import { after, describe, it } from "node:test";
import assert from "node:assert/strict";
import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  codigoDeSalida,
  verificar,
  type EjecutorCli,
  type Resultado,
} from "./verificar-instalacion.ts";

const RAIZ = fileURLToPath(new URL("../../", import.meta.url));
const PLUGIN = join(RAIZ, "plugins", "crediagil-controles");

const temporales: string[] = [];
after(() => {
  for (const carpeta of temporales) rmSync(carpeta, { recursive: true, force: true });
});

const AHORA = () => new Date("2026-10-19T18:00:00Z");

/** CLI falsa que "instala" el plugin y lo lista como instalado desde `rutaDelPlugin`. */
function cliQueInstala(rutaDelPlugin: string): EjecutorCli {
  return (args) => {
    if (args[1] === "list") {
      return {
        codigo: 0,
        salida: `crediagil-controles@crediagil\n  Read from: ${rutaDelPlugin}\n`,
      };
    }
    return { codigo: 0, salida: "ok" };
  };
}

/** Copia del plugin con un guardián que nunca bloquea nada. */
function pluginConGuardianRoto(): string {
  const carpeta = mkdtempSync(join(tmpdir(), "plugin-roto-"));
  temporales.push(carpeta);
  cpSync(PLUGIN, carpeta, { recursive: true });
  writeFileSync(join(carpeta, "hooks", "guardian-controles.ts"), "// no bloquea nada\n");
  return carpeta;
}

const estados = (r: Resultado) => r.piezas.map((p) => `${p.pieza}:${p.estado}`);

describe("verificar: con la CLI disponible", () => {
  it("aprueba el hook, el subagente y la skill del plugin real", () => {
    const resultado = verificar({ raiz: RAIZ, cli: cliQueInstala(PLUGIN), ahora: AHORA });
    assert.deepEqual(estados(resultado), ["hook:aprobada", "subagente:aprobada", "skill:aprobada"]);
    assert.equal(codigoDeSalida(resultado), 0);
  });

  it("deja una entrada por clase de pieza, con sus comprobaciones", () => {
    const resultado = verificar({ raiz: RAIZ, cli: cliQueInstala(PLUGIN), ahora: AHORA });
    assert.deepEqual(
      resultado.piezas.map((p) => p.pieza),
      ["hook", "subagente", "skill"],
    );
    const hook = resultado.piezas[0];
    assert.ok(hook && hook.comprobaciones.length >= 6);
    assert.ok(hook.comprobaciones.every((c) => c.resultado === "ok"));
  });

  it("reprueba el hook, con su causa, si el guardián no bloquea un dato con forma real", () => {
    const resultado = verificar({
      raiz: RAIZ,
      cli: cliQueInstala(pluginConGuardianRoto()),
      ahora: AHORA,
    });
    const hook = resultado.piezas.find((p) => p.pieza === "hook");
    assert.equal(hook?.estado, "reprobada");
    assert.match(hook?.causa ?? "", /bloquea/);
    assert.ok(hook?.comprobaciones.some((c) => c.resultado === "falla"));
    assert.equal(codigoDeSalida(resultado), 1);
  });

  it("reprueba las tres piezas si la instalación falla", () => {
    const cli: EjecutorCli = (args) =>
      args[1] === "install"
        ? { codigo: 1, salida: "no se pudo instalar" }
        : { codigo: 0, salida: "ok" };
    const resultado = verificar({ raiz: RAIZ, cli, ahora: AHORA });
    assert.deepEqual(estados(resultado), [
      "hook:reprobada",
      "subagente:reprobada",
      "skill:reprobada",
    ]);
    assert.match(resultado.piezas[0]?.causa ?? "", /no se pudo instalar/);
    assert.equal(codigoDeSalida(resultado), 1);
  });

  it("deja la instalación aislada: no toca la configuración del usuario", () => {
    const entornos: NodeJS.ProcessEnv[] = [];
    const cli: EjecutorCli = (args, opciones) => {
      entornos.push(opciones.env);
      return cliQueInstala(PLUGIN)(args, opciones);
    };
    verificar({ raiz: RAIZ, cli, ahora: AHORA });
    assert.ok(entornos.length > 0);
    for (const env of entornos) {
      assert.ok(env["CLAUDE_CONFIG_DIR"], "falta CLAUDE_CONFIG_DIR");
      assert.notEqual(env["CLAUDE_CONFIG_DIR"], process.env["CLAUDE_CONFIG_DIR"]);
    }
  });

  it("borra la carpeta temporal al terminar", () => {
    const carpetas: string[] = [];
    const cli: EjecutorCli = (args, opciones) => {
      carpetas.push(opciones.cwd);
      return cliQueInstala(PLUGIN)(args, opciones);
    };
    verificar({ raiz: RAIZ, cli, ahora: AHORA });
    assert.ok(carpetas.length > 0);
    for (const carpeta of new Set(carpetas)) assert.equal(existsSync(carpeta), false);
  });
});

describe("verificar: sin la CLI", () => {
  it("marca las tres piezas como no verificables, con la causa, y nunca como aprobadas", () => {
    const resultado = verificar({ raiz: RAIZ, cli: null, ahora: AHORA });
    assert.deepEqual(estados(resultado), [
      "hook:no_verificable",
      "subagente:no_verificable",
      "skill:no_verificable",
    ]);
    for (const pieza of resultado.piezas) assert.match(pieza.causa ?? "", /CLI de Claude Code/);
  });

  it("no falla el proceso: lo no verificable se informa, no se oculta", () => {
    assert.equal(codigoDeSalida(verificar({ raiz: RAIZ, cli: null, ahora: AHORA })), 0);
  });
});

describe("verificar: repetibilidad y salida", () => {
  it("dos ejecuciones seguidas dan el mismo estado por pieza", () => {
    const una = verificar({ raiz: RAIZ, cli: cliQueInstala(PLUGIN), ahora: AHORA });
    const otra = verificar({ raiz: RAIZ, cli: cliQueInstala(PLUGIN), ahora: AHORA });
    assert.deepEqual(otra, una);
  });

  it("incluye versión, fecha y repositorio de prueba", () => {
    const resultado = verificar({ raiz: RAIZ, cli: null, ahora: AHORA });
    assert.equal(resultado.version, "1.0.0");
    assert.equal(resultado.fecha, "2026-10-19T18:00:00.000Z");
    assert.equal(resultado.repositorioDePrueba, "carpeta temporal");
  });

  it("no contiene datos con forma real ni rutas de archivos", () => {
    const resultado = JSON.stringify(
      verificar({ raiz: RAIZ, cli: cliQueInstala(PLUGIN), ahora: AHORA }),
    );
    assert.doesNotMatch(resultado, /\d{9,}/);
    assert.doesNotMatch(resultado, /[A-Za-z]:\\|\/Users\//);
  });

  it("la CLI solo recibe comandos de plugin, nunca un prompt para el modelo", () => {
    const recibidos: string[][] = [];
    const cli: EjecutorCli = (args, opciones) => {
      recibidos.push(args);
      return cliQueInstala(PLUGIN)(args, opciones);
    };
    verificar({ raiz: RAIZ, cli, ahora: AHORA });
    assert.ok(recibidos.every((args) => args[0] === "plugin"));
  });
});

describe("verificar: el repositorio de prueba", () => {
  it("usa una estructura distinta de la de este repositorio", () => {
    const carpetas: string[] = [];
    const cli: EjecutorCli = (args, opciones) => {
      carpetas.push(opciones.cwd);
      mkdirSync(opciones.cwd, { recursive: true });
      assert.ok(existsSync(join(opciones.cwd, "app")));
      assert.equal(existsSync(join(opciones.cwd, "src")), false);
      assert.equal(existsSync(join(opciones.cwd, "specs")), false);
      return cliQueInstala(PLUGIN)(args, opciones);
    };
    verificar({ raiz: RAIZ, cli, ahora: AHORA });
    assert.ok(carpetas.length > 0);
  });
});
