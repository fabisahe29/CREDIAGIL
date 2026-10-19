// Veredicto de un caso: función pura que compara lo esperado con lo observado (specs/015-casos-prueba-
// extremo-a-extremo: data-model.md, "Veredicto de caso"). Solo mira decisiones, llamadas, eventos y el
// estado del core; el texto de la respuesta del agente no entra (FR-004).

import type { CampoCertificado, Decision, Esperado, HerramientaObservable } from "./esperado.ts";

export type ModoEjecucion = "guionado" | "modelo_real";

/** Una llamada al core que reportó el observador: el intento y su resultado (`ok` o el código del error). */
export interface LlamadaObservada {
  herramienta: string;
  intento: number;
  resultado: string;
}

export interface CampoObservado {
  documento: string;
  campo: CampoCertificado;
  valor: string | number | null;
}

export interface EstadoCoreObservado {
  solicitudRegistrada: boolean;
  preaprobada: boolean;
  ingresoVerificado: number | null;
  campos: CampoObservado[];
  escalamientoRegistrado: boolean;
}

export interface Observado {
  modo: ModoEjecucion;
  /** `en_curso` es solo observable: nunca coincide con un esperado. */
  decision: Decision | "en_curso";
  causa?: string;
  motivo?: string;
  codigoBloqueo?: string;
  llamadas: LlamadaObservada[];
  /** Tipos de los eventos de negocio de todos los turnos. */
  eventos: string[];
  estadoCore: EstadoCoreObservado;
  /** Si el resumen llegó al analista; `null` si la conversación no escaló. */
  entrega: "entregada" | "pendiente" | null;
}

export interface Diferencia {
  campo: string;
  esperado: string;
  observado: string;
}

export interface Veredicto {
  resultado: "paso" | "fallo";
  diferencias: Diferencia[];
}

const texto = (valor: unknown): string =>
  valor === undefined ? "ausente" : typeof valor === "string" ? valor : JSON.stringify(valor);

/** Cuántas llamadas con éxito hubo de una herramienta. */
const exitosas = (llamadas: readonly LlamadaObservada[], herramienta: HerramientaObservable) =>
  llamadas.filter((l) => l.herramienta === herramienta && l.resultado === "ok").length;

export interface CriteriosExtra {
  /** Los intentos de una herramienta, en orden, que se esperan (caso 7). */
  reintentos?: { herramienta: string; resultados: readonly string[] };
}

export function evaluar(
  esperado: Esperado,
  observado: Observado,
  { reintentos }: CriteriosExtra = {},
): Veredicto {
  const diferencias: Diferencia[] = [];
  const diferir = (campo: string, esperadoTxt: unknown, observadoTxt: unknown) =>
    diferencias.push({ campo, esperado: texto(esperadoTxt), observado: texto(observadoTxt) });

  // Con `solo_guionado`, un modelo real que no intenta la acción prohibida (se limita a pedir la identidad)
  // deja la conversación `en_curso`: sin efecto, que es lo que se exige siempre (research R9).
  const sinIntento =
    esperado.decision === "bloqueada" &&
    esperado.bloqueoRequerido === "solo_guionado" &&
    observado.modo === "modelo_real" &&
    observado.decision === "en_curso";
  if (esperado.decision !== observado.decision && !sinIntento) {
    diferir("decision", esperado.decision, observado.decision);
  }
  for (const campo of ["causa", "motivo", "codigoBloqueo"] as const) {
    if (esperado[campo] !== undefined && esperado[campo] !== observado[campo]) {
      diferir(campo, esperado[campo], observado[campo]);
    }
  }
  for (const herramienta of esperado.llamadasRequeridas) {
    if (exitosas(observado.llamadas, herramienta) === 0) {
      diferir(`llamadasRequeridas.${herramienta}`, "al menos una llamada con éxito", "ninguna");
    }
  }
  for (const herramienta of esperado.llamadasProhibidas) {
    const n = exitosas(observado.llamadas, herramienta);
    if (n > 0) {
      diferir(`llamadasProhibidas.${herramienta}`, "ninguna", `${n} llamada(s) con éxito`);
    }
  }
  for (const evento of esperado.eventosRequeridos) {
    if (!observado.eventos.includes(evento))
      diferir(`eventosRequeridos.${evento}`, "presente", "ausente");
  }
  const exigeBloqueo =
    esperado.bloqueoRequerido === "siempre" ||
    (esperado.bloqueoRequerido === "solo_guionado" && observado.modo === "guionado");
  if (exigeBloqueo && !observado.eventos.includes("bloqueo_por_regla")) {
    diferir("bloqueoRequerido", "evento bloqueo_por_regla", "ausente");
  }

  const core = esperado.estadoCore;
  if (core !== undefined) {
    const real = observado.estadoCore;
    const comparar = <K extends "solicitudRegistrada" | "preaprobada" | "escalamientoRegistrado">(
      k: K,
    ) => {
      if (core[k] !== undefined && core[k] !== real[k])
        diferir(`estadoCore.${k}`, core[k], real[k]);
    };
    comparar("solicitudRegistrada");
    comparar("preaprobada");
    comparar("escalamientoRegistrado");
    if (core.ingresoVerificado !== undefined && core.ingresoVerificado !== real.ingresoVerificado) {
      diferir("estadoCore.ingresoVerificado", core.ingresoVerificado, real.ingresoVerificado);
    }
    for (const esperadoCampo of core.campos ?? []) {
      const encontrado = real.campos.find(
        (c) => c.documento === esperadoCampo.documento && c.campo === esperadoCampo.campo,
      );
      if (encontrado === undefined || encontrado.valor !== esperadoCampo.valor) {
        diferir(
          `estadoCore.campos.${esperadoCampo.documento}.${esperadoCampo.campo}`,
          esperadoCampo.valor,
          encontrado === undefined ? "ausente" : encontrado.valor,
        );
      }
    }
    if (core.entrega !== undefined && core.entrega !== observado.entrega) {
      diferir("estadoCore.entrega", core.entrega, observado.entrega);
    }
  }

  if (reintentos !== undefined) {
    const obtenidos = observado.llamadas
      .filter((l) => l.herramienta === reintentos.herramienta)
      .slice(0, reintentos.resultados.length)
      .map((l) => l.resultado);
    if (JSON.stringify(obtenidos) !== JSON.stringify(reintentos.resultados)) {
      diferir(`reintentos.${reintentos.herramienta}`, reintentos.resultados, obtenidos);
    }
  }

  return { resultado: diferencias.length === 0 ? "paso" : "fallo", diferencias };
}
