// Control datos-reales: bloquea datos con forma real antes de que se guarden.
// Tarjeta: Luhn en cualquier contexto. Cédula, NIT y cuenta: solo con palabra clave en la línea.

import type { Accion } from "./accion.ts";
import { enmascarar, type Bloqueo } from "./bloqueo.ts";
import { ARCHIVO_CONFIGURACION, leerConfiguracion } from "./config-equipo.ts";
import {
  PREFIJO_FICTICIO,
  esFicticio,
  tienePalabraClave,
  type TipoDato,
} from "./convencion-ficticia.ts";

type Tipo = "tarjeta" | TipoDato;

// Tarjeta: 13–19 dígitos seguidos, o bloques de 4 (y Amex 4-6-5) con un mismo separador.
const TARJETA =
  /(?<![\d.,])(?:\d{13,19}|\d{4}([ -])\d{4}\1\d{4}\1\d{1,4}(?:\1\d{1,3})?|\d{4}([ -])\d{6}\2\d{5})(?![\d.,])/g;
// Cédula: 6–10 dígitos seguidos o con puntos de miles.
const CEDULA = /(?<![\d.])(?:\d{6,10}|\d{1,3}(?:\.\d{3}){1,3})(?![\d.])/g;
// NIT: 9 dígitos, seguidos o con puntos, con o sin dígito de verificación.
const NIT = /(?<![\d.])(?:\d{9}|\d{3}\.\d{3}\.\d{3})(?:\s*-\s*\d)?(?![\d.])/g;
// Cuenta: 10–20 dígitos, con espacios o guiones simples entre ellos.
const CUENTA = /(?<![\d.,])\d(?:[ -]?\d){9,19}(?![\d.,])/g;

const LIMITES: Record<TipoDato, readonly [number, number]> = {
  cédula: [6, 10],
  NIT: [9, 10],
  cuenta: [10, 20],
};

export function pasaLuhn(digitos: string): boolean {
  let suma = 0;
  for (let i = 0; i < digitos.length; i++) {
    let d = Number(digitos[digitos.length - 1 - i]);
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    suma += d;
  }
  return suma % 10 === 0;
}

function contarDigitos(valor: string): number {
  return valor.replace(/\D/g, "").length;
}

function detectarEnLinea(linea: string, prefijo: string): { tipo: Tipo; valor: string }[] {
  const hallazgos: { tipo: Tipo; valor: string }[] = [];

  for (const coincidencia of linea.matchAll(TARJETA)) {
    const valor = coincidencia[0];
    const digitos = valor.replace(/\D/g, "");
    if (
      digitos.length >= 13 &&
      digitos.length <= 19 &&
      pasaLuhn(digitos) &&
      !esFicticio(valor, prefijo)
    ) {
      hallazgos.push({ tipo: "tarjeta", valor });
    }
  }

  const porContexto: readonly [TipoDato, RegExp][] = [
    ["cédula", CEDULA],
    ["NIT", NIT],
    ["cuenta", CUENTA],
  ];
  for (const [tipo, patron] of porContexto) {
    if (!tienePalabraClave(linea, tipo)) continue;
    const [minimo, maximo] = LIMITES[tipo];
    for (const coincidencia of linea.matchAll(patron)) {
      const valor = coincidencia[0];
      const cantidad = contarDigitos(valor);
      const yaDetectado = hallazgos.some((h) => h.valor.includes(valor) || valor.includes(h.valor));
      if (cantidad >= minimo && cantidad <= maximo && !esFicticio(valor, prefijo) && !yaDetectado) {
        hallazgos.push({ tipo, valor });
      }
    }
  }
  return hallazgos;
}

const REGLA = "Los datos con forma real no se guardan: usa datos ficticios.";
const REGLA_POR_DEFECTO = `${REGLA} Se aplica la convención por defecto (no hay ${ARCHIVO_CONFIGURACION}).`;

/**
 * Sin contexto aplica la convención por defecto. Con contexto lee la configuración del equipo,
 * pero solo si la acción trae texto que revisar: así una configuración inválida no bloquea
 * acciones que no la necesitan. Si el archivo existe y no es válido, lanza `ConfiguracionInvalida`.
 */
export function datosReales(accion: Accion, contexto?: { raiz: string }): Bloqueo[] {
  if (accion.textos.length === 0) return [];
  const { prefijoFicticio, porDefecto } =
    contexto === undefined
      ? { prefijoFicticio: PREFIJO_FICTICIO, porDefecto: false }
      : leerConfiguracion(contexto.raiz);
  const regla = contexto !== undefined && porDefecto ? REGLA_POR_DEFECTO : REGLA;
  const bloqueos: Bloqueo[] = [];
  for (const { origen, texto } of accion.textos) {
    texto.split(/\r?\n/).forEach((linea, indice) => {
      for (const { tipo, valor } of detectarEnLinea(linea, prefijoFicticio)) {
        const correccion = `Usa un número ficticio que empiece por ${prefijoFicticio}.`;
        bloqueos.push({
          control: "datos-reales",
          detectado: `${tipo} ${enmascarar(valor)} en ${origen}, línea ${indice + 1}`,
          regla,
          correccion:
            tipo === "tarjeta"
              ? correccion
              : `${correccion} Si es un monto, sácalo de la línea que dice "${tipo}".`,
        });
      }
    });
  }
  return bloqueos;
}
