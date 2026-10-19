// Configuración opcional del equipo para el control de datos con forma real.
// Vive en el repositorio del equipo, no en el plugin: una actualización no la toca.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PREFIJO_FICTICIO } from "./convencion-ficticia.ts";

export const ARCHIVO_CONFIGURACION = ".claude/controles-equipo.json";

const CAMPOS_CONOCIDOS: ReadonlySet<string> = new Set(["prefijoFicticio"]);
const FORMA_PREFIJO = /^\d{1,6}$/;
const CORRECCION = `Edita ${ARCHIVO_CONFIGURACION} o bórralo para usar el valor por defecto.`;

export interface ConfiguracionControles {
  /** Los números que empiezan por este prefijo, sin separadores, se tratan como ficticios. */
  prefijoFicticio: string;
  /** Verdadero si no hay archivo de configuración y se aplicó la convención por defecto. */
  porDefecto: boolean;
}

/** El archivo de configuración existe pero no es válido: se bloquea, no se ignora. */
export class ConfiguracionInvalida extends Error {
  override name = "ConfiguracionInvalida";
}

function invalida(detalle: string): ConfiguracionInvalida {
  return new ConfiguracionInvalida(
    `${ARCHIVO_CONFIGURACION} no es válido. ${detalle} ${CORRECCION}`,
  );
}

function esObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === "object" && valor !== null && !Array.isArray(valor);
}

/** Lee la configuración del equipo bajo la raíz. Sin archivo, devuelve la convención por defecto. */
export function leerConfiguracion(raiz: string): ConfiguracionControles {
  const ruta = join(raiz, ARCHIVO_CONFIGURACION);
  if (!existsSync(ruta)) return { prefijoFicticio: PREFIJO_FICTICIO, porDefecto: true };

  let contenido: unknown;
  try {
    contenido = JSON.parse(readFileSync(ruta, "utf8"));
  } catch (causa) {
    const motivo = causa instanceof Error ? causa.message : String(causa);
    throw invalida(`No se pudo leer como JSON: ${motivo}.`);
  }
  if (!esObjeto(contenido)) throw invalida("Debe ser un objeto JSON.");

  for (const campo of Object.keys(contenido)) {
    if (!CAMPOS_CONOCIDOS.has(campo)) throw invalida(`El campo "${campo}" no existe.`);
  }

  const prefijo = contenido["prefijoFicticio"];
  if (prefijo === undefined) return { prefijoFicticio: PREFIJO_FICTICIO, porDefecto: false };
  if (typeof prefijo !== "string" || !FORMA_PREFIJO.test(prefijo)) {
    throw invalida(
      `"prefijoFicticio" debe tener entre 1 y 6 dígitos; se encontró ${JSON.stringify(prefijo)}.`,
    );
  }
  return { prefijoFicticio: prefijo, porDefecto: false };
}
