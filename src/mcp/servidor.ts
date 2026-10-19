// Servidor MCP del core de originación (contracts/core-mcp.md; research.md, R1 y R10).
// El esquema de entrada anunciado describe los campos, pero la validación estricta se hace aquí,
// para que una entrada inválida devuelva el contrato `validacion` con su campo (FR-008)
// y no el error genérico del SDK. Las herramientas de identidad son del #9
// (specs/007-verificacion-identidad/contracts/core-mcp.md).

import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  aResultadoMcp,
  errorValidacion,
  esquemaError,
  fallo,
  type Respuesta,
} from "../compartido/errores.ts";
import {
  DESCRIPCION_CAPACIDAD_PAGO,
  esquemaSimulacionCapacidadPago,
} from "../compartido/capacidad-pago.ts";
import { esquemaRegistroExtraccion } from "../compartido/extraccion.ts";
import { esquemaVerificacionIngreso } from "../compartido/ingreso.ts";
import { DESCRIPCION_PREAPROBAR_CREDITO } from "../compartido/preaprobacion.ts";
import {
  DESCRIPCION_ESCALAR_A_ANALISTA,
  esquemaResumenAnalista,
} from "../compartido/escalamiento.ts";
import {
  DESCRIPCION_REGISTRAR_SOLICITUD,
  esquemaSolicitudRegistrada,
} from "../compartido/solicitud.ts";
import { registrar } from "../compartido/logs.ts";
import { MAX_INTENTOS_VERIFICACION } from "../politica/politica.ts";
import {
  esquemaCoincidencia,
  esquemaEstadoIdentidad,
  esquemaSolicitud,
  type Core,
} from "./core-simulado.ts";

export const NOMBRE_SERVIDOR = "crediagil-core";

const correlationId = z.uuid();

/** Entradas estrictas: tipos exactos y sin campos extra. Los valores los valida el core. */
const ENTRADAS = {
  consultar_solicitud: z.object({ idSolicitud: z.string(), correlationId }).strict(),
  buscar_solicitante: z
    .object({ documento: z.unknown().optional(), nombre: z.unknown().optional(), correlationId })
    .strict(),
  verificar_identidad: z
    .object({
      idSolicitante: z.unknown(),
      fechaExpedicion: z.unknown(),
      idIntento: z.unknown(),
      correlationId,
    })
    .strict(),
  consultar_identidad: z.object({ correlationId }).strict(),
  registrar_extraccion: z
    .object({
      adjunto: z.unknown(),
      nombre: z.unknown(),
      contenido: z.unknown(),
      resultado: z.unknown(),
      reextraccion: z.unknown().optional(),
      correlationId,
    })
    .strict(),
  consultar_extracciones: z.object({ correlationId }).strict(),
  // #11: el ingreso verificado no es un campo de entrada; lo calcula el core (R8).
  verificar_ingreso: z.object({ ingresoDeclarado: z.unknown().optional(), correlationId }).strict(),
  consultar_verificacion_ingreso: z.object({ correlationId }).strict(),
  // #12: los valores los valida el core, que rechaza cada dato inválido, o ausente, con su código y
  // su campo; por eso aquí son opcionales: su falta debe llegar al core y no quedarse en este esquema.
  calcular_capacidad_pago: z
    .object({
      monto: z.unknown().optional(),
      plazoMeses: z.unknown().optional(),
      ingresoMensual: z.unknown().optional(),
      correlationId,
    })
    .strict(),
  // #13: el ingreso verificado, las discrepancias y los datos extraídos no son campos de entrada: los
  // toma el core de su propio estado (R2). Los valores los valida el core, con su código y su campo.
  registrar_solicitud: z
    .object({
      idSolicitante: z.unknown(),
      monto: z.unknown(),
      plazoMeses: z.unknown(),
      claveIdempotencia: z.unknown(),
      procedencia: z.unknown(),
      correlationId,
    })
    .strict(),
  consultar_solicitud_registrada: z.object({ correlationId }).strict(),
  // #14: sin campos del modelo: monto, cuota e ingreso salen de la solicitud registrada (R3).
  preaprobar_credito: z.object({ correlationId }).strict(),
  // #15: el solicitante, la solicitud, los ingresos, los documentos y las discrepancias no son campos
  // de entrada: el resumen lo arma el core con su estado (R3). Los valores los valida el core.
  escalar_a_analista: z
    .object({
      // Primero: si falta, es el campo que se informa (la trazabilidad lo necesita).
      correlationId,
      claveIdempotencia: z.unknown(),
      causa: z.unknown(),
      motivo: z.unknown(),
      codigo: z.unknown().optional(),
      causasAdicionales: z.unknown().optional(),
      asuntosPendientes: z.unknown().optional(),
      declarado: z.unknown().optional(),
    })
    .strict(),
  consultar_escalamiento: z.object({ correlationId }).strict(),
} as const;

type NombreHerramienta = keyof typeof ENTRADAS;
type Entrada<N extends NombreHerramienta> = z.infer<(typeof ENTRADAS)[N]>;

function validarEntrada<N extends NombreHerramienta>(
  herramienta: N,
  argumentos: unknown,
): { ok: true; entrada: Entrada<N> } | { ok: false; respuesta: Respuesta<never> } {
  const entrada = ENTRADAS[herramienta].safeParse(argumentos);
  if (entrada.success) return { ok: true, entrada: entrada.data as Entrada<N> };
  const problema = entrada.error.issues[0];
  const campo =
    problema?.code === "unrecognized_keys"
      ? (problema.keys[0] ?? "entrada")
      : String(problema?.path[0] ?? "entrada");
  return {
    ok: false,
    respuesta: fallo(
      errorValidacion(
        "formato_invalido",
        `La entrada de ${herramienta} no es válida en el campo ${campo}.`,
        campo,
      ),
    ),
  };
}

/** El correlationId de los argumentos, aunque la entrada no valide, para la trazabilidad del log. */
function correlationIdDe(argumentos: unknown): string | null {
  const valor = (argumentos as { correlationId?: unknown } | undefined)?.correlationId;
  return typeof valor === "string" ? valor : null;
}

function registrarHerramienta(
  herramienta: NombreHerramienta,
  argumentos: unknown,
  respuesta: Respuesta<unknown>,
  campos: Record<string, unknown> = {},
): void {
  registrar("herramienta", {
    herramienta,
    correlationId: correlationIdDe(argumentos),
    resultado: respuesta.ok ? "ok" : respuesta.error.codigo,
    ...campos,
  });
}

/** La regla de una reextracción, para el log; nunca otro dato de la entrada. */
function reextraccionDe(reextraccion: unknown): { reextraccion?: string } {
  if (typeof reextraccion !== "object" || reextraccion === null) return {};
  const { regla } = reextraccion as { regla?: unknown };
  return typeof regla === "string" ? { reextraccion: regla.slice(0, 64) } : {};
}

/** Qué criterio usó la búsqueda, para el log; nunca su valor (R9). */
function criterioDe(entrada: Entrada<"buscar_solicitante">): "documento" | "nombre" | null {
  if (entrada.documento !== undefined) return "documento";
  return entrada.nombre === undefined ? null : "nombre";
}

/** Esquema anunciado de un campo obligatorio: opcional aquí para que su falta llegue a validarEntrada. */
const anunciado = (descripcion: string) => z.unknown().optional().describe(descripcion);

const CORRELATION_ID_ANUNCIADO = anunciado(
  "Obligatorio. UUID de la conversación, para trazabilidad.",
);

const salida = <T extends z.ZodRawShape>(datos: T) => ({
  ok: z.boolean(),
  datos: z.object(datos).optional(),
  error: esquemaError.optional(),
});

export function crearServidor(core: Core): McpServer {
  const servidor = new McpServer({ name: NOMBRE_SERVIDOR, version: "0.2.0" });

  servidor.registerTool(
    "consultar_solicitud",
    {
      title: "Consultar solicitud",
      description:
        "Consulta el estado de una solicitud de crédito del core de Crediágil por su identificador. Devuelve solicitud: null si no existe.",
      inputSchema: z.looseObject({
        idSolicitud: anunciado("Obligatorio. Identificador de la solicitud: SOL- y 10 dígitos."),
        correlationId: CORRELATION_ID_ANUNCIADO,
      }),
      outputSchema: salida({ solicitud: esquemaSolicitud.nullable() }),
    },
    (argumentos: unknown) => {
      const validacion = validarEntrada("consultar_solicitud", argumentos);
      const respuesta: Respuesta<unknown> = validacion.ok
        ? core.consultarSolicitud(validacion.entrada.idSolicitud)
        : validacion.respuesta;
      registrarHerramienta("consultar_solicitud", argumentos, respuesta);
      return aResultadoMcp(respuesta);
    },
  );

  servidor.registerTool(
    "buscar_solicitante",
    {
      title: "Buscar solicitante",
      description:
        "Busca solicitantes en el core de Crediágil por número de documento o por nombre completo (uno de los dos). Puede devolver cero, una o varias coincidencias; no elijas entre varias, pide el número de documento.",
      inputSchema: z.looseObject({
        documento: anunciado(
          "Número de documento de identidad, con o sin puntos, espacios o guiones. Usa documento o nombre, no ambos.",
        ),
        nombre: anunciado("Nombre completo del solicitante. Usa documento o nombre, no ambos."),
        correlationId: CORRELATION_ID_ANUNCIADO,
      }),
      outputSchema: salida({ coincidencias: z.array(esquemaCoincidencia) }),
      annotations: { readOnlyHint: true },
    },
    (argumentos: unknown) => {
      const validacion = validarEntrada("buscar_solicitante", argumentos);
      const respuesta = validacion.ok
        ? core.buscarSolicitante(validacion.entrada)
        : validacion.respuesta;
      // Solo el tipo de criterio y el número de coincidencias: nunca el valor buscado (R9).
      const criterio = validacion.ok ? criterioDe(validacion.entrada) : null;
      registrarHerramienta("buscar_solicitante", argumentos, respuesta, {
        criterio,
        coincidencias: respuesta.ok ? respuesta.datos.coincidencias.length : null,
      });
      return aResultadoMcp(respuesta);
    },
  );

  servidor.registerTool(
    "verificar_identidad",
    {
      title: "Verificar identidad",
      description: `Verifica la identidad de un solicitante encontrado con la fecha de expedición de su documento (AAAA-MM-DD). Si el dato no coincide, informa sin revelar el dato correcto. Tras ${MAX_INTENTOS_VERIFICACION} intentos fallidos la verificación queda bloqueada.`,
      inputSchema: z.looseObject({
        idSolicitante: anunciado("Obligatorio. Identificador del solicitante: CLI- y 10 dígitos."),
        fechaExpedicion: anunciado(
          "Obligatorio. Fecha de expedición del documento de identidad, AAAA-MM-DD.",
        ),
        idIntento: anunciado(
          "Obligatorio. Clave de idempotencia del intento (1 a 64 caracteres); repetirla no cuenta otro intento.",
        ),
        correlationId: CORRELATION_ID_ANUNCIADO,
      }),
      outputSchema: salida({ identidad: esquemaEstadoIdentidad }),
    },
    (argumentos: unknown) => {
      const validacion = validarEntrada("verificar_identidad", argumentos);
      if (!validacion.ok) {
        registrarHerramienta("verificar_identidad", argumentos, validacion.respuesta);
        return aResultadoMcp(validacion.respuesta);
      }
      const { respuesta, auditoria } = core.verificarIdentidad(validacion.entrada);
      registrarHerramienta("verificar_identidad", argumentos, respuesta);
      // Auditoría de la Regla 1 (R9): resultado y valores usados, nunca la fecha.
      if (auditoria !== null) {
        registrar("auditoria", {
          regla: "Regla 1",
          correlationId: validacion.entrada.correlationId,
          ...auditoria,
        });
      }
      return aResultadoMcp(respuesta);
    },
  );

  servidor.registerTool(
    "consultar_identidad",
    {
      title: "Consultar identidad",
      description: "Devuelve el estado de identidad verificada de la conversación. Solo lectura.",
      inputSchema: z.looseObject({ correlationId: CORRELATION_ID_ANUNCIADO }),
      outputSchema: salida({ identidad: esquemaEstadoIdentidad }),
      annotations: { readOnlyHint: true },
    },
    (argumentos: unknown) => {
      const validacion = validarEntrada("consultar_identidad", argumentos);
      const respuesta = validacion.ok
        ? core.consultarIdentidad(validacion.entrada.correlationId)
        : validacion.respuesta;
      registrarHerramienta("consultar_identidad", argumentos, respuesta, {
        verificada: respuesta.ok ? respuesta.datos.identidad.verificada : null,
      });
      return aResultadoMcp(respuesta);
    },
  );

  servidor.registerTool(
    "registrar_extraccion",
    {
      title: "Registrar extracción",
      description:
        "Registra el resultado de extraer un documento de soporte, con la procedencia de cada dato. Exige la identidad verificada, revalida cada fragmento contra el contenido y es idempotente por la huella del contenido; no guarda el contenido.",
      inputSchema: z.looseObject({
        adjunto: anunciado(
          "Obligatorio. Número de adjunto del documento en la conversación (≥ 1).",
        ),
        nombre: anunciado("Obligatorio. Nombre del documento (1 a 255 caracteres)."),
        contenido: anunciado(
          "Obligatorio. Texto del documento, solo para revalidar; no se guarda ni va a los logs.",
        ),
        resultado: anunciado(
          "Obligatorio. Resultado de la extracción: extraido, no_cubierto o no_extraible.",
        ),
        reextraccion: anunciado(
          "Opcional. { regla }: pide reemplazar el registro tras una inconsistencia corregible; el core la recalcula y la acepta una vez por documento y regla.",
        ),
        correlationId: CORRELATION_ID_ANUNCIADO,
      }),
      outputSchema: salida({ extraccion: esquemaRegistroExtraccion }),
    },
    (argumentos: unknown) => {
      const validacion = validarEntrada("registrar_extraccion", argumentos);
      if (!validacion.ok) {
        registrarHerramienta("registrar_extraccion", argumentos, validacion.respuesta);
        return aResultadoMcp(validacion.respuesta);
      }
      const { respuesta, auditoria } = core.registrarExtraccion(validacion.entrada);
      // Solo metadatos: nunca el contenido, los valores ni los fragmentos (FR-017).
      registrarHerramienta("registrar_extraccion", argumentos, respuesta, {
        adjunto: typeof validacion.entrada.adjunto === "number" ? validacion.entrada.adjunto : null,
        estado: respuesta.ok ? respuesta.datos.extraccion.estado : null,
        ...reextraccionDe(validacion.entrada.reextraccion),
      });
      if (auditoria !== null) {
        registrar("auditoria_extraccion", {
          correlationId: validacion.entrada.correlationId,
          ...auditoria,
        });
      }
      return aResultadoMcp(respuesta);
    },
  );

  servidor.registerTool(
    "consultar_extracciones",
    {
      title: "Consultar extracciones",
      description:
        "Devuelve las extracciones de documentos registradas en la conversación, ordenadas por adjunto. Solo lectura.",
      inputSchema: z.looseObject({ correlationId: CORRELATION_ID_ANUNCIADO }),
      outputSchema: salida({ extracciones: z.array(esquemaRegistroExtraccion) }),
      annotations: { readOnlyHint: true },
    },
    (argumentos: unknown) => {
      const validacion = validarEntrada("consultar_extracciones", argumentos);
      const respuesta = validacion.ok
        ? core.consultarExtracciones(validacion.entrada.correlationId)
        : validacion.respuesta;
      registrarHerramienta("consultar_extracciones", argumentos, respuesta, {
        extracciones: respuesta.ok ? respuesta.datos.extracciones.length : null,
      });
      return aResultadoMcp(respuesta);
    },
  );

  servidor.registerTool(
    "verificar_ingreso",
    {
      title: "Verificar ingreso",
      description:
        "Calcula el ingreso mensual verificado con los documentos ya extraídos, lo compara con el declarado y contrasta los documentos entre sí. Exige la identidad verificada. El ingreso verificado lo calcula el core; no se envía.",
      inputSchema: z.looseObject({
        ingresoDeclarado: anunciado(
          "Opcional. Ingreso mensual que declaró el solicitante, entero de pesos ≥ 0. Ausente conserva el último; null lo borra.",
        ),
        correlationId: CORRELATION_ID_ANUNCIADO,
      }),
      outputSchema: salida({ verificacion: esquemaVerificacionIngreso }),
    },
    (argumentos: unknown) => {
      const validacion = validarEntrada("verificar_ingreso", argumentos);
      if (!validacion.ok) {
        registrarHerramienta("verificar_ingreso", argumentos, validacion.respuesta);
        return aResultadoMcp(validacion.respuesta);
      }
      const { respuesta, auditoria } = core.verificarIngreso(validacion.entrada);
      // Solo el estado: nunca valores de documentos, fragmentos ni nombres (R9).
      registrarHerramienta("verificar_ingreso", argumentos, respuesta, {
        estado: respuesta.ok ? respuesta.datos.verificacion.estado : null,
      });
      if (auditoria !== null) {
        registrar("auditoria_ingreso", {
          correlationId: validacion.entrada.correlationId,
          ...auditoria,
        });
      }
      return aResultadoMcp(respuesta);
    },
  );

  servidor.registerTool(
    "consultar_verificacion_ingreso",
    {
      title: "Consultar verificación de ingreso",
      description:
        "Devuelve la última verificación de ingreso de la conversación, o null si todavía no se verificó. Solo lectura.",
      inputSchema: z.looseObject({ correlationId: CORRELATION_ID_ANUNCIADO }),
      outputSchema: salida({ verificacion: esquemaVerificacionIngreso.nullable() }),
      annotations: { readOnlyHint: true },
    },
    (argumentos: unknown) => {
      const validacion = validarEntrada("consultar_verificacion_ingreso", argumentos);
      const respuesta = validacion.ok
        ? core.consultarVerificacionIngreso(validacion.entrada.correlationId)
        : validacion.respuesta;
      registrarHerramienta("consultar_verificacion_ingreso", argumentos, respuesta, {
        estado: respuesta.ok ? (respuesta.datos.verificacion?.estado ?? null) : null,
      });
      return aResultadoMcp(respuesta);
    },
  );

  servidor.registerTool(
    "calcular_capacidad_pago",
    {
      title: "Calcular capacidad de pago",
      description: DESCRIPCION_CAPACIDAD_PAGO,
      inputSchema: z.looseObject({
        monto: anunciado("Obligatorio. Monto en pesos colombianos, entero positivo."),
        plazoMeses: anunciado("Obligatorio. Plazo en meses, entero positivo."),
        ingresoMensual: anunciado("Obligatorio. Ingreso mensual en pesos, entero positivo."),
        correlationId: CORRELATION_ID_ANUNCIADO,
      }),
      outputSchema: salida({ simulacion: esquemaSimulacionCapacidadPago }),
      annotations: { readOnlyHint: true },
    },
    (argumentos: unknown) => {
      const validacion = validarEntrada("calcular_capacidad_pago", argumentos);
      const respuesta = validacion.ok
        ? core.calcularCapacidadPago(validacion.entrada)
        : validacion.respuesta;
      // Solo el resultado y la fuente del ingreso: nunca el monto, el ingreso ni la cuota (FR-015).
      registrarHerramienta(
        "calcular_capacidad_pago",
        argumentos,
        respuesta,
        respuesta.ok ? { fuenteIngreso: respuesta.datos.simulacion.fuenteIngreso } : {},
      );
      return aResultadoMcp(respuesta);
    },
  );

  servidor.registerTool(
    "registrar_solicitud",
    {
      title: "Registrar solicitud",
      description: DESCRIPCION_REGISTRAR_SOLICITUD,
      inputSchema: z.looseObject({
        idSolicitante: anunciado(
          "Obligatorio. Identificador del solicitante verificado: CLI- y 10 dígitos.",
        ),
        monto: anunciado("Obligatorio. Monto en pesos colombianos, entero positivo."),
        plazoMeses: anunciado("Obligatorio. Plazo en meses, entero positivo."),
        claveIdempotencia: anunciado(
          "Obligatorio. Clave de la solicitud (1 a 64 caracteres); repetirla no crea otra.",
        ),
        procedencia: anunciado(
          "Obligatorio. Origen de cada dato: monto, plazoMeses e ingresoDeclarado si lo hay; cada uno es una afirmación del solicitante (tipo afirmacion, fragmento) o un documento (tipo documento, adjunto, nombre, fragmento).",
        ),
        correlationId: CORRELATION_ID_ANUNCIADO,
      }),
      outputSchema: salida({
        solicitud: esquemaSolicitudRegistrada,
        repetida: z.boolean(),
      }),
    },
    (argumentos: unknown) => {
      const validacion = validarEntrada("registrar_solicitud", argumentos);
      if (!validacion.ok) {
        registrarHerramienta("registrar_solicitud", argumentos, validacion.respuesta);
        return aResultadoMcp(validacion.respuesta);
      }
      const { respuesta, auditoria } = core.registrarSolicitud(validacion.entrada);
      // Solo el resultado y el identificador: nunca montos, citas ni nombres de documentos (R9).
      registrarHerramienta(
        "registrar_solicitud",
        argumentos,
        respuesta,
        respuesta.ok ? { idSolicitud: respuesta.datos.solicitud.idSolicitud } : {},
      );
      if (auditoria !== null) {
        registrar("auditoria_solicitud", {
          correlationId: validacion.entrada.correlationId,
          ...auditoria,
        });
      }
      return aResultadoMcp(respuesta);
    },
  );

  servidor.registerTool(
    "consultar_solicitud_registrada",
    {
      title: "Consultar solicitud registrada",
      description:
        "Devuelve la solicitud registrada en la conversación, con la procedencia de cada dato, o null si todavía no se registró. Solo lectura.",
      inputSchema: z.looseObject({ correlationId: CORRELATION_ID_ANUNCIADO }),
      outputSchema: salida({ solicitud: esquemaSolicitudRegistrada.nullable() }),
      annotations: { readOnlyHint: true },
    },
    (argumentos: unknown) => {
      const validacion = validarEntrada("consultar_solicitud_registrada", argumentos);
      const respuesta = validacion.ok
        ? core.consultarSolicitudRegistrada(validacion.entrada.correlationId)
        : validacion.respuesta;
      registrarHerramienta("consultar_solicitud_registrada", argumentos, respuesta, {
        solicitud: respuesta.ok ? respuesta.datos.solicitud !== null : null,
      });
      return aResultadoMcp(respuesta);
    },
  );

  servidor.registerTool(
    "preaprobar_credito",
    {
      title: "Preaprobar crédito",
      description: DESCRIPCION_PREAPROBAR_CREDITO,
      inputSchema: z.looseObject({ correlationId: CORRELATION_ID_ANUNCIADO }),
      outputSchema: salida({
        solicitud: esquemaSolicitudRegistrada,
        repetida: z.boolean(),
      }),
    },
    (argumentos: unknown) => {
      const validacion = validarEntrada("preaprobar_credito", argumentos);
      if (!validacion.ok) {
        registrarHerramienta("preaprobar_credito", argumentos, validacion.respuesta);
        return aResultadoMcp(validacion.respuesta);
      }
      const { respuesta, auditoria } = core.preaprobarSolicitud(validacion.entrada);
      // Solo el resultado y el identificador: nunca montos, cuotas ni ingresos (R10).
      registrarHerramienta(
        "preaprobar_credito",
        argumentos,
        respuesta,
        respuesta.ok ? { idSolicitud: respuesta.datos.solicitud.idSolicitud } : {},
      );
      if (auditoria !== null) {
        registrar("auditoria_preaprobacion", {
          correlationId: validacion.entrada.correlationId,
          ...auditoria,
        });
      }
      return aResultadoMcp(respuesta);
    },
  );

  servidor.registerTool(
    "escalar_a_analista",
    {
      title: "Escalar a analista",
      description: DESCRIPCION_ESCALAR_A_ANALISTA,
      inputSchema: z.looseObject({
        claveIdempotencia: anunciado(
          "Obligatorio. Clave del escalamiento (1 a 64 caracteres); repetirla no crea otro.",
        ),
        causa: anunciado(
          "Obligatorio. Una de peticion_de_persona, monto_sobre_umbral, cuota_sobre_porcentaje, discrepancia_de_ingreso o caso_no_cubierto.",
        ),
        motivo: anunciado("Obligatorio. El motivo de la señal de escalamiento."),
        codigo: anunciado(
          "Opcional. Solo con el motivo preaprobacion_fuera_de_politica, y obligatorio entonces: el código del bloqueo.",
        ),
        causasAdicionales: anunciado(
          "Opcional. Hasta 8 causas más del mismo caso, cada una con causa, motivo y código opcional.",
        ),
        asuntosPendientes: anunciado(
          "Opcional. Los asuntos del mensaje del solicitante que quedaron sin atender: una lista sin repetidos de solicitud, documentos o cuota.",
        ),
        declarado: anunciado(
          "Opcional. Monto y plazo que dijo el solicitante, cada uno con valor entero positivo y procedencia; solo se usa si no hay solicitud registrada.",
        ),
        correlationId: CORRELATION_ID_ANUNCIADO,
      }),
      outputSchema: salida({
        escalamiento: esquemaResumenAnalista,
        repetida: z.boolean(),
      }),
    },
    (argumentos: unknown) => {
      const validacion = validarEntrada("escalar_a_analista", argumentos);
      if (!validacion.ok) {
        registrarHerramienta("escalar_a_analista", argumentos, validacion.respuesta);
        return aResultadoMcp(validacion.respuesta);
      }
      const { respuesta, auditoria } = core.escalarAAnalista(validacion.entrada);
      // Solo el resultado y el identificador: nunca nombres, montos, documentos ni citas (R11).
      registrarHerramienta(
        "escalar_a_analista",
        argumentos,
        respuesta,
        respuesta.ok ? { idEscalamiento: respuesta.datos.escalamiento.idEscalamiento } : {},
      );
      if (auditoria !== null) {
        registrar("auditoria_escalamiento", {
          correlationId: validacion.entrada.correlationId,
          ...auditoria,
        });
      }
      return aResultadoMcp(respuesta);
    },
  );

  servidor.registerTool(
    "consultar_escalamiento",
    {
      title: "Consultar escalamiento",
      description:
        "Devuelve el escalamiento de la conversación, con el resumen completo para el analista, o null si no se escaló. Solo lectura.",
      inputSchema: z.looseObject({ correlationId: CORRELATION_ID_ANUNCIADO }),
      outputSchema: salida({ escalamiento: esquemaResumenAnalista.nullable() }),
      annotations: { readOnlyHint: true },
    },
    (argumentos: unknown) => {
      const validacion = validarEntrada("consultar_escalamiento", argumentos);
      const respuesta = validacion.ok
        ? core.consultarEscalamiento(validacion.entrada.correlationId)
        : validacion.respuesta;
      registrarHerramienta("consultar_escalamiento", argumentos, respuesta, {
        escalamiento: respuesta.ok ? respuesta.datos.escalamiento !== null : null,
      });
      return aResultadoMcp(respuesta);
    },
  );

  return servidor;
}
