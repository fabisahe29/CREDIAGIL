// Política de reintentos del agente ante el core (FR-011; data-model.md, "Política de reintento").
// Función pura: el reloj y el azar se inyectan para que las pruebas fijen intentos y esperas exactas.

import { transitorioAgotado, type Respuesta } from "../compartido/errores.ts";

export const INTENTOS_MAXIMOS = 3;
export const ESPERAS_BASE_MS: readonly number[] = [500, 1000];
export const VARIACION = 0.2;

export interface OpcionesReintento<T> {
  dormir: (ms: number) => Promise<void>;
  /** Número en [0, 1]; 0,5 da la espera base exacta. */
  azar: () => number;
  alIntentar?: (intento: number, respuesta: Respuesta<T>) => void;
}

export interface ResultadoReintentos<T> {
  respuesta: Respuesta<T>;
  intentos: number;
  /** Verdadero si se agotaron los intentos ante un error reintentable. */
  agotado: boolean;
  ultimoError: string | null;
}

export async function conReintentos<T>(
  operacion: () => Promise<Respuesta<T>>,
  { dormir, azar, alIntentar }: OpcionesReintento<T>,
): Promise<ResultadoReintentos<T>> {
  let ultimoError: string | null = null;
  for (let intento = 1; intento <= INTENTOS_MAXIMOS; intento++) {
    const respuesta = await operacion();
    alIntentar?.(intento, respuesta);
    if (respuesta.ok || !respuesta.error.reintentable) {
      return {
        respuesta,
        intentos: intento,
        agotado: false,
        ultimoError: respuesta.ok ? null : respuesta.error.codigo,
      };
    }
    ultimoError = respuesta.error.codigo;
    if (intento < INTENTOS_MAXIMOS) {
      const base = ESPERAS_BASE_MS[intento - 1]!;
      await dormir(Math.round(base * (1 + (azar() * 2 - 1) * VARIACION)));
    }
  }
  return {
    respuesta: { ok: false, error: transitorioAgotado() },
    intentos: INTENTOS_MAXIMOS,
    agotado: true,
    ultimoError,
  };
}
