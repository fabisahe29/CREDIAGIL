// Armado del `.zip` de entrega (specs/017-paquete-de-entrega: research.md, R2 y R3).
// La lista de archivos es la de `git ls-files` más todo `.git/`, con el árbol limpio. Así el `.zip` deja
// fuera, sin repetir reglas, lo que `.gitignore` ya excluye (dependencias, `.env`, archivos locales).
// Solo lee `git`: nunca cambia el historial. No filtra nada de lo versionado: si hubiera un archivo
// prohibido versionado, el `.zip` lo contiene y `entrega:verificar` lo reporta, en vez de ocultarlo.

import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { ErrorEntrega } from "./tipos.ts";
import { escribirZip, type EntradaParaEscribir } from "./zip.ts";

export const ZIP_POR_DEFECTO = "dist/crediagil-entrega.zip";

/** Ejecuta `git` en `raiz` y devuelve su salida. Un fallo se propaga con tipo y causa. */
export function git(
  raiz: string,
  argumentos: string[],
  opciones: { maxBuffer?: number } = {},
): string {
  try {
    return execFileSync("git", argumentos, {
      cwd: raiz,
      encoding: "utf8",
      maxBuffer: opciones.maxBuffer ?? 64 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    throw new ErrorEntrega("git", `falló «git ${argumentos.join(" ")}»`, { cause: error });
  }
}

/** Rutas de todos los archivos bajo `carpeta` (relativa a `raiz`), con `/`. */
function archivosBajo(raiz: string, carpeta: string): string[] {
  const rutas: string[] = [];
  for (const entrada of readdirSync(join(raiz, carpeta), { withFileTypes: true })) {
    const ruta = `${carpeta}/${entrada.name}`;
    if (entrada.isDirectory()) rutas.push(...archivosBajo(raiz, ruta));
    else if (entrada.isFile()) rutas.push(ruta);
  }
  return rutas;
}

/** Archivos versionados más todo `.git/`. Se niega si hay cambios sin commit. */
export function listaDeArchivos(raiz: string): string[] {
  if (git(raiz, ["status", "--porcelain"]).trim() !== "") {
    throw new ErrorEntrega(
      "arbol-sucio",
      "hay cambios sin commit: el .zip debe armarse desde un árbol limpio, para que coincida con lo entregado",
    );
  }
  const versionados = git(raiz, ["ls-files", "-z"]).split("\0").filter(Boolean);
  return [...versionados, ...archivosBajo(raiz, ".git")];
}

export interface ResultadoArmado {
  salida: string;
  archivos: number;
}

export function armar(raiz: string, salida: string = ZIP_POR_DEFECTO): ResultadoArmado {
  const destino = resolve(raiz, salida);
  const entradas: EntradaParaEscribir[] = listaDeArchivos(raiz).map((ruta) => ({
    ruta,
    contenido: readFileSync(join(raiz, ruta)),
  }));
  mkdirSync(dirname(destino), { recursive: true });
  escribirZip(destino, entradas);
  return { salida: destino, archivos: entradas.length };
}
