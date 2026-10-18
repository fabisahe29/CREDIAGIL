// Extracción de documentos: esquemas, procedencia y validación (specs/008-extraccion-documentos:
// research.md, R3 y R4; data-model.md; contracts/subagente.md). Lo usan el agente, para validar lo
// que devuelve el subagente, y el core, para revalidar lo que recibe contra el documento
// (Principios III y IV de la constitución). El modelo comprende y extrae; este módulo comprueba.

import { createHash } from "node:crypto";
import { z } from "zod";
import { deducirMoneda, evaluarDocumento } from "../politica/documentos.ts";
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

type Verificacion =
  | { tipo: "monto"; campo: string; valor: number }
  | { tipo: "fecha"; campo: string; valor: string }
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

function revisarCitados(
  citados: readonly Citado[],
  contenido: string,
  hoy: Date,
  esperado?: { adjunto: number; nombre: string },
): ErrorExtraccion[] {
  const errores: ErrorExtraccion[] = [];
  const documento = colapsar(contenido);
  const hoyISO = hoy.toISOString().slice(0, 10);
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
      if (verificacion.tipo === "monto") {
        const monto = analizarMonto(verificacion.valor, dato.fragmento);
        if (monto === "centavos") {
          errores.push({ campo: verificacion.campo, motivo: "centavos_no_soportados" });
        } else if (monto === "no_coincide") {
          errores.push({ campo: verificacion.campo, motivo: "valor_no_coincide_con_fragmento" });
        }
      } else if (verificacion.tipo === "fecha") {
        if (verificacion.valor > hoyISO) {
          errores.push({ campo: verificacion.campo, motivo: "fecha_futura" });
        }
      } else if (deducirMoneda(dato.fragmento) === null) {
        errores.push({ campo: verificacion.campo, motivo: "moneda_no_reconocida" });
      }
    }
  }
  return errores;
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
// Validación de la salida del subagente
// ---------------------------------------------------------------------------------------------

function citadosDeSalida(salida: SalidaSubagente): Citado[] {
  const citados: Citado[] = [];
  const simple = (
    nombre: string,
    dato: { fragmento: string } | null,
    extra: Verificacion[] = [],
  ) => {
    if (dato !== null) {
      citados.push({ campo: nombre, fragmento: dato.fragmento, verificaciones: extra });
    }
  };
  const { certificado, extracto } = salida;
  if (certificado !== null) {
    simple("empleador", certificado.empleador);
    simple("cargo", certificado.cargo);
    simple(
      "fechaIngreso",
      certificado.fechaIngreso,
      certificado.fechaIngreso === null
        ? []
        : [{ tipo: "fecha", campo: "fechaIngreso", valor: certificado.fechaIngreso.valor }],
    );
    simple(
      "salario",
      certificado.salario,
      certificado.salario === null
        ? []
        : [{ tipo: "monto", campo: "salario", valor: certificado.salario.valor }],
    );
    simple("moneda", certificado.moneda, [{ tipo: "moneda", campo: "moneda" }]);
  }
  if (extracto !== null) {
    simple("titular", extracto.titular);
    simple(
      "periodo",
      extracto.periodo,
      extracto.periodo === null
        ? []
        : [{ tipo: "fecha", campo: "periodo", valor: extracto.periodo.valor.hasta }],
    );
    simple("moneda", extracto.moneda, [{ tipo: "moneda", campo: "moneda" }]);
    extracto.movimientos.forEach((movimiento, i) => {
      simple(`movimientos.${i}`, movimiento, [
        { tipo: "monto", campo: `movimientos.${i}.valor`, valor: movimiento.valor },
        { tipo: "fecha", campo: `movimientos.${i}.fecha`, valor: movimiento.fecha },
      ]);
    });
  }
  return citados;
}

export type ValidacionSalida =
  { ok: true; salida: SalidaSubagente } | { ok: false; errores: ErrorExtraccion[] };

/**
 * Valida lo que devolvió el subagente, en este orden: esquema, fragmentos presentes en el documento,
 * montos presentes en su fragmento, fechas no futuras y moneda reconocible. Acumula todos los
 * errores, no solo el primero, para que el reintento los corrija de una vez.
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
    ...revisarCitados(citadosDeSalida(valida), documento.contenido, hoy),
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
 * campo y aplica la política (Regla 5). Toda decisión sale de `evaluarDocumento`, no del modelo.
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
  const fragmentoMoneda =
    (salida.certificado?.moneda ?? salida.extracto?.moneda)?.fragmento ?? null;
  const decision = evaluarDocumento({
    tipo: salida.tipo,
    fragmentoMoneda,
    conflictos: salida.conflictos,
    faltantes: camposFaltantes(salida),
    tieneMontos: tieneMontos(salida),
  });

  if (decision.resultado === "no_cubierto") {
    return {
      estado: "no_cubierto",
      ...base,
      causa: decision.causa ?? "documento_no_soportado",
      tipoDetectado: salida.tipo,
      fragmentoMoneda,
    };
  }
  if (decision.resultado === "no_extraible") {
    return { estado: "no_extraible", ...base, conflictos: [...salida.conflictos], ultimoError: [] };
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
  const extraido: DocumentoExtraido | null =
    certificado !== null
      ? {
          tipo: "certificado_laboral",
          empleador: conProcedencia(certificado.empleador),
          cargo: conProcedencia(certificado.cargo),
          fechaIngreso: conProcedencia(certificado.fechaIngreso),
          salario: conProcedencia(certificado.salario),
          moneda: moneda(certificado.moneda),
        }
      : extracto !== null
        ? {
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
          }
        : null;
  if (extraido === null) {
    // Un tipo soportado siempre trae su bloque (lo exige el esquema): esto no debería ocurrir.
    return {
      estado: "no_extraible",
      ...base,
      conflictos: [],
      ultimoError: [
        { campo: "tipo", motivo: "esquema", detalle: "el documento no trae su bloque" },
      ],
    };
  }
  return { estado: "extraido", ...base, documento: extraido, faltantes: decision.faltantes };
}

// ---------------------------------------------------------------------------------------------
// Revalidación de un resultado (core)
// ---------------------------------------------------------------------------------------------

function citadosDeResultado(documento: DocumentoExtraido): Citado[] {
  const citados: Citado[] = [];
  const dato = (
    nombre: string,
    valor: { procedencia: Procedencia } | null,
    verificaciones: Verificacion[] = [],
  ) => {
    if (valor !== null) {
      citados.push({
        campo: `documento.${nombre}`,
        fragmento: valor.procedencia.fragmento,
        verificaciones: verificaciones.map((v) => ({ ...v, campo: `documento.${v.campo}` })),
        procedencia: { adjunto: valor.procedencia.adjunto, nombre: valor.procedencia.nombre },
      });
    }
  };
  if (documento.tipo === "certificado_laboral") {
    dato("empleador", documento.empleador);
    dato("cargo", documento.cargo);
    dato(
      "fechaIngreso",
      documento.fechaIngreso,
      documento.fechaIngreso === null
        ? []
        : [{ tipo: "fecha", campo: "fechaIngreso", valor: documento.fechaIngreso.valor }],
    );
    dato(
      "salario",
      documento.salario,
      documento.salario === null
        ? []
        : [{ tipo: "monto", campo: "salario", valor: documento.salario.valor }],
    );
    dato("moneda", documento.moneda, [{ tipo: "moneda", campo: "moneda" }]);
  } else {
    dato("titular", documento.titular);
    dato(
      "periodo",
      documento.periodo,
      documento.periodo === null
        ? []
        : [{ tipo: "fecha", campo: "periodo", valor: documento.periodo.valor.hasta }],
    );
    dato("moneda", documento.moneda, [{ tipo: "moneda", campo: "moneda" }]);
    documento.movimientos.forEach((movimiento, i) => {
      dato(`movimientos.${i}`, movimiento, [
        { tipo: "monto", campo: `movimientos.${i}.valor`, valor: movimiento.valor },
        { tipo: "fecha", campo: `movimientos.${i}.fecha`, valor: movimiento.fecha },
      ]);
    });
  }
  return citados;
}

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

/** Un resultado `extraido`: fragmentos, montos y periodo contra el documento, y los faltantes de la política. */
function erroresDeExtraido(
  valido: Resultado<"extraido">,
  contenido: string,
  hoy: Date,
): ErrorExtraccion[] {
  const { documento } = valido;
  const errores = revisarCitados(citadosDeResultado(documento), contenido, hoy, {
    adjunto: valido.adjunto,
    nombre: valido.nombre,
  });
  if (documento.tipo === "extracto_bancario") {
    errores.push(
      ...erroresDePeriodo("documento.", documento.periodo?.valor ?? null, documento.movimientos),
    );
  }
  const decision = evaluarDocumento({
    tipo: documento.tipo,
    fragmentoMoneda: documento.moneda?.procedencia.fragmento ?? null,
    conflictos: [],
    faltantes: faltantesDeDocumento(documento),
    tieneMontos: montosDeDocumento(documento),
  });
  const esperados = decision.faltantes.join(",");
  if (decision.resultado !== "extraido" || esperados !== valido.faltantes.join(",")) {
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
