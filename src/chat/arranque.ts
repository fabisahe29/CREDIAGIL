// Lógica de arranque del chat, sin efectos, para probarla aparte de principal.ts
// (specs/006-interfaz-chat/contracts/chat-cli.md, "Arranque" y "Códigos de salida").

import type { ClienteCore } from "../agente/cliente-core.ts";
import { registrar } from "../compartido/logs.ts";

export const USO = "Uso: npm run chat [-- --demo] [-- --caso <ruta>]";

export const FALTA_CLAVE =
  "Falta ANTHROPIC_API_KEY en el entorno de la sesión. Defínela antes de iniciar (ver .env.example).";

export interface OpcionesArranque {
  demo: boolean;
  caso?: string;
}

/** Interpreta los argumentos; `null` si alguno no es válido (se muestra el uso y se sale con 2). */
export function leerOpciones(argumentos: readonly string[]): OpcionesArranque | null {
  const opciones: OpcionesArranque = { demo: false };
  for (let i = 0; i < argumentos.length; i++) {
    const argumento = argumentos[i];
    if (argumento === "--demo") {
      opciones.demo = true;
      continue;
    }
    const ruta = argumentos[i + 1];
    if (argumento === "--caso" && ruta !== undefined && !ruta.startsWith("--")) {
      opciones.caso = ruta;
      i++;
      continue;
    }
    return null;
  }
  return opciones;
}

/** El mensaje de error si falta la configuración obligatoria; nunca incluye valores (FR-017). */
export const verificarConfiguracion = (entorno: Record<string, string | undefined>) =>
  entorno["ANTHROPIC_API_KEY"] ? null : FALTA_CLAVE;

/** Arranca el core; si falla, lo registra y devuelve la causa en lugar de lanzar. */
export async function arrancarCore(
  crear: () => Promise<ClienteCore>,
): Promise<{ ok: true; core: ClienteCore } | { ok: false; causa: string }> {
  try {
    return { ok: true, core: await crear() };
  } catch (error) {
    const causa = error instanceof Error ? error.message : String(error);
    registrar("error_arranque", { causa }, { nivel: "error" });
    return { ok: false, causa };
  }
}
