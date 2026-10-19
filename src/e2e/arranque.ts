// Lógica de arranque del comando `npm run casos`, sin efectos, para probarla aparte de principal.ts
// (specs/015-casos-prueba-extremo-a-extremo/contracts/comando-casos.md, "Uso").

import type { ModoEjecucion } from "./veredicto.ts";

export const USO = "Uso: npm run casos [-- --modelo-real] [-- --caso <1 a 7>] [-- --json]";

export const NUMEROS_DE_CASO = [1, 2, 3, 4, 5, 6, 7] as const;

export interface OpcionesComando {
  modo: ModoEjecucion;
  /** Un solo caso; ausente: los siete. */
  caso?: number;
  json: boolean;
}

/** Interpreta los argumentos; `null` si alguno no es válido (se muestra el uso y se sale con 2). */
export function leerOpciones(argumentos: readonly string[]): OpcionesComando | null {
  const opciones: OpcionesComando = { modo: "guionado", json: false };
  for (let i = 0; i < argumentos.length; i++) {
    const argumento = argumentos[i];
    if (argumento === "--modelo-real") {
      opciones.modo = "modelo_real";
      continue;
    }
    if (argumento === "--json") {
      opciones.json = true;
      continue;
    }
    const valor = argumentos[i + 1];
    if (argumento === "--caso" && valor !== undefined && /^[1-7]$/.test(valor)) {
      opciones.caso = Number(valor);
      i++;
      continue;
    }
    return null;
  }
  return opciones;
}
