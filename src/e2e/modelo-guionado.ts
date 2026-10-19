// Modelo guionado (specs/015-casos-prueba-extremo-a-extremo: research.md, R2 y R3). Sustituye solo lo
// que comprende el modelo: la consulta de la conversación, el subagente de extracción y el clasificador
// de documentos. Para cada llamada del guion hace lo mismo que el SDK: corre los hooks PreToolUse
// registrados (identidad y Regla 2) y, si ninguno la deniega, ejecuta la herramienta real del adaptador.
// La decisión de crédito sigue siendo del código; el guion no decide nada.

import { z } from "zod";
import type { HookCallback, HookInput, Options } from "@anthropic-ai/claude-agent-sdk";
import type { ContextoConsulta, QueryFn } from "../agente/agente.ts";
import { CLAVE_SERVIDOR } from "../agente/adaptador.ts";
import type {
  ClasificarDocumento,
  EjecutarSubagente,
  RespuestaSubagente,
} from "../agente/extraccion.ts";
import type { Guion, LlamadaGuionada } from "./guion.ts";

/** El paso del caso que se está enviando; el ejecutor lo avanza antes de cada turno. */
export interface Cursor {
  paso: number;
}

export interface ModeloGuionado {
  cursor: Cursor;
  ejecutarConsulta: QueryFn;
  ejecutarSubagente: EjecutarSubagente;
  clasificarDocumento: ClasificarDocumento;
  /** Problemas del propio guion (una entrada inválida, una herramienta ausente); vacío si no hubo. */
  problemas: string[];
}

type Salida = { hookSpecificOutput?: { permissionDecision?: string } };

/** Como el SDK, los `matcher` son expresiones regulares sobre el nombre completo de la herramienta. */
const coincide = (matcher: string | undefined, nombre: string) =>
  matcher === undefined || new RegExp(`^(?:${matcher})$`).test(nombre);

async function lasDeniega(
  hooks: NonNullable<Options["hooks"]>["PreToolUse"],
  nombre: string,
  entrada: unknown,
  idLlamada: string,
): Promise<boolean> {
  for (const grupo of hooks ?? []) {
    if (!coincide(grupo.matcher, nombre)) continue;
    for (const hook of grupo.hooks as HookCallback[]) {
      const input = {
        session_id: "e2e",
        transcript_path: "",
        cwd: ".",
        hook_event_name: "PreToolUse",
        tool_name: nombre,
        tool_input: entrada,
        tool_use_id: idLlamada,
      } as HookInput;
      const salida = (await hook(input, idLlamada, {
        signal: new AbortController().signal,
      })) as Salida;
      if (salida.hookSpecificOutput?.permissionDecision === "deny") return true;
    }
  }
  return false;
}

async function ejecutarLlamada(
  options: Options,
  contexto: ContextoConsulta,
  llamada: LlamadaGuionada,
  indice: number,
  problemas: string[],
): Promise<void> {
  const nombre = `mcp__${CLAVE_SERVIDOR}__${llamada.herramienta}`;
  const herramientas = contexto.herramientas as unknown as Record<
    string,
    { esquema: z.ZodRawShape; manejar: (entrada: unknown) => Promise<unknown> } | undefined
  >;
  const herramienta = herramientas[llamada.herramienta];
  if (herramienta === undefined) {
    problemas.push(`la herramienta ${llamada.herramienta} no está disponible para el modelo`);
    return;
  }
  // El SDK valida la entrada con el esquema de la herramienta antes de llamarla; aquí igual.
  const entrada = z.object(herramienta.esquema).safeParse(llamada.entrada);
  if (!entrada.success) {
    problemas.push(`entrada inválida para ${llamada.herramienta}: ${entrada.error.message}`);
    return;
  }
  const idLlamada = `guion-${indice}`;
  if (await lasDeniega(options.hooks?.PreToolUse, nombre, entrada.data, idLlamada)) return;
  await herramienta.manejar(entrada.data);
}

export function crearModeloGuionado(guion: Guion): ModeloGuionado {
  const cursor: Cursor = { paso: 0 };
  const problemas: string[] = [];

  const ejecutarConsulta: QueryFn = async function* ({ options }, contexto) {
    const paso = guion.pasos[cursor.paso];
    if (paso === undefined) {
      problemas.push(`el guion no tiene el paso ${cursor.paso + 1}`);
    }
    for (const [indice, llamada] of (paso?.llamadas ?? []).entries()) {
      await ejecutarLlamada(options, contexto, llamada, indice, problemas);
    }
    yield {
      type: "result",
      subtype: "success",
      stop_reason: "end_turn",
      result: paso?.respuesta ?? "…",
      num_turns: 1,
      is_error: false,
    } as never;
  };

  const ejecutarSubagente: EjecutarSubagente = async ({
    documento,
  }): Promise<RespuestaSubagente> => {
    const salida = guion.extracciones[documento.nombre];
    if (salida === undefined) {
      problemas.push(`el guion no trae la extracción de ${documento.nombre}`);
      return { ok: false, causa: "sin_salida_estructurada", detalle: "sin extracción en el guion" };
    }
    return { ok: true, salida };
  };

  const clasificarDocumento: ClasificarDocumento = async ({ documento }) => {
    const tipo = guion.clasificacion[documento.nombre];
    if (tipo === undefined) {
      problemas.push(`el guion no trae la clasificación de ${documento.nombre}`);
      return { ok: false, causa: "salida_invalida", detalle: "sin clasificación en el guion" };
    }
    return { ok: true, tipo };
  };

  return { cursor, ejecutarConsulta, ejecutarSubagente, clasificarDocumento, problemas };
}
