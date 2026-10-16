// Datos ficticios compartidos por las pruebas de la revisión. No es un archivo de prueba:
// así se puede importar sin registrar casos dos veces.

import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rutaPaquete, type Paquete } from "./paquete.ts";

function gitEn(raiz: string, ...argumentos: string[]): void {
  execFileSync("git", argumentos, { cwd: raiz, stdio: ["ignore", "pipe", "ignore"] });
}

/** Repositorio git temporal con main, una spec del issue y una rama de ticket. */
export function crearRepositorio(rama = "6-prueba", issue = 6): string {
  const raiz = mkdtempSync(join(tmpdir(), "paquete-"));
  gitEn(raiz, "init", "-q", "-b", "main");
  gitEn(raiz, "config", "user.email", "prueba@crediagil.example");
  gitEn(raiz, "config", "user.name", "Persona Ficticia");
  gitEn(raiz, "config", "commit.gpgsign", "false");
  mkdirSync(join(raiz, "specs", "004-x"), { recursive: true });
  mkdirSync(join(raiz, ".specify", "memory"), { recursive: true });
  writeFileSync(
    join(raiz, "specs", "004-x", "spec.md"),
    `# Spec\n\n**Issue de origen**: [fabisahe29/CREDIAGIL#${issue} — Título](https://github.com/fabisahe29/CREDIAGIL/issues/${issue})\n`,
  );
  writeFileSync(join(raiz, ".specify", "memory", "constitution.md"), "# Constitución\n");
  writeFileSync(join(raiz, "viejo.ts"), "export const a = 1;\n");
  writeFileSync(join(raiz, "borrar.ts"), "export const b = 2;\n");
  gitEn(raiz, "add", ".");
  gitEn(raiz, "commit", "-q", "-m", "base");
  gitEn(raiz, "switch", "-q", "-c", rama);
  return raiz;
}

/** Commit en la rama con un archivo agregado, uno modificado y uno eliminado. */
export function commitEnRama(raiz: string): void {
  writeFileSync(join(raiz, "nuevo.ts"), "export const c = 3;\n");
  writeFileSync(join(raiz, "viejo.ts"), "export const a = 10;\n");
  gitEn(raiz, "rm", "-q", "borrar.ts");
  gitEn(raiz, "add", ".");
  gitEn(raiz, "commit", "-q", "-m", "cambios");
}

export const SHA = "a".repeat(40);

export const PAQUETE: Paquete = {
  issue: 6,
  rama: "6-prueba",
  sha: SHA,
  base: "b".repeat(40),
  archivos: [
    { ruta: ".claude/revision/lib/decision.ts", estado: "agregado" },
    { ruta: "src/politica/umbrales.ts", estado: "modificado" },
  ],
  spec: "specs/004-x/spec.md",
  constitucion: ".specify/memory/constitution.md",
};

export function hallazgo(cambios: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    severidad: "alta",
    archivo: ".claude/revision/lib/decision.ts",
    linea: 42,
    descripcion: "Qué está mal y por qué.",
    sugerencia: "Cómo corregirlo.",
    preexistente: false,
    ...cambios,
  };
}

export function informeCodigo(cambios: Record<string, unknown> = {}): Record<string, unknown> {
  return { tipo: "codigo", sha: SHA, resumen: "Una frase.", hallazgos: [hallazgo()], ...cambios };
}

export function regla(
  numero: number,
  estado = "no_aplicable",
  cambios: Record<string, unknown> = {},
): Record<string, unknown> {
  const base: Record<string, unknown> = { regla: numero, estado };
  if (estado === "no_aplicable") base["motivo"] = "El diff no toca esta regla.";
  else {
    base["evidencia"] = [
      { archivo: "src/politica/umbrales.ts", linea: 3, cita: "TOPE = 5_000_000" },
    ];
    base["contrastado_con"] = [`Principio I, regla ${numero}`];
  }
  return { ...base, ...cambios };
}

export function informeCumplimiento(
  cambios: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    tipo: "cumplimiento",
    sha: SHA,
    resumen: "Una frase.",
    reglas: [regla(1), regla(2, "cumplida"), regla(3), regla(4), regla(5)],
    restricciones: [],
    ...cambios,
  };
}

/** Mensaje final de un revisor: texto libre y un único bloque json. */
export function mensajeRevisor(informe: unknown): string {
  return `Revisión terminada.\n\n\`\`\`json\n${JSON.stringify(informe, null, 2)}\n\`\`\`\n`;
}

/** Escribe un paquete.json ficticio en la raíz indicada. */
export function escribirPaquete(raiz: string, paquete: Paquete = PAQUETE): string {
  const carpeta = rutaPaquete(raiz, paquete.sha);
  mkdirSync(carpeta, { recursive: true });
  writeFileSync(join(carpeta, "paquete.json"), JSON.stringify(paquete));
  writeFileSync(join(carpeta, "diff.patch"), "diff --git a/x b/x\n");
  return carpeta;
}
