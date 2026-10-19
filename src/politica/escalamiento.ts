// Escalamiento: catálogos cerrados y funciones puras que deducen la causa, la acción recomendada y la
// regla de cada motivo (specs/013-escalamiento-analista: research.md, R1, R2 y R14; contracts/politica.md).
// Es la única fuente de los motivos de escalamiento y de su regla: el core, el agente y las pruebas
// llaman a las mismas funciones, así que no pueden discrepar. Ninguna llama al modelo ni lee el core.
// Los umbrales de la política no se repiten aquí: siguen solo en `politica.ts`.

import { MAX_INTENTOS_VERIFICACION } from "./politica.ts";
import { REGLA_PRINCIPIO_V, REGLA_5 } from "./documentos.ts";
import { REGLA_3 } from "./ingreso.ts";
import { REGLA_2, type CodigoBloqueo } from "./preaprobacion.ts";

/** Las cinco causas de la spec; la causa de un escalamiento es siempre una de estas. */
export const CAUSAS_ESCALAMIENTO = [
  "peticion_de_persona",
  "monto_sobre_umbral",
  "cuota_sobre_porcentaje",
  "discrepancia_de_ingreso",
  "caso_no_cubierto",
] as const;
export type CausaEscalamiento = (typeof CAUSAS_ESCALAMIENTO)[number];

/** Los doce motivos de la señal de escalamiento del agente; el motivo conserva el detalle de la causa. */
export const MOTIVOS_ESCALAMIENTO = [
  "pide_persona",
  "caso_no_cubierto",
  "identidad_ambigua",
  "identidad_no_verificable",
  "discrepancia_de_ingreso",
  "inconsistencia_documental",
  "documento_no_extraible",
  "preaprobacion_fuera_de_politica",
  "falla_transitoria_persistente",
  "falla_del_agente",
  "limite_de_turnos",
  "respuesta_incompleta",
] as const;
export type MotivoEscalamiento = (typeof MOTIVOS_ESCALAMIENTO)[number];

/** Las acciones recomendadas: las cuatro de la aclaración Q2 del #15 y tres para lo que Q2 no nombra. */
export const ACCIONES_RECOMENDADAS = [
  "contactar_al_solicitante",
  "revisar_con_simulacion_de_cuota",
  "verificar_ingresos_con_soporte",
  "revisar_tipo_de_documento_o_moneda",
  "revisar_documentos_manualmente",
  "verificar_identidad_manualmente",
  "atender_falla_tecnica",
] as const;
export type AccionRecomendada = (typeof ACCIONES_RECOMENDADAS)[number];

/** Lo que puede faltar en un resumen para el analista. */
export const PENDIENTES = [
  "identidad",
  "monto",
  "plazo",
  "ingreso_verificado",
  "documentos",
] as const;
export type Pendiente = (typeof PENDIENTES)[number];

/** Regla 4: si el solicitante pide explícitamente hablar con una persona, se escala de inmediato. */
export const REGLA_4 = "Regla 4 · el solicitante pide hablar con una persona";

/** Nombre con el que ya importan la Regla 4 el adaptador y sus pruebas. */
export const REGLA_PIDE_PERSONA = REGLA_4;

export const REGLA_AMBIGUA = "Regla 1 · coincidencias sin desambiguar";
export const REGLA_NO_VERIFICABLE = `Regla 1 · ${MAX_INTENTOS_VERIFICACION} intentos fallidos de verificación`;
export const REGLA_NO_EXTRAIBLE = `${REGLA_PRINCIPIO_V} · documento no extraíble`;

const REGLAS: Readonly<Record<MotivoEscalamiento, string>> = {
  pide_persona: REGLA_4,
  caso_no_cubierto: REGLA_5,
  identidad_ambigua: REGLA_AMBIGUA,
  identidad_no_verificable: REGLA_NO_VERIFICABLE,
  discrepancia_de_ingreso: REGLA_3,
  inconsistencia_documental: REGLA_3,
  documento_no_extraible: REGLA_NO_EXTRAIBLE,
  preaprobacion_fuera_de_politica: REGLA_2,
  falla_transitoria_persistente: "constitución, Principio VI · reintentos agotados",
  falla_del_agente: "constitución, Principio VI · reintento del modelo agotado",
  limite_de_turnos: "FR-003 · límite de seguridad del ciclo",
  respuesta_incompleta: "FR-004 · razón de parada inesperada",
};

/** El texto de la regla que se audita para un motivo. */
export const reglaDeEscalamiento = (motivo: MotivoEscalamiento): string => REGLAS[motivo];

/** Regla de negocio de cada motivo; los técnicos y el documento no extraíble no tienen. */
export const ORDEN_REGLA: Partial<Record<MotivoEscalamiento, 1 | 2 | 3 | 4 | 5>> = {
  pide_persona: 4,
  caso_no_cubierto: 5,
  identidad_ambigua: 1,
  identidad_no_verificable: 1,
  discrepancia_de_ingreso: 3,
  inconsistencia_documental: 3,
  preaprobacion_fuera_de_politica: 2,
};

/**
 * Las causas cuyo resumen lleva la decisión de la Regla 2 recalculada con la solicitud registrada:
 * el monto, la cuota y la discrepancia de ingreso son lo que esa regla decide (#15, R3).
 */
export const CAUSAS_CON_DECISION_DE_LA_REGLA_2: readonly CausaEscalamiento[] = [
  "monto_sobre_umbral",
  "cuota_sobre_porcentaje",
  "discrepancia_de_ingreso",
];

/** Lo que clasifica un escalamiento: el motivo de la señal y, solo con la Regla 2, el código del bloqueo. */
export interface Clasificacion {
  motivo: MotivoEscalamiento;
  codigo?: CodigoBloqueo;
}

const CAUSA_POR_CODIGO: Readonly<Record<CodigoBloqueo, CausaEscalamiento>> = {
  monto_sobre_tope: "monto_sobre_umbral",
  cuota_sobre_porcentaje: "cuota_sobre_porcentaje",
  discrepancia_registrada: "discrepancia_de_ingreso",
  ingreso_no_verificado: "caso_no_cubierto",
  cuota_no_calculable: "caso_no_cubierto",
};

const ACCION_POR_CODIGO: Readonly<Record<CodigoBloqueo, AccionRecomendada>> = {
  monto_sobre_tope: "revisar_con_simulacion_de_cuota",
  cuota_sobre_porcentaje: "revisar_con_simulacion_de_cuota",
  discrepancia_registrada: "verificar_ingresos_con_soporte",
  ingreso_no_verificado: "revisar_documentos_manualmente",
  cuota_no_calculable: "revisar_con_simulacion_de_cuota",
};

const CAUSA_POR_MOTIVO: Readonly<
  Record<Exclude<MotivoEscalamiento, "preaprobacion_fuera_de_politica">, CausaEscalamiento>
> = {
  pide_persona: "peticion_de_persona",
  discrepancia_de_ingreso: "discrepancia_de_ingreso",
  caso_no_cubierto: "caso_no_cubierto",
  inconsistencia_documental: "caso_no_cubierto",
  documento_no_extraible: "caso_no_cubierto",
  identidad_ambigua: "caso_no_cubierto",
  identidad_no_verificable: "caso_no_cubierto",
  falla_transitoria_persistente: "caso_no_cubierto",
  falla_del_agente: "caso_no_cubierto",
  limite_de_turnos: "caso_no_cubierto",
  respuesta_incompleta: "caso_no_cubierto",
};

const ACCION_POR_MOTIVO: Readonly<
  Record<Exclude<MotivoEscalamiento, "preaprobacion_fuera_de_politica">, AccionRecomendada>
> = {
  pide_persona: "contactar_al_solicitante",
  discrepancia_de_ingreso: "verificar_ingresos_con_soporte",
  caso_no_cubierto: "revisar_tipo_de_documento_o_moneda",
  inconsistencia_documental: "revisar_documentos_manualmente",
  documento_no_extraible: "revisar_documentos_manualmente",
  identidad_ambigua: "verificar_identidad_manualmente",
  identidad_no_verificable: "verificar_identidad_manualmente",
  falla_transitoria_persistente: "atender_falla_tecnica",
  falla_del_agente: "atender_falla_tecnica",
  limite_de_turnos: "atender_falla_tecnica",
  respuesta_incompleta: "atender_falla_tecnica",
};

/**
 * Elige por código (solo la preaprobación fuera de política lo trae, y siempre) o por motivo. Una
 * combinación imposible es un error de programación, no una entrada para adivinar.
 */
function resolver<T>(
  { motivo, codigo }: Clasificacion,
  porCodigo: Readonly<Record<CodigoBloqueo, T>>,
  porMotivo: Readonly<Record<Exclude<MotivoEscalamiento, "preaprobacion_fuera_de_politica">, T>>,
): T {
  if (motivo === "preaprobacion_fuera_de_politica") {
    if (codigo === undefined) throw new Error(`el motivo ${motivo} exige el código del bloqueo`);
    return porCodigo[codigo];
  }
  if (codigo !== undefined) throw new Error(`el motivo ${motivo} no lleva código de bloqueo`);
  return porMotivo[motivo];
}

/** La causa cerrada de un escalamiento, deducida del motivo de la señal y del código de la Regla 2. */
export const causaDeEscalamiento = (clasificacion: Clasificacion): CausaEscalamiento =>
  resolver(clasificacion, CAUSA_POR_CODIGO, CAUSA_POR_MOTIVO);

/** La acción recomendada al analista: fija por motivo y código, nunca redactada por el agente. */
export const accionRecomendada = (clasificacion: Clasificacion): AccionRecomendada =>
  resolver(clasificacion, ACCION_POR_CODIGO, ACCION_POR_MOTIVO);
// ---------------------------------------------------------------------------------------------
// Regla 4: la petición explícita de una persona, detectada por código antes del modelo
// ---------------------------------------------------------------------------------------------

/** Palabras que anulan un verbo si están justo antes de él, en la misma oración. */
const NEGACIONES: readonly string[] = ["no", "ni", "sin", "nunca", "tampoco", "jamas"];

/**
 * Verbos que por sí solos piden hablar con alguien, normalizados: minúsculas y sin tildes. Con uno de
 * estos, el nombre de la persona puede ir a pocas palabras («hablar con una persona»).
 */
const VERBOS_DE_CONTACTO: readonly string[] = [
  "hablar",
  "hablarme",
  "hablarle",
  "conversar",
  "comunicar",
  "comunicarme",
  "comunicame",
  "comunique",
  "comuniquen",
  "contactar",
  "contactarme",
  "contactame",
  "contacte",
  "contacten",
  "pasar",
  "pasame",
  "pasarme",
  "pase",
  "pasen",
  "transferir",
  "transferirme",
  "transfiereme",
  "transfiera",
  "transfieran",
  "atender",
  "atienda",
  "atiendan",
  "atiendame",
];

/**
 * Verbos de deseo. Solos no piden una persona («quiero un crédito»): cuentan solo si el nombre de la
 * persona va justo después («necesito un asesor»).
 */
const VERBOS_DE_DESEO: readonly string[] = [
  "quiero",
  "quisiera",
  "necesito",
  "prefiero",
  "deseo",
  "solicito",
  "exijo",
  "pido",
];

/** Maneras de nombrar a una persona, como secuencias de palabras normalizadas. */
const SUSTANTIVOS_DE_PERSONA: readonly (readonly string[])[] = [
  ["una", "persona"],
  ["un", "humano"],
  ["una", "humana"],
  ["un", "agente", "humano"],
  ["un", "asesor"],
  ["una", "asesora"],
  ["un", "analista"],
  ["una", "analista"],
  ["un", "ejecutivo"],
  ["una", "ejecutiva"],
  ["un", "representante"],
  ["alguien", "real"],
  ["alguien", "de", "carne", "y", "hueso"],
];

/** «Una persona natural» o «jurídica» es una clase de solicitante, no alguien con quien hablar. */
const CLASES_DE_PERSONA: readonly string[] = ["natural", "juridica", "juridico", "moral"];

/** Con un verbo de contacto, el nombre de la persona debe empezar a esta distancia o menos. */
const DISTANCIA_MAXIMA_CON_VERBO_DE_CONTACTO = 4;

/** Cuántas palabras antes del verbo se miran en busca de una negación. */
const VENTANA_DE_NEGACION = 3;

/** Marca el límite entre oraciones: una negación no lo cruza. */
const LIMITE = "|";

/**
 * Palabras en minúsculas y sin tildes, sin espacios repetidos. Los signos que cierran una oración o
 * una pausa se conservan como `LIMITE`: «No, quiero hablar con una persona» no niega la petición.
 */
export function palabrasDe(texto: string): string[] {
  return texto
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[,.;:!?¿¡()]/gu, ` ${LIMITE} `)
    .replace(/[^\p{L}\p{N}\s|]/gu, " ")
    .split(/\s+/)
    .filter((palabra) => palabra !== "");
}

/** Posiciones donde empieza una manera de nombrar a una persona, sin las clases de solicitante. */
function posicionesDeSustantivo(palabras: readonly string[]): number[] {
  const posiciones: number[] = [];
  for (let inicio = 0; inicio < palabras.length; inicio++) {
    const frase = SUSTANTIVOS_DE_PERSONA.find((candidata) =>
      candidata.every((palabra, desplazamiento) => palabras[inicio + desplazamiento] === palabra),
    );
    if (frase === undefined) continue;
    const siguiente = palabras[inicio + frase.length];
    if (siguiente !== undefined && CLASES_DE_PERSONA.includes(siguiente)) continue;
    posiciones.push(inicio);
  }
  return posiciones;
}

/** Si hay una negación en las tres palabras anteriores al verbo, sin cruzar el límite de una oración. */
export function estaNegado(palabras: readonly string[], posicion: number): boolean {
  for (let i = posicion - 1; i >= Math.max(0, posicion - VENTANA_DE_NEGACION); i--) {
    if (palabras[i] === LIMITE) return false;
    if (NEGACIONES.includes(palabras[i]!)) return true;
  }
  return false;
}

/**
 * Regla 4: si el mensaje pide explícitamente hablar con una persona. Hace falta un verbo ligado a la
 * persona: uno de contacto («hablar», «pasar», «atender») con el nombre de la persona a cuatro palabras
 * o menos, o uno de deseo («necesito») con el nombre justo después; y sin una negación en las tres
 * palabras anteriores, dentro de la misma oración. «Una persona natural» no cuenta. Pura y
 * conservadora: lo que no reconoce lo decide el modelo con `solicitar_analista`.
 */
export function detectarPeticionPersona(texto: string): boolean {
  const palabras = palabrasDe(texto);
  const sustantivos = posicionesDeSustantivo(palabras);
  if (sustantivos.length === 0) return false;
  return palabras.some((palabra, posicion) => {
    const contacto = VERBOS_DE_CONTACTO.includes(palabra);
    const deseo = VERBOS_DE_DESEO.includes(palabra);
    if (!contacto && !deseo) return false;
    if (estaNegado(palabras, posicion)) return false;
    return sustantivos.some((destino) => {
      const distancia = destino - posicion;
      return contacto
        ? distancia > 0 && distancia <= DISTANCIA_MAXIMA_CON_VERBO_DE_CONTACTO
        : distancia === 1;
    });
  });
}
