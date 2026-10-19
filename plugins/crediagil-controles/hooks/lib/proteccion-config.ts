// Control configuracion-protegida: el agente no escribe la configuración de los controles.
// Si pudiera, relajaría por su cuenta el control de datos con forma real.

import type { Accion } from "./accion.ts";
import type { Bloqueo } from "./bloqueo.ts";
import { ARCHIVO_CONFIGURACION } from "./config-equipo.ts";

const HERRAMIENTAS_DE_ESCRITURA: ReadonlySet<string> = new Set([
  "Write",
  "Edit",
  "MultiEdit",
  "NotebookEdit",
]);
const HERRAMIENTAS_SHELL: ReadonlySet<string> = new Set(["Bash", "PowerShell"]);
const NOMBRE = ARCHIVO_CONFIGURACION.split("/").pop() ?? ARCHIVO_CONFIGURACION;
const REGLA =
  "La configuración de los controles la cambia una persona, no el agente: si el agente pudiera editarla, relajaría el control por su cuenta.";
const CORRECCION = `Pide a una persona que edite ${ARCHIVO_CONFIGURACION} fuera de la sesión.`;

function esElArchivo(ruta: string): boolean {
  return ruta === ARCHIVO_CONFIGURACION || ruta.endsWith(`/${ARCHIVO_CONFIGURACION}`);
}

/** Un comando que nombra el archivo, sin importar cómo lo escriba, se trata como escritura. */
function nombraElArchivo(comando: string): boolean {
  return new RegExp(`(?<![\\w.-])${NOMBRE.replaceAll(".", "\\.")}(?![\\w.-])`, "i").test(comando);
}

export function proteccionConfig(accion: Accion): Bloqueo[] {
  const escribeElArchivo =
    HERRAMIENTAS_DE_ESCRITURA.has(accion.herramienta) && accion.rutas.some(esElArchivo);
  const loNombraUnComando =
    HERRAMIENTAS_SHELL.has(accion.herramienta) &&
    accion.comando !== undefined &&
    nombraElArchivo(accion.comando);
  if (!escribeElArchivo && !loNombraUnComando) return [];
  return [
    {
      control: "configuracion-protegida",
      detectado: `${accion.herramienta} intentó escribir ${ARCHIVO_CONFIGURACION}`,
      regla: REGLA,
      correccion: CORRECCION,
    },
  ];
}
