// Comando `npm run casos [-- --modelo-real] [-- --caso <1 a 7>] [-- --json]`
// (specs/015-casos-prueba-extremo-a-extremo/contracts/comando-casos.md). Ejecuta los casos obligatorios,
// imprime el informe y sale con 0 (éxito), 1 (fallo), 2 (opciones inválidas) o 3 (incompleto). Los logs
// JSON de las conversaciones van a logs/casos-<fecha>.jsonl, no al informe.

import { closeSync, mkdirSync, openSync, writeSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { fijarDestino, registrar } from "../compartido/logs.ts";
import { leerOpciones, USO } from "./arranque.ts";
import { ejecutarCasos } from "./comando.ts";
import { CODIGO_OPCIONES_INVALIDAS, formatearInforme, informeJson } from "./informe.ts";

const CARPETA_CASOS = fileURLToPath(new URL("../../casos/obligatorios/", import.meta.url));
const CARPETA_LOGS = fileURLToPath(new URL("../../logs/", import.meta.url));

const dosDigitos = (n: number) => String(n).padStart(2, "0");
const marcaDeTiempo = (d: Date) =>
  `${d.getFullYear()}${dosDigitos(d.getMonth() + 1)}${dosDigitos(d.getDate())}-` +
  `${dosDigitos(d.getHours())}${dosDigitos(d.getMinutes())}${dosDigitos(d.getSeconds())}`;

async function principal(): Promise<void> {
  const opciones = leerOpciones(process.argv.slice(2));
  if (opciones === null) {
    process.stderr.write(`${USO}\n`);
    process.exitCode = CODIGO_OPCIONES_INVALIDAS;
    return;
  }

  mkdirSync(CARPETA_LOGS, { recursive: true });
  const rutaLog = `${CARPETA_LOGS}casos-${marcaDeTiempo(new Date())}.jsonl`;
  const descriptor = openSync(rutaLog, "a");
  fijarDestino({ write: (texto: string) => writeSync(descriptor, texto) });
  try {
    const informe = await ejecutarCasos(opciones, {
      carpetaCasos: CARPETA_CASOS,
      ejecucion: { stderrCore: descriptor },
    });
    process.stdout.write(`${formatearInforme(informe)}\n`);
    if (opciones.json) process.stdout.write(`${informeJson(informe)}\n`);
    process.exitCode = informe.codigoSalida;
  } finally {
    fijarDestino(null);
    closeSync(descriptor);
  }
}

principal().catch((error: unknown) => {
  const causa = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  registrar("error_casos_principal", { causa }, { nivel: "error" });
  process.stderr.write(`Error inesperado: ${causa}\n`);
  process.exitCode = 1;
});
