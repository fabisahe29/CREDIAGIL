// Verificación del `.zip` de entrega (specs/017-paquete-de-entrega: contracts/comando-entrega.md).
// Revisa el `.zip` real y el repositorio: nombres prohibidos, `.git`, peso, secretos, historial y
// artefactos de Spec Kit. Un hallazgo bloquea; lo que no se pudo comprobar es «no verificable», nunca
// «ok». Ningún hallazgo incluye el valor de un secreto, solo su tipo y su ubicación.

import { statSync } from "node:fs";
import { git } from "./armar.ts";
import { detectarSecretos, esTexto, nombreProhibido } from "./contenido.ts";
import { verificarSpecs } from "./specs.ts";
import {
  LIMITE_BYTES,
  veredictoDe,
  type Comprobacion,
  type EntradaZip,
  type Hallazgo,
  type InformeEntrega,
} from "./tipos.ts";
import { leerZip } from "./zip.ts";

/** Origen del contexto de git; se inyecta en las pruebas. */
export interface OrigenGit {
  /** Texto de `git log --all -p`. */
  historial(): string;
  /** `true` si `origin/main` es antepasado de `HEAD`, `false` si no, `undefined` si no se puede saber. */
  origenEsAntepasado(): boolean | undefined;
}

export interface OpcionesVerificar {
  zip: string;
  raiz: string;
  git?: OrigenGit;
  /** Hallazgos de los artefactos de Spec Kit; por defecto, `verificarSpecs(raiz)`. */
  specs?: () => Hallazgo[];
}

export function origenGitLocal(raiz: string): OrigenGit {
  return {
    historial: () =>
      git(raiz, ["log", "--all", "-p", "--no-color"], { maxBuffer: 1024 * 1024 * 1024 }),
    origenEsAntepasado: () => {
      try {
        git(raiz, ["rev-parse", "--verify", "--quiet", "refs/remotes/origin/main"]);
      } catch {
        return undefined;
      }
      try {
        git(raiz, ["merge-base", "--is-ancestor", "origin/main", "HEAD"]);
        return true;
      } catch (error) {
        const estado = (error as { cause?: { status?: number } }).cause?.status;
        return estado === 1 ? false : undefined;
      }
    },
  };
}

/** Los archivos de objetos y el índice de `.git` van comprimidos: el historial se revisa con `git log`. */
function seEscanea(entrada: EntradaZip): boolean {
  if (entrada.ruta.startsWith(".git/objects/") || entrada.ruta === ".git/index") return false;
  return esTexto(entrada.contenido);
}

function comprobarNombres(entradas: EntradaZip[]): Hallazgo[] {
  const hallazgos: Hallazgo[] = [];
  for (const { ruta } of entradas) {
    const motivo = nombreProhibido(ruta);
    if (motivo !== undefined)
      hallazgos.push({ tipo: "nombre-prohibido", ubicacion: ruta, detalle: motivo });
  }
  return hallazgos;
}

function comprobarGit(entradas: EntradaZip[]): Hallazgo[] {
  return entradas.some((e) => e.ruta === ".git/HEAD")
    ? []
    : [
        {
          tipo: "falta-git",
          ubicacion: ".git/",
          detalle: "el .zip no incluye el historial (.git/HEAD)",
        },
      ];
}

function comprobarPeso(bytes: number): Hallazgo[] {
  return bytes > LIMITE_BYTES
    ? [
        {
          tipo: "peso",
          ubicacion: "(el .zip)",
          detalle: `pesa ${megas(bytes)} y el máximo es ${megas(LIMITE_BYTES)}`,
        },
      ]
    : [];
}

function comprobarSecretos(entradas: EntradaZip[]): Hallazgo[] {
  const hallazgos: Hallazgo[] = [];
  for (const entrada of entradas.filter(seEscanea)) {
    const vistos = new Set<string>();
    for (const { tipo, linea } of detectarSecretos(
      Buffer.from(entrada.contenido).toString("utf8"),
    )) {
      if (vistos.has(tipo)) continue;
      vistos.add(tipo);
      hallazgos.push({ tipo: "secreto", ubicacion: `${entrada.ruta}:${linea}`, detalle: tipo });
    }
  }
  return hallazgos;
}

/** Aplica los detectores al texto de `git log -p` y reporta el commit y el archivo, nunca el valor. */
export function secretosEnHistorial(texto: string): Hallazgo[] {
  const hallazgos: Hallazgo[] = [];
  const vistos = new Set<string>();
  let commit = "(desconocido)";
  let archivo = "(desconocido)";
  for (const linea of texto.split(/\r?\n/)) {
    const encabezado = /^commit ([0-9a-f]{40})/.exec(linea);
    if (encabezado !== null) {
      commit = encabezado[1]!.slice(0, 7);
      continue;
    }
    const destino = /^\+\+\+ b\/(.+)$/.exec(linea);
    if (destino !== null) {
      archivo = destino[1]!;
      continue;
    }
    if (!/^[+-]/.test(linea)) continue;
    for (const { tipo } of detectarSecretos(linea)) {
      const clave = `${commit}|${archivo}|${tipo}`;
      if (vistos.has(clave)) continue;
      vistos.add(clave);
      hallazgos.push({
        tipo: "historial",
        ubicacion: `commit ${commit}`,
        detalle: `${tipo} en ${archivo}`,
      });
    }
  }
  return hallazgos;
}

export function verificarZip(opciones: OpcionesVerificar): InformeEntrega {
  const entradas = leerZip(opciones.zip);
  const tamanoBytes = statSync(opciones.zip).size;
  const origen = opciones.git ?? origenGitLocal(opciones.raiz);
  const hallazgos: Hallazgo[] = [];
  const comprobaciones: Comprobacion[] = [];

  const registrar = (nombre: string, encontrados: Hallazgo[], nota?: string) => {
    hallazgos.push(...encontrados);
    comprobaciones.push({
      nombre,
      estado: encontrados.length === 0 ? "ok" : "hallazgos",
      ...(nota ? { nota } : {}),
    });
  };

  registrar("nombres", comprobarNombres(entradas));
  registrar("git", comprobarGit(entradas));
  registrar("peso", comprobarPeso(tamanoBytes), `${megas(tamanoBytes)} de ${megas(LIMITE_BYTES)}`);
  registrar("secretos", comprobarSecretos(entradas));

  const enHistorial = secretosEnHistorial(origen.historial());
  const antepasado = origen.origenEsAntepasado();
  const reescrito: Hallazgo[] =
    antepasado === false
      ? [
          {
            tipo: "historial",
            ubicacion: "HEAD",
            detalle: "origin/main no es antepasado de HEAD: el historial publicado no se conserva",
          },
        ]
      : [];
  hallazgos.push(...enHistorial, ...reescrito);
  const hallazgosHistorial = enHistorial.length + reescrito.length;
  comprobaciones.push({
    nombre: "historial",
    estado:
      hallazgosHistorial > 0 ? "hallazgos" : antepasado === undefined ? "no verificable" : "ok",
    ...(antepasado === undefined && hallazgosHistorial === 0 ? { nota: "sin origin/main" } : {}),
  });

  registrar("specs", (opciones.specs ?? (() => verificarSpecs(opciones.raiz)))());

  return {
    zip: opciones.zip,
    tamanoBytes,
    comprobaciones,
    hallazgos,
    veredicto: veredictoDe(comprobaciones, hallazgos),
  };
}

function megas(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
}
