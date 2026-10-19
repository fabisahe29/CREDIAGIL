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
  type ErrorCore,
  type Respuesta,
} from "../compartido/errores.ts";
import {
  SOLICITANTES_EJEMPLO,
  SOLICITUDES_EJEMPLO,
  type Solicitante,
  type Solicitud,
} from "./datos-ejemplo.ts";
import { crearFalla, type ModoFalla } from "./falla.ts";
import {
  REGLA_1,
  alcanzaLimite,
  evaluarRegla1,
  type EstadoIdentidad,
} from "../politica/identidad.ts";
import {
  MAX_INTENTOS_VERIFICACION,
  MAX_REEXTRACCIONES_POR_REGLA,
  TASA_MENSUAL_PUNTOS_BASE,
  VERSION_POLITICA,
} from "../politica/politica.ts";
import { ErrorCuota, calcularCuota, calcularRelacionCuotaIngreso } from "../politica/cuota.ts";
import {
  AVISOS_CAPACIDAD_PAGO,
  validarEntradaCapacidadPago,
  type FuenteIngreso,
  type SimulacionCapacidadPago,
} from "../compartido/capacidad-pago.ts";
import { REGLA_5, REGLA_PRINCIPIO_V } from "../politica/documentos.ts";
import { validarConsistencia } from "../politica/consistencia.ts";
import { calcularDiferenciaPorcentaje, decidirIngreso } from "../politica/ingreso.ts";
import { REGLA_2, evaluarRegla2, type DecisionRegla2 } from "../politica/preaprobacion.ts";
import { validarEntradaPreaprobacion } from "../compartido/preaprobacion.ts";
import {
  CAUSAS_CON_DECISION_DE_LA_REGLA_2,
  accionRecomendada,
  reglaDeEscalamiento,
  type CausaEscalamiento,
  type MotivoEscalamiento,
  type Pendiente,
} from "../politica/escalamiento.ts";
import type { Asunto } from "../politica/asuntos.ts";
import {
  calcularPendientes,
  esquemaResumenAnalista,
  validarEntradaEscalamiento,
  type DiscrepanciaResumen,
  type ResultadoEscalamiento,
  type ResumenAnalista,
} from "../compartido/escalamiento.ts";
import type { VerificacionIngreso } from "../compartido/ingreso.ts";
import {
  esquemaSolicitudRegistrada,
  validarFormaRegistroSolicitud,
  validarProcedenciaDato,
  type FormaRegistroSolicitud,
  type ResultadoRegistro,
  type SolicitudRegistrada,
  type VerificacionRegistrada,
} from "../compartido/solicitud.ts";
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
  estado: z.enum(["en_estudio", "preaprobada", "anulada", "reservada"]),
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
  /**
   * Pide reemplazar el registro de este contenido tras una inconsistencia corregible (#11, R6). El core
   * recalcula la consistencia: el agente no puede reemplazar un registro porque «crea» que falló.
   */
  reextraccion?: unknown;
}

const esquemaEntradaExtraccion = z.object({
  correlationId: z.uuid(),
  adjunto: z.int().min(1),
  nombre: z.string().min(1).max(255),
  contenido: z.string().min(1).max(TAMANO_MAXIMO_CONTENIDO),
  resultado: z.unknown(),
  reextraccion: z.strictObject({ regla: z.string().min(1).max(64) }).optional(),
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
  /** La regla de consistencia que motivó el reemplazo, si fue una reextracción. */
  reextraccion?: string;
}

export type RespuestaRegistroExtraccion = Respuesta<{ extraccion: RegistroExtraccion }>;

/** Entrada de `verificar_ingreso` (specs/009-ingreso-verificado-consistencia/contracts/core-mcp.md). */
export interface EntradaVerificacionIngreso {
  /** Ya validado por el servidor. */
  correlationId: string;
  /**
   * Lo que declaró el solicitante, en pesos. `undefined` conserva el último declarado y `null` lo
   * borra. Se guarda; nunca interviene en el ingreso verificado (FR-001).
   */
  ingresoDeclarado?: unknown;
}

/** Tope del ingreso declarado: con él, ×100 sigue siendo un entero seguro. */
export const INGRESO_DECLARADO_MAXIMO = Math.floor(Number.MAX_SAFE_INTEGER / 100);

const esquemaIngresoDeclarado = z.int().min(0).max(INGRESO_DECLARADO_MAXIMO);

/** Auditoría de una verificación que cambió el resultado: metadatos y enteros, nunca contenido (R9). */
export interface AuditoriaIngreso {
  regla: string;
  estado: VerificacionIngreso["estado"];
  ingresoVerificado: number | null;
  ingresoDeclarado: number | null;
  diferencia: number | null;
  umbralPorcentaje: number | null;
  /** Solo los nombres de las reglas de consistencia que fallaron. */
  reglasInconsistencia: string[];
  versionPolitica: string;
}

export type RespuestaVerificacionIngreso = Respuesta<{ verificacion: VerificacionIngreso }>;

/**
 * Auditoría de un registro de solicitud (#13, R9): la Regla 1, el resultado y los enteros relevantes;
 * nunca fragmentos, nombres de documentos ni texto de la conversación.
 */
export interface AuditoriaRegistro {
  resultado: "registrada" | "rechazada";
  regla: string;
  /** Solo en un rechazo: el código del error. */
  codigo?: string;
  /** Solo en un rechazo con un campo: el campo del error. */
  campo?: string;
  /** Solo en un registro: la solicitud creada. */
  idSolicitud?: string;
  idSolicitante: string | null;
  monto: number | null;
  plazoMeses: number | null;
  ingresoDeclarado: number | null;
  ingresoVerificado: number | null;
  estadoVerificacion: VerificacionIngreso["estado"] | null;
  /** Documentos extraídos de la conversación que usa la solicitud. */
  documentos: number;
  versionPolitica: string;
}

export type RespuestaRegistroSolicitud = Respuesta<ResultadoRegistro>;

/**
 * Auditoría de una decisión de preaprobación (#14, R10): la Regla 2, el resultado y los enteros
 * relevantes; nunca fragmentos, nombres de documentos ni contenido.
 */
export interface AuditoriaPreaprobacion {
  resultado: "preaprobada" | "bloqueada";
  regla: string;
  /** Solo en un bloqueo: el código del error. */
  codigo?: string;
  idSolicitud?: string;
  idSolicitante: string | null;
  monto: number | null;
  plazoMeses: number | null;
  cuotaMensual: number | null;
  ingresoVerificado: number | null;
  versionPolitica: string;
}

export type RespuestaPreaprobacion = Respuesta<ResultadoRegistro>;

/**
 * Auditoría de un escalamiento (#15, R11): la regla, la causa, los identificadores y lo que faltaba;
 * nunca nombres, documentos, citas ni contenido.
 */
export interface AuditoriaEscalamiento {
  resultado: "escalada";
  regla: string;
  causa: CausaEscalamiento;
  motivo: MotivoEscalamiento;
  /** Solo con la preaprobación fuera de política: el código del bloqueo. */
  codigo?: string;
  causasAdicionales: number;
  idEscalamiento: string;
  idSolicitud?: string;
  idSolicitante?: string;
  pendientes: Pendiente[];
  /** Los asuntos del mensaje que quedaron sin atender, como los entregó el agente (#16). */
  asuntosPendientes: Asunto[];
  versionPolitica: string;
}

export type RespuestaEscalamiento = Respuesta<ResultadoEscalamiento>;

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
  /**
   * Calcula el ingreso verificado y evalúa discrepancia e inconsistencias con lo que el core ya guardó
   * (#11, R8). Exige identidad verificada. `auditoria` es `null` si el resultado no cambió.
   */
  verificarIngreso(entrada: EntradaVerificacionIngreso): {
    respuesta: RespuestaVerificacionIngreso;
    auditoria: AuditoriaIngreso | null;
  };
  /** Solo lectura: la última verificación de ingreso de la conversación, o `null` si no hay. */
  consultarVerificacionIngreso(
    correlationId: unknown,
  ): Respuesta<{ verificacion: VerificacionIngreso | null }>;
  /**
   * Solo lectura (#12, R3 y R4): simula la cuota y su proporción del ingreso. No exige identidad, no
   * escribe nada y no audita. La fuente del ingreso la decide el core con la verificación guardada.
   */
  calcularCapacidadPago(entrada: unknown): Respuesta<{ simulacion: SimulacionCapacidadPago }>;
  /**
   * Registra la solicitud de un solicitante con la identidad verificada, con la procedencia de cada
   * dato (#13). Toma del estado del core el solicitante, el ingreso declarado, la verificación de
   * ingreso y los datos extraídos; del llamador, solo monto, plazo y procedencia. Es idempotente por
   * `claveIdempotencia` dentro de la conversación. `auditoria` es `null` si no hubo decisión que
   * auditar: falla simulada, error de forma o repetición.
   */
  registrarSolicitud(entrada: unknown): {
    respuesta: RespuestaRegistroSolicitud;
    auditoria: AuditoriaRegistro | null;
  };
  /**
   * Preaprueba la solicitud registrada de la conversación si cumple la Regla 2 (#14). No recibe datos
   * del modelo: decide con la solicitud, la identidad verificada y la política. Es idempotente por
   * solicitud. `auditoria` es `null` si no hubo decisión que auditar: falla simulada, error de
   * forma, falta de solicitud o repetición.
   */
  preaprobarSolicitud(entrada: unknown): {
    respuesta: RespuestaPreaprobacion;
    auditoria: AuditoriaPreaprobacion | null;
  };
  /** Solo lectura (#13, R8): la solicitud registrada en la conversación, o `null`. */
  consultarSolicitudRegistrada(
    correlationId: unknown,
  ): Respuesta<{ solicitud: SolicitudRegistrada | null }>;
  /**
   * Entrega un caso a un analista con un resumen que arma el core con su propio estado (#15, R3). No
   * exige identidad ni solicitud registrada, y nunca se rechaza por no poder justificar la causa: solo
   * por la forma de la entrada. Es idempotente por conversación. `auditoria` es `null` si no hubo
   * decisión que auditar: falla simulada, error o repetición.
   */
  escalarAAnalista(entrada: unknown): {
    respuesta: RespuestaEscalamiento;
    auditoria: AuditoriaEscalamiento | null;
  };
  /** Solo lectura (#15): el escalamiento de la conversación, o `null`. */
  consultarEscalamiento(
    correlationId: unknown,
  ): Respuesta<{ escalamiento: ResumenAnalista | null }>;
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
  /** Última verificación de ingreso y último ingreso declarado, por conversación (#11, R8). */
  const verificaciones = new Map<string, VerificacionIngreso>();
  const declarados = new Map<string, number | null>();
  /** Solicitudes registradas por identificador, las de cada conversación y el contador (#13, R7, R8). */
  const registradas = new Map<string, SolicitudRegistrada>();
  const registradasPorConversacion = new Map<string, string[]>();
  let siguienteNumeroSolicitud = 2_000_001;
  /** Un escalamiento por conversación y el contador de sus identificadores (#15, R8). */
  const escalamientos = new Map<string, ResumenAnalista>();
  let siguienteNumeroEscalamiento = 3_000_001;

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

  /** La verificación de ingreso de la conversación solo si es del solicitante que se registra (R2). */
  function verificacionPropia(correlationId: string, idSolicitante: string) {
    const verificacion = verificaciones.get(correlationId);
    return verificacion?.idSolicitante === idSolicitante ? verificacion : null;
  }

  /** Copia de la verificación de ingreso para el registro, con el porcentaje de diferencia (R9). */
  function verificacionRegistrada(v: VerificacionIngreso): VerificacionRegistrada {
    return structuredClone({
      estado: v.estado,
      ingresoVerificado: v.ingreso,
      discrepancia:
        v.discrepancia === null
          ? null
          : {
              ...v.discrepancia,
              diferenciaPorcentaje: calcularDiferenciaPorcentaje(
                v.discrepancia.declarado,
                v.discrepancia.verificado,
              ),
            },
      inconsistencias: v.inconsistencias,
      sinContrastar: v.sinContrastar,
      calculadaEn: v.calculadaEn,
    });
  }

  /** Extracciones de la conversación, ordenadas por adjunto. */
  const extraccionesDe = (correlationId: string): RegistroExtraccion[] =>
    [...(extracciones.get(correlationId)?.values() ?? [])].sort(
      (a, b) => (a.adjuntos[0] ?? 0) - (b.adjuntos[0] ?? 0),
    );

  /** Un documento citado debe estar entre las extracciones de la conversación, con ese número y nombre. */
  const estaExtraido = (correlationId: string, adjunto: number, nombre: string): boolean =>
    extraccionesDe(correlationId).some((r) => r.adjuntos.includes(adjunto) && r.nombre === nombre);

  /**
   * El primer problema de la procedencia, en el orden monto, plazo, ingreso declarado (R3). El ingreso
   * declarado es el que `verificar_ingreso` guardó: si el core no tiene uno, no admite procedencia.
   */
  function errorDeProcedencia(
    forma: FormaRegistroSolicitud,
    ingresoDeclarado: number | null,
  ): ErrorCore | null {
    const enviada =
      typeof forma.procedencia === "object" && forma.procedencia !== null
        ? (forma.procedencia as Record<string, unknown>)
        : {};
    for (const dato of ["monto", "plazoMeses", "ingresoDeclarado"] as const) {
      const valor = enviada[dato];
      if (dato === "ingresoDeclarado" && ingresoDeclarado === null) {
        if (valor === undefined || valor === null) continue;
        return errorValidacion(
          "ingreso_declarado_no_verificado",
          "El core no tiene un ingreso declarado de este solicitante: envíalo primero a verificar_ingreso.",
          "procedencia.ingresoDeclarado",
        );
      }
      const validacion = validarProcedenciaDato(dato, valor);
      if (!validacion.ok) return validacion.error;
      const { procedencia } = validacion;
      if (
        procedencia.tipo === "documento" &&
        !estaExtraido(forma.correlationId, procedencia.adjunto, procedencia.nombre)
      ) {
        return errorValidacion(
          "procedencia_documento_desconocida",
          `El documento citado como origen de ${dato} no está entre los extraídos de la conversación.`,
          `procedencia.${dato}`,
        );
      }
    }
    return null;
  }

  /** Auditoría de un registro: los enteros del contexto, sin fragmentos ni nombres de documentos. */
  function auditoriaDeRegistro(
    resultado: AuditoriaRegistro["resultado"],
    forma: FormaRegistroSolicitud,
    extra: Pick<AuditoriaRegistro, "codigo" | "campo" | "idSolicitud"> = {},
  ): AuditoriaRegistro {
    const verificacion = verificacionPropia(forma.correlationId, forma.idSolicitante);
    return {
      resultado,
      regla: REGLA_1,
      ...extra,
      idSolicitante: forma.idSolicitante,
      monto: forma.monto,
      plazoMeses: forma.plazoMeses,
      ingresoDeclarado:
        verificacion === null ? null : (declarados.get(forma.correlationId) ?? null),
      ingresoVerificado: verificacion?.ingreso?.monto ?? null,
      estadoVerificacion: verificacion?.estado ?? null,
      documentos: extraccionesDe(forma.correlationId).length,
      versionPolitica: VERSION_POLITICA,
    };
  }

  function rechazarRegistro(
    forma: FormaRegistroSolicitud,
    error: ErrorCore,
  ): { respuesta: RespuestaRegistroSolicitud; auditoria: AuditoriaRegistro } {
    return {
      respuesta: fallo(error),
      auditoria: auditoriaDeRegistro("rechazada", forma, {
        codigo: error.codigo,
        ...(error.campo !== undefined ? { campo: error.campo } : {}),
      }),
    };
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
      /** Una reextracción: reemplaza el registro solo si la inconsistencia corregible sigue vigente. */
      function reemplazar({
        correlationId,
        idSolicitante,
        previo,
        deLaConversacion,
        entrada: { adjunto, nombre, contenido, resultado },
        regla,
      }: {
        correlationId: string;
        idSolicitante: string | null;
        previo: RegistroExtraccion | undefined;
        deLaConversacion: Map<string, RegistroExtraccion>;
        entrada: { adjunto: number; nombre: string; contenido: string; resultado: unknown };
        regla: string;
      }): { respuesta: RespuestaRegistroExtraccion; auditoria: AuditoriaExtraccion | null } {
        const sinEfecto = (error: ReturnType<typeof errorNegocio>) => ({
          respuesta: fallo(error),
          auditoria: null,
        });
        if (previo?.estado !== "extraido") {
          return sinEfecto(
            errorNegocio(
              "reextraccion_no_aplica",
              "No hay una extracción previa de este documento que reextraer.",
            ),
          );
        }
        if (
          previo.reextraidaPor.filter((r) => r === regla).length >= MAX_REEXTRACCIONES_POR_REGLA
        ) {
          return sinEfecto(
            errorNegocio(
              "reextraccion_agotada",
              "Este documento ya se reextrajo por esa regla; la inconsistencia vigente decide.",
            ),
          );
        }
        const nombreSolicitante = registrados.find(
          (s) => s.idSolicitante === idSolicitante,
        )?.nombre;
        const { inconsistencias } = validarConsistencia({
          nombreSolicitante: nombreSolicitante ?? "",
          registros: [...deLaConversacion.values()],
        });
        const vigente = inconsistencias.some(
          (i) => i.regla === regla && i.corregible && i.adjuntos.includes(previo.adjunto),
        );
        if (nombreSolicitante === undefined || !vigente) {
          return sinEfecto(
            errorNegocio(
              "reextraccion_no_aplica",
              "La regla no es una inconsistencia corregible vigente de este documento.",
            ),
          );
        }
        // El resultado nuevo se revalida como cualquiera; si no pasa, el registro anterior se conserva.
        const validacion = validarResultado(resultado, contenido, ahora());
        const primero = primerError(validacion, adjunto, nombre);
        if (!validacion.ok || primero !== null) {
          return {
            respuesta: fallo(
              errorValidacion(
                "extraccion_invalida",
                `La reextracción no coincide con el documento: ${primero?.campo} (${primero?.motivo}).`,
                `resultado.${primero?.campo ?? "(raíz)"}`,
              ),
            ),
            auditoria: null,
          };
        }
        const registro: RegistroExtraccion = {
          ...validacion.resultado,
          adjuntos: previo.adjuntos,
          registradoEn: ahora().toISOString(),
          reextraidaPor: [...previo.reextraidaPor, regla],
        };
        deLaConversacion.set(registro.huella, registro);
        return {
          respuesta: exito({ extraccion: structuredClone(registro) }),
          auditoria: { ...auditoriaDe(registro), reextraccion: regla },
        };
      }

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
      const { correlationId, adjunto, nombre, contenido, resultado, reextraccion } = forma.data;

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
      if (reextraccion !== undefined) {
        return reemplazar({
          correlationId,
          idSolicitante: identidad.idSolicitante,
          previo,
          deLaConversacion,
          entrada: { adjunto, nombre, contenido, resultado },
          regla: reextraccion.regla,
        });
      }
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
        reextraidaPor: [],
      };
      deLaConversacion.set(registro.huella, registro);
      extracciones.set(correlationId, deLaConversacion);
      return {
        respuesta: exito({ extraccion: structuredClone(registro) }),
        auditoria: auditoriaDe(registro),
      };
    },

    verificarIngreso(entrada) {
      if (fallaSimulada.debeFallar()) return { respuesta: fallo(noDisponible()), auditoria: null };
      const sinEfecto = (respuesta: RespuestaVerificacionIngreso) => ({
        respuesta,
        auditoria: null,
      });
      const id = z.uuid().safeParse(entrada.correlationId);
      if (!id.success) {
        return sinEfecto(
          fallo(
            errorValidacion(
              "formato_invalido",
              "El correlationId debe ser un UUID.",
              "correlationId",
            ),
          ),
        );
      }
      const correlationId = id.data;
      const { ingresoDeclarado } = entrada;
      if (
        ingresoDeclarado !== undefined &&
        ingresoDeclarado !== null &&
        !esquemaIngresoDeclarado.safeParse(ingresoDeclarado).success
      ) {
        return sinEfecto(
          fallo(
            errorValidacion(
              "formato_invalido",
              "El ingreso declarado debe ser un entero de pesos, mayor o igual a 0.",
              "ingresoDeclarado",
            ),
          ),
        );
      }

      // Regla 1 del lado del servidor: sin identidad verificada no se calcula ni se guarda nada.
      const identidad = identidades.get(correlationId);
      if (identidad === undefined || !evaluarRegla1(identidad).permitido) {
        return sinEfecto(
          fallo(
            errorNegocio(
              "identidad_no_verificada",
              "No se verifica el ingreso sin la identidad del solicitante verificada.",
            ),
          ),
        );
      }
      const idSolicitante = identidad.idSolicitante;
      const nombreSolicitante = registrados.find((s) => s.idSolicitante === idSolicitante)?.nombre;
      if (idSolicitante === null || nombreSolicitante === undefined) {
        return sinEfecto(
          fallo(
            errorNegocio(
              "identidad_no_verificada",
              "El solicitante verificado no está registrado en el core.",
            ),
          ),
        );
      }

      const declarado =
        ingresoDeclarado === undefined
          ? (declarados.get(correlationId) ?? null)
          : (ingresoDeclarado as number | null);
      declarados.set(correlationId, declarado);
      const resultado = decidirIngreso({
        registros: [...(extracciones.get(correlationId)?.values() ?? [])],
        nombreSolicitante,
        idSolicitante,
        ingresoDeclarado: declarado,
      });
      const anterior = verificaciones.get(correlationId);
      const nueva: VerificacionIngreso = {
        correlationId,
        ...resultado,
        calculadaEn: ahora().toISOString(),
      };
      // La misma decisión con los mismos datos no cambia nada ni se audita otra vez (R9).
      if (anterior !== undefined && mismaVerificacion(anterior, nueva)) {
        return sinEfecto(exito({ verificacion: structuredClone(anterior) }));
      }
      verificaciones.set(correlationId, nueva);
      return {
        respuesta: exito({ verificacion: structuredClone(nueva) }),
        auditoria: auditoriaIngresoDe(nueva),
      };
    },

    consultarVerificacionIngreso(correlationId) {
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
      const guardada = verificaciones.get(id.data);
      return exito({ verificacion: guardada === undefined ? null : structuredClone(guardada) });
    },

    calcularCapacidadPago(argumentos) {
      if (fallaSimulada.debeFallar()) return fallo(noDisponible());
      const validacion = validarEntradaCapacidadPago(argumentos);
      if (!validacion.ok) return fallo(validacion.error);
      const { monto, plazoMeses, ingresoMensual, correlationId } = validacion.entrada;
      let cuotaMensual: number;
      let relacionCuotaIngresoPorcentaje: number;
      try {
        cuotaMensual = calcularCuota(monto, plazoMeses);
        relacionCuotaIngresoPorcentaje = calcularRelacionCuotaIngreso(cuotaMensual, ingresoMensual);
      } catch (error) {
        // Un monto que no da una cuota calculable es una entrada inválida, no una falla del core.
        if (error instanceof ErrorCuota) {
          return fallo(errorValidacion("monto_invalido", error.message, "monto"));
        }
        throw error;
      }
      // Solo lectura: se mira la verificación guardada, no se escribe nada. La fuente `verificado` la
      // asigna el core únicamente si el ingreso coincide con el que salió de los documentos (R3).
      const verificacion = verificaciones.get(correlationId);
      const fuenteIngreso: FuenteIngreso =
        verificacion?.estado === "verificado" && verificacion.ingreso?.monto === ingresoMensual
          ? "verificado"
          : "declarado";
      return exito({
        simulacion: {
          tipo: "simulacion",
          vinculante: false,
          monto,
          plazoMeses,
          ingresoMensual,
          fuenteIngreso,
          tasaMensualPuntosBase: TASA_MENSUAL_PUNTOS_BASE,
          cuotaMensual,
          relacionCuotaIngresoPorcentaje,
          aviso: AVISOS_CAPACIDAD_PAGO[fuenteIngreso],
          versionPolitica: VERSION_POLITICA,
        },
      });
    },

    registrarSolicitud(entrada) {
      if (fallaSimulada.debeFallar()) return { respuesta: fallo(noDisponible()), auditoria: null };
      const validacion = validarFormaRegistroSolicitud(entrada);
      if (!validacion.ok) return { respuesta: fallo(validacion.error), auditoria: null };
      const forma = validacion.entrada;
      const { correlationId, idSolicitante } = forma;

      // Regla 1 del lado del servidor: sin identidad verificada, y de este solicitante, no se guarda
      // nada (Principio IV). El solicitante que se guarda es siempre el verificado.
      const identidad = identidades.get(correlationId) ?? {
        correlationId,
        verificada: false,
        idSolicitante: null,
        verificadaEn: null,
      };
      const solicitante = registrados.find((s) => s.idSolicitante === identidad.idSolicitante);
      if (!evaluarRegla1(identidad, idSolicitante).permitido || solicitante === undefined) {
        return rechazarRegistro(
          forma,
          errorNegocio(
            "identidad_no_verificada",
            "No se registra una solicitud sin la identidad del solicitante verificada.",
          ),
        );
      }

      // Repetición: la misma clave en la conversación devuelve la solicitud ya registrada.
      const deLaConversacion = (registradasPorConversacion.get(correlationId) ?? [])
        .map((id) => registradas.get(id))
        .filter((s): s is SolicitudRegistrada => s !== undefined);
      const previa = deLaConversacion.find((s) => s.claveIdempotencia === forma.claveIdempotencia);
      if (previa !== undefined) {
        return {
          respuesta: exito({ solicitud: structuredClone(previa), repetida: true }),
          auditoria: null,
        };
      }

      // Solicitud abierta (R7): solo cuentan las registradas por esta herramienta.
      const abierta = [...registradas.values()].find(
        (s) =>
          s.solicitante.idSolicitante === idSolicitante &&
          (s.estado === "en_estudio" || s.estado === "preaprobada"),
      );
      if (abierta !== undefined) {
        return rechazarRegistro(
          forma,
          errorNegocio(
            "solicitud_abierta",
            `Este solicitante ya tiene la solicitud ${abierta.idSolicitud} abierta; un analista decide si se cambia.`,
          ),
        );
      }

      // Un documento no cubierto o no extraíble ya escaló: no se registra como solicitud (R11).
      const documentos = extraccionesDe(correlationId);
      const noAptos = documentos.filter((d) => d.estado !== "extraido");
      if (noAptos.length > 0) {
        return rechazarRegistro(
          forma,
          errorNegocio(
            "documentos_no_aptos",
            `No se registra con documentos no cubiertos o no extraíbles: adjunto ${noAptos
              .flatMap((d) => d.adjuntos)
              .join(", ")}.`,
          ),
        );
      }

      // El ingreso declarado y la verificación solo valen si son de este solicitante (R2).
      const verificacion = verificacionPropia(correlationId, idSolicitante);
      const ingresoDeclarado =
        verificacion === null ? null : (declarados.get(correlationId) ?? null);
      const errorProcedencia = errorDeProcedencia(forma, ingresoDeclarado);
      if (errorProcedencia !== null) return rechazarRegistro(forma, errorProcedencia);

      // Ya validado: se arma con lo que sabe el core y lo que citó el llamador.
      const enviada = forma.procedencia as Record<string, unknown>;
      const idSolicitud = `SOL-000${String(siguienteNumeroSolicitud).padStart(7, "0")}`;
      const registradaEn = ahora().toISOString();
      const solicitud = esquemaSolicitudRegistrada.parse({
        idSolicitud,
        correlationId,
        claveIdempotencia: forma.claveIdempotencia,
        estado: "en_estudio",
        registradaEn,
        solicitante: {
          idSolicitante: solicitante.idSolicitante,
          nombre: solicitante.nombre,
          documentoEnmascarado: enmascararDocumento(solicitante.documento),
        },
        monto: { valor: forma.monto, procedencia: enviada["monto"] },
        plazoMeses: { valor: forma.plazoMeses, procedencia: enviada["plazoMeses"] },
        ingresoDeclarado:
          ingresoDeclarado === null
            ? null
            : { valor: ingresoDeclarado, procedencia: enviada["ingresoDeclarado"] },
        verificacionIngreso: verificacion === null ? null : verificacionRegistrada(verificacion),
        datosExtraidos: structuredClone(documentos),
        preaprobacion: null,
        versionPolitica: VERSION_POLITICA,
      });
      siguienteNumeroSolicitud++;
      registradas.set(idSolicitud, solicitud);
      registradasPorConversacion.set(correlationId, [
        ...deLaConversacion.map((s) => s.idSolicitud),
        idSolicitud,
      ]);
      almacen.set(idSolicitud, {
        idSolicitud,
        solicitante: {
          nombre: solicitante.nombre,
          documento: solicitante.documento,
          correo: solicitante.correo,
        },
        monto: forma.monto,
        plazoMeses: forma.plazoMeses,
        estado: "en_estudio",
        creadaEn: registradaEn,
      });
      return {
        respuesta: exito({ solicitud: structuredClone(solicitud), repetida: false }),
        auditoria: auditoriaDeRegistro("registrada", forma, { idSolicitud }),
      };
    },

    preaprobarSolicitud(entrada) {
      if (fallaSimulada.debeFallar()) return { respuesta: fallo(noDisponible()), auditoria: null };
      const forma = validarEntradaPreaprobacion(entrada);
      if (!forma.ok) return { respuesta: fallo(forma.error), auditoria: null };
      const { correlationId } = forma;

      const auditar = (
        resultado: AuditoriaPreaprobacion["resultado"],
        solicitud: SolicitudRegistrada | undefined,
        decision: DecisionRegla2 | null,
        codigo?: string,
      ): AuditoriaPreaprobacion => ({
        resultado,
        regla: REGLA_2,
        ...(codigo !== undefined ? { codigo } : {}),
        ...(solicitud !== undefined ? { idSolicitud: solicitud.idSolicitud } : {}),
        idSolicitante: solicitud?.solicitante.idSolicitante ?? null,
        monto: solicitud?.monto.valor ?? null,
        plazoMeses: solicitud?.plazoMeses.valor ?? null,
        cuotaMensual: numeroDe(decision?.valores["cuotaMensual"]),
        ingresoVerificado: solicitud?.verificacionIngreso?.ingresoVerificado?.monto ?? null,
        versionPolitica: VERSION_POLITICA,
      });
      const bloquear = (
        error: ReturnType<typeof errorNegocio>,
        solicitud: SolicitudRegistrada | undefined,
        decision: DecisionRegla2 | null = null,
      ) => ({
        respuesta: fallo<ResultadoRegistro>(error),
        auditoria: auditar("bloqueada", solicitud, decision, error.codigo),
      });
      const sinIdentidad = () =>
        errorNegocio(
          "identidad_no_verificada",
          "No se preaprueba sin la identidad del solicitante verificada.",
        );

      // Regla 1 del lado del servidor (Principio IV): la identidad debe estar verificada y, una vez
      // hay solicitud, ser la de su dueño: la verificación de una persona no se transfiere a otra.
      const identidad = identidades.get(correlationId) ?? {
        correlationId,
        verificada: false,
        idSolicitante: null,
        verificadaEn: null,
      };
      if (!evaluarRegla1(identidad).permitido) return bloquear(sinIdentidad(), undefined);

      const ultima = registradasPorConversacion.get(correlationId)?.at(-1);
      const solicitud = ultima === undefined ? undefined : registradas.get(ultima);
      if (solicitud === undefined) {
        return {
          respuesta: fallo<ResultadoRegistro>(
            errorNegocio(
              "solicitud_no_registrada",
              "No hay una solicitud registrada en esta conversación: regístrala antes de preaprobar.",
            ),
          ),
          auditoria: null,
        };
      }
      if (!evaluarRegla1(identidad, solicitud.solicitante.idSolicitante).permitido) {
        return bloquear(sinIdentidad(), solicitud);
      }

      // Idempotente por solicitud (R7): ya preaprobada, se devuelve la misma sin otro efecto.
      if (solicitud.estado === "preaprobada") {
        return {
          respuesta: exito({ solicitud: structuredClone(solicitud), repetida: true }),
          auditoria: null,
        };
      }

      // Regla 2 con los datos de la solicitud registrada, nunca con lo que envíe el modelo (R3).
      const decision = evaluarRegla2({
        monto: solicitud.monto.valor,
        plazoMeses: solicitud.plazoMeses.valor,
        verificacion: solicitud.verificacionIngreso,
      });
      if (!decision.permitido) {
        return bloquear(
          errorNegocio(decision.codigo ?? "fuera_de_politica", decision.motivo),
          solicitud,
          decision,
        );
      }

      const preaprobadaEn = ahora().toISOString();
      const preaprobada = esquemaSolicitudRegistrada.parse({
        ...solicitud,
        estado: "preaprobada",
        preaprobacion: { preaprobadaEn, decision },
      });
      registradas.set(preaprobada.idSolicitud, preaprobada);
      const resumen = almacen.get(preaprobada.idSolicitud);
      if (resumen !== undefined) resumen.estado = "preaprobada";
      return {
        respuesta: exito({ solicitud: structuredClone(preaprobada), repetida: false }),
        auditoria: auditar("preaprobada", preaprobada, decision),
      };
    },

    consultarSolicitudRegistrada(correlationId) {
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
      const ultima = registradasPorConversacion.get(id.data)?.at(-1);
      const solicitud = ultima === undefined ? undefined : registradas.get(ultima);
      return exito({ solicitud: solicitud === undefined ? null : structuredClone(solicitud) });
    },

    escalarAAnalista(entrada) {
      if (fallaSimulada.debeFallar()) return { respuesta: fallo(noDisponible()), auditoria: null };
      const forma = validarEntradaEscalamiento(entrada);
      if (!forma.ok) return { respuesta: fallo(forma.error), auditoria: null };
      const { correlationId, motivo, codigo, declarado } = forma.entrada;

      // Un solo escalamiento por conversación: repetir, o llegar con otra clave u otra causa, devuelve el
      // primero y no audita (R8).
      const previo = escalamientos.get(correlationId);
      if (previo !== undefined) {
        return {
          respuesta: exito({ escalamiento: structuredClone(previo), repetida: true }),
          auditoria: null,
        };
      }

      const clasificacion = { motivo, ...(codigo !== undefined ? { codigo } : {}) };
      const causasAdicionales = (forma.entrada.causasAdicionales ?? []).map((a) => ({
        causa: a.causa,
        motivo: a.motivo,
        ...(a.codigo !== undefined ? { codigo: a.codigo } : {}),
        accionRecomendada: accionRecomendada({
          motivo: a.motivo,
          ...(a.codigo !== undefined ? { codigo: a.codigo } : {}),
        }),
      }));

      // Todo lo demás sale del estado del core, nunca de la entrada (R3).
      const identidad = identidades.get(correlationId);
      const identificado =
        identidad?.verificada === true
          ? registrados.find((s) => s.idSolicitante === identidad.idSolicitante)
          : undefined;
      const ultima = registradasPorConversacion.get(correlationId)?.at(-1);
      const registrada = ultima === undefined ? undefined : registradas.get(ultima);
      const solicitud =
        identificado !== undefined &&
        registrada?.solicitante.idSolicitante === identificado.idSolicitante
          ? registrada
          : undefined;
      const propia =
        identificado === undefined
          ? null
          : verificacionPropia(correlationId, identificado.idSolicitante);
      const verificacionIngreso =
        solicitud?.verificacionIngreso ?? (propia === null ? null : verificacionRegistrada(propia));

      const discrepancias: DiscrepanciaResumen[] = [];
      if (
        verificacionIngreso?.estado === "discrepancia" &&
        verificacionIngreso.discrepancia !== null
      ) {
        const d = verificacionIngreso.discrepancia;
        discrepancias.push({
          tipo: "ingreso",
          declarado: d.declarado,
          verificado: d.verificado,
          diferenciaPorcentaje: d.diferenciaPorcentaje,
          umbralPorcentaje: d.umbralPorcentaje,
        });
      }
      for (const i of verificacionIngreso?.inconsistencias ?? []) {
        if (i.detiene) {
          discrepancias.push({ tipo: "documental", regla: i.regla, adjuntos: [...i.adjuntos] });
        }
      }

      const base = {
        solicitante:
          identificado === undefined
            ? { identificado: false as const }
            : {
                identificado: true as const,
                idSolicitante: identificado.idSolicitante,
                nombre: identificado.nombre,
                documentoEnmascarado: enmascararDocumento(identificado.documento),
              },
        monto: solicitud?.monto ?? declarado?.monto ?? null,
        plazoMeses: solicitud?.plazoMeses ?? declarado?.plazoMeses ?? null,
        verificacionIngreso,
        datosExtraidos: extraccionesDe(correlationId),
      };
      const candidato = {
        idEscalamiento: "ESC-000" + String(siguienteNumeroEscalamiento),
        correlationId,
        claveIdempotencia: forma.entrada.claveIdempotencia,
        escaladoEn: ahora().toISOString(),
        versionPolitica: VERSION_POLITICA,
        causa: forma.entrada.causa,
        motivo,
        ...(codigo !== undefined ? { codigo } : {}),
        regla: reglaDeEscalamiento(motivo),
        accionRecomendada: accionRecomendada(clasificacion),
        causasAdicionales,
        ...base,
        solicitud:
          solicitud === undefined
            ? null
            : { idSolicitud: solicitud.idSolicitud, estado: solicitud.estado },
        ingresoDeclarado: solicitud?.ingresoDeclarado ?? null,
        discrepancias,
        decision:
          solicitud !== undefined && CAUSAS_CON_DECISION_DE_LA_REGLA_2.includes(forma.entrada.causa)
            ? decisionDeLaRegla2(solicitud)
            : null,
        pendientes: calcularPendientes(base),
        // Lo que el agente observó del mensaje: el core no lo sabe, solo lo guarda y lo valida (#16, R7).
        asuntosPendientes: forma.entrada.asuntosPendientes ?? [],
      };
      const analisis = esquemaResumenAnalista.safeParse(structuredClone(candidato));
      if (!analisis.success) {
        return {
          respuesta: fallo(
            errorNegocio("resumen_invalido", "El resumen del escalamiento no cumple su esquema."),
          ),
          auditoria: null,
        };
      }
      const resumen = analisis.data;
      siguienteNumeroEscalamiento++;
      escalamientos.set(correlationId, resumen);
      return {
        respuesta: exito({ escalamiento: structuredClone(resumen), repetida: false }),
        auditoria: {
          resultado: "escalada",
          regla: resumen.regla,
          causa: resumen.causa,
          motivo: resumen.motivo,
          ...(resumen.codigo !== undefined ? { codigo: resumen.codigo } : {}),
          causasAdicionales: resumen.causasAdicionales.length,
          idEscalamiento: resumen.idEscalamiento,
          ...(resumen.solicitud !== null ? { idSolicitud: resumen.solicitud.idSolicitud } : {}),
          ...(resumen.solicitante.identificado
            ? { idSolicitante: resumen.solicitante.idSolicitante }
            : {}),
          pendientes: [...resumen.pendientes],
          asuntosPendientes: [...resumen.asuntosPendientes],
          versionPolitica: VERSION_POLITICA,
        },
      };
    },

    consultarEscalamiento(correlationId) {
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
      const escalamiento = escalamientos.get(id.data);
      return exito({
        escalamiento: escalamiento === undefined ? null : structuredClone(escalamiento),
      });
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
 * La decisión explicable de la Regla 2 con lo que guarda la solicitud (#15, R3): la misma función de la
 * política que usan el hook y la preaprobación, sin repetir ningún umbral. Un escalamiento no se rechaza
 * porque la política diga que la solicitud cumple: la decisión lo deja a la vista del analista.
 */
function decisionDeLaRegla2(solicitud: SolicitudRegistrada) {
  const d = evaluarRegla2({
    monto: solicitud.monto.valor,
    plazoMeses: solicitud.plazoMeses.valor,
    verificacion: solicitud.verificacionIngreso,
  });
  return {
    regla: d.regla,
    motivo: d.motivo,
    valores: d.valores,
    versionPolitica: d.versionPolitica,
  };
}

/** Un valor de la decisión como número entero, o `null` si no está. */
const numeroDe = (valor: string | number | undefined): number | null =>
  typeof valor === "number" ? valor : null;

/** Dos verificaciones son la misma decisión si solo difiere la marca de tiempo (R9). */
function mismaVerificacion(a: VerificacionIngreso, b: VerificacionIngreso): boolean {
  const sinMarca = ({ calculadaEn: _marca, ...resto }: VerificacionIngreso) => resto;
  return JSON.stringify(sinMarca(a)) === JSON.stringify(sinMarca(b));
}

/** Auditoría de la Regla 3 (R9): estado y enteros; nunca fragmentos, valores de documentos ni nombres. */
function auditoriaIngresoDe(v: VerificacionIngreso): AuditoriaIngreso {
  return {
    regla: v.decision.regla,
    estado: v.estado,
    ingresoVerificado: v.ingreso?.monto ?? null,
    ingresoDeclarado: v.ingresoDeclarado,
    diferencia: v.discrepancia?.diferencia ?? null,
    umbralPorcentaje: v.discrepancia?.umbralPorcentaje ?? null,
    reglasInconsistencia: [...new Set(v.inconsistencias.map((i) => i.regla))],
    versionPolitica: v.decision.versionPolitica,
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
