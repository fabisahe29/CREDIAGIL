// Core de originación simulado: almacén en memoria con datos ficticios (FR-014, FR-015, FR-016;
// research.md, R10). No tiene reglas de originación; solo responde consultas con el contrato común.

import { z } from "zod";
import {
  errorNegocio,
  errorPermisos,
  errorTransitorio,
  errorValidacion,
  exito,
  fallo,
  type Respuesta,
} from "../compartido/errores.ts";
import { SOLICITUDES_EJEMPLO, type Solicitud } from "./datos-ejemplo.ts";
import { crearFalla, type ModoFalla } from "./falla.ts";

/** Forma de una solicitud, compartida por el servidor (outputSchema) y el cliente del agente. */
export const esquemaSolicitud = z.object({
  idSolicitud: z.string(),
  solicitante: z.object({ nombre: z.string(), documento: z.string(), correo: z.string() }),
  monto: z.number().int(),
  plazoMeses: z.number().int(),
  estado: z.enum(["en_estudio", "anulada", "reservada"]),
  creadaEn: z.string(),
});

export const esquemaIdSolicitud = z.string().regex(/^SOL-000\d{7}$/);

export interface Core {
  consultarSolicitud(idSolicitud: unknown): Respuesta<{ solicitud: Solicitud | null }>;
}

export interface OpcionesCore {
  datos?: readonly Solicitud[];
  /** Falla transitoria simulada (FR-010); sin ella, el core nunca falla. */
  falla?: ModoFalla | null;
}

export function crearCore({ datos = SOLICITUDES_EJEMPLO, falla = null }: OpcionesCore = {}): Core {
  const almacen = new Map(datos.map((s) => [s.idSolicitud, structuredClone(s)]));
  const fallaSimulada = crearFalla(falla);

  return {
    consultarSolicitud(idSolicitud) {
      if (fallaSimulada.debeFallar()) {
        return fallo(
          errorTransitorio("core_no_disponible", "El core de originación no está disponible."),
        );
      }
      const id = esquemaIdSolicitud.safeParse(idSolicitud);
      if (!id.success) {
        return fallo(
          errorValidacion(
            "formato_invalido",
            "El identificador de solicitud debe tener la forma SOL- seguida de 10 dígitos.",
            "idSolicitud",
          ),
        );
      }
      const solicitud = almacen.get(id.data);
      if (solicitud === undefined) return exito({ solicitud: null });
      if (solicitud.estado === "anulada") {
        return fallo(
          errorNegocio("solicitud_anulada", "La solicitud está anulada y no se consulta."),
        );
      }
      if (solicitud.estado === "reservada") {
        return fallo(
          errorPermisos("solicitud_reservada", "La solicitud pertenece a otro canal de atención."),
        );
      }
      return exito({ solicitud: structuredClone(solicitud) });
    },
  };
}
