// Formateador PostToolUse (FR-011, FR-012; research.md, R10; contracts/hooks.md).
// Formatea con Prettier el archivo de código editado. Si no puede, conserva la edición
// y avisa al modelo con código 2 (la herramienta ya se ejecutó: no se deshace nada).

import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { extname, isAbsolute, join, relative } from "node:path";
import { pathToFileURL } from "node:url";

const EXTENSIONES = new Set([".ts", ".tsx", ".js", ".mjs", ".cjs", ".json"]);

interface Prettier {
  getFileInfo(ruta: string, opciones: { ignorePath: string }): Promise<{ ignored: boolean }>;
  resolveConfig(ruta: string): Promise<Record<string, unknown> | null>;
  format(texto: string, opciones: Record<string, unknown>): Promise<string>;
}

function omitir(mensaje: string): never {
  process.stderr.write(`${mensaje}\n`);
  process.exit(2);
}

async function cargarPrettier(): Promise<Prettier> {
  // Se resuelve desde el propio hook: el node_modules del repositorio.
  const ruta = createRequire(import.meta.url).resolve("prettier");
  const modulo = (await import(pathToFileURL(ruta).href)) as { default?: Prettier } & Prettier;
  return modulo.default ?? modulo;
}

async function leerStdin(): Promise<string> {
  let texto = "";
  process.stdin.setEncoding("utf8");
  for await (const fragmento of process.stdin) texto += String(fragmento);
  // PowerShell antepone un BOM al pasar texto por tubería.
  return texto.replace(/^﻿/, "");
}

async function principal(): Promise<void> {
  const entrada: unknown = JSON.parse(await leerStdin());
  const datos =
    typeof entrada === "object" && entrada !== null && "tool_input" in entrada
      ? entrada.tool_input
      : undefined;
  const archivo =
    typeof datos === "object" &&
    datos !== null &&
    "file_path" in datos &&
    typeof datos.file_path === "string"
      ? datos.file_path
      : undefined;
  if (archivo === undefined || !EXTENSIONES.has(extname(archivo).toLowerCase())) return;

  const raiz = process.env["CLAUDE_PROJECT_DIR"] ?? process.cwd();
  const absoluto = isAbsolute(archivo) ? archivo : join(raiz, archivo);
  const mostrado = relative(raiz, absoluto).replace(/\\/g, "/");

  let prettier: Prettier;
  try {
    prettier = await cargarPrettier();
  } catch {
    omitir("Formato omitido: falta Prettier. Ejecuta npm install.");
  }

  try {
    const { ignored } = await prettier.getFileInfo(absoluto, {
      ignorePath: join(raiz, ".prettierignore"),
    });
    if (ignored) return;
    const original = readFileSync(absoluto, "utf8");
    const configuracion = (await prettier.resolveConfig(absoluto)) ?? {};
    const formateado = await prettier.format(original, { ...configuracion, filepath: absoluto });
    if (formateado !== original) writeFileSync(absoluto, formateado);
  } catch (error) {
    const detalle = error instanceof Error ? error.message.split("\n")[0] : String(error);
    omitir(`Formato omitido en ${mostrado}: ${detalle}`);
  }
}

await principal();
