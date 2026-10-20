// Tipos del informe de la entrega (specs/017-paquete-de-entrega: data-model.md).
// Un hallazgo bloquea; una comprobación que no se pudo hacer nunca cuenta como éxito.

/** Un archivo dentro del `.zip`. */
export interface EntradaZip {
  /** Ruta relativa a la raíz del repositorio, siempre con `/`. */
  ruta: string;
  /** Bytes sin comprimir. */
  tamano: number;
  contenido: Uint8Array;
}

export const TIPOS_HALLAZGO = [
  "nombre-prohibido",
  "falta-git",
  "peso",
  "secreto",
  "spec-incompleta",
  "historial",
] as const;
export type TipoHallazgo = (typeof TIPOS_HALLAZGO)[number];

export interface Hallazgo {
  tipo: TipoHallazgo;
  /** Ruta dentro del `.zip` o carpeta de `specs/`; para el historial, el commit. */
  ubicacion: string;
  /** Qué regla incumple. Nunca incluye el valor de un secreto, solo su tipo. */
  detalle: string;
}

export type EstadoComprobacion = "ok" | "hallazgos" | "no verificable";

export interface Comprobacion {
  nombre: string;
  estado: EstadoComprobacion;
  /** Texto corto opcional, por ejemplo el tamaño medido. */
  nota?: string;
}

export type Veredicto = "listo" | "bloqueado" | "incompleto";

export interface InformeEntrega {
  zip: string;
  /** Debe ser ≤ LIMITE_BYTES. */
  tamanoBytes: number;
  comprobaciones: Comprobacion[];
  hallazgos: Hallazgo[];
  veredicto: Veredicto;
}

/** Límite de peso del `.zip` que fija el enunciado: 50 MB. */
export const LIMITE_BYTES = 50 * 1024 * 1024;

/**
 * Un hallazgo de cualquier tipo deja el veredicto en `bloqueado`. Una comprobación «no verificable»
 * sin hallazgos lo deja en `incompleto`: nunca cuenta como éxito.
 */
export function veredictoDe(comprobaciones: Comprobacion[], hallazgos: Hallazgo[]): Veredicto {
  if (hallazgos.length > 0 || comprobaciones.some((c) => c.estado === "hallazgos")) {
    return "bloqueado";
  }
  if (comprobaciones.some((c) => c.estado === "no verificable")) return "incompleto";
  return "listo";
}

/** Error con tipo y causa: los fallos de la entrega nunca se silencian (Principio VI). */
export class ErrorEntrega extends Error {
  readonly tipo: "zip-invalido" | "arbol-sucio" | "git" | "opciones";

  constructor(tipo: ErrorEntrega["tipo"], mensaje: string, opciones?: { cause?: unknown }) {
    super(mensaje, opciones);
    this.name = "ErrorEntrega";
    this.tipo = tipo;
  }
}
