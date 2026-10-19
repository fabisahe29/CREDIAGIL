// Control revisores: un subagente revisor solo puede leer.
// Es una capa más de la solo lectura: aunque un revisor quedara mal configurado, solo lee.

import type { Accion } from "./accion.ts";
import type { Bloqueo } from "./bloqueo.ts";

/** Un revisor es todo subagente cuyo nombre empieza por `revisor-`, con o sin prefijo de plugin. */
const NOMBRE_REVISOR = /^(?:[^:]+:)?revisor-/;
const HERRAMIENTAS_DE_LECTURA: ReadonlySet<string> = new Set(["Read", "Grep", "Glob"]);

export function revisores(accion: Accion): Bloqueo[] {
  if (accion.agente === undefined || !NOMBRE_REVISOR.test(accion.agente)) return [];
  if (HERRAMIENTAS_DE_LECTURA.has(accion.herramienta)) return [];
  return [
    {
      control: "revisores",
      detectado: `el subagente ${accion.agente} intentó usar ${accion.herramienta}; un revisor solo puede usar Read, Grep y Glob`,
      regla: "Un revisor solo informa: no tiene herramientas para modificar nada.",
      correccion:
        "El revisor solo informa: deja el hallazgo en el informe JSON; la corrección la hace la sesión de desarrollo.",
    },
  ];
}
