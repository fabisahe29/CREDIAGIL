// Portabilidad del plugin: qué no puede aparecer en ningún archivo que viaja.
// Rutas absolutas, credenciales y referencias propias del repositorio donde se desarrolla.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

export interface Hallazgo {
  /** Ruta relativa a la carpeta analizada, con `/`. */
  archivo: string;
  linea: number;
  /** Nombre legible del término prohibido que se encontró. */
  termino: string;
}

interface Termino {
  nombre: string;
  patron: RegExp;
}

// Las expresiones evitan falsos positivos: `(?<![\w.])` impide que `src/` coincida dentro de otra palabra.
export const TERMINOS: readonly Termino[] = [
  { nombre: "ruta absoluta de Windows", patron: /(?<![A-Za-z0-9])[A-Za-z]:[\\/]/ },
  { nombre: "ruta absoluta de Unix", patron: /(?<![\w.])\/(?:Users|home)\// },
  { nombre: "credencial (token de GitHub)", patron: /\bgh[pousr]_[A-Za-z0-9]{20,}/ },
  { nombre: "credencial (token fino de GitHub)", patron: /\bgithub_pat_[A-Za-z0-9_]{20,}/ },
  { nombre: "credencial (clave de Anthropic)", patron: /\bsk-ant-[A-Za-z0-9_-]{10,}/ },
  { nombre: "credencial (clave de AWS)", patron: /\bAKIA[0-9A-Z]{16}\b/ },
  { nombre: "credencial (clave privada)", patron: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { nombre: "specs/", patron: /(?<![\w.])specs\// },
  { nombre: "src/", patron: /(?<![\w.])src\// },
  { nombre: ".specify", patron: /\.specify\b/ },
  { nombre: "constitución", patron: /constituci[oó]n/i },
  { nombre: "CLAUDE.md", patron: /\bCLAUDE\.md\b/ },
  { nombre: "DECISIONES.md", patron: /\bDECISIONES\.md\b/ },
  { nombre: "docs/datos-ficticios", patron: /docs\/datos-ficticios/ },
  { nombre: "número de requisito", patron: /\bFR-\d+/ },
  { nombre: "número de issue", patron: /(?<![\w&])#\d+\b/ },
  {
    nombre: "documento de diseño",
    patron: /\b(?:research|data-model|quickstart)\.md\b|(?<![\w.])contracts\//,
  },
  { nombre: "propietario del repositorio (fabisahe29)", patron: /fabisahe29/i },
];

/** Busca términos prohibidos en un texto. `archivo` es el nombre que se cita en cada hallazgo. */
export function analizarTexto(texto: string, archivo: string): Hallazgo[] {
  const hallazgos: Hallazgo[] = [];
  texto.split(/\r?\n/).forEach((linea, indice) => {
    for (const { nombre, patron } of TERMINOS) {
      if (patron.test(linea)) hallazgos.push({ archivo, linea: indice + 1, termino: nombre });
    }
  });
  return hallazgos;
}

function archivosDe(ruta: string): string[] {
  if (statSync(ruta).isFile()) return [ruta];
  return readdirSync(ruta, { withFileTypes: true }).flatMap((entrada) =>
    entrada.isDirectory() ? archivosDe(join(ruta, entrada.name)) : [join(ruta, entrada.name)],
  );
}

/** Analiza un archivo o una carpeta completa. Los archivos se citan relativos a la carpeta. */
export function analizar(ruta: string): Hallazgo[] {
  const base = statSync(ruta).isFile() ? join(ruta, "..") : ruta;
  return archivosDe(ruta).flatMap((archivo) =>
    analizarTexto(readFileSync(archivo, "utf8"), relative(base, archivo).split("\\").join("/")),
  );
}
