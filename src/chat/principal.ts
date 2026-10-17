// Arranque del chat de terminal: npm run chat [-- --demo] [-- --caso <ruta>]
// (specs/006-interfaz-chat/contracts/chat-cli.md, "Arranque"). Comprueba la clave, dirige los logs
// a logs/chat-<fecha>.jsonl (R6), arranca el core una sola vez y conecta readline con el chat.

import { closeSync, mkdirSync, openSync, writeSync } from "node:fs";
import { relative } from "node:path";
import { clearLine, createInterface, cursorTo, moveCursor } from "node:readline";
import { fileURLToPath } from "node:url";
import { conversar } from "../agente/agente.ts";
import { crearClienteCore } from "../agente/cliente-core.ts";
import { fijarDestino, registrar } from "../compartido/logs.ts";
import { arrancarCore, leerOpciones, USO, verificarConfiguracion } from "./arranque.ts";
import { iniciarChat, type Terminal } from "./chat.ts";

const CARPETA_LOGS = fileURLToPath(new URL("../../logs/", import.meta.url));

const dosDigitos = (n: number) => String(n).padStart(2, "0");
const marcaDeTiempo = (d: Date) =>
  `${d.getFullYear()}${dosDigitos(d.getMonth() + 1)}${dosDigitos(d.getDate())}-` +
  `${dosDigitos(d.getHours())}${dosDigitos(d.getMinutes())}${dosDigitos(d.getSeconds())}`;

async function principal(): Promise<void> {
  const opciones = leerOpciones(process.argv.slice(2));
  if (opciones === null) {
    process.stderr.write(`${USO}\n`);
    process.exitCode = 2;
    return;
  }
  const faltante = verificarConfiguracion(process.env);
  if (faltante !== null) {
    process.stderr.write(`${faltante}\n`);
    process.exitCode = 1;
    return;
  }

  mkdirSync(CARPETA_LOGS, { recursive: true });
  const rutaLog = `${CARPETA_LOGS}chat-${marcaDeTiempo(new Date())}.jsonl`;
  const descriptor = openSync(rutaLog, "a");
  fijarDestino({ write: (texto: string) => writeSync(descriptor, texto) });
  // Idempotente: primero se deja de escribir en el archivo y después se cierra una sola vez.
  let logsCerrados = false;
  const cerrarLogs = () => {
    if (logsCerrados) return;
    logsCerrados = true;
    fijarDestino(null);
    closeSync(descriptor);
  };

  const arranque = await arrancarCore(() => crearClienteCore({ stderr: descriptor }));
  if (!arranque.ok) {
    cerrarLogs();
    process.stderr.write(`No pude arrancar el core de originación: ${arranque.causa}\n`);
    process.exitCode = 1;
    return;
  }
  const { core } = arranque;

  const salida = process.stdout;
  const esTerminal = Boolean(process.stdin.isTTY && salida.isTTY);
  const rl = createInterface({ input: process.stdin, output: salida, terminal: esTerminal });

  const terminal: Terminal = {
    escribir(texto) {
      if (esTerminal) {
        clearLine(salida, 0);
        cursorTo(salida, 0);
      }
      salida.write(`${texto}\n`);
    },
    pedir(modo) {
      if (!esTerminal) return;
      rl.setPrompt(modo === "bloque" ? "… " : "› ");
      rl.prompt();
    },
    alRecibirLinea(manejador) {
      rl.on("line", (linea) => {
        // El chat vuelve a mostrar la entrada con su etiqueta («Tú: …»): se borra el eco de readline.
        if (esTerminal) {
          moveCursor(salida, 0, -1);
          clearLine(salida, 0);
        }
        manejador(linea);
      });
    },
    alCerrar(manejador) {
      rl.on("close", manejador);
    },
  };

  // Ctrl+C sale de inmediato, aunque haya un turno en curso; la conversación no se guarda.
  // Los Ctrl+C siguientes se ignoran mientras se cierra; se sale aunque el cierre falle.
  let saliendo = false;
  rl.on("SIGINT", () => {
    if (saliendo) return;
    saliendo = true;
    salida.write("\nSaliendo…\n");
    void core
      .cerrar()
      .catch(() => {})
      .finally(() => {
        cerrarLogs();
        process.exit(0);
      });
  });

  await iniciarChat({
    terminal,
    conversar,
    core,
    rutaLog: relative(process.cwd(), rutaLog),
    demo: opciones.demo,
    color: salida.hasColors?.() ?? false,
    directorioBase: process.cwd(),
    ...(opciones.caso !== undefined ? { casoInicial: opciones.caso } : {}),
  });
  rl.close();
  cerrarLogs();
}

principal().catch((error: unknown) => {
  const causa = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  registrar("error_chat_principal", { causa }, { nivel: "error" });
  process.stderr.write(`Error inesperado: ${causa}\n`);
  process.exitCode = 1;
});
