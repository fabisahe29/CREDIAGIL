import { after, describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { tarjetaLuhn } from "./lib/generadores.ts";

const GUARDIAN = fileURLToPath(new URL("./guardian.ts", import.meta.url));

interface Resultado {
  codigo: number | null;
  salida: string;
  motivo: string | undefined;
}

/** Ejecuta el guardián como lo hace Claude Code: JSON por stdin, raíz en CLAUDE_PROJECT_DIR. */
export function ejecutarGuardian(entrada: unknown, raiz: string): Resultado {
  const proceso = spawnSync(process.execPath, [GUARDIAN], {
    input: typeof entrada === "string" ? entrada : JSON.stringify(entrada),
    env: { ...process.env, CLAUDE_PROJECT_DIR: raiz },
    encoding: "utf8",
  });
  const salida = proceso.stdout.trim();
  let motivo: string | undefined;
  if (salida !== "") {
    const json = JSON.parse(salida) as {
      hookSpecificOutput: { permissionDecision: string; permissionDecisionReason: string };
    };
    assert.equal(json.hookSpecificOutput.permissionDecision, "deny");
    motivo = json.hookSpecificOutput.permissionDecisionReason;
  }
  return { codigo: proceso.status, salida, motivo };
}

describe("guardián como proceso", () => {
  const raiz = mkdtempSync(join(tmpdir(), "guardian-"));
  after(() => rmSync(raiz, { recursive: true, force: true }));

  it("bloquea con error-interno una entrada sin tool_name (falla cerrado)", () => {
    const r = ejecutarGuardian({}, raiz);
    assert.equal(r.codigo, 0);
    assert.match(r.motivo ?? "", /\[error-interno\] .*tool_name/);
  });

  it("bloquea con error-interno una entrada que no es JSON", () => {
    const r = ejecutarGuardian("esto no es json", raiz);
    assert.equal(r.codigo, 0);
    assert.match(r.motivo ?? "", /\[error-interno\]/);
  });

  it("acepta una entrada con BOM, como la que produce una tubería de PowerShell", () => {
    const entrada = "﻿" + JSON.stringify({ tool_name: "Read", tool_input: { file_path: "a.md" } });
    assert.equal(ejecutarGuardian(entrada, raiz).salida, "");
  });

  it("permite un Read normal sin imprimir nada", () => {
    const r = ejecutarGuardian({ tool_name: "Read", tool_input: { file_path: "README.md" } }, raiz);
    assert.equal(r.codigo, 0);
    assert.equal(r.salida, "");
  });
});

describe("guardián: spec primero (US3)", () => {
  const raiz = mkdtempSync(join(tmpdir(), "guardian-spec-"));
  spawnSync("git", ["init", "-q", "-b", "7-y"], { cwd: raiz });
  after(() => rmSync(raiz, { recursive: true, force: true }));

  it("bloquea escribir en src/ sin spec y junta los dos motivos con un dato real (FR-014)", () => {
    const r = ejecutarGuardian(
      {
        tool_name: "Write",
        tool_input: { file_path: "src/a.ts", content: `pago ${tarjetaLuhn()}` },
      },
      raiz,
    );
    assert.match(r.motivo ?? "", /\(2 motivos\)/);
    assert.match(r.motivo ?? "", /\[datos-reales\]/);
    assert.match(r.motivo ?? "", /\[spec-primero\] .*rama 7-y.*#7/);
  });

  it("permite escribir fuera de src/ sin spec", () => {
    const r = ejecutarGuardian(
      { tool_name: "Write", tool_input: { file_path: "docs/x.md", content: "texto" } },
      raiz,
    );
    assert.equal(r.salida, "");
  });
});

describe("guardián: secretos (US2)", () => {
  const raiz = mkdtempSync(join(tmpdir(), "guardian-secretos-"));
  writeFileSync(join(raiz, ".env"), "GIT_HUB=valor-de-prueba\n");
  writeFileSync(join(raiz, ".env.example"), "GIT_HUB=\n");
  after(() => rmSync(raiz, { recursive: true, force: true }));

  it("bloquea un Read de .env", () => {
    const r = ejecutarGuardian(
      { tool_name: "Read", tool_input: { file_path: join(raiz, ".env") } },
      raiz,
    );
    assert.match(r.motivo ?? "", /\[secretos\] Read sobre \.env/);
  });

  it("permite un Read de .env.example", () => {
    const r = ejecutarGuardian(
      { tool_name: "Read", tool_input: { file_path: ".env.example" } },
      raiz,
    );
    assert.equal(r.salida, "");
  });
});

describe("guardián: datos con forma real (US1)", () => {
  const raiz = mkdtempSync(join(tmpdir(), "guardian-datos-"));
  after(() => rmSync(raiz, { recursive: true, force: true }));
  const tarjeta = tarjetaLuhn();

  it("bloquea un Write con una tarjeta y no repite el dato en el mensaje", () => {
    const r = ejecutarGuardian(
      { tool_name: "Write", tool_input: { file_path: "notas.md", content: `pago ${tarjeta}` } },
      raiz,
    );
    assert.match(r.motivo ?? "", /\[datos-reales\] tarjeta ••••\d{4} en notas\.md, línea 1/);
    assert.ok(!(r.motivo ?? "").includes(tarjeta));
  });

  it("bloquea un git commit cuyo mensaje contiene una tarjeta (FR-002)", () => {
    const r = ejecutarGuardian(
      { tool_name: "Bash", tool_input: { command: `git commit -m "pago ${tarjeta}"` } },
      raiz,
    );
    assert.match(r.motivo ?? "", /\[datos-reales\] tarjeta .* en comando/);
  });

  it("bloquea un comentario MCP con una cédula y su palabra clave", () => {
    const cedula = "52" + "3".repeat(6);
    const r = ejecutarGuardian(
      {
        tool_name: "mcp__github__add_issue_comment",
        tool_input: { owner: "o", repo: "r", issue_number: 5, body: `cédula ${cedula}` },
      },
      raiz,
    );
    assert.match(r.motivo ?? "", /\[datos-reales\] cédula/);
  });

  it("permite un Write con un monto del dominio", () => {
    const r = ejecutarGuardian(
      {
        tool_name: "Write",
        tool_input: { file_path: "notas.md", content: "monto: $5.000.000 COP" },
      },
      raiz,
    );
    assert.equal(r.salida, "");
  });
});

describe("guardián: revisores de solo lectura (spec 004, US1)", () => {
  const raiz = mkdtempSync(join(tmpdir(), "guardian-revisores-"));
  after(() => rmSync(raiz, { recursive: true, force: true }));

  it("niega un Write de un revisor", () => {
    const r = ejecutarGuardian(
      {
        tool_name: "Write",
        tool_input: { file_path: "a.ts", content: "x" },
        agent_type: "revisor-codigo",
      },
      raiz,
    );
    assert.match(r.motivo ?? "", /\[revisores\] el subagente revisor-codigo/);
  });

  it("permite un Read de un revisor", () => {
    const r = ejecutarGuardian(
      { tool_name: "Read", tool_input: { file_path: "a.ts" }, agent_type: "revisor-codigo" },
      raiz,
    );
    assert.equal(r.salida, "");
  });
});

describe("guardián: puerta del PR (spec 004, US3)", () => {
  const raiz = mkdtempSync(join(tmpdir(), "guardian-puerta-"));
  after(() => rmSync(raiz, { recursive: true, force: true }));

  it("niega crear un PR sin decisión de revisión (sin remoto, falla cerrado)", () => {
    const r = ejecutarGuardian(
      {
        tool_name: "mcp__github__create_pull_request",
        tool_input: { owner: "o", repo: "r", head: "6-x", base: "main", title: "t" },
      },
      raiz,
    );
    assert.match(r.motivo ?? "", /\[puerta-pr\] .*origin\/6-x/);
  });

  it("niega escribir a mano la decisión", () => {
    const r = ejecutarGuardian(
      {
        tool_name: "Write",
        tool_input: { file_path: ".git/crediagil/revisiones/x/decision.json", content: "{}" },
      },
      raiz,
    );
    assert.match(r.motivo ?? "", /\[puerta-pr\] Write sobre \.git\/crediagil/);
  });
});
