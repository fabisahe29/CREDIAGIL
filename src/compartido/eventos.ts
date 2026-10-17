// Catálogo único de eventos de negocio (specs/006-interfaz-chat: data-model.md, "EventoNegocio";
// contracts/eventos.md). Lo usan el agente, que emite, y el chat, que valida otra vez y muestra.
// Solo describe eventos: los umbrales y las reglas viven en la política, nunca aquí.

import { z } from "zod";

export const TIPOS_EVENTO = [
  "preaprobacion",
  "solicitud_de_dato",
  "escalamiento",
  "bloqueo_por_regla",
] as const;
export type TipoEvento = (typeof TIPOS_EVENTO)[number];

const textoNoVacio = z.string().min(1);

/** Valores usados en la decisión: strings ya formateados o enteros (montos en pesos). */
const esquemaValores = z.record(z.string(), z.union([z.string(), z.int()]));
const valoresNoVacios = esquemaValores.refine((v) => Object.keys(v).length > 0, {
  message: "debe tener al menos un valor",
});

const comunes = {
  descripcion: textoNoVacio,
  motivo: textoNoVacio,
  correlationId: z.uuid(),
  ts: z.iso.datetime(),
  regla: textoNoVacio.optional(),
  valores: esquemaValores.optional(),
};

export const esquemaEvento = z.discriminatedUnion("tipo", [
  z.strictObject({
    tipo: z.literal("preaprobacion"),
    ...comunes,
    regla: textoNoVacio,
    valores: valoresNoVacios,
  }),
  z.strictObject({ tipo: z.literal("solicitud_de_dato"), ...comunes, dato: textoNoVacio }),
  z.strictObject({ tipo: z.literal("escalamiento"), ...comunes }),
  z.strictObject({
    tipo: z.literal("bloqueo_por_regla"),
    ...comunes,
    regla: textoNoVacio,
    valores: valoresNoVacios,
    siguientePaso: textoNoVacio,
  }),
]);

export type EventoNegocio = z.infer<typeof esquemaEvento>;

/** Lo que entrega un emisor: `correlationId` y `ts` los completa `emitirEvento`. */
export type DatosEvento = EventoNegocio extends infer E
  ? E extends EventoNegocio
    ? Omit<E, "correlationId" | "ts">
    : never
  : never;

export type Validacion = { ok: true; evento: EventoNegocio } | { ok: false; problema: string };

/** Valida un valor desconocido contra el catálogo. Nunca lanza. */
export function validarEvento(valor: unknown): Validacion {
  const tipo = (valor as { tipo?: unknown } | null)?.tipo;
  if (typeof valor === "object" && valor !== null && !Array.isArray(valor)) {
    if (tipo === undefined) return { ok: false, problema: "falta el campo tipo" };
    if (!(TIPOS_EVENTO as readonly unknown[]).includes(tipo)) {
      return { ok: false, problema: `tipo desconocido: ${String(tipo)}` };
    }
  } else {
    return { ok: false, problema: "el evento no es un objeto" };
  }
  const resultado = esquemaEvento.safeParse(valor);
  if (resultado.success) return { ok: true, evento: resultado.data };
  const problema = resultado.error.issues
    .map((issue) => {
      const campo = issue.path.join(".");
      if (issue.code === "unrecognized_keys")
        return `campos no permitidos: ${issue.keys.join(", ")}`;
      return campo === "" ? issue.message : `${campo}: ${issue.message}`;
    })
    .join("; ");
  return { ok: false, problema };
}
