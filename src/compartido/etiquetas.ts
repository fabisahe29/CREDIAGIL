// Etiquetas que delimitan el prompt del agente (specs/006-interfaz-chat/contracts/eventos.md).
// El texto que no controla el código (lo que escribe el solicitante, el contenido de un documento o
// la respuesta del modelo) no puede abrirlas ni cerrarlas: se neutralizan en cualquier variante.

/** Estructura de la conversación: la compone `componerPrompt` en el agente. */
export const ETIQUETAS_CONVERSACION = ["historial", "turno", "mensaje_nuevo"] as const;
/** Documentos adjuntos: los compone el chat. */
export const ETIQUETAS_DOCUMENTO = ["documento", "documento_no_soportado"] as const;
export const ETIQUETAS_RESERVADAS = [...ETIQUETAS_CONVERSACION, ...ETIQUETAS_DOCUMENTO] as const;

/**
 * Reemplaza el `<` de cada etiqueta indicada, de apertura o de cierre, sin distinguir mayúsculas y
 * con espacios opcionales (`</DOCUMENTO >`, `< turno`), por `&lt;`. El resto del texto no cambia.
 */
export function neutralizarEtiquetas(
  texto: string,
  nombres: readonly string[] = ETIQUETAS_RESERVADAS,
): string {
  const alternativas = [...nombres].sort((a, b) => b.length - a.length).join("|");
  const patron = new RegExp(`<(\\s*\\/?\\s*)(${alternativas})(?![\\w-])`, "gi");
  return texto.replace(patron, "&lt;$1$2");
}
