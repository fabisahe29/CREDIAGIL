// Decisión por gravedad (aclaración Q1; data-model.md, "Decisión"; research.md, R6).
// El modelo clasifica; la regla que decide si se abre el PR es este código, con pruebas.

import type { Fallo } from "./almacen.ts";
import type {
  Hallazgo,
  InformeCodigo,
  InformeCumplimiento,
  Severidad,
  TipoRevision,
} from "./informe.ts";

export type EstadoRevision = "valida" | "fallida";

export interface Conteos {
  critica: number;
  alta: number;
  media: number;
  baja: number;
  cumplidas: number;
  incumplidas: number;
  no_aplicables: number;
}

export interface Decision {
  sha: string;
  permite: boolean;
  motivos: string[];
  conteos: Conteos;
  revisiones: Record<TipoRevision, EstadoRevision>;
}

export interface Entradas {
  codigo?: InformeCodigo;
  cumplimiento?: InformeCumplimiento;
  fallos?: Partial<Record<TipoRevision, Fallo>>;
}

const BLOQUEANTES: ReadonlySet<Severidad> = new Set(["critica", "alta"]);
const NOMBRE_SEVERIDAD: Readonly<Record<Severidad, string>> = {
  critica: "crítica",
  alta: "alta",
  media: "media",
  baja: "baja",
};
const NOMBRE_REVISION: Readonly<Record<TipoRevision, string>> = {
  codigo: "código",
  cumplimiento: "cumplimiento",
};

const ubicacion = (h: { archivo: string; linea: number }) => `${h.archivo}:${h.linea}`;

function motivoHallazgo(prefijo: string, h: Hallazgo): string {
  return `${prefijo} ${NOMBRE_SEVERIDAD[h.severidad]}: ${ubicacion(h)} — ${h.descripcion}`;
}

export function decidir(sha: string, entradas: Entradas): Decision {
  const motivos: string[] = [];
  const conteos: Conteos = {
    critica: 0,
    alta: 0,
    media: 0,
    baja: 0,
    cumplidas: 0,
    incumplidas: 0,
    no_aplicables: 0,
  };
  const revisiones: Record<TipoRevision, EstadoRevision> = {
    codigo: "valida",
    cumplimiento: "valida",
  };

  for (const tipo of ["codigo", "cumplimiento"] as const) {
    const fallo = entradas.fallos?.[tipo];
    if (fallo !== undefined) {
      revisiones[tipo] = "fallida";
      motivos.push(`Revisión de ${NOMBRE_REVISION[tipo]} fallida: ${fallo.causa}`);
    } else if (entradas[tipo] === undefined) {
      revisiones[tipo] = "fallida";
      motivos.push(`Revisión de ${NOMBRE_REVISION[tipo]} sin informe válido`);
    }
  }

  const hallazgos = revisiones.codigo === "valida" ? (entradas.codigo?.hallazgos ?? []) : [];
  const cumplimiento = revisiones.cumplimiento === "valida" ? entradas.cumplimiento : undefined;
  const restricciones = cumplimiento?.restricciones ?? [];

  for (const h of hallazgos) {
    conteos[h.severidad]++;
    if (BLOQUEANTES.has(h.severidad)) motivos.push(motivoHallazgo("Hallazgo", h));
  }
  for (const h of restricciones) {
    conteos[h.severidad]++;
    if (BLOQUEANTES.has(h.severidad)) motivos.push(motivoHallazgo("Restricción", h));
  }
  for (const r of cumplimiento?.reglas ?? []) {
    if (r.estado === "cumplida") conteos.cumplidas++;
    else if (r.estado === "no_aplicable") conteos.no_aplicables++;
    else {
      conteos.incumplidas++;
      const evidencia = (r.evidencia ?? []).map(ubicacion).join(", ");
      motivos.push(`Regla ${r.regla} incumplida: ${evidencia}`);
    }
  }

  return { sha, permite: motivos.length === 0, motivos, conteos, revisiones };
}
