// Extracción de documentos: esquemas, procedencia y validación (specs/008-extraccion-documentos:
// research.md, R3 y R4; data-model.md; contracts/subagente.md). Lo usan el agente, para validar lo
// que devuelve el subagente, y el core, para revalidar lo que recibe contra el documento
// (Principios III y IV de la constitución). El modelo comprende y extrae; este módulo comprueba.

import { createHash } from "node:crypto";
import { z } from "zod";
import { buscarMonedaExtranjera, deducirMoneda, evaluarDocumento } from "../politica/documentos.ts";
import {
  MAX_INTENTOS_EXTRACCION,
  MONEDA_SOPORTADA,
  TIPOS_DOCUMENTO_SOPORTADOS,
} from "../politica/politica.ts";

// ---------------------------------------------------------------------------------------------
// Esquemas básicos
// ---------------------------------------------------------------------------------------------

/** Caracteres máximos del contenido de un documento: el mismo tope de 256 KiB del chat (#8). */
export const TAMANO_MAXIMO_CONTENIDO = 256 * 1024;

const FECHA_ISO = /^\d{4}-\d{2}-\d{2}$/;

/** Verdadero si `valor` es una fecha de calendario real en formato AAAA-MM-DD. */
export function esFechaCalendario(valor: string): boolean {
  if (!FECHA_ISO.test(valor)) return false;
  const [anio, mes, dia] = valor.split("-").map(Number) as [number, number, number];
  const fecha = new Date(Date.UTC(anio, mes - 1, dia));
  return (
    fecha.getUTCFullYear() === anio && fecha.getUTCMonth() === mes - 1 && fecha.getUTCDate() === dia
  );
}

const fechaISO = z
  .string()
  .regex(FECHA_ISO)
  .refine(esFechaCalendario, "fecha de calendario inválida");
const fragmento = z.string().min(1).max(300);
const texto = z.string().min(1);
const pesos = z.int().positive();
const sentido = z.enum(["abono", "cargo"]);
const periodo = z
  .strictObject({ desde: fechaISO, hasta: fechaISO })
  .refine((p) => p.desde <= p.hasta, "la fecha inicial es posterior a la final");

// ---------------------------------------------------------------------------------------------
// Errores de validación
// ---------------------------------------------------------------------------------------------

export const MOTIVOS_ERROR = [
  "esquema",
  "fragmento_no_encontrado",
  "valor_no_coincide_con_fragmento",
  "centavos_no_soportados",
  "moneda_no_reconocida",
  "fecha_futura",
  "huella_no_coincide",
  "decision_no_coincide",
] as const;

/** Un error concreto, con el campo y el motivo: es lo que se le dice al subagente al reintentar. */
export const esquemaErrorExtraccion = z.strictObject({
  campo: z.string().min(1),
  motivo: z.enum(MOTIVOS_ERROR),
  detalle: z.string().optional(),
});
export type ErrorExtraccion = z.infer<typeof esquemaErrorExtraccion>;

// ---------------------------------------------------------------------------------------------
// Salida del subagente: valor normalizado más fragmento literal (R3)
// ---------------------------------------------------------------------------------------------

const citado = <T extends z.ZodType>(valor: T) => z.strictObject({ valor, fragmento }).nullable();
const monedaCitada = z.strictObject({ fragmento }).nullable();

const certificadoSalida = z.strictObject({
  empleador: citado(texto),
  cargo: citado(texto),
  fechaIngreso: citado(fechaISO),
  salario: citado(pesos),
  moneda: monedaCitada,
});

const movimientoSalida = z.strictObject({
  fecha: fechaISO,
  descripcion: texto,
  valor: pesos,
  sentido,
  fragmento,
});

const extractoSalida = z.strictObject({
  titular: citado(texto),
  periodo: citado(periodo),
  moneda: monedaCitada,
  movimientos: z.array(movimientoSalida),
});

export const esquemaSalidaSubagente = z
  .strictObject({
    tipo: z.enum([...TIPOS_DOCUMENTO_SOPORTADOS, "otro"] as const),
    certificado: certificadoSalida.nullable(),
    extracto: extractoSalida.nullable(),
    conflictos: z.array(texto),
  })
  .superRefine((salida, ctx) => {
    const reglas = [
      ["certificado", "certificado_laboral", salida.certificado] as const,
      ["extracto", "extracto_bancario", salida.extracto] as const,
    ];
    for (const [bloque, tipo, valor] of reglas) {
      if (salida.tipo === tipo && valor === null) {
        ctx.addIssue({ code: "custom", path: [bloque], message: `falta el bloque «${bloque}»` });
      }
      if (salida.tipo !== tipo && valor !== null) {
        ctx.addIssue({
          code: "custom",
          path: [bloque],
          message: `el bloque «${bloque}» solo va con el tipo ${tipo}`,
        });
      }
    }
  });
export type SalidaSubagente = z.infer<typeof esquemaSalidaSubagente>;

// ---------------------------------------------------------------------------------------------
// Resultado de la extracción, con procedencia
// ---------------------------------------------------------------------------------------------

export const esquemaProcedencia = z.strictObject({
  adjunto: z.int().min(1),
  nombre: z.string().min(1).max(255),
  fragmento,
});
export type Procedencia = z.infer<typeof esquemaProcedencia>;

const campo = <T extends z.ZodType>(valor: T) =>
  z.strictObject({ valor, procedencia: esquemaProcedencia }).nullable();

const certificadoExtraido = z.strictObject({
  tipo: z.literal("certificado_laboral"),
  empleador: campo(texto),
  cargo: campo(texto),
  fechaIngreso: campo(fechaISO),
  salario: campo(pesos),
  moneda: campo(z.literal(MONEDA_SOPORTADA)),
});

const movimientoExtraido = z.strictObject({
  fecha: fechaISO,
  descripcion: texto,
  valor: pesos,
  sentido,
  procedencia: esquemaProcedencia,
});

const extractoExtraido = z.strictObject({
  tipo: z.literal("extracto_bancario"),
  titular: campo(texto),
  periodo: campo(periodo),
  moneda: campo(z.literal(MONEDA_SOPORTADA)),
  movimientos: z.array(movimientoExtraido),
});

const documentoExtraido = z.discriminatedUnion("tipo", [certificadoExtraido, extractoExtraido]);
export type DocumentoExtraido = z.infer<typeof documentoExtraido>;
export type CertificadoLaboral = z.infer<typeof certificadoExtraido>;
export type ExtractoBancario = z.infer<typeof extractoExtraido>;
export type Movimiento = z.infer<typeof movimientoExtraido>;

const comunes = {
  adjunto: z.int().min(1),
  nombre: z.string().min(1).max(255),
  huella: z.string().regex(/^[0-9a-f]{64}$/),
  intentos: z.int().min(1).max(MAX_INTENTOS_EXTRACCION),
};

const crearVariantes = <E extends z.ZodRawShape>(extra: E) =>
  [
    z.strictObject({
      estado: z.literal("extraido"),
      ...comunes,
      ...extra,
      documento: documentoExtraido,
      faltantes: z.array(texto),
    }),
    z.strictObject({
      estado: z.literal("no_cubierto"),
      ...comunes,
      ...extra,
      causa: z.enum(["moneda_extranjera", "documento_no_soportado"]),
      /** Lo que clasificó el subagente y el fragmento de moneda: con ellos el core revalida la causa. */
      tipoDetectado: texto,
      fragmentoMoneda: fragmento.nullable(),
    }),
    z.strictObject({
      estado: z.literal("no_extraible"),
      ...comunes,
      ...extra,
      conflictos: z.array(texto),
      ultimoError: z.array(esquemaErrorExtraccion),
    }),
  ] as const;

export const esquemaResultadoExtraccion = z.discriminatedUnion("estado", crearVariantes({}));
export type ResultadoExtraccion = z.infer<typeof esquemaResultadoExtraccion>;

/** Lo que guarda el core: el resultado y los adjuntos con ese mismo contenido. */
export const esquemaRegistroExtraccion = z.discriminatedUnion(
  "estado",
  crearVariantes({ adjuntos: z.array(z.int().min(1)).min(1), registradoEn: z.iso.datetime() }),
);
export type RegistroExtraccion = z.infer<typeof esquemaRegistroExtraccion>;

// ---------------------------------------------------------------------------------------------
// Huella y faltantes
// ---------------------------------------------------------------------------------------------

/** SHA-256 en hexadecimal del contenido: reconoce el mismo documento entregado otra vez (FR-018). */
export const huella = (contenido: string): string =>
  createHash("sha256").update(contenido, "utf8").digest("hex");

const nulos = (campos: Record<string, unknown>) =>
  Object.entries(campos)
    .filter(([, valor]) => valor === null)
    .map(([nombre]) => nombre);

/** Si el documento trae montos: solo entonces la moneda hace falta. */
export function tieneMontos(salida: SalidaSubagente): boolean {
  if (salida.certificado !== null) return salida.certificado.salario !== null;
  if (salida.extracto !== null) return salida.extracto.movimientos.length > 0;
  return false;
}

/**
 * Campos que el documento no trae, en el orden del esquema. La moneda solo falta si hay montos.
 * Un documento de otro tipo no tiene faltantes.
 */
export function camposFaltantes(salida: SalidaSubagente): string[] {
  const { certificado, extracto } = salida;
  const montos = tieneMontos(salida);
  if (certificado !== null) {
    const { empleador, cargo, fechaIngreso, salario, moneda } = certificado;
    return nulos({ empleador, cargo, fechaIngreso, salario, ...(montos ? { moneda } : {}) });
  }
  if (extracto !== null) {
    const { titular, periodo: periodoCitado, moneda } = extracto;
    return nulos({ titular, periodo: periodoCitado, ...(montos ? { moneda } : {}) });
  }
  return [];
}

// ---------------------------------------------------------------------------------------------
// Comprobaciones contra el documento
// ---------------------------------------------------------------------------------------------

/** Zona horaria de Crediágil: «hoy» es el día en Colombia, no en UTC (revisión de 0aa8c2a). */
export const ZONA_HORARIA = "America/Bogota";

/** La fecha AAAA-MM-DD de un instante en la zona horaria de Crediágil. */
export const fechaLocal = (instante: Date): string =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: ZONA_HORARIA,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instante);

type Verificacion =
  | { tipo: "monto"; campo: string; valor: number }
  | { tipo: "fecha"; campo: string; valor: string }
  | { tipo: "texto"; campo: string; valor: string }
  | { tipo: "sentido"; campo: string; valor: "abono" | "cargo" }
  | { tipo: "moneda"; campo: string };

/** Un dato con su fragmento y lo que hay que comprobar de él. */
interface Citado {
  campo: string;
  fragmento: string;
  verificaciones: Verificacion[];
  /** Documento al que dice pertenecer; solo en un resultado ya construido. */
  procedencia?: { adjunto: number; nombre: string };
}

const colapsar = (cadena: string) => cadena.replace(/\s+/g, " ").trim();

/** Minúsculas, sin tildes y con los espacios colapsados: para comparar un valor con su cita. */
const comparable = (cadena: string) =>
  colapsar(
    cadena
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .toLowerCase(),
  );

type ResultadoMonto = "ok" | "centavos" | "no_coincide";

/**
 * Comprueba que `valor` (pesos enteros) aparece en el fragmento. Acepta separadores de miles
 * (`3.800.000`, `3,800,000`) y centavos en cero (`,00`). Unos centavos distintos de cero no se
 * redondean: se rechazan (Principio III).
 */
function analizarMonto(valor: number, textoFragmento: string): ResultadoMonto {
  let hayCentavos = false;
  for (const coincidencia of textoFragmento.matchAll(/\d[\d.,]*/g)) {
    const numero = coincidencia[0].replace(/[.,]+$/, "");
    const ultimo = Math.max(numero.lastIndexOf("."), numero.lastIndexOf(","));
    let parteEntera = numero;
    let decimales = "";
    if (ultimo >= 0 && numero.length - ultimo - 1 <= 2) {
      parteEntera = numero.slice(0, ultimo);
      decimales = numero.slice(ultimo + 1);
    }
    const digitos = parteEntera.replace(/[.,]/g, "");
    if (digitos === "" || Number(digitos) !== valor) continue;
    if (/[1-9]/.test(decimales)) hayCentavos = true;
    else return "ok";
  }
  return hayCentavos ? "centavos" : "no_coincide";
}

const MESES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
] as const;

/** El número aparece como número completo: «1» no coincide dentro de «2021». */
const comoNumero = (texto: string, numero: string) =>
  numero !== "" && new RegExp(`(?<!\\d)${numero}(?!\\d)`).test(texto);

/**
 * La fecha AAAA-MM-DD aparece en su cita: tal cual, con números (1/02/2022) o con el mes en
 * letras («1 de febrero de 2022»). Se exigen el año, el mes y el día.
 */
function fechaEnFragmento(valor: string, fragmento: string): boolean {
  const texto = comparable(fragmento);
  if (texto.includes(valor)) return true;
  const [anio = "", mes = "", dia = ""] = valor.split("-");
  const numeroMes = Number(mes);
  const nombreMes: string | undefined = MESES[numeroMes - 1];
  const hayMes =
    (nombreMes !== undefined && texto.includes(nombreMes)) ||
    (numeroMes === 9 && texto.includes("setiembre")) ||
    comoNumero(texto, mes) ||
    comoNumero(texto, String(numeroMes));
  const hayDia = comoNumero(texto, dia) || comoNumero(texto, String(Number(dia)));
  return comoNumero(texto, anio) && hayMes && hayDia;
}

/** Palabras que indican el sentido de un movimiento cuando la cita no dice «abono» ni «cargo». */
const PALABRAS_SENTIDO = {
  abono: ["credito", "ingreso", "deposito", "consignacion", "recibid", "nomina"],
  cargo: ["debito", "retiro", "pago", "compra", "egreso", "transferencia a", "envio"],
} as const;

/**
 * El sentido del movimiento coincide con su cita. Si la cita dice «abono» o «cargo», manda la última
 * de las dos (la columna del tipo suele ir al final de la fila); si no, un `+` antes del monto indica
 * abono, y si tampoco, alguna palabra propia de su sentido.
 */
function sentidoEnFragmento(sentido: "abono" | "cargo", fragmento: string): boolean {
  const texto = comparable(fragmento);
  let ultimo: string | undefined;
  for (const coincidencia of texto.matchAll(/(?<![a-z])(abono|cargo)s?(?![a-z])/g)) {
    ultimo = coincidencia[1];
  }
  if (ultimo !== undefined) return ultimo === sentido;
  if (/\+\s*\$?\s*\d/.test(texto)) return sentido === "abono";
  return PALABRAS_SENTIDO[sentido].some((palabra) => texto.includes(palabra));
}

function errorDeVerificacion(
  verificacion: Verificacion,
  fragmento: string,
  hoyLocal: string,
): ErrorExtraccion | null {
  const noCoincide = {
    campo: verificacion.campo,
    motivo: "valor_no_coincide_con_fragmento",
  } as const;
  switch (verificacion.tipo) {
    case "monto": {
      const monto = analizarMonto(verificacion.valor, fragmento);
      if (monto === "centavos")
        return { campo: verificacion.campo, motivo: "centavos_no_soportados" };
      return monto === "no_coincide" ? noCoincide : null;
    }
    case "fecha":
      if (verificacion.valor > hoyLocal)
        return { campo: verificacion.campo, motivo: "fecha_futura" };
      return fechaEnFragmento(verificacion.valor, fragmento) ? null : noCoincide;
    case "texto":
      return comparable(fragmento).includes(comparable(verificacion.valor)) ? null : noCoincide;
    case "sentido":
      return sentidoEnFragmento(verificacion.valor, fragmento) ? null : noCoincide;
    case "moneda":
      return deducirMoneda(fragmento) === null
        ? { campo: verificacion.campo, motivo: "moneda_no_reconocida" }
        : null;
  }
}

/**
 * Cada cita debe estar en el documento, y cada valor en su cita: textos, fechas, montos y el sentido
 * de los movimientos (revisión de 0aa8c2a). Las fechas no pueden ser posteriores a hoy en Colombia.
 */
function revisarCitados(
  citados: readonly Citado[],
  contenido: string,
  hoy: Date,
  esperado?: { adjunto: number; nombre: string },
): ErrorExtraccion[] {
  const errores: ErrorExtraccion[] = [];
  const documento = colapsar(contenido);
  const hoyLocal = fechaLocal(hoy);
  for (const dato of citados) {
    if (
      esperado !== undefined &&
      dato.procedencia !== undefined &&
      (dato.procedencia.adjunto !== esperado.adjunto || dato.procedencia.nombre !== esperado.nombre)
    ) {
      errores.push({
        campo: dato.campo,
        motivo: "esquema",
        detalle: "la procedencia es de otro documento",
      });
    }
    if (!documento.includes(colapsar(dato.fragmento))) {
      errores.push({ campo: dato.campo, motivo: "fragmento_no_encontrado" });
      continue;
    }
    for (const verificacion of dato.verificaciones) {
      const error = errorDeVerificacion(verificacion, dato.fragmento, hoyLocal);
      if (error !== null) errores.push(error);
    }
  }
  // Un mismo problema en el mismo campo se informa una vez (por ejemplo, las dos fechas del periodo).
  return errores.filter(
    (error, i) =>
      errores.findIndex((e) => e.campo === error.campo && e.motivo === error.motivo) === i,
  );
}

/** Los movimientos de un extracto deben caer dentro de su periodo. */
function erroresDePeriodo(
  prefijo: string,
  periodoExtracto: { desde: string; hasta: string } | null,
  movimientos: readonly { fecha: string }[],
): ErrorExtraccion[] {
  if (periodoExtracto === null) return [];
  return movimientos.flatMap((movimiento, indice) =>
    movimiento.fecha < periodoExtracto.desde || movimiento.fecha > periodoExtracto.hasta
      ? [
          {
            campo: `${prefijo}movimientos.${indice}.fecha`,
            motivo: "esquema" as const,
            detalle: "la fecha está fuera del periodo del extracto",
          },
        ]
      : [],
  );
}

const erroresDeEsquema = (issues: readonly z.core.$ZodIssue[]): ErrorExtraccion[] =>
  issues.map((issue) => ({
    campo: issue.path.join(".") || "(raíz)",
    motivo: "esquema",
    detalle: issue.message,
  }));

// ---------------------------------------------------------------------------------------------
// Vista común de una salida o de un resultado, para construir las citas una sola vez
// ---------------------------------------------------------------------------------------------

interface DatoVista<T> {
  valor: T;
  fragmento: string;
  procedencia?: { adjunto: number; nombre: string };
}

interface VistaDocumento {
  certificado: {
    empleador: DatoVista<string> | null;
    cargo: DatoVista<string> | null;
    fechaIngreso: DatoVista<string> | null;
    salario: DatoVista<number> | null;
    moneda: Omit<DatoVista<unknown>, "valor"> | null;
  } | null;
  extracto: {
    titular: DatoVista<string> | null;
    periodo: DatoVista<{ desde: string; hasta: string }> | null;
    moneda: Omit<DatoVista<unknown>, "valor"> | null;
    movimientos: readonly (Omit<DatoVista<number>, "valor"> & {
      fecha: string;
      descripcion: string;
      valor: number;
      sentido: "abono" | "cargo";
    })[];
  } | null;
}

/** Las citas de un documento y lo que hay que comprobar de cada una; `prefijo` va en cada campo. */
function citadosDe(vista: VistaDocumento, prefijo: string): Citado[] {
  const citados: Citado[] = [];
  const agregar = (
    nombre: string,
    dato: Omit<DatoVista<unknown>, "valor"> | null,
    verificaciones: Verificacion[],
  ) => {
    if (dato === null) return;
    citados.push({
      campo: `${prefijo}${nombre}`,
      fragmento: dato.fragmento,
      verificaciones: verificaciones.map((v) => ({
        ...v,
        campo: `${prefijo}${v.campo}`,
      })),
      ...(dato.procedencia !== undefined ? { procedencia: dato.procedencia } : {}),
    });
  };
  const texto = (nombre: string, dato: DatoVista<string> | null) =>
    agregar(
      nombre,
      dato,
      dato === null ? [] : [{ tipo: "texto", campo: nombre, valor: dato.valor }],
    );

  const { certificado, extracto } = vista;
  if (certificado !== null) {
    texto("empleador", certificado.empleador);
    texto("cargo", certificado.cargo);
    const { fechaIngreso, salario } = certificado;
    agregar(
      "fechaIngreso",
      fechaIngreso,
      fechaIngreso === null
        ? []
        : [{ tipo: "fecha", campo: "fechaIngreso", valor: fechaIngreso.valor }],
    );
    agregar(
      "salario",
      salario,
      salario === null ? [] : [{ tipo: "monto", campo: "salario", valor: salario.valor }],
    );
    agregar("moneda", certificado.moneda, [{ tipo: "moneda", campo: "moneda" }]);
  }
  if (extracto !== null) {
    texto("titular", extracto.titular);
    const { periodo: periodoCitado } = extracto;
    agregar(
      "periodo",
      periodoCitado,
      periodoCitado === null
        ? []
        : [
            {
              tipo: "fecha",
              campo: "periodo",
              valor: periodoCitado.valor.desde,
            },
            {
              tipo: "fecha",
              campo: "periodo",
              valor: periodoCitado.valor.hasta,
            },
          ],
    );
    agregar("moneda", extracto.moneda, [{ tipo: "moneda", campo: "moneda" }]);
    extracto.movimientos.forEach((movimiento, i) => {
      agregar(`movimientos.${i}`, movimiento, [
        {
          tipo: "monto",
          campo: `movimientos.${i}.valor`,
          valor: movimiento.valor,
        },
        {
          tipo: "fecha",
          campo: `movimientos.${i}.fecha`,
          valor: movimiento.fecha,
        },
        {
          tipo: "texto",
          campo: `movimientos.${i}.descripcion`,
          valor: movimiento.descripcion,
        },
        {
          tipo: "sentido",
          campo: `movimientos.${i}.sentido`,
          valor: movimiento.sentido,
        },
      ]);
    });
  }
  return citados;
}

/** La vista de un resultado ya construido: la cita sale de la procedencia. */
function vistaDeDocumento(documento: DocumentoExtraido): VistaDocumento {
  const dato = <T>(campoExtraido: { valor: T; procedencia: Procedencia } | null) =>
    campoExtraido === null
      ? null
      : {
          valor: campoExtraido.valor,
          fragmento: campoExtraido.procedencia.fragmento,
          procedencia: {
            adjunto: campoExtraido.procedencia.adjunto,
            nombre: campoExtraido.procedencia.nombre,
          },
        };
  if (documento.tipo === "certificado_laboral") {
    return {
      certificado: {
        empleador: dato(documento.empleador),
        cargo: dato(documento.cargo),
        fechaIngreso: dato(documento.fechaIngreso),
        salario: dato(documento.salario),
        moneda: dato(documento.moneda),
      },
      extracto: null,
    };
  }
  return {
    certificado: null,
    extracto: {
      titular: dato(documento.titular),
      periodo: dato(documento.periodo),
      moneda: dato(documento.moneda),
      movimientos: documento.movimientos.map((m) => ({
        fecha: m.fecha,
        descripcion: m.descripcion,
        valor: m.valor,
        sentido: m.sentido,
        fragmento: m.procedencia.fragmento,
        procedencia: {
          adjunto: m.procedencia.adjunto,
          nombre: m.procedencia.nombre,
        },
      })),
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Validación de la salida del subagente
// ---------------------------------------------------------------------------------------------

export type ValidacionSalida =
  { ok: true; salida: SalidaSubagente } | { ok: false; errores: ErrorExtraccion[] };

/**
 * Valida lo que devolvió el subagente, en este orden: esquema, citas presentes en el documento,
 * valores presentes en su cita (montos, textos, fechas y sentido), fechas no futuras y moneda
 * reconocible. Acumula todos los errores, no solo el primero, para que el reintento los corrija.
 */
export function validarSalida(
  salida: unknown,
  documento: { contenido: string },
  hoy: Date,
): ValidacionSalida {
  const analisis = esquemaSalidaSubagente.safeParse(salida);
  if (!analisis.success) return { ok: false, errores: erroresDeEsquema(analisis.error.issues) };
  const valida = analisis.data;
  const errores = [
    ...revisarCitados(citadosDe(valida, ""), documento.contenido, hoy),
    ...erroresDePeriodo(
      "",
      valida.extracto?.periodo?.valor ?? null,
      valida.extracto?.movimientos ?? [],
    ),
  ];
  return errores.length > 0 ? { ok: false, errores } : { ok: true, salida: valida };
}

// ---------------------------------------------------------------------------------------------
// Construcción del resultado
// ---------------------------------------------------------------------------------------------

export interface DocumentoConContenido {
  adjunto: number;
  nombre: string;
  contenido: string;
}

/**
 * Convierte una salida ya validada en el resultado de la extracción: agrega la procedencia a cada
 * campo y aplica la política (Regla 5). Toda decisión sale de `evaluarDocumento`, no del modelo; la
 * moneda extranjera se busca en todo el documento, no solo en la cita que eligió el modelo.
 */
export function construirResultado(
  salida: SalidaSubagente,
  documento: DocumentoConContenido,
  intentos: number,
): ResultadoExtraccion {
  const base = {
    adjunto: documento.adjunto,
    nombre: documento.nombre,
    huella: huella(documento.contenido),
    intentos,
  };
  const fragmentoCitado =
    (salida.certificado?.moneda ?? salida.extracto?.moneda)?.fragmento ?? null;
  const extranjera = buscarMonedaExtranjera(documento.contenido);
  const decision = evaluarDocumento({
    tipo: salida.tipo,
    fragmentoMoneda: fragmentoCitado,
    monedaExtranjeraEnContenido: extranjera?.fragmento ?? null,
    conflictos: salida.conflictos,
    faltantes: camposFaltantes(salida),
    tieneMontos: tieneMontos(salida),
  });

  if (decision.resultado === "no_cubierto") {
    // La evidencia de la moneda extranjera es la cita del modelo si la nombra, o la del documento.
    const citaExtranjera =
      fragmentoCitado !== null && deducirMoneda(fragmentoCitado)?.tipo === "extranjera"
        ? fragmentoCitado
        : (extranjera?.fragmento ?? fragmentoCitado);
    return {
      estado: "no_cubierto",
      ...base,
      causa: decision.causa ?? "documento_no_soportado",
      tipoDetectado: salida.tipo,
      fragmentoMoneda: decision.causa === "moneda_extranjera" ? citaExtranjera : fragmentoCitado,
    };
  }
  if (decision.resultado === "no_extraible") {
    return {
      estado: "no_extraible",
      ...base,
      conflictos: [...salida.conflictos],
      ultimoError: [],
    };
  }

  const procedencia = (texto: string): Procedencia => ({
    adjunto: documento.adjunto,
    nombre: documento.nombre,
    fragmento: texto,
  });
  const conProcedencia = <T>(dato: { valor: T; fragmento: string } | null) =>
    dato === null ? null : { valor: dato.valor, procedencia: procedencia(dato.fragmento) };
  const moneda = (
    dato: { fragmento: string } | null,
  ): { valor: typeof MONEDA_SOPORTADA; procedencia: Procedencia } | null =>
    dato !== null && deducirMoneda(dato.fragmento)?.tipo === "soportada"
      ? { valor: MONEDA_SOPORTADA, procedencia: procedencia(dato.fragmento) }
      : null;

  const { certificado, extracto } = salida;
  let extraido: DocumentoExtraido | null = null;
  if (certificado !== null) {
    extraido = {
      tipo: "certificado_laboral",
      empleador: conProcedencia(certificado.empleador),
      cargo: conProcedencia(certificado.cargo),
      fechaIngreso: conProcedencia(certificado.fechaIngreso),
      salario: conProcedencia(certificado.salario),
      moneda: moneda(certificado.moneda),
    };
  } else if (extracto !== null) {
    extraido = {
      tipo: "extracto_bancario",
      titular: conProcedencia(extracto.titular),
      periodo: conProcedencia(extracto.periodo),
      moneda: moneda(extracto.moneda),
      movimientos: extracto.movimientos.map((m) => ({
        fecha: m.fecha,
        descripcion: m.descripcion,
        valor: m.valor,
        sentido: m.sentido,
        procedencia: procedencia(m.fragmento),
      })),
    };
  }
  if (extraido === null) {
    // Un tipo soportado siempre trae su bloque (lo exige el esquema): esto no debería ocurrir.
    return {
      estado: "no_extraible",
      ...base,
      conflictos: [],
      ultimoError: [
        {
          campo: "tipo",
          motivo: "esquema",
          detalle: "el documento no trae su bloque",
        },
      ],
    };
  }
  return {
    estado: "extraido",
    ...base,
    documento: extraido,
    faltantes: decision.faltantes,
  };
}

// ---------------------------------------------------------------------------------------------
// Revalidación de un resultado (core)
// ---------------------------------------------------------------------------------------------
const montosDeDocumento = (documento: DocumentoExtraido): boolean =>
  documento.tipo === "certificado_laboral"
    ? documento.salario !== null
    : documento.movimientos.length > 0;

/** Igual que `camposFaltantes`, sobre un documento ya construido. */
function faltantesDeDocumento(documento: DocumentoExtraido): string[] {
  const montos = montosDeDocumento(documento);
  return documento.tipo === "certificado_laboral"
    ? nulos({
        empleador: documento.empleador,
        cargo: documento.cargo,
        fechaIngreso: documento.fechaIngreso,
        salario: documento.salario,
        ...(montos ? { moneda: documento.moneda } : {}),
      })
    : nulos({
        titular: documento.titular,
        periodo: documento.periodo,
        ...(montos ? { moneda: documento.moneda } : {}),
      });
}

export type ValidacionResultado =
  { ok: true; resultado: ResultadoExtraccion } | { ok: false; errores: ErrorExtraccion[] };

type Resultado<E extends ResultadoExtraccion["estado"]> = Extract<
  ResultadoExtraccion,
  { estado: E }
>;

/**
 * Un resultado `extraido`: citas y valores contra el documento, el periodo, y la decisión de la
 * política, que también mira si el documento nombra una moneda extranjera en cualquier parte.
 */
function erroresDeExtraido(
  valido: Resultado<"extraido">,
  contenido: string,
  hoy: Date,
): ErrorExtraccion[] {
  const { documento } = valido;
  const errores = revisarCitados(
    citadosDe(vistaDeDocumento(documento), "documento."),
    contenido,
    hoy,
    {
      adjunto: valido.adjunto,
      nombre: valido.nombre,
    },
  );
  if (documento.tipo === "extracto_bancario") {
    errores.push(
      ...erroresDePeriodo("documento.", documento.periodo?.valor ?? null, documento.movimientos),
    );
  }
  const decision = evaluarDocumento({
    tipo: documento.tipo,
    fragmentoMoneda: documento.moneda?.procedencia.fragmento ?? null,
    monedaExtranjeraEnContenido: buscarMonedaExtranjera(contenido)?.fragmento ?? null,
    conflictos: [],
    faltantes: faltantesDeDocumento(documento),
    tieneMontos: montosDeDocumento(documento),
  });
  if (decision.resultado !== "extraido") {
    errores.push({
      campo: "estado",
      motivo: "decision_no_coincide",
      detalle: `la política da: ${decision.causa ?? decision.resultado}`,
    });
    return errores;
  }
  const esperados = decision.faltantes.join(",");
  if (esperados !== valido.faltantes.join(",")) {
    errores.push({
      campo: "faltantes",
      motivo: "decision_no_coincide",
      detalle: `la política da: ${esperados === "" ? "ninguno" : esperados}`,
    });
  }
  return errores;
}

/** Un resultado `no_cubierto`: la política debe dar la misma causa con lo que trae. */
function erroresDeNoCubierto(
  valido: Resultado<"no_cubierto">,
  contenido: string,
  hoy: Date,
): ErrorExtraccion[] {
  const errores =
    valido.fragmentoMoneda === null
      ? []
      : revisarCitados(
          [{ campo: "fragmentoMoneda", fragmento: valido.fragmentoMoneda, verificaciones: [] }],
          contenido,
          hoy,
        );
  const decision = evaluarDocumento({
    tipo: valido.tipoDetectado,
    fragmentoMoneda: valido.fragmentoMoneda,
    monedaExtranjeraEnContenido: buscarMonedaExtranjera(contenido)?.fragmento ?? null,
    conflictos: [],
    faltantes: [],
    tieneMontos: valido.fragmentoMoneda !== null,
  });
  if (decision.resultado !== "no_cubierto" || decision.causa !== valido.causa) {
    errores.push({
      campo: "causa",
      motivo: "decision_no_coincide",
      detalle: `la política da: ${decision.causa ?? decision.resultado}`,
    });
  }
  return errores;
}

/** Un resultado `no_extraible` debe traer conflictos o errores que lo justifiquen. */
const erroresDeNoExtraible = (valido: Resultado<"no_extraible">): ErrorExtraccion[] =>
  valido.conflictos.length === 0 && valido.ultimoError.length === 0
    ? [
        {
          campo: "ultimoError",
          motivo: "decision_no_coincide",
          detalle: "no trae conflictos ni errores que lo justifiquen",
        },
      ]
    : [];

/**
 * Revalida un resultado contra el contenido del documento. Los campos de los errores son relativos
 * al resultado (por ejemplo `documento.salario` o `causa`). Un resultado `extraido` debe tener cada
 * fragmento en el documento y cada monto en su fragmento; uno `no_cubierto` debe confirmarlo la
 * política con lo que trae; uno `no_extraible` debe traer conflictos o errores que lo justifiquen.
 */
export function validarResultado(
  resultado: unknown,
  contenido: string,
  hoy: Date,
): ValidacionResultado {
  const analisis = esquemaResultadoExtraccion.safeParse(resultado);
  if (!analisis.success) return { ok: false, errores: erroresDeEsquema(analisis.error.issues) };
  const valido = analisis.data;
  const errores: ErrorExtraccion[] =
    valido.huella === huella(contenido)
      ? []
      : [
          {
            campo: "huella",
            motivo: "huella_no_coincide",
            detalle: "no es la huella del contenido recibido",
          },
        ];
  if (valido.estado === "extraido") errores.push(...erroresDeExtraido(valido, contenido, hoy));
  else if (valido.estado === "no_cubierto") {
    errores.push(...erroresDeNoCubierto(valido, contenido, hoy));
  } else errores.push(...erroresDeNoExtraible(valido));
  return errores.length > 0 ? { ok: false, errores } : { ok: true, resultado: valido };
}
