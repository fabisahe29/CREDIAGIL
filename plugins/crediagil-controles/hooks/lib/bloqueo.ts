// Bloqueo de un control y mensaje para el modelo.

/** Nombre del control que bloquea; cada control se nombra a sí mismo. */
export type Control = string;

export interface Bloqueo {
  control: Control;
  /** Qué se detectó y dónde. Un dato con forma real va siempre enmascarado. */
  detectado: string;
  regla: string;
  correccion: string;
}

/** Orden de los controles genéricos en el mensaje; quien usa otros controles pasa el suyo. */
export const ORDEN_GENERICO: readonly Control[] = ["secretos", "datos-reales", "revisores"];

const ERROR_INTERNO: Control = "error-interno";

/** Posición en el mensaje: los controles conocidos primero, los demás después y el error al final. */
function rango(control: Control, orden: readonly Control[]): number {
  if (control === ERROR_INTERNO) return Number.MAX_SAFE_INTEGER;
  const posicion = orden.indexOf(control);
  return posicion < 0 ? orden.length : posicion;
}

/** Deja visibles solo los últimos 4 dígitos, para que el dato no llegue al contexto ni a los logs. */
export function enmascarar(valor: string): string {
  const digitos = valor.replace(/\D/g, "");
  return digitos.length < 4 ? "••••" : `••••${digitos.slice(-4)}`;
}

export function componerMensaje(
  bloqueos: readonly Bloqueo[],
  orden: readonly Control[] = ORDEN_GENERICO,
): string {
  const ordenados = [...bloqueos].sort((a, b) => rango(a.control, orden) - rango(b.control, orden));
  const cantidad = ordenados.length === 1 ? "1 motivo" : `${ordenados.length} motivos`;
  const bloques = ordenados.map(
    (b) => `[${b.control}] ${b.detectado}\n  Regla: ${b.regla}\n  Corrección: ${b.correccion}`,
  );
  return [`Acción bloqueada por los controles (${cantidad}).`, ...bloques].join("\n\n");
}
