// Logs estructurados (research.md, R6; constitución, Principio VI).
// Una línea JSON por evento, nunca en stdout: en el servidor stdio, stdout es el canal MCP.
// Por defecto va a stderr; el chat la dirige a un archivo con `fijarDestino`.

export type Nivel = "info" | "warn" | "error";

export interface Destino {
  write(texto: string): unknown;
}

export interface OpcionesRegistro {
  destino?: Destino;
  nivel?: Nivel;
}

let destinoFijado: Destino | null = null;

/**
 * Cambia el destino por defecto de `registrar` (el chat lo dirige a un archivo; R6 del #8).
 * `null` vuelve a stderr. Se resuelve en cada llamada, para no capturar `process.stderr` al cargar.
 */
export function fijarDestino(destino: Destino | null): void {
  destinoFijado = destino;
}

export function registrar(
  evento: string,
  campos: Record<string, unknown> = {},
  { destino = destinoFijado ?? process.stderr, nivel = "info" }: OpcionesRegistro = {},
): void {
  const registro = {
    ts: new Date().toISOString(),
    nivel,
    evento,
    correlationId: null,
    ...campos,
  };
  destino.write(`${JSON.stringify(registro)}\n`);
}
