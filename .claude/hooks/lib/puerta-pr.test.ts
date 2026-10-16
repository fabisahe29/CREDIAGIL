import { after, describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { normalizarAccion } from "./accion.ts";
import { puertaPr } from "./puerta-pr.ts";

const SHA = "d".repeat(40);
const OTRO = "e".repeat(40);
const raiz = mkdtempSync(join(tmpdir(), "puerta-pr-"));
after(() => rmSync(raiz, { recursive: true, force: true }));

function escribirDecision(sha: string, contenido: unknown): void {
  const carpeta = join(raiz, ".git", "crediagil", "revisiones", sha);
  mkdirSync(carpeta, { recursive: true });
  writeFileSync(
    join(carpeta, "decision.json"),
    typeof contenido === "string" ? contenido : JSON.stringify(contenido),
  );
}

function decision(sha: string, cambios: Record<string, unknown> = {}) {
  return {
    sha,
    permite: true,
    motivos: [],
    revisiones: { codigo: "valida", cumplimiento: "valida" },
    ...cambios,
  };
}

function crearPr(head: string, obtenerHeadRemoto: (rama: string) => string = () => SHA) {
  const accion = normalizarAccion(
    {
      tool_name: "mcp__github__create_pull_request",
      tool_input: { owner: "fabisahe29", repo: "CREDIAGIL", head, base: "main", title: "t" },
    },
    raiz,
  );
  return puertaPr(accion, { raiz, obtenerHeadRemoto });
}

function escribir(herramienta: string, ruta: string) {
  const accion = normalizarAccion(
    { tool_name: herramienta, tool_input: { file_path: join(raiz, ruta), content: "{}" } },
    raiz,
  );
  return puertaPr(accion, { raiz, obtenerHeadRemoto: () => SHA });
}

describe("puerta-pr: crear el PR (FR-008, FR-009)", () => {
  it("se niega sin decision.json para el head remoto", () => {
    const bloqueos = crearPr("7-sin-decision", () => OTRO);
    assert.equal(bloqueos.length, 1);
    assert.equal(bloqueos[0]!.control, "puerta-pr");
    assert.match(bloqueos[0]!.correccion, /\/ticket-abrir-pr/);
  });

  it("se niega con una decisión de otro sha", () => {
    escribirDecision(SHA, decision(OTRO));
    assert.equal(crearPr("6-x").length, 1);
  });

  it("se niega con permite: false e incluye sus motivos", () => {
    escribirDecision(
      SHA,
      decision(SHA, { permite: false, motivos: ["Regla 2 incumplida: a.ts:3"] }),
    );
    const bloqueos = crearPr("6-x");
    assert.equal(bloqueos.length, 1);
    assert.match(bloqueos[0]!.detectado, /Regla 2 incumplida: a\.ts:3/);
  });

  it("se niega con una revisión fallida aunque diga permite: true", () => {
    escribirDecision(
      SHA,
      decision(SHA, { revisiones: { codigo: "valida", cumplimiento: "fallida" } }),
    );
    assert.equal(crearPr("6-x").length, 1);
  });

  it("se niega con una decision.json corrupta", () => {
    escribirDecision(SHA, "{ no es json");
    assert.equal(crearPr("6-x").length, 1);
  });

  it("se niega si no se puede leer el head remoto (falla cerrado)", () => {
    const bloqueos = crearPr("6-x", () => {
      throw new Error("origin/6-x no existe");
    });
    assert.equal(bloqueos.length, 1);
    assert.match(bloqueos[0]!.detectado, /origin\/6-x no existe/);
  });

  it("se niega sin head en la entrada", () => {
    assert.equal(crearPr("").length, 1);
  });

  it("pasa con la decisión favorable del sha actual", () => {
    escribirDecision(SHA, decision(SHA));
    assert.deepEqual(crearPr("6-x"), []);
  });

  it("acepta head con el prefijo del dueño (owner:rama)", () => {
    escribirDecision(SHA, decision(SHA));
    let pedida = "";
    const bloqueos = crearPr("fabisahe29:6-x", (rama) => {
      pedida = rama;
      return SHA;
    });
    assert.deepEqual(bloqueos, []);
    assert.equal(pedida, "6-x");
  });
});

describe("puerta-pr: escribir a mano el paquete o la decisión", () => {
  for (const herramienta of ["Write", "Edit", "MultiEdit", "NotebookEdit"]) {
    it(`niega ${herramienta} bajo .git/crediagil/`, () => {
      const bloqueos = escribir(herramienta, `.git/crediagil/revisiones/${SHA}/decision.json`);
      assert.equal(bloqueos.length, 1);
      assert.match(bloqueos[0]!.correccion, /revision\.ts/);
    });
  }

  it("permite leer el paquete", () => {
    assert.deepEqual(escribir("Read", `.git/crediagil/revisiones/${SHA}/paquete.json`), []);
  });

  it("no afecta a otras rutas", () => {
    assert.deepEqual(escribir("Write", "notas.md"), []);
  });

  it("no afecta a otras herramientas MCP", () => {
    const accion = normalizarAccion(
      { tool_name: "mcp__github__add_issue_comment", tool_input: { body: "x" } },
      raiz,
    );
    assert.deepEqual(puertaPr(accion, { raiz, obtenerHeadRemoto: () => SHA }), []);
  });
});
