// Bloqueo de un control y mensaje para el modelo (contracts/hooks.md, "Mensaje de bloqueo"; FR-014).

export type Control =
  "secretos" | "datos-reales" | "spec-primero" | "revisores" | "puerta-pr" | "error-interno";

export interface Bloqueo {
  control: Control;
  /** Qué se detectó y dónde. Un dato con forma real va siempre enmascarado. */
  detectado: string;
  regla: string;
  correccion: string;
}

const ORDEN: readonly Control[] = [
  "secretos",
  "datos-reales",
  "spec-primero",
  "revisores",
  "puerta-pr",
  "error-interno",
];

/** Deja visibles solo los últimos 4 dígitos, para que el dato no llegue al contexto ni a los logs. */
export function enmascarar(valor: string): string {
  const digitos = valor.replace(/\D/g, "");
  return digitos.length < 4 ? "••••" : `••••${digitos.slice(-4)}`;
}

export function componerMensaje(bloqueos: readonly Bloqueo[]): string {
  const ordenados = [...bloqueos].sort(
    (a, b) => ORDEN.indexOf(a.control) - ORDEN.indexOf(b.control),
  );
  const cantidad = ordenados.length === 1 ? "1 motivo" : `${ordenados.length} motivos`;
  const bloques = ordenados.map(
    (b) => `[${b.control}] ${b.detectado}\n  Regla: ${b.regla}\n  Corrección: ${b.correccion}`,
  );
  return [`Acción bloqueada por los guardarraíles de Crediágil (${cantidad}).`, ...bloques].join(
    "\n\n",
  );
}
