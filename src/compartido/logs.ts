// Logs estructurados (research.md, R6; constitución, Principio VI).
// Una línea JSON por evento, siempre en stderr: en el servidor stdio, stdout es el canal MCP.

export type Nivel = "info" | "warn" | "error";

export interface Destino {
  write(texto: string): unknown;
}

export interface OpcionesRegistro {
  destino?: Destino;
  nivel?: Nivel;
}

export function registrar(
  evento: string,
  campos: Record<string, unknown> = {},
  { destino = process.stderr, nivel = "info" }: OpcionesRegistro = {},
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
