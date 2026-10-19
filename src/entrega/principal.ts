// Comandos `npm run entrega:armar [-- --salida <ruta>]` y
// `npm run entrega:verificar [-- --zip <ruta>] [-- --json]`
// (specs/017-paquete-de-entrega/contracts/comando-entrega.md).
// Códigos de salida: 0 listo · 1 bloqueado (o el armado se negó) · 2 opciones inválidas o .zip ilegible ·
// 3 incompleto (sin hallazgos, pero algo no se pudo verificar: no es éxito).

import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { armar, ZIP_POR_DEFECTO } from "./armar.ts";
import { ErrorEntrega, type InformeEntrega, type Veredicto } from "./tipos.ts";
import { verificarZip, type OpcionesVerificar } from "./verificar.ts";

export const USO = [
  "Uso:",
  "  npm run entrega:armar [-- --salida <ruta>]",
  "  npm run entrega:verificar [-- --zip <ruta>] [-- --json]",
].join("\n");

export const CODIGO_LISTO = 0;
export const CODIGO_BLOQUEADO = 1;
export const CODIGO_OPCIONES_INVALIDAS = 2;
export const CODIGO_INCOMPLETO = 3;

const CODIGO_POR_VEREDICTO: Readonly<Record<Veredicto, number>> = {
  listo: CODIGO_LISTO,
  bloqueado: CODIGO_BLOQUEADO,
  incompleto: CODIGO_INCOMPLETO,
};

export interface Salida {
  codigo: number;
  stdout: string;
  stderr: string;
}

export interface Dependencias {
  armar: typeof armar;
  verificarZip: (opciones: OpcionesVerificar) => InformeEntrega;
}

const DEPENDENCIAS: Dependencias = { armar, verificarZip };

/** Valor de una opción `--nombre <valor>`, o `undefined` si falta; `null` si está sin valor. */
function valorDe(argumentos: string[], nombre: string): string | undefined | null {
  const indice = argumentos.indexOf(nombre);
  if (indice === -1) return undefined;
  const valor = argumentos[indice + 1];
  return valor === undefined || valor.startsWith("--") ? null : valor;
}

function opcionesInvalidas(motivo: string): Salida {
  return { codigo: CODIGO_OPCIONES_INVALIDAS, stdout: "", stderr: `${motivo}\n${USO}\n` };
}

const TEXTO_ESTADO = {
  ok: "ok",
  hallazgos: "hallazgos",
  "no verificable": "no verificable",
} as const;

/** Una línea por comprobación y, debajo, cada hallazgo con su tipo y ubicación. Nunca muestra un valor. */
export function formatearInforme(informe: InformeEntrega): string {
  const lineas: string[] = [];
  for (const comprobacion of informe.comprobaciones) {
    const cantidad = informe.hallazgos.filter((h) =>
      perteneceA(comprobacion.nombre, h.tipo),
    ).length;
    const resto =
      comprobacion.estado === "hallazgos"
        ? String(cantidad)
        : comprobacion.nota
          ? `(${comprobacion.nota})`
          : "";
    lineas.push(
      `${comprobacion.nombre.padEnd(12)}${TEXTO_ESTADO[comprobacion.estado].padEnd(16)}${resto}`.trimEnd(),
    );
  }
  lineas.push(`Veredicto: ${informe.veredicto}`);
  for (const h of informe.hallazgos) lineas.push(`  ${h.tipo} · ${h.ubicacion} · ${h.detalle}`);
  return `${lineas.join("\n")}\n`;
}

const COMPROBACION_DE_TIPO = {
  "nombre-prohibido": "nombres",
  "falta-git": "git",
  peso: "peso",
  secreto: "secretos",
  historial: "historial",
  "spec-incompleta": "specs",
} as const;

function perteneceA(comprobacion: string, tipo: keyof typeof COMPROBACION_DE_TIPO): boolean {
  return COMPROBACION_DE_TIPO[tipo] === comprobacion;
}

export function ejecutar(
  argumentos: string[],
  raiz: string,
  dependencias: Dependencias = DEPENDENCIAS,
): Salida {
  const [orden, ...resto] = argumentos;

  if (orden === "armar") {
    const salida = valorDe(resto, "--salida");
    if (salida === null) return opcionesInvalidas("falta el valor de --salida");
    try {
      const resultado = dependencias.armar(raiz, salida ?? ZIP_POR_DEFECTO);
      return {
        codigo: CODIGO_LISTO,
        stdout: `Armado: ${resultado.salida} (${resultado.archivos} archivos). Ahora: npm run entrega:verificar\n`,
        stderr: "",
      };
    } catch (error) {
      return { codigo: CODIGO_BLOQUEADO, stdout: "", stderr: `${mensajeDe(error)}\n` };
    }
  }

  if (orden === "verificar") {
    const zip = valorDe(resto, "--zip");
    if (zip === null) return opcionesInvalidas("falta el valor de --zip");
    const desconocidas = resto.filter(
      (a, i) => a.startsWith("--") && !["--zip", "--json"].includes(a) && resto[i - 1] !== "--zip",
    );
    if (desconocidas.length > 0) return opcionesInvalidas(`opción desconocida: ${desconocidas[0]}`);
    try {
      const informe = dependencias.verificarZip({
        zip: resolve(raiz, zip ?? ZIP_POR_DEFECTO),
        raiz,
      });
      const json = resto.includes("--json") ? `${JSON.stringify(informe, null, 2)}\n` : "";
      return {
        codigo: CODIGO_POR_VEREDICTO[informe.veredicto],
        stdout: formatearInforme(informe) + json,
        stderr: "",
      };
    } catch (error) {
      const codigo =
        error instanceof ErrorEntrega && error.tipo === "git"
          ? CODIGO_INCOMPLETO
          : CODIGO_OPCIONES_INVALIDAS;
      return { codigo, stdout: "", stderr: `${mensajeDe(error)}\n` };
    }
  }

  return opcionesInvalidas(
    orden === undefined ? "falta la orden (armar o verificar)" : `orden desconocida: ${orden}`,
  );
}

function mensajeDe(error: unknown): string {
  if (error instanceof ErrorEntrega) {
    const causa =
      error.cause instanceof Error ? ` (causa: ${error.cause.message.split("\n")[0]})` : "";
    return `${error.tipo}: ${error.message}${causa}`;
  }
  return error instanceof Error ? error.message : String(error);
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const raiz = fileURLToPath(new URL("../../", import.meta.url));
  const salida = ejecutar(process.argv.slice(2), raiz);
  process.stdout.write(salida.stdout);
  process.stderr.write(salida.stderr);
  process.exitCode = salida.codigo;
}
