// Documentos adjuntos al chat (specs/006-interfaz-chat: research.md, R7; data-model.md, "Documento").
// Solo .txt y .md, hasta 256 KiB, en UTF-8 válido y sin bytes nulos. Lo demás no se lee: llega al
// agente como metadatos para que escale (regla 5). El contenido nunca va a los logs (FR-015).

import { readFile, stat } from "node:fs/promises";
import { basename, extname, resolve } from "node:path";
import { neutralizarEtiquetas } from "../compartido/etiquetas.ts";
import { NOMBRE_TEXTO_PEGADO } from "../compartido/extraccion.ts";

export const TAMANO_MAXIMO_BYTES = 256 * 1024;
const EXTENSIONES_SOPORTADAS = new Set([".txt", ".md"]);

export type MotivoNoSoportado = "formato" | "tamano" | "codificacion";

export type DocumentoLeido =
  | { tipo: "soportado"; nombre: string; contenido: string; bytes: number }
  | {
      tipo: "no_soportado";
      nombre: string;
      tipoArchivo: string;
      motivo: MotivoNoSoportado;
      bytes: number;
    }
  | { tipo: "vacio"; nombre: string }
  | { tipo: "inexistente"; ruta: string };

export type DocumentoEnviable = Extract<DocumentoLeido, { tipo: "soportado" | "no_soportado" }>;

/** Quita comillas y ángulos, que romperían un atributo del bloque <documento …>. */
const sinCaracteresDeBloque = (texto: string) => texto.replace(/["<>]/g, "_");

/** Nombre base sin caracteres que rompan el bloque <documento nombre="…">. */
export const nombreSeguro = (ruta: string) => sinCaracteresDeBloque(basename(ruta));

/** Extensión en minúsculas, sin el punto y sin caracteres que rompan el bloque. */
export function tipoDeArchivo(ruta: string): string {
  const extension = extname(ruta).toLowerCase();
  return extension === "" ? "sin extensión" : sinCaracteresDeBloque(extension.slice(1));
}

export async function leerDocumento(ruta: string, directorioBase: string): Promise<DocumentoLeido> {
  const completa = resolve(directorioBase, ruta);
  const info = await stat(completa).catch(() => null);
  if (info === null || !info.isFile()) return { tipo: "inexistente", ruta };

  const nombre = nombreSeguro(completa);
  const extension = extname(completa).toLowerCase();
  const tipoArchivo = tipoDeArchivo(completa);
  const noSoportado = (motivo: MotivoNoSoportado): DocumentoLeido => ({
    tipo: "no_soportado",
    nombre,
    tipoArchivo,
    motivo,
    bytes: info.size,
  });

  if (!EXTENSIONES_SOPORTADAS.has(extension)) return noSoportado("formato");
  if (info.size > TAMANO_MAXIMO_BYTES) return noSoportado("tamano");
  if (info.size === 0) return { tipo: "vacio", nombre };

  const bytes = await readFile(completa);
  // El archivo pudo crecer entre stat y la lectura: el límite se aplica también a lo leído.
  if (bytes.length > TAMANO_MAXIMO_BYTES) return noSoportado("tamano");
  if (bytes.includes(0)) return noSoportado("codificacion");
  let contenido: string;
  try {
    contenido = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return noSoportado("codificacion");
  }
  if (contenido.trim() === "") return { tipo: "vacio", nombre };
  return { tipo: "soportado", nombre, contenido, bytes: bytes.length };
}

/**
 * Mensaje que recibe el agente. El contenido va delimitado y no puede abrir ni cerrar ninguna
 * etiqueta del prompt, en ninguna variante (`</DOCUMENTO >`, `</historial>`…).
 */
export function componerMensaje(documento: DocumentoEnviable, adjunto: number): string {
  const encabezado = `Adjunto el documento ${documento.nombre} (adjunto ${adjunto}).`;
  if (documento.tipo === "no_soportado") {
    return `${encabezado}\n<documento_no_soportado adjunto="${adjunto}" nombre="${documento.nombre}" tipo="${documento.tipoArchivo}" motivo="${documento.motivo}"/>`;
  }
  const contenido = neutralizarEtiquetas(documento.contenido);
  return `${encabezado}\n<documento adjunto="${adjunto}" nombre="${documento.nombre}">\n${contenido}\n</documento>`;
}

export { NOMBRE_TEXTO_PEGADO };

/** Un texto pegado de más de 256 KiB no se puede extraer: se registra como no soportado. */
export const clasificarPegado = (texto: string): MotivoNoSoportado | null =>
  Buffer.byteLength(texto, "utf8") > TAMANO_MAXIMO_BYTES ? "tamano" : null;

/**
 * Un texto pegado sigue siendo un mensaje del solicitante, no un bloque de datos: así «quiero hablar
 * con una persona» sigue valiendo como instrucción (Regla 4). Al final lleva la marca, que compone el
 * chat, con el número de adjunto para que el agente pueda pedir su extracción; el texto no puede
 * forjarla ni abrir ningún bloque del prompt.
 */
export function componerPegado(
  texto: string,
  adjunto: number,
  motivo: MotivoNoSoportado | null = null,
): string {
  const noSoportado = motivo === null ? "" : ` soportado="no" motivo="${motivo}"`;
  const marca = `<adjunto_registrado numero="${adjunto}" nombre="${NOMBRE_TEXTO_PEGADO}"${noSoportado}/>`;
  return `${neutralizarEtiquetas(texto)}\n${marca}`;
}

export const detalleAdjunto = (documento: DocumentoEnviable) =>
  documento.tipo === "soportado" ? `${documento.bytes} bytes` : `no soportado: ${documento.motivo}`;

/** Lo único del documento que va a los logs (Principio VI). */
export function metadatosParaLog(documento: DocumentoEnviable) {
  if (documento.tipo === "soportado") {
    return {
      nombre: documento.nombre,
      tipoArchivo: extname(documento.nombre).slice(1).toLowerCase(),
      bytes: documento.bytes,
      soportado: true,
    };
  }
  return {
    nombre: documento.nombre,
    tipoArchivo: documento.tipoArchivo,
    bytes: documento.bytes,
    soportado: false,
    motivo: documento.motivo,
  };
}
