import { after, describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  PAQUETE,
  SHA,
  escribirPaquete,
  hallazgo,
  informeCodigo,
  informeCumplimiento,
  mensajeRevisor,
  regla,
} from "./lib/fixtures.ts";
import { rutaPaquete } from "./lib/paquete.ts";

const CAPTURAR = fileURLToPath(new URL("./capturar.ts", import.meta.url));

/** Ejecuta el hook como lo hace Claude Code en SubagentStop. */
export function ejecutarCapturar(entrada: unknown, raiz: string) {
  const proceso = spawnSync(process.execPath, [CAPTURAR], {
    input: typeof entrada === "string" ? entrada : JSON.stringify(entrada),
    env: { ...process.env, CLAUDE_PROJECT_DIR: raiz },
    encoding: "utf8",
  });
  return { codigo: proceso.status, stderr: proceso.stderr };
}

export function entradaStop(
  agente: string,
  mensaje: string,
  stopHookActive = false,
): Record<string, unknown> {
  return {
    hook_event_name: "SubagentStop",
    agent_type: agente,
    agent_id: "agente-ficticio",
    last_assistant_message: mensaje,
    stop_hook_active: stopHookActive,
    cwd: ".",
  };
}

describe("capturar: hook SubagentStop", () => {
  const raices: string[] = [];
  after(() => raices.forEach((r) => rmSync(r, { recursive: true, force: true })));
  function nuevaRaiz(conPaquete = true): string {
    const raiz = mkdtempSync(join(tmpdir(), "capturar-"));
    raices.push(raiz);
    if (conPaquete) escribirPaquete(raiz);
    return raiz;
  }
  const archivo = (raiz: string, nombre: string) => join(rutaPaquete(raiz, SHA), nombre);

  it("un informe válido sale con 0 y queda guardado tal cual", () => {
    const raiz = nuevaRaiz();
    const informe = informeCodigo();
    const r = ejecutarCapturar(entradaStop("revisor-codigo", mensajeRevisor(informe)), raiz);
    assert.equal(r.codigo, 0, r.stderr);
    assert.deepEqual(
      JSON.parse(readFileSync(archivo(raiz, "informe-codigo.json"), "utf8")),
      informe,
    );
    assert.equal(existsSync(archivo(raiz, "fallo-codigo.json")), false);
  });

  it("un informe inválido sin stop_hook_active sale con 2, explica y no escribe nada", () => {
    const raiz = nuevaRaiz();
    const malo = informeCodigo({ hallazgos: [hallazgo({ severidad: "grave" })] });
    const r = ejecutarCapturar(entradaStop("revisor-codigo", mensajeRevisor(malo)), raiz);
    assert.equal(r.codigo, 2);
    assert.match(r.stderr, /V3/);
    assert.equal(existsSync(archivo(raiz, "informe-codigo.json")), false);
    assert.equal(existsSync(archivo(raiz, "fallo-codigo.json")), false);
  });

  it("un mensaje sin bloque json sin stop_hook_active sale con 2 (V1)", () => {
    const raiz = nuevaRaiz();
    const r = ejecutarCapturar(entradaStop("revisor-codigo", "Terminé, todo bien."), raiz);
    assert.equal(r.codigo, 2);
    assert.match(r.stderr, /V1/);
  });

  it("un informe inválido con stop_hook_active sale con 0 y guarda el fallo con la causa", () => {
    const raiz = nuevaRaiz();
    const malo = informeCodigo({ hallazgos: [hallazgo({ preexistente: true })] });
    const r = ejecutarCapturar(entradaStop("revisor-codigo", mensajeRevisor(malo), true), raiz);
    assert.equal(r.codigo, 0);
    const fallo = JSON.parse(readFileSync(archivo(raiz, "fallo-codigo.json"), "utf8")) as {
      tipo: string;
      sha: string;
      errores: string[];
    };
    assert.equal(fallo.tipo, "codigo");
    assert.equal(fallo.sha, SHA);
    assert.match(fallo.errores.join("\n"), /V7/);
    assert.equal(existsSync(archivo(raiz, "informe-codigo.json")), false);
  });

  it("un subagente que no es revisor sale con 0 sin escribir", () => {
    const raiz = nuevaRaiz();
    const r = ejecutarCapturar(entradaStop("Explore", mensajeRevisor(informeCodigo())), raiz);
    assert.equal(r.codigo, 0);
    assert.equal(existsSync(archivo(raiz, "informe-codigo.json")), false);
  });

  it("un sha sin paquete guarda un fallo y nunca un informe", () => {
    const raiz = nuevaRaiz(false);
    const r = ejecutarCapturar(
      entradaStop("revisor-codigo", mensajeRevisor(informeCodigo())),
      raiz,
    );
    assert.equal(r.codigo, 0);
    assert.equal(existsSync(archivo(raiz, "informe-codigo.json")), false);
    assert.match(readFileSync(archivo(raiz, "fallo-codigo.json"), "utf8"), /paquete/);
  });

  it("una entrada que no es JSON sale con 0 sin escribir informe (falla cerrado)", () => {
    const raiz = nuevaRaiz();
    const r = ejecutarCapturar("esto no es json", raiz);
    assert.equal(r.codigo, 0);
    assert.equal(existsSync(archivo(raiz, "informe-codigo.json")), false);
  });

  it("un informe válido reemplaza un fallo anterior del mismo tipo", () => {
    const raiz = nuevaRaiz();
    const malo = informeCodigo({ tipo: "otro" });
    ejecutarCapturar(entradaStop("revisor-codigo", mensajeRevisor(malo), true), raiz);
    assert.equal(existsSync(archivo(raiz, "fallo-codigo.json")), true);
    ejecutarCapturar(entradaStop("revisor-codigo", mensajeRevisor(informeCodigo())), raiz);
    assert.equal(existsSync(archivo(raiz, "fallo-codigo.json")), false);
    assert.equal(existsSync(archivo(raiz, "informe-codigo.json")), true);
  });

  it("un informe de cumplimiento válido queda guardado como informe-cumplimiento.json", () => {
    const raiz = nuevaRaiz();
    const informe = informeCumplimiento();
    const r = ejecutarCapturar(entradaStop("revisor-cumplimiento", mensajeRevisor(informe)), raiz);
    assert.equal(r.codigo, 0, r.stderr);
    assert.deepEqual(
      JSON.parse(readFileSync(archivo(raiz, "informe-cumplimiento.json"), "utf8")),
      informe,
    );
  });

  it("un informe de cumplimiento sin las 5 reglas sale con 2 (V4)", () => {
    const raiz = nuevaRaiz();
    const incompleto = informeCumplimiento({ reglas: [regla(1), regla(2, "cumplida")] });
    const r = ejecutarCapturar(
      entradaStop("revisor-cumplimiento", mensajeRevisor(incompleto)),
      raiz,
    );
    assert.equal(r.codigo, 2);
    assert.match(r.stderr, /V4/);
  });

  it("el paquete del fixture es el que valida el sha", () => {
    assert.equal(PAQUETE.sha, SHA);
  });
});
