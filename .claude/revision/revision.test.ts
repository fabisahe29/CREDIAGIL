import { after, describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { archivoDecision, guardarInforme } from "./lib/almacen.ts";
import {
  commitEnRama,
  crearRepositorio,
  hallazgo,
  informeCodigo,
  informeCumplimiento,
} from "./lib/fixtures.ts";
import type { Informe } from "./lib/informe.ts";
import { leerPaquete, rutaPaquete } from "./lib/paquete.ts";

const REVISION = fileURLToPath(new URL("./revision.ts", import.meta.url));

/** Ejecuta el CLI como lo hace /ticket-abrir-pr, desde la raíz del repositorio. */
export function ejecutarRevision(argumentos: string[], raiz: string, entrada = "") {
  const proceso = spawnSync(process.execPath, [REVISION, ...argumentos], {
    cwd: raiz,
    input: entrada,
    env: { ...process.env, CLAUDE_PROJECT_DIR: raiz },
    encoding: "utf8",
  });
  return { codigo: proceso.status, stdout: proceso.stdout, stderr: proceso.stderr };
}

describe("revision.ts preparar", () => {
  const raices: string[] = [];
  after(() => raices.forEach((r) => rmSync(r, { recursive: true, force: true })));

  it("con --local imprime el sha y crea el paquete", () => {
    const raiz = crearRepositorio();
    raices.push(raiz);
    commitEnRama(raiz);
    const r = ejecutarRevision(["preparar", "--local"], raiz);
    assert.equal(r.codigo, 0, r.stderr);
    const { sha } = JSON.parse(r.stdout) as { sha: string };
    assert.match(sha, /^[0-9a-f]{40}$/);
    assert.equal(existsSync(join(rutaPaquete(raiz, sha), "diff.patch")), true);
  });

  it("sin cambios respecto de main sale con 1 y un mensaje legible", () => {
    const raiz = crearRepositorio();
    raices.push(raiz);
    const r = ejecutarRevision(["preparar", "--local"], raiz);
    assert.equal(r.codigo, 1);
    assert.match(r.stderr, /DiffVacio: .*no tiene cambios/);
  });

  it("sin spec del ticket sale con 1 y lo explica", () => {
    const raiz = crearRepositorio("8-sin-spec");
    raices.push(raiz);
    commitEnRama(raiz);
    const r = ejecutarRevision(["preparar", "--local"], raiz);
    assert.equal(r.codigo, 1);
    assert.match(r.stderr, /SinSpec: .*#8/);
  });

  it("sin remoto, el modo normal falla con un error de git legible", () => {
    const raiz = crearRepositorio();
    raices.push(raiz);
    commitEnRama(raiz);
    const r = ejecutarRevision(["preparar"], raiz);
    assert.equal(r.codigo, 1);
    assert.match(r.stderr, /ErrorGit: git rev-parse origin\/6-prueba/);
  });

  it("un subcomando desconocido muestra el uso", () => {
    const raiz = crearRepositorio();
    raices.push(raiz);
    const r = ejecutarRevision(["otro"], raiz);
    assert.equal(r.codigo, 1);
    assert.match(r.stderr, /uso: revision\.ts/);
  });
});

describe("revision.ts decidir", () => {
  const raices: string[] = [];
  after(() => raices.forEach((r) => rmSync(r, { recursive: true, force: true })));

  function prepararConInformes(cambiosCodigo: Record<string, unknown> = {}) {
    const raiz = crearRepositorio();
    raices.push(raiz);
    commitEnRama(raiz);
    const { sha } = JSON.parse(ejecutarRevision(["preparar", "--local"], raiz).stdout) as {
      sha: string;
    };
    const paquete = leerPaquete(raiz, sha);
    const enDiff = { archivo: "nuevo.ts" };
    guardarInforme(
      raiz,
      informeCodigo({
        sha,
        hallazgos: [hallazgo({ ...enDiff, severidad: "media" })],
        ...cambiosCodigo,
      }) as unknown as Informe,
    );
    guardarInforme(raiz, informeCumplimiento({ sha }) as unknown as Informe);
    return { raiz, sha, paquete };
  }

  it("con informes válidos que no bloquean, escribe decision.json con permite: true", () => {
    const { raiz, sha } = prepararConInformes();
    const r = ejecutarRevision(["decidir", sha], raiz);
    assert.equal(r.codigo, 0, r.stderr);
    const { comentarios: _, ...decision } = JSON.parse(r.stdout) as {
      permite: boolean;
      sha: string;
      comentarios: unknown;
    };
    assert.equal(decision.permite, true);
    assert.deepEqual(JSON.parse(readFileSync(archivoDecision(raiz, sha), "utf8")), decision);
  });

  it("con un hallazgo alto, permite: false y el motivo con archivo y línea", () => {
    const { raiz, sha } = prepararConInformes({
      hallazgos: [hallazgo({ archivo: "nuevo.ts", severidad: "alta", linea: 1 })],
    });
    const decision = JSON.parse(ejecutarRevision(["decidir", sha], raiz).stdout) as {
      permite: boolean;
      motivos: string[];
    };
    assert.equal(decision.permite, false);
    assert.match(decision.motivos.join("\n"), /nuevo\.ts:1/);
  });

  it("un informe guardado que ya no valida cuenta como revisión fallida", () => {
    const { raiz, sha } = prepararConInformes({
      hallazgos: [hallazgo({ archivo: "fuera-del-diff.ts" })],
    });
    const decision = JSON.parse(ejecutarRevision(["decidir", sha], raiz).stdout) as {
      permite: boolean;
      revisiones: Record<string, string>;
    };
    assert.equal(decision.permite, false);
    assert.equal(decision.revisiones["codigo"], "fallida");
  });

  it("sin paquete para el sha sale con 1", () => {
    const raiz = crearRepositorio();
    raices.push(raiz);
    const r = ejecutarRevision(["decidir", "c".repeat(40)], raiz);
    assert.equal(r.codigo, 1);
    assert.match(r.stderr, /PaqueteInexistente/);
  });
});

describe("revision.ts decidir: comentarios de registro", () => {
  const raices: string[] = [];
  after(() => raices.forEach((r) => rmSync(r, { recursive: true, force: true })));

  it("incluye los cuerpos de los dos registros con su marcador; decision.json no los guarda", () => {
    const raiz = crearRepositorio();
    raices.push(raiz);
    commitEnRama(raiz);
    const { sha } = JSON.parse(ejecutarRevision(["preparar", "--local"], raiz).stdout) as {
      sha: string;
    };
    guardarInforme(raiz, informeCodigo({ sha, hallazgos: [] }) as unknown as Informe);
    const salida = JSON.parse(ejecutarRevision(["decidir", sha], raiz).stdout) as {
      comentarios: Record<string, string>;
    };
    assert.match(salida.comentarios["codigo"]!, new RegExp(`revision=codigo;commit=${sha}`));
    assert.match(salida.comentarios["cumplimiento"]!, /revisión fallida/);
    assert.equal(
      "comentarios" in (JSON.parse(readFileSync(archivoDecision(raiz, sha), "utf8")) as object),
      false,
    );
  });
});

describe("revision.ts reutilizar", () => {
  const raices: string[] = [];
  after(() => raices.forEach((r) => rmSync(r, { recursive: true, force: true })));

  function conRegistros() {
    const raiz = crearRepositorio();
    raices.push(raiz);
    commitEnRama(raiz);
    const { sha } = JSON.parse(ejecutarRevision(["preparar", "--local"], raiz).stdout) as {
      sha: string;
    };
    guardarInforme(raiz, informeCodigo({ sha, hallazgos: [] }) as unknown as Informe);
    guardarInforme(raiz, informeCumplimiento({ sha }) as unknown as Informe);
    const { comentarios } = JSON.parse(ejecutarRevision(["decidir", sha], raiz).stdout) as {
      comentarios: Record<string, string>;
    };
    rmSync(archivoDecision(raiz, sha));
    return { raiz, sha, comentarios };
  }

  it("con los dos registros del sha reconstruye la decisión sin revisar de nuevo", () => {
    const { raiz, sha, comentarios } = conRegistros();
    const r = ejecutarRevision(["reutilizar", sha], raiz, JSON.stringify(comentarios));
    assert.equal(r.codigo, 0, r.stderr);
    const decision = JSON.parse(r.stdout) as { permite: boolean; reutilizada: boolean };
    assert.equal(decision.permite, true);
    assert.equal(decision.reutilizada, true);
    assert.equal(existsSync(archivoDecision(raiz, sha)), true);
  });

  it("si falta un registro sale con 3 para revisar de nuevo", () => {
    const { raiz, sha, comentarios } = conRegistros();
    const r = ejecutarRevision(
      ["reutilizar", sha],
      raiz,
      JSON.stringify({ codigo: comentarios["codigo"] }),
    );
    assert.equal(r.codigo, 3);
    assert.match(r.stderr, /cumplimiento: no hay un registro/);
  });

  it("un registro de otro commit no sirve (sale con 3)", () => {
    const { raiz, sha, comentarios } = conRegistros();
    const otro = comentarios["codigo"]!.replaceAll(sha, "f".repeat(40));
    const r = ejecutarRevision(
      ["reutilizar", sha],
      raiz,
      JSON.stringify({ ...comentarios, codigo: otro }),
    );
    assert.equal(r.codigo, 3);
  });

  it("un registro de una revisión fallida no se reutiliza (sale con 3)", () => {
    const raiz = crearRepositorio();
    raices.push(raiz);
    commitEnRama(raiz);
    const { sha } = JSON.parse(ejecutarRevision(["preparar", "--local"], raiz).stdout) as {
      sha: string;
    };
    const { comentarios } = JSON.parse(ejecutarRevision(["decidir", sha], raiz).stdout) as {
      comentarios: Record<string, string>;
    };
    const r = ejecutarRevision(["reutilizar", sha], raiz, JSON.stringify(comentarios));
    assert.equal(r.codigo, 3);
  });

  it("stdin que no es JSON sale con 1", () => {
    const { raiz, sha } = conRegistros();
    assert.equal(ejecutarRevision(["reutilizar", sha], raiz, "no json").codigo, 1);
  });
});
