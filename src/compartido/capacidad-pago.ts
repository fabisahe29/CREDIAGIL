// Simulación de capacidad de pago: contrato de la herramienta `calcular_capacidad_pago` (specs/010-
// simulacion-cuota-capacidad-pago: data-model.md; contracts/core-mcp.md; research.md, R5). Lo usan el
// servidor MCP, el cliente y el adaptador del agente: la descripción que lee el modelo está escrita
// una sola vez, y una respuesta que no cumple el esquema no se adivina (Principio III).

import { z } from "zod";
import { errorValidacion, type ErrorCore } from "./errores.ts";

/** Quién respalda el ingreso de la simulación; lo decide el core, nunca el modelo (R3). */
export const FUENTES_INGRESO = ["declarado", "verificado"] as const;
export type FuenteIngreso = (typeof FUENTES_INGRESO)[number];

/** Avisos por fuente de ingreso. Los pone el código: el modelo no los redacta (FR-008, FR-014). */
export const AVISOS_CAPACIDAD_PAGO: Readonly<Record<FuenteIngreso, string>> = {
  declarado:
    "Simulación no vinculante con el ingreso que declaraste, que no está verificado. No reemplaza la verificación de tu ingreso con documentos ni una preaprobación.",
  verificado:
    "Simulación no vinculante con tu ingreso verificado. No es una preaprobación: la decisión la toma la política de crédito con tu solicitud.",
};

/**
 * Lo que lee el modelo para elegir entre simular y preaprobar (FR-007; research.md, R7). Dice qué
 * hace, qué no hace y cuándo corresponde cada herramienta, sin dar los umbrales de la Regla 2: con
 * ellos el modelo concluiría «sí califica» a partir de la proporción.
 */
export const DESCRIPCION_CAPACIDAD_PAGO =
  "Solo simula: calcula la cuota mensual fija y qué proporción del ingreso mensual representa, con la tasa fija de Crediágil, para un monto, un plazo en meses y un ingreso. No registra, no reserva ni compromete nada, y puede usarse sin identidad verificada. No reemplaza a preaprobar_credito: usa esta herramienta cuando el solicitante explora o pregunta cuánto pagaría al mes; preaprobar_credito corresponde solo con una solicitud con identidad e ingreso verificados. El resultado no es una decisión de crédito: preséntalo siempre como una simulación no vinculante y repite su aviso.";

const enteroPositivo = z.int().positive();
const correlationId = z.uuid();

export const esquemaEntradaCapacidadPago = z.strictObject({
  monto: enteroPositivo,
  plazoMeses: enteroPositivo,
  ingresoMensual: enteroPositivo,
  correlationId,
});
export type EntradaCapacidadPago = z.infer<typeof esquemaEntradaCapacidadPago>;

/** Cada campo, en el orden en que se informa el primero inválido, con su error. */
const CAMPOS = [
  ["monto", enteroPositivo, "monto_invalido", "El monto debe ser un entero de pesos mayor que 0."],
  [
    "plazoMeses",
    enteroPositivo,
    "plazo_invalido",
    "El plazo debe ser un entero de meses mayor que 0.",
  ],
  [
    "ingresoMensual",
    enteroPositivo,
    "ingreso_invalido",
    "El ingreso mensual es obligatorio y debe ser un entero de pesos mayor que 0.",
  ],
  ["correlationId", correlationId, "formato_invalido", "El correlationId debe ser un UUID."],
] as const;

export type ValidacionCapacidadPago =
  { ok: true; entrada: EntradaCapacidadPago } | { ok: false; error: ErrorCore };

/**
 * Valida la entrada de la herramienta: devuelve la entrada tipada o el error de validación (no
 * reintentable) del primer campo inválido. Un campo de más se informa al final. Nunca completa ni
 * corrige un dato (Principio III).
 */
export function validarEntradaCapacidadPago(entrada: unknown): ValidacionCapacidadPago {
  if (typeof entrada !== "object" || entrada === null || Array.isArray(entrada)) {
    return {
      ok: false,
      error: errorValidacion(
        "formato_invalido",
        "La entrada de calcular_capacidad_pago debe ser un objeto.",
        "entrada",
      ),
    };
  }
  const objeto = entrada as Record<string, unknown>;
  for (const [campo, esquema, codigo, mensaje] of CAMPOS) {
    if (!esquema.safeParse(objeto[campo]).success) {
      return { ok: false, error: errorValidacion(codigo, mensaje, campo) };
    }
  }
  const sobrante = Object.keys(objeto).find(
    (campo) => !CAMPOS.some(([nombre]) => nombre === campo),
  );
  if (sobrante !== undefined) {
    return {
      ok: false,
      error: errorValidacion(
        "formato_invalido",
        `La entrada de calcular_capacidad_pago no admite el campo ${sobrante}.`,
        sobrante,
      ),
    };
  }
  return { ok: true, entrada: esquemaEntradaCapacidadPago.parse(objeto) };
}

export const esquemaSimulacionCapacidadPago = z.strictObject({
  tipo: z.literal("simulacion"),
  vinculante: z.literal(false),
  monto: enteroPositivo,
  plazoMeses: enteroPositivo,
  ingresoMensual: enteroPositivo,
  fuenteIngreso: z.enum(FUENTES_INGRESO),
  /** La tasa aplicada, en puntos base mensuales, tomada de la política. */
  tasaMensualPuntosBase: enteroPositivo,
  cuotaMensual: enteroPositivo,
  /** `cuotaMensual / ingresoMensual · 100`, con dos decimales y calculado con enteros. */
  relacionCuotaIngresoPorcentaje: z.number().min(0),
  aviso: z.string().min(1),
  versionPolitica: z.string().min(1),
});
export type SimulacionCapacidadPago = z.infer<typeof esquemaSimulacionCapacidadPago>;
