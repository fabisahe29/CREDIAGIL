// Registro de la solicitud con procedencia: contrato de las herramientas `registrar_solicitud` y
// `consultar_solicitud_registrada` (specs/011-registro-solicitud-procedencia: data-model.md;
// contracts/core-mcp.md; research.md, R2, R3, R6 y R8). Lo usan el core, el servidor MCP, el cliente y
// el adaptador del agente: la descripción que lee el modelo está escrita una sola vez, y una respuesta
// que no cumple el esquema no se adivina (Principio III).

import { z } from "zod";
import { errorValidacion, type ErrorCore } from "./errores.ts";
import { huella, esquemaRegistroExtraccion } from "./extraccion.ts";
import { esquemaPreaprobacion } from "./preaprobacion.ts";
import {
  ESTADOS_VERIFICACION,
  esquemaDiscrepancia,
  esquemaInconsistencia,
  esquemaIngresoVerificado,
} from "./ingreso.ts";
import { LARGO_MAXIMO_FRAGMENTO } from "../politica/documentos.ts";

/** Lo que lee el modelo sobre `registrar_solicitud`: qué hace, qué exige y qué no decide (R1, R2). */
export const DESCRIPCION_REGISTRAR_SOLICITUD =
  "Registra la solicitud de un solicitante con identidad verificada, con el origen de cada dato. Exige la identidad verificada de ese solicitante; sin ella se rechaza. El ingreso verificado, las discrepancias y los datos extraídos de los documentos los toma el core de su propio estado: no se envían. Es idempotente: repetirla con los mismos datos devuelve la solicitud ya registrada. Un dato sin origen, o con uno que no se puede comprobar, se rechaza y no se guarda nada. Registrar no aprueba ni rechaza: no decide el crédito.";

// ---------------------------------------------------------------------------------------------
// Procedencia
// ---------------------------------------------------------------------------------------------

const fragmento = z.string().min(1).max(LARGO_MAXIMO_FRAGMENTO);

/** Lo que el solicitante dijo en la conversación. */
const procedenciaAfirmacion = z.strictObject({ tipo: z.literal("afirmacion"), fragmento });

/** Lo que salió de un documento extraído de la conversación. */
const procedenciaDocumento = z.strictObject({
  tipo: z.literal("documento"),
  adjunto: z.int().min(1),
  nombre: z.string().min(1).max(255),
  fragmento,
});

/** El origen de un dato del registro: una afirmación del solicitante o un documento (R3). */
export const esquemaProcedenciaRegistro = z.discriminatedUnion("tipo", [
  procedenciaAfirmacion,
  procedenciaDocumento,
]);
export type ProcedenciaRegistro = z.infer<typeof esquemaProcedenciaRegistro>;

/** Los datos de la solicitud que llevan la procedencia que envía el llamador. */
export const DATOS_CON_PROCEDENCIA = ["monto", "plazoMeses", "ingresoDeclarado"] as const;
export type DatoConProcedencia = (typeof DATOS_CON_PROCEDENCIA)[number];

const NOMBRES_DATO: Readonly<Record<DatoConProcedencia, string>> = {
  monto: "el monto",
  plazoMeses: "el plazo",
  ingresoDeclarado: "el ingreso declarado",
};

export type ValidacionProcedencia =
  { ok: true; procedencia: ProcedenciaRegistro } | { ok: false; error: ErrorCore };

/**
 * Valida la procedencia de un dato: ausente o nula es `procedencia_faltante`, y mal formada es
 * `procedencia_invalida`, las dos de validación, no reintentables y con el campo `procedencia.<dato>`.
 * El mensaje nombra el dato y nunca repite el fragmento (Principio VI).
 */
export function validarProcedenciaDato(
  dato: DatoConProcedencia,
  valor: unknown,
): ValidacionProcedencia {
  const campo = `procedencia.${dato}`;
  if (valor === undefined || valor === null) {
    return {
      ok: false,
      error: errorValidacion(
        "procedencia_faltante",
        `Falta el origen de ${NOMBRES_DATO[dato]}: cita lo que dijo el solicitante o el documento del que salió.`,
        campo,
      ),
    };
  }
  const analisis = esquemaProcedenciaRegistro.safeParse(valor);
  if (!analisis.success) {
    return {
      ok: false,
      error: errorValidacion(
        "procedencia_invalida",
        `El origen de ${NOMBRES_DATO[dato]} no es válido: debe ser una cita literal del solicitante o un documento de la conversación, de 1 a ${LARGO_MAXIMO_FRAGMENTO} caracteres.`,
        campo,
      ),
    };
  }
  return { ok: true, procedencia: analisis.data };
}

// ---------------------------------------------------------------------------------------------
// Entrada de `registrar_solicitud`
// ---------------------------------------------------------------------------------------------

const enteroPositivo = z.int().positive();
const FORMA_ID_SOLICITANTE = /^CLI-000\d{7}$/;

/**
 * Lo que recibe `registrar_solicitud`. No hay campos para el ingreso verificado, las discrepancias, los
 * datos extraídos, el solicitante ni el ingreso declarado: los toma el core (R2).
 */
export const esquemaEntradaRegistroSolicitud = z.strictObject({
  correlationId: z.uuid(),
  idSolicitante: z.string().regex(FORMA_ID_SOLICITANTE),
  monto: enteroPositivo,
  plazoMeses: enteroPositivo,
  claveIdempotencia: z.string().min(1).max(64),
  procedencia: z.strictObject({
    monto: esquemaProcedenciaRegistro,
    plazoMeses: esquemaProcedenciaRegistro,
    ingresoDeclarado: esquemaProcedenciaRegistro.optional(),
  }),
});
export type EntradaRegistroSolicitud = z.infer<typeof esquemaEntradaRegistroSolicitud>;

/** La entrada una vez comprobada la forma; la procedencia se valida después, dato por dato. */
export interface FormaRegistroSolicitud {
  correlationId: string;
  idSolicitante: string;
  monto: number;
  plazoMeses: number;
  claveIdempotencia: string;
  procedencia: unknown;
}

export type ValidacionForma =
  { ok: true; entrada: FormaRegistroSolicitud } | { ok: false; error: ErrorCore };

const CAMPOS_FORMA = [
  ["correlationId", z.uuid(), "formato_invalido", "El correlationId debe ser un UUID."],
  [
    "idSolicitante",
    z.string().regex(FORMA_ID_SOLICITANTE),
    "formato_invalido",
    "El identificador de solicitante debe tener la forma CLI- seguida de 10 dígitos.",
  ],
  ["monto", enteroPositivo, "monto_invalido", "El monto debe ser un entero de pesos mayor que 0."],
  [
    "plazoMeses",
    enteroPositivo,
    "plazo_invalido",
    "El plazo debe ser un entero de meses mayor que 0.",
  ],
  [
    "claveIdempotencia",
    z.string().min(1).max(64),
    "formato_invalido",
    "La clave de idempotencia debe tener de 1 a 64 caracteres.",
  ],
] as const;

const CAMPOS_CONOCIDOS: readonly string[] = [
  ...CAMPOS_FORMA.map(([campo]) => campo),
  "procedencia",
];

/**
 * Comprueba la forma de la entrada, sin mirar la procedencia: el primer campo inválido, en el orden
 * del contrato, con su código; un campo de más se informa al final. Nunca completa ni corrige un dato.
 */
export function validarFormaRegistroSolicitud(entrada: unknown): ValidacionForma {
  if (typeof entrada !== "object" || entrada === null || Array.isArray(entrada)) {
    return {
      ok: false,
      error: errorValidacion(
        "formato_invalido",
        "La entrada de registrar_solicitud debe ser un objeto.",
        "entrada",
      ),
    };
  }
  const objeto = entrada as Record<string, unknown>;
  for (const [campo, esquema, codigo, mensaje] of CAMPOS_FORMA) {
    if (!esquema.safeParse(objeto[campo]).success) {
      return { ok: false, error: errorValidacion(codigo, mensaje, campo) };
    }
  }
  const extra = Object.keys(objeto).find((campo) => !CAMPOS_CONOCIDOS.includes(campo));
  if (extra !== undefined) {
    return {
      ok: false,
      error: errorValidacion(
        "formato_invalido",
        `El campo ${extra} no existe en registrar_solicitud: el core lo toma de su estado.`,
        extra,
      ),
    };
  }
  return {
    ok: true,
    entrada: {
      correlationId: objeto["correlationId"] as string,
      idSolicitante: objeto["idSolicitante"] as string,
      monto: objeto["monto"] as number,
      plazoMeses: objeto["plazoMeses"] as number,
      claveIdempotencia: objeto["claveIdempotencia"] as string,
      procedencia: objeto["procedencia"],
    },
  };
}

/** Clave de idempotencia de una solicitud: la misma para los mismos datos, entre turnos (R6). */
export const claveIdempotenciaSolicitud = (
  idSolicitante: string,
  monto: number,
  plazoMeses: number,
): string => huella(JSON.stringify([idSolicitante, monto, plazoMeses]));

// ---------------------------------------------------------------------------------------------
// Solicitud registrada
// ---------------------------------------------------------------------------------------------

/** Un valor de la solicitud junto con su procedencia: un dato sin procedencia no existe. */
const datoRegistrado = <T extends z.ZodType>(valor: T) =>
  z.strictObject({ valor, procedencia: esquemaProcedenciaRegistro });

const CON_INGRESO: readonly string[] = ["verificado", "discrepancia", "falta_declarado"];

/** La copia de la última verificación de ingreso del mismo solicitante (data-model.md). */
export const esquemaVerificacionRegistrada = z
  .strictObject({
    estado: z.enum(ESTADOS_VERIFICACION),
    ingresoVerificado: esquemaIngresoVerificado.nullable(),
    discrepancia: esquemaDiscrepancia
      .extend({ diferenciaPorcentaje: z.number().min(0) })
      .nullable(),
    inconsistencias: z.array(esquemaInconsistencia),
    sinContrastar: z.array(z.string()),
    calculadaEn: z.iso.datetime(),
  })
  .superRefine((v, ctx) => {
    if (CON_INGRESO.includes(v.estado) !== (v.ingresoVerificado !== null)) {
      ctx.addIssue({
        code: "custom",
        path: ["ingresoVerificado"],
        message: "el ingreso va con verificado, discrepancia y falta_declarado",
      });
    }
  });
export type VerificacionRegistrada = z.infer<typeof esquemaVerificacionRegistrada>;

export const esquemaSolicitudRegistrada = z
  .strictObject({
    idSolicitud: z.string().regex(/^SOL-000\d{7}$/),
    correlationId: z.uuid(),
    claveIdempotencia: z.string().min(1).max(64),
    estado: z.enum(["en_estudio", "preaprobada"]),
    registradaEn: z.iso.datetime(),
    solicitante: z.strictObject({
      idSolicitante: z.string().regex(FORMA_ID_SOLICITANTE),
      nombre: z.string().min(1),
      documentoEnmascarado: z.string().min(1),
    }),
    monto: datoRegistrado(enteroPositivo),
    plazoMeses: datoRegistrado(enteroPositivo),
    ingresoDeclarado: datoRegistrado(z.int().min(0)).nullable(),
    verificacionIngreso: esquemaVerificacionRegistrada.nullable(),
    datosExtraidos: z
      .array(esquemaRegistroExtraccion)
      .refine((registros) => registros.every((r) => r.estado === "extraido"), {
        message: "los datos extraídos solo incluyen documentos extraídos",
      }),
    /** La constancia de la preaprobación (#14), o `null` mientras la solicitud sigue en estudio. */
    preaprobacion: esquemaPreaprobacion.nullable(),
    versionPolitica: z.string().min(1),
  })
  .refine((s) => (s.estado === "preaprobada") === (s.preaprobacion !== null), {
    message: "el estado preaprobada y la constancia de la preaprobación van juntos",
    path: ["preaprobacion"],
  });
export type SolicitudRegistrada = z.infer<typeof esquemaSolicitudRegistrada>;

/** Lo que devuelve `registrar_solicitud` en `datos`. */
export const esquemaResultadoRegistro = z.strictObject({
  solicitud: esquemaSolicitudRegistrada,
  repetida: z.boolean(),
});
export type ResultadoRegistro = z.infer<typeof esquemaResultadoRegistro>;

// ---------------------------------------------------------------------------------------------
// Citas
// ---------------------------------------------------------------------------------------------

/** Minúsculas, sin tildes y con los espacios colapsados: para comparar una cita con un texto. */
const comparable = (texto: string): string =>
  texto
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

/**
 * La cita aparece, literal, en alguno de los textos, sin importar tildes, mayúsculas ni espacios
 * (R3). Una cita vacía no aparece en ninguno.
 */
export function contieneFragmento(textos: readonly string[], cita: string): boolean {
  const buscada = comparable(cita);
  if (buscada === "") return false;
  return textos.some((texto) => comparable(texto).includes(buscada));
}
