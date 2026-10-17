// Demo del agente con el modelo real (quickstart.md, Escenarios 3 y 4).
// Uso: node src/agente/demo.ts "<mensaje>"
// La respuesta va a stdout; tipo, turnos y correlationId a stderr, junto con los logs JSON.

import { registrar } from "../compartido/logs.ts";
import { conversar } from "./agente.ts";

async function principal(): Promise<void> {
  const mensaje = process.argv.slice(2).join(" ").trim();
  if (mensaje === "") {
    process.stderr.write('Uso: node src/agente/demo.ts "<mensaje>"\n');
    process.exitCode = 1;
    return;
  }
  if (!process.env["ANTHROPIC_API_KEY"]) {
    process.stderr.write(
      "Falta ANTHROPIC_API_KEY en el entorno de la sesión (ver .env.example). La demo usa el modelo real.\n",
    );
    process.exitCode = 1;
    return;
  }
  const resultado = await conversar(mensaje);
  process.stdout.write(`${resultado.respuesta}\n`);
  process.stderr.write(
    `tipo=${resultado.tipo} turnos=${resultado.turnos} correlationId=${resultado.correlationId}\n`,
  );
}

principal().catch((error: unknown) => {
  const causa = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  registrar("error_demo", { causa }, { nivel: "error" });
  process.exitCode = 1;
});
