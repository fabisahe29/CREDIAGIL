// Comentario de registro de una revisión en el issue (contracts/informe.md, "Comentario de registro";
// FR-010 a FR-012; research.md, R7). El cuerpo lo genera este módulo; la sesión solo lo publica.
// Lleva el informe completo para auditar y para reutilizarlo al reintentar sobre el mismo commit.

import type { Fallo } from "./almacen.ts";
import {
  BloqueJsonInvalido,
  extraerBloqueJson,
  REGLAS,
  type Hallazgo,
  type Informe,
  type InformeCodigo,
  type InformeCumplimiento,
  type TipoRevision,
} from "./informe.ts";

export interface Registro {
  tipo: TipoRevision;
  sha: string;
  informe?: Informe;
  fallo?: Fallo;
  /** Fecha del registro, `AAAA-MM-DD`. */
  fecha: string;
}

const NOMBRE: Readonly<Record<TipoRevision, string>> = {
  codigo: "código",
  cumplimiento: "cumplimiento",
};
const NOMBRE_SEVERIDAD = { critica: "crítica", alta: "alta", media: "media", baja: "baja" };
const ICONO_ESTADO = { cumplida: "✅", incumplida: "⛔", no_aplicable: "➖" };
const MARCADOR = /^<!-- crediagil:revision=(codigo|cumplimiento);commit=([0-9a-f]{40}) -->$/;

export function marcador(tipo: TipoRevision, sha: string): string {
  return `<!-- crediagil:revision=${tipo};commit=${sha} -->`;
}

const bloqueante = (h: Hallazgo) => h.severidad === "critica" || h.severidad === "alta";
const lineaHallazgo = (h: Hallazgo) =>
  `- ${NOMBRE_SEVERIDAD[h.severidad]} — \`${h.archivo}:${h.linea}\` — ${h.descripcion}`;

/** Si esta revisión, por sí sola, impide abrir el PR (regla de gravedad de la aclaración Q1). */
export function bloqueaPorSiMisma(informe: Informe): boolean {
  if (informe.tipo === "codigo") return informe.hallazgos.some(bloqueante);
  return (
    informe.reglas.some((r) => r.estado === "incumplida") || informe.restricciones.some(bloqueante)
  );
}

function conteoSeveridades(hallazgos: readonly Hallazgo[]): string {
  return (["critica", "alta", "media", "baja"] as const)
    .map((s) => `${NOMBRE_SEVERIDAD[s]}: ${hallazgos.filter((h) => h.severidad === s).length}`)
    .join(" · ");
}

function cuerpoCodigo(informe: InformeCodigo): string[] {
  const lineas = ["**Hallazgos por severidad**", `- ${conteoSeveridades(informe.hallazgos)}`, ""];
  if (informe.hallazgos.length === 0) return [...lineas, "Sin hallazgos."];
  const bloquean = informe.hallazgos.filter(bloqueante);
  const resto = informe.hallazgos.filter((h) => !bloqueante(h));
  if (bloquean.length > 0) lineas.push("**Lo que bloquea**", ...bloquean.map(lineaHallazgo), "");
  if (resto.length > 0) lineas.push("**Hallazgos**", ...resto.map(lineaHallazgo));
  return lineas;
}

function cuerpoCumplimiento(informe: InformeCumplimiento): string[] {
  const estados = REGLAS.map((n) => {
    const r = informe.reglas.find((x) => x.regla === n);
    return `${n} ${r === undefined ? "?" : ICONO_ESTADO[r.estado]}`;
  }).join(" · ");
  const lineas = ["**Reglas de negocio**", `- ${estados}`, ""];
  const incumplidas = informe.reglas.filter((r) => r.estado === "incumplida");
  const restricciones = informe.restricciones;
  if (incumplidas.length > 0 || restricciones.some(bloqueante)) {
    lineas.push(
      "**Lo que bloquea**",
      ...incumplidas.map((r) => {
        const evidencia = (r.evidencia ?? []).map((e) => `\`${e.archivo}:${e.linea}\``).join(", ");
        return `- Regla ${r.regla} — ${evidencia}`;
      }),
      ...restricciones.filter(bloqueante).map(lineaHallazgo),
      "",
    );
  }
  const otras = restricciones.filter((h) => !bloqueante(h));
  if (otras.length > 0) lineas.push("**Restricciones**", ...otras.map(lineaHallazgo));
  return lineas;
}

export function renderComentario({ tipo, sha, informe, fallo, fecha }: Registro): string {
  const corto = sha.slice(0, 7);
  const titulo = (estado: string) =>
    `🔎 **Revisión de ${NOMBRE[tipo]}** · commit \`${corto}\` · ${estado} · ${fecha}`;

  if (informe === undefined) {
    const errores = (fallo?.errores ?? []).map((e) => `- ${e}`);
    return [
      marcador(tipo, sha),
      titulo("⛔ revisión fallida"),
      "",
      `**Causa**: ${fallo?.causa ?? "el revisor no entregó un informe válido"}`,
      ...(errores.length > 0 ? ["", ...errores] : []),
      "",
    ].join("\n");
  }

  const estado = bloqueaPorSiMisma(informe) ? "⛔ bloquea" : "✅ no bloquea";
  const cuerpo = informe.tipo === "codigo" ? cuerpoCodigo(informe) : cuerpoCumplimiento(informe);
  return [
    marcador(tipo, sha),
    titulo(estado),
    "",
    informe.resumen,
    "",
    ...cuerpo,
    "",
    "<details><summary>Informe completo</summary>",
    "",
    "```json",
    JSON.stringify(informe, null, 2),
    "```",
    "",
    "</details>",
    "",
  ].join("\n");
}

/** Tipo, sha e informe (sin validar) de un comentario de registro; null si no lo es o no trae informe. */
export function parsearComentario(
  cuerpo: string,
): { tipo: TipoRevision; sha: string; informe: unknown } | null {
  const primera = cuerpo.split(/\r?\n/, 1)[0]?.trim() ?? "";
  const coincidencia = MARCADOR.exec(primera);
  if (coincidencia === null) return null;
  try {
    const informe = extraerBloqueJson(cuerpo);
    return { tipo: coincidencia[1] as TipoRevision, sha: coincidencia[2]!, informe };
  } catch (error) {
    if (error instanceof BloqueJsonInvalido) return null;
    throw error;
  }
}
