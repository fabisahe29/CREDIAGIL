// Core de originación simulado: almacén en memoria con datos ficticios (FR-014, FR-015, FR-016;
// research.md, R10). Consulta solicitudes (#7) y, desde el #9, identifica y verifica solicitantes
// (specs/007-verificacion-identidad: research.md, R1 a R4; contracts/core-mcp.md).

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
import {
  SOLICITANTES_EJEMPLO,
  SOLICITUDES_EJEMPLO,
  type Solicitante,
  type Solicitud,
} from "./datos-ejemplo.ts";
import { crearFalla, type ModoFalla } from "./falla.ts";
import { alcanzaLimite, evaluarRegla1, type EstadoIdentidad } from "../politica/identidad.ts";
import { MAX_INTENTOS_VERIFICACION, VERSION_POLITICA } from "../politica/politica.ts";
import { REGLA_5, REGLA_PRINCIPIO_V } from "../politica/documentos.ts";
import {
  TAMANO_MAXIMO_CONTENIDO,
  huella,
  validarResultado,
  type ErrorExtraccion,
  type RegistroExtraccion,
  type ValidacionResultado,
} from "../compartido/extraccion.ts";

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

/** Coincidencia de búsqueda: nunca incluye la fecha de expedición ni el documento completo. */
export const esquemaCoincidencia = z
  .object({
    idSolicitante: z.string(),
    nombre: z.string(),
    documentoEnmascarado: z.string(),
  })
  .strict();

export type Coincidencia = z.infer<typeof esquemaCoincidencia>;

export interface CriterioBusqueda {
  documento?: unknown;
  nombre?: unknown;
}

/** Estado de identidad de una conversación (data-model.md, "EstadoIdentidad"). */
export const esquemaEstadoIdentidad = z
  .object({
    correlationId: z.uuid(),
    verificada: z.boolean(),
    idSolicitante: z.string().nullable(),
    verificadaEn: z.iso.datetime().nullable(),
  })
  .strict();

export const esquemaIdSolicitante = z.string().regex(/^CLI-000\d{7}$/);

export interface EntradaVerificacion {
  idSolicitante: unknown;
  fechaExpedicion: unknown;
  idIntento: unknown;
  /** Ya validado por el servidor. */
  correlationId: string;
}

export type ResultadoAuditoria =
  "verificada" | "no_coincide" | "bloqueada" | "inexistente" | "formato_invalido";

/** Lo que el servidor registra como auditoría; nunca lleva fechas (R9). */
export interface Auditoria {
  resultado: ResultadoAuditoria;
  idSolicitante: string | null;
  intentosFallidos: number;
  campo?: string;
}

export type RespuestaIdentidad = Respuesta<{ identidad: EstadoIdentidad }>;

export interface ResultadoVerificacion {
  respuesta: RespuestaIdentidad;
  /** `null` si no hay nada que auditar: falla simulada o repetición (FR-016). */
  auditoria: Auditoria | null;
}

/** Entrada de `registrar_extraccion` (specs/008-extraccion-documentos/contracts/core-mcp.md). */
export interface EntradaRegistroExtraccion {
  /** Ya validado por el servidor. */
  correlationId: string;
  adjunto: unknown;
  nombre: unknown;
  /** El texto del documento: solo para revalidar, nunca se guarda. */
  contenido: unknown;
  resultado: unknown;
}

const esquemaEntradaExtraccion = z.object({
  correlationId: z.uuid(),
  adjunto: z.int().min(1),
  nombre: z.string().min(1).max(255),
  contenido: z.string().min(1).max(TAMANO_MAXIMO_CONTENIDO),
  resultado: z.unknown(),
});

/** Auditoría de una extracción registrada: metadatos, nunca contenido, valores ni fragmentos. */
export interface AuditoriaExtraccion {
  adjunto: number;
  /** Los 12 primeros caracteres de la huella. */
  huella: string;
  estado: RegistroExtraccion["estado"];
  tipo?: string;
  causa?: string;
  faltantes: string[];
  regla: string;
  versionPolitica: string;
}

export type RespuestaRegistroExtraccion = Respuesta<{ extraccion: RegistroExtraccion }>;

export interface Core {
  consultarSolicitud(idSolicitud: unknown): Respuesta<{ solicitud: Solicitud | null }>;
  buscarSolicitante(criterio: CriterioBusqueda): Respuesta<{ coincidencias: Coincidencia[] }>;
  verificarIdentidad(entrada: EntradaVerificacion): ResultadoVerificacion;
  /** Solo lectura: lo consultan los controles del agente, nunca el modelo (R1, R7). */
  consultarIdentidad(correlationId: unknown): RespuestaIdentidad;
  /**
   * Registra el resultado de una extracción (#10, R6): exige identidad verificada, revalida contra el
   * contenido y es idempotente por la huella del contenido. `auditoria` es `null` si no hubo efecto.
   */
  registrarExtraccion(entrada: EntradaRegistroExtraccion): {
    respuesta: RespuestaRegistroExtraccion;
    auditoria: AuditoriaExtraccion | null;
  };
  /** Solo lectura: las extracciones de la conversación, ordenadas por adjunto. */
  consultarExtracciones(correlationId: unknown): Respuesta<{ extracciones: RegistroExtraccion[] }>;
}

export interface OpcionesCore {
  datos?: readonly Solicitud[];
  solicitantes?: readonly Solicitante[];
  /** Falla transitoria simulada (FR-010); sin ella, el core nunca falla. */
  falla?: ModoFalla | null;
  /** Reloj del core; inyectable para fijar "hoy" en las pruebas. */
  ahora?: () => Date;
}

/** Documento sin puntos, espacios ni guiones; `null` si no queda con 6 a 10 dígitos (R3). */
export function normalizarDocumento(valor: unknown): string | null {
  if (typeof valor !== "string") return null;
  const limpio = valor.replace(/[.\s-]/g, "");
  return /^\d{6,10}$/.test(limpio) ? limpio : null;
}

/**
 * Nombre en minúsculas, sin tildes (NFD sin marcas) y con espacios colapsados; `null` si tiene
 * caracteres que no son letras ni espacios o menos de 3 letras (R3).
 */
export function normalizarNombre(valor: unknown): string | null {
  if (typeof valor !== "string") return null;
  const limpio = valor
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
  if (!/^\p{L}+( \p{L}+)*$/u.test(limpio)) return null;
  return limpio.replaceAll(" ", "").length >= 3 ? limpio : null;
}

/** Deja visibles solo los 4 últimos dígitos. */
export function enmascararDocumento(documento: string): string {
  return "*".repeat(Math.max(documento.length - 4, 0)) + documento.slice(-4);
}

/** Fecha AAAA-MM-DD de calendario válida y no posterior a `hoy` (R4). */
export function esFechaExpedicionValida(valor: unknown, hoy: Date): valor is string {
  if (typeof valor !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false;
  const fecha = new Date(`${valor}T00:00:00.000Z`);
  if (Number.isNaN(fecha.getTime()) || fecha.toISOString().slice(0, 10) !== valor) return false;
  return valor <= hoy.toISOString().slice(0, 10);
}

const esIdIntentoValido = (valor: unknown): valor is string =>
  typeof valor === "string" && valor.length >= 1 && valor.length <= 64;

const noDisponible = () =>
  errorTransitorio("core_no_disponible", "El core de originación no está disponible.");

const VERIFICACION_BLOQUEADA = () =>
  errorNegocio(
    "verificacion_bloqueada",
    "La verificación de identidad quedó bloqueada por intentos fallidos. Un analista debe revisar el caso.",
  );

const quedan = (restantes: number) =>
  restantes === 1 ? "Te queda 1 intento." : `Te quedan ${restantes} intentos.`;

export function crearCore({
  datos = SOLICITUDES_EJEMPLO,
  solicitantes = SOLICITANTES_EJEMPLO,
  falla = null,
  ahora = () => new Date(),
}: OpcionesCore = {}): Core {
  const almacen = new Map(datos.map((s) => [s.idSolicitud, structuredClone(s)]));
  const registrados = solicitantes.map((s) => structuredClone(s));
  const fallaSimulada = crearFalla(falla);
  /** Estado de identidad por conversación (R1). */
  const identidades = new Map<string, EstadoIdentidad>();
  /** Intentos por `${correlationId}|${idSolicitante}` (data-model.md, "IntentosVerificacion"). */
  const intentos = new Map<string, { fallidos: number; bloqueada: boolean }>();
  /** Fallo por `${correlationId}|${idIntento}`, para la idempotencia (R4); los éxitos no se guardan. */
  const respuestasPorIntento = new Map<string, RespuestaIdentidad>();
  /** Extracciones por conversación y huella del contenido; nunca el contenido (#10, R6). */
  const extracciones = new Map<string, Map<string, RegistroExtraccion>>();

  /** Valida y evalúa un intento en el orden de R4; no guarda la respuesta. */
  function evaluarIntento(
    { idSolicitante, fechaExpedicion, correlationId }: EntradaVerificacion,
    auditar: (a: Auditoria) => void,
  ): RespuestaIdentidad {
    const id = esquemaIdSolicitante.safeParse(idSolicitante);
    if (!id.success) {
      auditar({
        resultado: "formato_invalido",
        idSolicitante: null,
        intentosFallidos: 0,
        campo: "idSolicitante",
      });
      return fallo(
        errorValidacion(
          "formato_invalido",
          "El identificador de solicitante debe tener la forma CLI- seguida de 10 dígitos.",
          "idSolicitante",
        ),
      );
    }
    const clave = `${correlationId}|${id.data}`;
    const contador = intentos.get(clave) ?? { fallidos: 0, bloqueada: false };
    if (!esFechaExpedicionValida(fechaExpedicion, ahora())) {
      auditar({
        resultado: "formato_invalido",
        idSolicitante: id.data,
        intentosFallidos: contador.fallidos,
        campo: "fechaExpedicion",
      });
      return fallo(
        errorValidacion(
          "formato_invalido",
          "La fecha de expedición debe ser una fecha válida y pasada, con la forma AAAA-MM-DD.",
          "fechaExpedicion",
        ),
      );
    }
    const registrado = registrados.find((s) => s.idSolicitante === id.data);
    if (registrado === undefined) {
      auditar({ resultado: "inexistente", idSolicitante: id.data, intentosFallidos: 0 });
      return fallo(
        errorNegocio("solicitante_inexistente", "No hay un solicitante con ese identificador."),
      );
    }
    // Cambio de solicitante: la verificación de otra persona no se transfiere (caso borde de la spec).
    const verificadoAntes = identidades.get(correlationId);
    if (verificadoAntes?.verificada && verificadoAntes.idSolicitante !== id.data) {
      identidades.delete(correlationId);
    }
    if (contador.bloqueada) {
      auditar({
        resultado: "bloqueada",
        idSolicitante: id.data,
        intentosFallidos: contador.fallidos,
      });
      return fallo(VERIFICACION_BLOQUEADA());
    }
    if (fechaExpedicion !== registrado.fechaExpedicion) {
      contador.fallidos++;
      contador.bloqueada = alcanzaLimite(contador.fallidos);
      intentos.set(clave, contador);
      if (contador.bloqueada) {
        auditar({
          resultado: "bloqueada",
          idSolicitante: id.data,
          intentosFallidos: contador.fallidos,
        });
        return fallo(VERIFICACION_BLOQUEADA());
      }
      auditar({
        resultado: "no_coincide",
        idSolicitante: id.data,
        intentosFallidos: contador.fallidos,
      });
      return fallo(
        errorNegocio(
          "dato_no_coincide",
          `La fecha de expedición no coincide. ${quedan(MAX_INTENTOS_VERIFICACION - contador.fallidos)}`,
        ),
      );
    }
    const actual = identidades.get(correlationId);
    if (actual?.verificada && actual.idSolicitante === id.data) {
      // Repetición de una verificación exitosa: mismo estado y sin auditoría nueva (FR-016).
      return exito({ identidad: { ...actual } });
    }
    const identidad: EstadoIdentidad = {
      correlationId,
      verificada: true,
      idSolicitante: id.data,
      verificadaEn: ahora().toISOString(),
    };
    identidades.set(correlationId, identidad);
    auditar({
      resultado: "verificada",
      idSolicitante: id.data,
      intentosFallidos: contador.fallidos,
    });
    return exito({ identidad: { ...identidad } });
  }

  const aCoincidencia = (s: Solicitante): Coincidencia => ({
    idSolicitante: s.idSolicitante,
    nombre: s.nombre,
    documentoEnmascarado: enmascararDocumento(s.documento),
  });

  return {
    consultarSolicitud(idSolicitud) {
      if (fallaSimulada.debeFallar()) return fallo(noDisponible());
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

    buscarSolicitante({ documento, nombre }) {
      if (fallaSimulada.debeFallar()) return fallo(noDisponible());
      if ((documento === undefined) === (nombre === undefined)) {
        return fallo(
          errorValidacion(
            "formato_invalido",
            "Busca por número de documento o por nombre completo, uno de los dos.",
            "criterio",
          ),
        );
      }
      let encontrados: Solicitante[];
      if (documento !== undefined) {
        const buscado = normalizarDocumento(documento);
        if (buscado === null) {
          return fallo(
            errorValidacion(
              "formato_invalido",
              "El número de documento debe tener de 6 a 10 dígitos.",
              "documento",
            ),
          );
        }
        encontrados = registrados.filter((s) => s.documento === buscado);
      } else {
        const buscado = normalizarNombre(nombre);
        if (buscado === null) {
          return fallo(
            errorValidacion(
              "formato_invalido",
              "El nombre debe tener al menos 3 letras y solo letras y espacios.",
              "nombre",
            ),
          );
        }
        encontrados = registrados.filter((s) => normalizarNombre(s.nombre) === buscado);
      }
      const coincidencias = encontrados
        .toSorted((a, b) => a.idSolicitante.localeCompare(b.idSolicitante))
        .map(aCoincidencia);
      return exito({ coincidencias });
    },

    verificarIdentidad(entrada) {
      if (fallaSimulada.debeFallar()) return { respuesta: fallo(noDisponible()), auditoria: null };
      let auditoria: Auditoria | null = null;
      const auditar = (a: Auditoria) => {
        auditoria = a;
      };
      if (!esIdIntentoValido(entrada.idIntento)) {
        auditar({
          resultado: "formato_invalido",
          idSolicitante: null,
          intentosFallidos: 0,
          campo: "idIntento",
        });
        const respuesta = fallo<never>(
          errorValidacion(
            "formato_invalido",
            "El identificador del intento debe tener de 1 a 64 caracteres.",
            "idIntento",
          ),
        );
        return { respuesta, auditoria };
      }
      const claveIntento = `${entrada.correlationId}|${entrada.idIntento}`;
      const previa = respuestasPorIntento.get(claveIntento);
      // El mismo intento reenviado (p. ej. un reintento tras un tiempo agotado) no cuenta dos veces.
      if (previa !== undefined) return { respuesta: structuredClone(previa), auditoria: null };
      const respuesta = evaluarIntento(entrada, auditar);
      // Solo se guardan los fallos, que son los que no deben contarse dos veces. Un éxito repetido
      // se evalúa contra el estado actual: si se invalidó, vuelve a verificar (revisión de dea0951).
      if (!respuesta.ok) respuestasPorIntento.set(claveIntento, structuredClone(respuesta));
      return { respuesta, auditoria };
    },

    consultarIdentidad(correlationId) {
      if (fallaSimulada.debeFallar()) return fallo(noDisponible());
      const id = z.uuid().safeParse(correlationId);
      if (!id.success) {
        return fallo(
          errorValidacion(
            "formato_invalido",
            "El correlationId debe ser un UUID.",
            "correlationId",
          ),
        );
      }
      const identidad = identidades.get(id.data) ?? {
        correlationId: id.data,
        verificada: false,
        idSolicitante: null,
        verificadaEn: null,
      };
      return exito({ identidad: { ...identidad } });
    },

    registrarExtraccion(entrada) {
      if (fallaSimulada.debeFallar()) return { respuesta: fallo(noDisponible()), auditoria: null };
      const forma = esquemaEntradaExtraccion.safeParse(entrada);
      if (!forma.success) {
        const campo = String(forma.error.issues[0]?.path[0] ?? "entrada");
        return {
          respuesta: fallo(
            errorValidacion(
              "formato_invalido",
              `El campo ${campo} de la extracción no es válido.`,
              campo,
            ),
          ),
          auditoria: null,
        };
      }
      const { correlationId, adjunto, nombre, contenido, resultado } = forma.data;

      // Regla 1 del lado del servidor: sin identidad verificada no se registra nada (Principio IV).
      const identidad = identidades.get(correlationId) ?? {
        correlationId,
        verificada: false,
        idSolicitante: null,
        verificadaEn: null,
      };
      if (!evaluarRegla1(identidad).permitido) {
        return {
          respuesta: fallo(
            errorNegocio(
              "identidad_no_verificada",
              "No se registra una extracción sin la identidad del solicitante verificada.",
            ),
          ),
          auditoria: null,
        };
      }

      // El mismo contenido ya registrado: se devuelve el mismo registro, sin otro efecto (FR-018).
      const deLaConversacion =
        extracciones.get(correlationId) ?? new Map<string, RegistroExtraccion>();
      const previo = deLaConversacion.get(huella(contenido));
      if (previo !== undefined) {
        if (!previo.adjuntos.includes(adjunto)) previo.adjuntos.push(adjunto);
        return { respuesta: exito({ extraccion: structuredClone(previo) }), auditoria: null };
      }

      // Defensa en profundidad: se revalida contra el documento, aunque el agente ya lo hizo.
      const validacion = validarResultado(resultado, contenido, ahora());
      const primero = primerError(validacion, adjunto, nombre);
      if (!validacion.ok || primero !== null) {
        return {
          respuesta: fallo(
            errorValidacion(
              "extraccion_invalida",
              `La extracción no coincide con el documento: ${primero?.campo} (${primero?.motivo}).`,
              `resultado.${primero?.campo ?? "(raíz)"}`,
            ),
          ),
          auditoria: null,
        };
      }

      const registro: RegistroExtraccion = {
        ...validacion.resultado,
        adjuntos: [adjunto],
        registradoEn: ahora().toISOString(),
      };
      deLaConversacion.set(registro.huella, registro);
      extracciones.set(correlationId, deLaConversacion);
      return {
        respuesta: exito({ extraccion: structuredClone(registro) }),
        auditoria: auditoriaDe(registro),
      };
    },

    consultarExtracciones(correlationId) {
      if (fallaSimulada.debeFallar()) return fallo(noDisponible());
      const id = z.uuid().safeParse(correlationId);
      if (!id.success) {
        return fallo(
          errorValidacion(
            "formato_invalido",
            "El correlationId debe ser un UUID.",
            "correlationId",
          ),
        );
      }
      const lista = [...(extracciones.get(id.data)?.values() ?? [])]
        .map((registro) => structuredClone(registro))
        .sort((a, b) => (a.adjuntos[0] ?? 0) - (b.adjuntos[0] ?? 0));
      return exito({ extracciones: lista });
    },
  };
}

/**
 * El primer problema de un registro: un error de la revalidación, o un resultado que no es del
 * adjunto o del nombre de la entrada. `null` si no hay ninguno.
 */
function primerError(
  validacion: ValidacionResultado,
  adjunto: number,
  nombre: string,
): ErrorExtraccion | null {
  if (!validacion.ok) return validacion.errores[0] ?? { campo: "(raíz)", motivo: "esquema" };
  if (validacion.resultado.adjunto !== adjunto) {
    return { campo: "adjunto", motivo: "esquema", detalle: "no es el adjunto de la entrada" };
  }
  if (validacion.resultado.nombre !== nombre) {
    return { campo: "nombre", motivo: "esquema", detalle: "no es el nombre de la entrada" };
  }
  return null;
}

/** Auditoría de una extracción registrada (FR-017): metadatos, nunca contenido ni fragmentos. */
function auditoriaDe(registro: RegistroExtraccion): AuditoriaExtraccion {
  const base = {
    adjunto: registro.adjuntos[0] ?? registro.adjunto,
    huella: registro.huella.slice(0, 12),
    estado: registro.estado,
    versionPolitica: VERSION_POLITICA,
  };
  if (registro.estado === "extraido") {
    return {
      ...base,
      tipo: registro.documento.tipo,
      faltantes: [...registro.faltantes],
      regla: registro.faltantes.length > 0 ? REGLA_PRINCIPIO_V : REGLA_5,
    };
  }
  if (registro.estado === "no_cubierto") {
    return { ...base, causa: registro.causa, faltantes: [], regla: REGLA_5 };
  }
  return { ...base, faltantes: [], regla: REGLA_PRINCIPIO_V };
}
