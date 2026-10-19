// Asuntos de un mensaje: catálogos cerrados y funciones puras que dicen qué plantea el solicitante y en
// qué estado quedó cada cosa (specs/014-atencion-mensajes-varios-asuntos: research.md, R1 a R3 y R6;
// contracts/politica.md). Ninguna llama al modelo ni lee el core, y ninguna repite un umbral de
// `politica.ts`: el estado de un asunto es una decisión sobre el caso y sale de código, no del modelo.

import { estaNegado, palabrasDe, type MotivoEscalamiento } from "./escalamiento.ts";

/** Lo que el agente sabe atender en un mensaje; la petición de una persona no es un asunto, es la causa que escala. */
export const ASUNTOS = ["solicitud", "documentos", "cuota"] as const;
export type Asunto = (typeof ASUNTOS)[number];

export const ESTADOS_ASUNTO = ["resuelto", "pendiente", "escalado"] as const;
export type EstadoAsunto = (typeof ESTADOS_ASUNTO)[number];

/** Por qué un asunto sigue pendiente; el texto que ve el solicitante sale de una tabla fija. */
export const MOTIVOS_PENDIENTE = [
  "falta_identidad",
  "falta_dato",
  "lo_revisara_el_analista",
  "sin_atender",
] as const;
export type MotivoPendiente = (typeof MOTIVOS_PENDIENTE)[number];

/** Cómo quedó un asunto: `resultado` solo con `resuelto` y `motivo` solo con `pendiente`. */
export interface AsuntoObservado {
  asunto: Asunto;
  estado: EstadoAsunto;
  resultado?: string;
  motivo?: MotivoPendiente;
}

// ---------------------------------------------------------------------------------------------
// Detección
// ---------------------------------------------------------------------------------------------

/** Palabras que nombran la cuota, normalizadas: minúsculas y sin tildes. */
const PALABRAS_DE_CUOTA: readonly string[] = ["cuota", "cuotas", "mensualidad"];

/** Maneras de preguntar cuánto se pagaría, como secuencias de palabras normalizadas. */
const FRASES_DE_CUOTA: readonly (readonly string[])[] = [
  ["cuanto", "pagaria"],
  ["cuanto", "pagar"],
  ["cuanto", "me", "costaria"],
  ["pago", "mensual"],
];

/** Nombres de lo que se pide: un crédito o un préstamo. */
const NOMBRES_DE_CREDITO: readonly string[] = ["credito", "prestamo"];

/** Verbos que por sí solos inician o piden algo; valen con «crédito», «préstamo» o «solicitud». */
const VERBOS_DE_ACCION: readonly string[] = [
  "pedir",
  "pedirlo",
  "pido",
  "solicitar",
  "solicito",
  "sacar",
  "tramitar",
  "iniciar",
  "registrar",
  "radicar",
  "abrir",
  "hacer",
];

/** Verbos de deseo: piden algo solo con «crédito» o «préstamo» («quiero un crédito»), no con «solicitud». */
const VERBOS_DE_DESEO: readonly string[] = [
  "quiero",
  "quisiera",
  "necesito",
  "deseo",
  "busco",
  "requiero",
];

/** Cuántas palabras antes del nombre se buscan el verbo, sin cruzar el límite de una oración. */
const DISTANCIA_MAXIMA_DEL_VERBO = 4;

const LIMITE_DE_ORACION = "|";

const empiezaCon = (palabras: readonly string[], posicion: number, frase: readonly string[]) =>
  frase.every((palabra, desplazamiento) => palabras[posicion + desplazamiento] === palabra);

/** Si el mensaje pregunta por la cuota, sin una negación inmediata («sin cuota inicial» no cuenta). */
function planteaCuota(palabras: readonly string[]): boolean {
  return palabras.some(
    (palabra, posicion) =>
      (PALABRAS_DE_CUOTA.includes(palabra) ||
        FRASES_DE_CUOTA.some((frase) => empiezaCon(palabras, posicion, frase))) &&
      !estaNegado(palabras, posicion),
  );
}

/**
 * Si hay un verbo que pide algo a pocas palabras antes de la posición, en la misma oración y sin una
 * negación inmediata.
 */
function hayVerboAntes(
  palabras: readonly string[],
  posicion: number,
  verbos: readonly string[],
): boolean {
  for (let i = posicion - 1; i >= Math.max(0, posicion - DISTANCIA_MAXIMA_DEL_VERBO); i--) {
    const palabra = palabras[i];
    if (palabra === undefined || palabra === LIMITE_DE_ORACION) return false;
    if (verbos.includes(palabra) && !estaNegado(palabras, i)) return true;
  }
  return false;
}

/**
 * Si el mensaje pide iniciar una solicitud: «crédito» o «préstamo» con un verbo de acción o de deseo
 * cerca, o «solicitud» con un verbo de acción. «Quiero saber cómo va mi solicitud» es una consulta, no
 * una solicitud nueva.
 */
function planteaSolicitud(palabras: readonly string[]): boolean {
  return palabras.some((palabra, posicion) => {
    if (NOMBRES_DE_CREDITO.includes(palabra)) {
      return hayVerboAntes(palabras, posicion, [...VERBOS_DE_ACCION, ...VERBOS_DE_DESEO]);
    }
    return palabra === "solicitud" && hayVerboAntes(palabras, posicion, VERBOS_DE_ACCION);
  });
}

/**
 * Los asuntos que plantea el mensaje, en el orden del catálogo y sin repetir. `documentos` sale de que
 * haya adjuntos que la Regla 5 aún no revisó, sin mirar el texto; `cuota` y `solicitud` salen de listas
 * cerradas de expresiones. Pura y conservadora, como la Regla 4: lo que no reconoce no inventa un asunto,
 * y lo que el modelo sí atienda aparece igual por sus herramientas.
 */
export function detectarAsuntos(mensaje: string, hayDocumentosNuevos: boolean): Asunto[] {
  const palabras = palabrasDe(mensaje);
  const planteados: Record<Asunto, boolean> = {
    solicitud: planteaSolicitud(palabras),
    documentos: hayDocumentosNuevos,
    cuota: planteaCuota(palabras),
  };
  return ASUNTOS.filter((asunto) => planteados[asunto]);
}

// ---------------------------------------------------------------------------------------------
// Estado
// ---------------------------------------------------------------------------------------------

/** Lo que el adaptador observó de una llamada al core: nunca sus entradas ni datos del solicitante. */
export interface ObservacionLlamada {
  /** Nombre de la llamada al core que ya usa `llamarConReintentos`. */
  herramienta: string;
  ok: boolean;
  codigoError?: string;
  /** Solo de `calcular_capacidad_pago` con éxito. */
  simulacion?: { cuotaMensual: number; aviso: string };
  /** Solo de `registrar_extraccion` con éxito: cuántos campos faltan en el documento. */
  faltantes?: number;
  /** Solo de `registrar_extraccion` con éxito: identifica el documento, para no contarlo dos veces al reextraer. */
  huella?: string;
  /** Solo de `registrar_solicitud` con éxito. */
  idSolicitud?: string;
}

export interface EntradaEstado {
  esperados: readonly Asunto[];
  /** Adjuntos que la Regla 5 aún no había revisado al empezar el turno. */
  documentosNuevos: number;
  observaciones: readonly ObservacionLlamada[];
  /** Herramientas que el control de identidad bloqueó por la Regla 1 en el turno. */
  bloqueosPorIdentidad: readonly string[];
  senales: readonly { motivo: MotivoEscalamiento }[];
  /** Si la identidad del solicitante está verificada; ausente si no se pudo comprobar. */
  identidadVerificada?: boolean;
}

/** Qué asunto muestra cada llamada al core que salió bien o mal. */
const ASUNTO_DE_LLAMADA: Readonly<Record<string, Asunto>> = {
  calcular_capacidad_pago: "cuota",
  registrar_extraccion: "documentos",
  registrar_solicitud: "solicitud",
  preaprobar_credito: "solicitud",
};

/** Qué asunto muestra una herramienta que el control de identidad bloqueó. */
const ASUNTO_DE_BLOQUEO: Readonly<Record<string, Asunto>> = {
  extraer_documento: "documentos",
  verificar_ingreso: "documentos",
  registrar_solicitud: "solicitud",
  preaprobar_credito: "solicitud",
};

/** Errores de validación de la simulación: un dato que el solicitante debe aportar o corregir. */
const ERRORES_DE_DATO_DE_CUOTA: readonly string[] = [
  "monto_invalido",
  "plazo_invalido",
  "ingreso_invalido",
  "formato_invalido",
];

const MOTIVOS_QUE_ESCALAN_DOCUMENTOS: readonly MotivoEscalamiento[] = [
  "caso_no_cubierto",
  "documento_no_extraible",
  "inconsistencia_documental",
];

const MOTIVOS_QUE_ESCALAN_LA_SOLICITUD: readonly MotivoEscalamiento[] = [
  "identidad_ambigua",
  "identidad_no_verificable",
  "discrepancia_de_ingreso",
  "inconsistencia_documental",
  "preaprobacion_fuera_de_politica",
];

const pendiente = (asunto: Asunto, motivo: MotivoPendiente): AsuntoObservado => ({
  asunto,
  estado: "pendiente",
  motivo,
});

const resuelto = (asunto: Asunto, resultado: string): AsuntoObservado => ({
  asunto,
  estado: "resuelto",
  resultado,
});

const escalado = (asunto: Asunto): AsuntoObservado => ({ asunto, estado: "escalado" });

/** Pesos con punto como separador de miles: «$206.723». Determinista, sin depender del idioma del sistema. */
const formatearPesos = (valor: number): string =>
  `$${String(valor).replace(/\B(?=(\d{3})+(?!\d))/g, ".")}`;

const hayMotivo = (entrada: EntradaEstado, motivos: readonly MotivoEscalamiento[]): boolean =>
  entrada.senales.some((senal) => motivos.includes(senal.motivo));

/** El motivo de un asunto sin resultado: falta la identidad si se sabe que no está verificada. */
function motivoSinResultado(
  entrada: EntradaEstado,
  herramientas: readonly string[],
): MotivoPendiente {
  const bloqueado = entrada.bloqueosPorIdentidad.some((h) => herramientas.includes(h));
  return bloqueado || entrada.identidadVerificada === false ? "falta_identidad" : "sin_atender";
}

function estadoCuota(entrada: EntradaEstado): AsuntoObservado {
  const simulada = entrada.observaciones.find(
    (o) => o.herramienta === "calcular_capacidad_pago" && o.ok && o.simulacion !== undefined,
  )?.simulacion;
  if (simulada !== undefined) {
    return resuelto(
      "cuota",
      `cuota mensual simulada de ${formatearPesos(simulada.cuotaMensual)}. ${simulada.aviso}`,
    );
  }
  const faltaUnDato = entrada.observaciones.some(
    (o) =>
      o.herramienta === "calcular_capacidad_pago" &&
      !o.ok &&
      o.codigoError !== undefined &&
      ERRORES_DE_DATO_DE_CUOTA.includes(o.codigoError),
  );
  return pendiente("cuota", faltaUnDato ? "falta_dato" : "sin_atender");
}

function estadoDocumentos(entrada: EntradaEstado): AsuntoObservado {
  if (hayMotivo(entrada, MOTIVOS_QUE_ESCALAN_DOCUMENTOS)) return escalado("documentos");
  const registros = entrada.observaciones.filter(
    (o) => o.herramienta === "registrar_extraccion" && o.ok,
  );
  const faltantes = registros.reduce((total, o) => total + (o.faltantes ?? 0), 0);
  // Un documento reextraído se registra más de una vez: se cuenta por su huella, no por registro.
  const documentos = new Set(registros.map((o, posicion) => o.huella ?? `registro-${posicion}`));
  const registrosEsperados = Math.max(entrada.documentosNuevos, 1);
  if (documentos.size >= registrosEsperados && faltantes === 0) {
    return resuelto("documentos", "listo");
  }
  if (registros.length > 0 && faltantes > 0) return pendiente("documentos", "falta_dato");
  return pendiente(
    "documentos",
    motivoSinResultado(entrada, ["extraer_documento", "verificar_ingreso"]),
  );
}

function estadoSolicitud(entrada: EntradaEstado): AsuntoObservado {
  if (hayMotivo(entrada, MOTIVOS_QUE_ESCALAN_LA_SOLICITUD)) return escalado("solicitud");
  if (entrada.observaciones.some((o) => o.herramienta === "preaprobar_credito" && o.ok)) {
    return resuelto("solicitud", "preaprobada");
  }
  const registro = entrada.observaciones.find(
    (o) => o.herramienta === "registrar_solicitud" && o.ok,
  );
  if (registro !== undefined) {
    return resuelto(
      "solicitud",
      registro.idSolicitud === undefined ? "registrada" : `registrada (${registro.idSolicitud})`,
    );
  }
  return pendiente(
    "solicitud",
    motivoSinResultado(entrada, ["registrar_solicitud", "preaprobar_credito"]),
  );
}

const ESTADO_DE_ASUNTO: Readonly<Record<Asunto, (entrada: EntradaEstado) => AsuntoObservado>> = {
  solicitud: estadoSolicitud,
  documentos: estadoDocumentos,
  cuota: estadoCuota,
};

/**
 * El estado de cada asunto del turno: los esperados por el mensaje más los que muestran las llamadas
 * al core y los bloqueos, en el orden del catálogo y sin repetir. La petición de una persona (Regla 4)
 * deja todos pendientes para el analista, sin mirar nada más. No decide el escalamiento: lo lee de
 * las señales.
 */
export function estadoDeAsuntos(entrada: EntradaEstado): AsuntoObservado[] {
  const delTurno = new Set<Asunto>(entrada.esperados);
  for (const observacion of entrada.observaciones) {
    const asunto = ASUNTO_DE_LLAMADA[observacion.herramienta];
    if (asunto !== undefined) delTurno.add(asunto);
  }
  for (const herramienta of entrada.bloqueosPorIdentidad) {
    const asunto = ASUNTO_DE_BLOQUEO[herramienta];
    if (asunto !== undefined) delTurno.add(asunto);
  }
  const asuntos = ASUNTOS.filter((asunto) => delTurno.has(asunto));
  if (hayMotivo(entrada, ["pide_persona"])) {
    return asuntos.map((asunto) => pendiente(asunto, "lo_revisara_el_analista"));
  }
  return asuntos.map((asunto) => ESTADO_DE_ASUNTO[asunto](entrada));
}

/** Los asuntos en estado pendiente, en el orden del catálogo: lo que el analista recibe como pendiente. */
export function asuntosPendientes(asuntos: readonly AsuntoObservado[]): Asunto[] {
  return ASUNTOS.filter((asunto) =>
    asuntos.some((a) => a.asunto === asunto && a.estado === "pendiente"),
  );
}
