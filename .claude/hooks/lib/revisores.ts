// Control revisores (contracts/revisores.md, "Controles nuevos del guardián"; FR-003; research.md, R2).
// Tercera capa de la solo lectura: aunque un revisor quedara mal configurado, solo puede leer.

import type { Accion } from "./accion.ts";
import type { Bloqueo } from "./bloqueo.ts";

export const AGENTES_REVISORES: ReadonlySet<string> = new Set([
  "revisor-codigo",
  "revisor-cumplimiento",
]);
const HERRAMIENTAS_DE_LECTURA: ReadonlySet<string> = new Set(["Read", "Grep", "Glob"]);

export function revisores(accion: Accion): Bloqueo[] {
  if (accion.agente === undefined || !AGENTES_REVISORES.has(accion.agente)) return [];
  if (HERRAMIENTAS_DE_LECTURA.has(accion.herramienta)) return [];
  return [
    {
      control: "revisores",
      detectado: `el subagente ${accion.agente} intentó usar ${accion.herramienta}; un revisor solo puede usar Read, Grep y Glob`,
      regla: "FR-003 (spec 004) · constitución, Principio IV",
      correccion:
        "El revisor solo informa: deja el hallazgo en el informe JSON; la corrección la hace la sesión de desarrollo.",
    },
  ];
}
