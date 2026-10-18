// Solo para pruebas: constructores de documentos ficticios con la salida del subagente que les
// corresponde, para armar conversaciones con varios certificados y extractos sin escribir cada texto
// a mano (constitución, Principio II; docs/datos-ficticios.md). Los usan las pruebas de la política de
// ingreso, del core, del servidor y del adaptador (#11).

import {
  construirResultado,
  esquemaRegistroExtraccion,
  validarSalida,
  type RegistroExtraccion,
  type SalidaSubagente,
} from "./extraccion.ts";
import { HOY_EJEMPLO } from "./extraccion-ejemplos.ts";

/** Un documento ficticio con su contenido y la salida que daría el subagente. */
export interface Ejemplo {
  adjunto: number;
  nombre: string;
  contenido: string;
  salida: SalidaSubagente;
}

/** Pesos con puntos de miles, como los escriben los documentos de prueba. */
export const miles = (valor: number): string => String(valor).replace(/\B(?=(\d{3})+(?!\d))/g, ".");

export interface OpcionesCertificado {
  adjunto?: number;
  nombre?: string;
  empleador?: string;
  /** `null`: el certificado no trae salario. */
  salario?: number | null;
}

export function ejemploCertificado({
  adjunto = 1,
  nombre = "certificado.md",
  empleador = "Industrias Imaginarias del Valle S.A.S.",
  salario = 3_800_000,
}: OpcionesCertificado = {}): Ejemplo {
  const lineaSalario = salario === null ? null : `Salario básico mensual: $${miles(salario)} COP`;
  const contenido = [
    "Certificado laboral ficticio",
    `${empleador} certifica que Ana Pérez Ficticia`,
    "trabaja como analista de operaciones desde el 1 de febrero de 2022.",
    ...(lineaSalario === null ? [] : [lineaSalario]),
  ].join("\n");
  return {
    adjunto,
    nombre,
    contenido,
    salida: {
      tipo: "certificado_laboral",
      certificado: {
        empleador: { valor: empleador, fragmento: `${empleador} certifica` },
        cargo: {
          valor: "analista de operaciones",
          fragmento: "trabaja como analista de operaciones",
        },
        fechaIngreso: { valor: "2022-02-01", fragmento: "desde el 1 de febrero de 2022" },
        salario:
          lineaSalario === null ? null : { valor: salario as number, fragmento: lineaSalario },
        moneda: lineaSalario === null ? null : { fragmento: `$${miles(salario as number)} COP` },
      },
      extracto: null,
      conflictos: [],
    },
  };
}

export interface MovimientoEjemplo {
  fecha: string;
  descripcion: string;
  valor: number;
  sentido: "abono" | "cargo";
}

export interface OpcionesExtracto {
  adjunto?: number;
  nombre?: string;
  titular?: string;
  desde?: string;
  hasta?: string;
  /** Por defecto, un abono de nómina de 3.800.000 el día 5 del mes de `desde`. */
  movimientos?: readonly MovimientoEjemplo[];
}

export const nominaDelMes = (desde: string, valor = 3_800_000): MovimientoEjemplo => ({
  fecha: `${desde.slice(0, 7)}-05`,
  descripcion: "Nómina Industrias Imaginarias",
  valor,
  sentido: "abono",
});

export function ejemploExtracto({
  adjunto = 2,
  nombre = "extracto-2026-09.md",
  titular = "Ana Pérez Ficticia",
  desde = "2026-09-01",
  hasta = "2026-09-30",
  movimientos = [nominaDelMes(desde)],
}: OpcionesExtracto = {}): Ejemplo {
  const lineas = movimientos.map(
    (m) => `${m.fecha} ${m.descripcion} ${m.sentido} ${miles(m.valor)}`,
  );
  const contenido = [
    "Extracto de ahorros ficticio",
    `Titular: ${titular}`,
    `Periodo: ${desde} a ${hasta}`,
    "Moneda: pesos colombianos",
    ...lineas,
  ].join("\n");
  return {
    adjunto,
    nombre,
    contenido,
    salida: {
      tipo: "extracto_bancario",
      certificado: null,
      extracto: {
        titular: { valor: titular, fragmento: `Titular: ${titular}` },
        periodo: { valor: { desde, hasta }, fragmento: `Periodo: ${desde} a ${hasta}` },
        moneda: { fragmento: "Moneda: pesos colombianos" },
        movimientos: movimientos.map((m, i) => ({
          fecha: m.fecha,
          descripcion: m.descripcion,
          valor: m.valor,
          sentido: m.sentido,
          fragmento: lineas[i] as string,
        })),
      },
      conflictos: [],
    },
  };
}

/** Los tres extractos de julio, agosto y septiembre de 2026, con nómina y sin otros movimientos. */
export const extractosTrimestre = (
  opciones: Omit<OpcionesExtracto, "adjunto" | "nombre" | "desde" | "hasta" | "movimientos"> & {
    primerAdjunto?: number;
    nomina?: number;
  } = {},
): Ejemplo[] => {
  const { primerAdjunto = 2, nomina = 3_800_000, ...resto } = opciones;
  const meses = [
    ["2026-07-01", "2026-07-31", "extracto-2026-07.md"],
    ["2026-08-01", "2026-08-31", "extracto-2026-08.md"],
    ["2026-09-01", "2026-09-30", "extracto-2026-09.md"],
  ] as const;
  return meses.map(([desde, hasta, nombre], i) =>
    ejemploExtracto({
      ...resto,
      adjunto: primerAdjunto + i,
      nombre,
      desde,
      hasta,
      movimientos: [nominaDelMes(desde, nomina)],
    }),
  );
};

/**
 * El registro que guardaría el core para ese documento: pasa por la misma validación y construcción
 * del #10, así que un ejemplo mal armado falla aquí y no en la prueba que lo usa.
 */
export function aRegistro(ejemplo: Ejemplo, hoy: Date = HOY_EJEMPLO): RegistroExtraccion {
  const validacion = validarSalida(ejemplo.salida, ejemplo, hoy);
  if (!validacion.ok) {
    throw new Error(`ejemplo inválido: ${validacion.errores.map((e) => e.campo).join(", ")}`);
  }
  const resultado = construirResultado(validacion.salida, ejemplo, 1);
  return esquemaRegistroExtraccion.parse({
    ...resultado,
    adjuntos: [ejemplo.adjunto],
    registradoEn: hoy.toISOString(),
    reextraidaPor: [],
  });
}

/**
 * Un extracto cuyo texto trae dos nombres, el del titular y el de un autorizado, con la lectura errada
 * del subagente (toma el autorizado como titular) y la correcta. Comparten contenido, así que son
 * el mismo documento para el core: sirven para probar la reextracción (US5 del #11).
 */
export function extractoConLecturaErrada(opciones: OpcionesExtracto = {}): {
  errada: Ejemplo;
  correcta: Ejemplo;
} {
  const base = ejemploExtracto(opciones);
  const contenido = `${base.contenido}\nAutorizado: Luis Gómez Inventado`;
  const correcta: Ejemplo = { ...base, contenido };
  const errada: Ejemplo = {
    ...base,
    contenido,
    salida: {
      ...base.salida,
      extracto: {
        ...base.salida.extracto!,
        titular: {
          valor: "Luis Gómez Inventado",
          fragmento: "Autorizado: Luis Gómez Inventado",
        },
      },
    },
  };
  return { errada, correcta };
}
