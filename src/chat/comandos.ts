// Interpretación de una línea del chat (specs/006-interfaz-chat: data-model.md, "Entrada";
// contracts/chat-cli.md, "Comandos"). Una línea que empieza por "/" nunca va al agente.

export type NombreComando = "ayuda" | "adjuntar" | "pegar" | "caso" | "nueva" | "salir";

export type Entrada =
  | { tipo: "mensaje"; texto: string }
  | { tipo: "vacia" }
  | { tipo: "comando"; nombre: NombreComando; argumento?: string }
  | { tipo: "comando_desconocido"; texto: string };

const SIN_ARGUMENTO: readonly NombreComando[] = ["ayuda", "pegar", "nueva", "salir"];
const CON_ARGUMENTO: readonly NombreComando[] = ["adjuntar", "caso"];

export const TEXTO_AYUDA = [
  "Comandos:",
  "  /ayuda             muestra esta ayuda",
  "  /adjuntar <ruta>   envía un documento .txt o .md al agente; queda numerado como adjunto",
  "  /pegar             abre un bloque de varias líneas; ciérralo con una línea /fin (queda como adjunto «texto pegado»)",
  "  /caso <ruta>       reproduce un caso de prueba (carpeta con caso.json)",
  "  /nueva             empieza una conversación nueva",
  "  /salir             termina",
  "Para enviar texto de varias líneas usa /pegar: si pegas varias líneas como un mensaje, solo se envía la primera.",
].join("\n");

export function interpretarLinea(linea: string): Entrada {
  const texto = linea.trim();
  if (texto === "") return { tipo: "vacia" };
  if (!texto.startsWith("/")) return { tipo: "mensaje", texto };

  const espacio = texto.search(/\s/);
  const nombre = espacio === -1 ? texto.slice(1) : texto.slice(1, espacio);
  const argumento = espacio === -1 ? "" : texto.slice(espacio).trim();

  if ((SIN_ARGUMENTO as readonly string[]).includes(nombre) && argumento === "") {
    return { tipo: "comando", nombre: nombre as NombreComando };
  }
  if ((CON_ARGUMENTO as readonly string[]).includes(nombre) && argumento !== "") {
    return { tipo: "comando", nombre: nombre as NombreComando, argumento };
  }
  return { tipo: "comando_desconocido", texto };
}
