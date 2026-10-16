// Informes de los revisores y su validación (contracts/informe.md, "Validación" V1–V8; R5).
// Un informe que no pasa el esquema no se adivina: la revisión cuenta como fallida (FR-009).
// Se valida con guardas de tipo propias, sin Zod, para no depender de node_modules.

import { datosReales } from "../../hooks/lib/datos-reales.ts";
import type { Paquete } from "./paquete.ts";

export type TipoRevision = "codigo" | "cumplimiento";
export type Severidad = "critica" | "alta" | "media" | "baja";
export type EstadoDeRegla = "cumplida" | "incumplida" | "no_aplicable";
export type NumeroRegla = 1 | 2 | 3 | 4 | 5;

export interface Ubicacion {
  archivo: string;
  linea: number;
}

export interface Hallazgo extends Ubicacion {
  severidad: Severidad;
  contexto?: Ubicacion;
  descripcion: string;
  sugerencia: string;
  preexistente: boolean;
}

export interface Evidencia extends Ubicacion {
  cita: string;
}

export interface EstadoRegla {
  regla: NumeroRegla;
  estado: EstadoDeRegla;
  evidencia?: Evidencia[];
  contrastado_con?: string[];
  motivo?: string;
}

export interface InformeCodigo {
  tipo: "codigo";
  sha: string;
  resumen: string;
  hallazgos: Hallazgo[];
}

export interface InformeCumplimiento {
  tipo: "cumplimiento";
  sha: string;
  resumen: string;
  reglas: EstadoRegla[];
  restricciones: Hallazgo[];
}

export type Informe = InformeCodigo | InformeCumplimiento;

export type ResultadoValidacion<T> =
  { valido: true; informe: T } | { valido: false; errores: string[] };

/** Lo que la validación necesita del paquete: el sha y los archivos del diff. */
export type AlcancePaquete = Pick<Paquete, "sha" | "archivos">;

export const SEVERIDADES: readonly Severidad[] = ["critica", "alta", "media", "baja"];
export const ESTADOS_REGLA: readonly EstadoDeRegla[] = ["cumplida", "incumplida", "no_aplicable"];
export const REGLAS: readonly NumeroRegla[] = [1, 2, 3, 4, 5];

export class BloqueJsonInvalido extends Error {
  override name = "BloqueJsonInvalido";
}

const BLOQUE_JSON = /```json[^\S\r\n]*\r?\n([\s\S]*?)\r?\n?```/g;

/** Contenido del único bloque ```json del mensaje del revisor (V1). */
export function extraerBloqueJson(mensaje: string): unknown {
  const bloques = [...mensaje.matchAll(BLOQUE_JSON)];
  if (bloques.length !== 1) {
    throw new BloqueJsonInvalido(
      `V1: el mensaje debe terminar con exactamente un bloque json y tiene ${bloques.length}`,
    );
  }
  try {
    return JSON.parse(bloques[0]![1]!);
  } catch (error) {
    const causa = error instanceof Error ? error.message : String(error);
    throw new BloqueJsonInvalido(`V1: el bloque json no se puede parsear (${causa})`, {
      cause: error,
    });
  }
}

function esObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === "object" && valor !== null && !Array.isArray(valor);
}

function esTexto(valor: unknown): valor is string {
  return typeof valor === "string" && valor.trim() !== "";
}

function esLinea(valor: unknown): valor is number {
  return Number.isInteger(valor) && (valor as number) >= 1;
}

function esUbicacion(valor: unknown): valor is Ubicacion {
  return esObjeto(valor) && esTexto(valor["archivo"]) && esLinea(valor["linea"]);
}

/** Acumulador de errores y de textos a revisar por V8. */
class Revision {
  readonly errores: string[] = [];
  readonly textos: { origen: string; texto: string }[] = [];

  error(condicion: string, detalle: string): void {
    this.errores.push(`${condicion}: ${detalle}`);
  }

  texto(origen: string, valor: unknown): void {
    if (typeof valor === "string") this.textos.push({ origen, texto: valor });
  }

  /** V8: ningún texto del informe contiene un dato con forma real. */
  revisarDatosReales(): void {
    const bloqueos = datosReales({ herramienta: "Write", rutas: [], textos: this.textos });
    for (const bloqueo of bloqueos) this.error("V8", `dato con forma real: ${bloqueo.detectado}`);
  }
}

function revisarEncabezado(
  valor: Record<string, unknown>,
  tipo: TipoRevision,
  paquete: AlcancePaquete,
  revision: Revision,
): void {
  if (valor["tipo"] !== tipo) {
    revision.error("V2", `tipo "${String(valor["tipo"])}" en lugar de "${tipo}"`);
  }
  if (valor["sha"] !== paquete.sha) {
    revision.error("V2", `sha "${String(valor["sha"])}" distinto del paquete (${paquete.sha})`);
  }
  if (!esTexto(valor["resumen"])) revision.error("V3", "falta resumen");
  revision.texto("resumen", valor["resumen"]);
}

/** Valida una lista de hallazgos (código o restricciones de cumplimiento): V3, V6, V7 y textos para V8. */
function revisarHallazgos(
  lista: unknown,
  campo: string,
  paquete: AlcancePaquete,
  revision: Revision,
): void {
  if (!Array.isArray(lista)) {
    revision.error("V3", `${campo} no es una lista`);
    return;
  }
  const enDiff = new Set(paquete.archivos.map((a) => a.ruta));
  lista.forEach((h: unknown, i) => {
    const donde = `${campo}[${i}]`;
    if (!esObjeto(h)) {
      revision.error("V3", `${donde} no es un objeto`);
      return;
    }
    if (!SEVERIDADES.includes(h["severidad"] as Severidad)) {
      revision.error(
        "V3",
        `${donde}.severidad "${String(h["severidad"])}" fuera de ${SEVERIDADES.join(", ")}`,
      );
    }
    if (!esTexto(h["archivo"])) revision.error("V3", `${donde}.archivo vacío`);
    if (!esLinea(h["linea"])) revision.error("V3", `${donde}.linea no es un entero ≥ 1`);
    if (!esTexto(h["descripcion"])) revision.error("V3", `${donde}.descripcion vacía`);
    if (!esTexto(h["sugerencia"])) revision.error("V3", `${donde}.sugerencia vacía`);
    if (typeof h["preexistente"] !== "boolean") {
      revision.error("V3", `${donde}.preexistente no es booleano`);
    }
    if (h["contexto"] !== undefined && !esUbicacion(h["contexto"])) {
      revision.error("V3", `${donde}.contexto no es {archivo, linea}`);
    }

    const preexistente = h["preexistente"] === true;
    if (preexistente && h["severidad"] !== "baja") {
      revision.error("V7", `${donde} es preexistente y su severidad no es baja`);
    }
    const archivo = h["archivo"];
    if (!preexistente && typeof archivo === "string" && !enDiff.has(archivo)) {
      const contexto = h["contexto"];
      if (!esUbicacion(contexto) || !enDiff.has(contexto.archivo)) {
        revision.error(
          "V6",
          `${donde} cita ${archivo}, fuera del diff, sin un contexto que apunte a una línea del diff`,
        );
      }
    }
    revision.texto(`${donde}.descripcion`, h["descripcion"]);
    revision.texto(`${donde}.sugerencia`, h["sugerencia"]);
  });
}

function resultado<T>(valor: unknown, revision: Revision): ResultadoValidacion<T> {
  revision.revisarDatosReales();
  return revision.errores.length === 0
    ? { valido: true, informe: valor as T }
    : { valido: false, errores: revision.errores };
}

export function validarInformeCodigo(
  valor: unknown,
  paquete: AlcancePaquete,
): ResultadoValidacion<InformeCodigo> {
  const revision = new Revision();
  if (!esObjeto(valor)) {
    revision.error("V3", "el informe no es un objeto JSON");
    return { valido: false, errores: revision.errores };
  }
  revisarEncabezado(valor, "codigo", paquete, revision);
  revisarHallazgos(valor["hallazgos"], "hallazgos", paquete, revision);
  return resultado<InformeCodigo>(valor, revision);
}

function esEvidencia(valor: unknown): valor is Evidencia {
  return esUbicacion(valor) && esTexto((valor as unknown as Record<string, unknown>)["cita"]);
}

/** Reglas 1 a 5: cada una exactamente una vez (V4), con estado válido (V3) y evidencia o motivo (V5). */
function revisarReglas(lista: unknown, revision: Revision): void {
  if (!Array.isArray(lista)) {
    revision.error("V3", "reglas no es una lista");
    return;
  }
  const vistas = new Map<number, number>();
  lista.forEach((r: unknown, i) => {
    const donde = `reglas[${i}]`;
    if (!esObjeto(r)) {
      revision.error("V3", `${donde} no es un objeto`);
      return;
    }
    const numero = r["regla"];
    if (!REGLAS.includes(numero as NumeroRegla)) {
      revision.error("V3", `${donde}.regla "${String(numero)}" fuera de 1 a 5`);
    } else {
      vistas.set(numero as number, (vistas.get(numero as number) ?? 0) + 1);
    }
    const estado = r["estado"];
    if (!ESTADOS_REGLA.includes(estado as EstadoDeRegla)) {
      revision.error(
        "V3",
        `${donde}.estado "${String(estado)}" fuera de ${ESTADOS_REGLA.join(", ")}`,
      );
    }

    const evidencia = r["evidencia"];
    if (evidencia !== undefined && !Array.isArray(evidencia)) {
      revision.error("V3", `${donde}.evidencia no es una lista`);
    }
    const evidencias: unknown[] = Array.isArray(evidencia) ? evidencia : [];
    evidencias.forEach((e, j) => {
      if (!esEvidencia(e))
        revision.error("V3", `${donde}.evidencia[${j}] no es {archivo, linea, cita}`);
      else revision.texto(`${donde}.evidencia[${j}].cita`, e.cita);
    });
    if ((estado === "cumplida" || estado === "incumplida") && evidencias.length === 0) {
      revision.error("V5", `${donde} (regla ${String(numero)}) está ${estado} sin evidencia`);
    }
    if (estado === "no_aplicable" && !esTexto(r["motivo"])) {
      revision.error("V5", `${donde} (regla ${String(numero)}) es no_aplicable sin motivo`);
    }
    const contrastado = r["contrastado_con"];
    if (
      contrastado !== undefined &&
      !(Array.isArray(contrastado) && contrastado.every((c) => typeof c === "string"))
    ) {
      revision.error("V3", `${donde}.contrastado_con no es una lista de textos`);
    }
    revision.texto(`${donde}.motivo`, r["motivo"]);
  });

  for (const numero of REGLAS) {
    const veces = vistas.get(numero) ?? 0;
    if (veces !== 1) {
      revision.error(
        "V4",
        `la regla ${numero} aparece ${veces} veces; debe aparecer exactamente una`,
      );
    }
  }
}

export function validarInformeCumplimiento(
  valor: unknown,
  paquete: AlcancePaquete,
): ResultadoValidacion<InformeCumplimiento> {
  const revision = new Revision();
  if (!esObjeto(valor)) {
    revision.error("V3", "el informe no es un objeto JSON");
    return { valido: false, errores: revision.errores };
  }
  revisarEncabezado(valor, "cumplimiento", paquete, revision);
  revisarReglas(valor["reglas"], revision);
  revisarHallazgos(valor["restricciones"], "restricciones", paquete, revision);
  return resultado<InformeCumplimiento>(valor, revision);
}

export function validarInforme(
  tipo: TipoRevision,
  valor: unknown,
  paquete: AlcancePaquete,
): ResultadoValidacion<Informe> {
  return tipo === "codigo"
    ? validarInformeCodigo(valor, paquete)
    : validarInformeCumplimiento(valor, paquete);
}
