// Escritor y lector mínimo de `.zip` con node:zlib (specs/017-paquete-de-entrega: research.md, R2).
// Sin dependencias nuevas. Soporta entradas «stored» y «deflate», nombres en UTF-8 y rutas con `/`.
// No soporta ZIP64: el paquete pesa como máximo 50 MB y tiene muy pocos archivos.

import { readFileSync, writeFileSync } from "node:fs";
import { crc32, deflateRawSync, inflateRawSync } from "node:zlib";
import { ErrorEntrega, type EntradaZip } from "./tipos.ts";

const FIRMA_LOCAL = 0x04034b50;
const FIRMA_CENTRAL = 0x02014b50;
const FIRMA_FIN = 0x06054b50;
const BANDERA_UTF8 = 0x0800;
const METODO_STORED = 0;
const METODO_DEFLATE = 8;
const MAX_ENTRADAS = 0xffff;
const MAX_BYTES = 0xffffffff;
/** 1 de enero de 1980 00:00, la fecha mínima que admite el formato. */
const HORA_DOS = 0;
const FECHA_DOS = (1 << 5) | 1;

/** Entrada para escribir: la ruta con `/` y sus bytes. */
export interface EntradaParaEscribir {
  ruta: string;
  contenido: Uint8Array;
}

/** Arma el contenido de un `.zip` en memoria. */
export function empaquetar(entradas: EntradaParaEscribir[]): Buffer {
  if (entradas.length > MAX_ENTRADAS) {
    throw new ErrorEntrega(
      "zip-invalido",
      `demasiados archivos para un .zip sin ZIP64: ${entradas.length}`,
    );
  }
  const partes: Buffer[] = [];
  const central: Buffer[] = [];
  let desplazamiento = 0;

  for (const entrada of entradas) {
    if (entrada.ruta.includes("\\")) {
      throw new ErrorEntrega("zip-invalido", `la ruta debe usar «/»: ${entrada.ruta}`);
    }
    const nombre = Buffer.from(entrada.ruta, "utf8");
    const datos = Buffer.from(entrada.contenido);
    const comprimido = datos.length === 0 ? datos : deflateRawSync(datos);
    const metodo = datos.length === 0 ? METODO_STORED : METODO_DEFLATE;
    if (datos.length > MAX_BYTES || desplazamiento > MAX_BYTES) {
      throw new ErrorEntrega(
        "zip-invalido",
        `el archivo supera el límite sin ZIP64: ${entrada.ruta}`,
      );
    }
    const suma = crc32(datos);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(FIRMA_LOCAL, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(BANDERA_UTF8, 6);
    local.writeUInt16LE(metodo, 8);
    local.writeUInt16LE(HORA_DOS, 10);
    local.writeUInt16LE(FECHA_DOS, 12);
    local.writeUInt32LE(suma, 14);
    local.writeUInt32LE(comprimido.length, 18);
    local.writeUInt32LE(datos.length, 22);
    local.writeUInt16LE(nombre.length, 26);
    local.writeUInt16LE(0, 28);

    const cabecera = Buffer.alloc(46);
    cabecera.writeUInt32LE(FIRMA_CENTRAL, 0);
    cabecera.writeUInt16LE(20, 4);
    cabecera.writeUInt16LE(20, 6);
    cabecera.writeUInt16LE(BANDERA_UTF8, 8);
    cabecera.writeUInt16LE(metodo, 10);
    cabecera.writeUInt16LE(HORA_DOS, 12);
    cabecera.writeUInt16LE(FECHA_DOS, 14);
    cabecera.writeUInt32LE(suma, 16);
    cabecera.writeUInt32LE(comprimido.length, 20);
    cabecera.writeUInt32LE(datos.length, 24);
    cabecera.writeUInt16LE(nombre.length, 28);
    cabecera.writeUInt32LE(desplazamiento, 42);

    partes.push(local, nombre, comprimido);
    central.push(cabecera, nombre);
    desplazamiento += local.length + nombre.length + comprimido.length;
  }

  const directorio = Buffer.concat(central);
  const fin = Buffer.alloc(22);
  fin.writeUInt32LE(FIRMA_FIN, 0);
  fin.writeUInt16LE(entradas.length, 8);
  fin.writeUInt16LE(entradas.length, 10);
  fin.writeUInt32LE(directorio.length, 12);
  fin.writeUInt32LE(desplazamiento, 16);
  return Buffer.concat([...partes, directorio, fin]);
}

export function escribirZip(destino: string, entradas: EntradaParaEscribir[]): void {
  writeFileSync(destino, empaquetar(entradas));
}

/** Lee las entradas de un `.zip` ya cargado en memoria. Lanza `ErrorEntrega` si está dañado. */
export function desempaquetar(zip: Buffer): EntradaZip[] {
  const posicionFin = buscarFin(zip);
  const total = zip.readUInt16LE(posicionFin + 10);
  const tamanoDirectorio = zip.readUInt32LE(posicionFin + 12);
  let cursor = zip.readUInt32LE(posicionFin + 16);
  if (cursor + tamanoDirectorio > posicionFin) {
    throw new ErrorEntrega("zip-invalido", "el directorio central del .zip es inconsistente");
  }

  const entradas: EntradaZip[] = [];
  for (let i = 0; i < total; i++) {
    if (cursor + 46 > zip.length || zip.readUInt32LE(cursor) !== FIRMA_CENTRAL) {
      throw new ErrorEntrega("zip-invalido", `entrada ${i + 1} del directorio central inválida`);
    }
    const metodo = zip.readUInt16LE(cursor + 10);
    const sumaEsperada = zip.readUInt32LE(cursor + 16);
    const tamanoComprimido = zip.readUInt32LE(cursor + 20);
    const tamano = zip.readUInt32LE(cursor + 24);
    const largoNombre = zip.readUInt16LE(cursor + 28);
    const largoExtra = zip.readUInt16LE(cursor + 30);
    const largoComentario = zip.readUInt16LE(cursor + 32);
    const posicionLocal = zip.readUInt32LE(cursor + 42);
    const ruta = zip.toString("utf8", cursor + 46, cursor + 46 + largoNombre);
    cursor += 46 + largoNombre + largoExtra + largoComentario;

    if (posicionLocal + 30 > zip.length || zip.readUInt32LE(posicionLocal) !== FIRMA_LOCAL) {
      throw new ErrorEntrega("zip-invalido", `cabecera local inválida: ${ruta}`);
    }
    const inicio =
      posicionLocal +
      30 +
      zip.readUInt16LE(posicionLocal + 26) +
      zip.readUInt16LE(posicionLocal + 28);
    if (inicio + tamanoComprimido > zip.length) {
      throw new ErrorEntrega("zip-invalido", `datos truncados: ${ruta}`);
    }
    const crudo = zip.subarray(inicio, inicio + tamanoComprimido);
    let contenido: Buffer;
    try {
      if (metodo === METODO_STORED) contenido = Buffer.from(crudo);
      else if (metodo === METODO_DEFLATE) contenido = inflateRawSync(crudo);
      else
        throw new ErrorEntrega(
          "zip-invalido",
          `método de compresión no soportado (${metodo}): ${ruta}`,
        );
    } catch (error) {
      if (error instanceof ErrorEntrega) throw error;
      throw new ErrorEntrega("zip-invalido", `no se pudo descomprimir: ${ruta}`, { cause: error });
    }
    if (contenido.length !== tamano || crc32(contenido) !== sumaEsperada) {
      throw new ErrorEntrega("zip-invalido", `suma de comprobación distinta: ${ruta}`);
    }
    entradas.push({ ruta, tamano, contenido });
  }
  return entradas;
}

export function leerZip(origen: string): EntradaZip[] {
  let bytes: Buffer;
  try {
    bytes = readFileSync(origen);
  } catch (error) {
    throw new ErrorEntrega("zip-invalido", `no se pudo leer el .zip: ${origen}`, { cause: error });
  }
  return desempaquetar(bytes);
}

function buscarFin(zip: Buffer): number {
  const desde = Math.max(0, zip.length - 22 - 0xffff);
  for (let i = zip.length - 22; i >= desde; i--) {
    if (zip.readUInt32LE(i) === FIRMA_FIN) return i;
  }
  throw new ErrorEntrega("zip-invalido", "no es un .zip: falta el final del directorio central");
}
