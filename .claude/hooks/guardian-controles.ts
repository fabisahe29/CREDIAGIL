// Guardián PreToolUse del plugin: solo los controles genéricos, sin nada propio de un flujo.
// Bloquea secretos y datos con forma real, y mantiene a los revisores en solo lectura.

import { fileURLToPath } from "node:url";
import { ejecutar, type ContextoBase, type ControlGuardian } from "./guardian-base.ts";
import { ORDEN_GENERICO } from "./lib/bloqueo.ts";
import { datosReales } from "./lib/datos-reales.ts";
import { proteccionConfig } from "./lib/proteccion-config.ts";
import { revisores } from "./lib/revisores.ts";
import { secretos } from "./lib/secretos.ts";

export const CONTROLES: ControlGuardian<ContextoBase>[] = [
  secretos,
  datosReales,
  proteccionConfig,
  revisores,
];

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await ejecutar(CONTROLES, (raiz) => ({ raiz }), ORDEN_GENERICO);
}
