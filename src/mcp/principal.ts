// Arranque del servidor MCP del core por stdio (contracts/core-mcp.md, "Servidor").
// stdout queda para el protocolo MCP; todo log va a stderr.

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registrar } from "../compartido/logs.ts";
import { crearCore } from "./core-simulado.ts";
import { leerFalla } from "./falla.ts";
import { crearServidor } from "./servidor.ts";

async function principal(): Promise<void> {
  // Un valor inválido de CREDIAGIL_FALLA impide arrancar: no se adivina (FR-010).
  const falla = leerFalla(process.env["CREDIAGIL_FALLA"]);
  const servidor = crearServidor(crearCore({ falla }));
  await servidor.connect(new StdioServerTransport());
  registrar("arranque", { servidor: "crediagil-core", falla: falla ?? "ninguna" });
}

principal().catch((error: unknown) => {
  const causa = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  registrar("error_arranque", { causa }, { nivel: "error" });
  process.exitCode = 1;
});
