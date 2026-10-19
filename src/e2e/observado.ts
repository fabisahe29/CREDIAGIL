// Resultado observado de un caso (specs/015-casos-prueba-extremo-a-extremo: research.md, R1; data-model.md,
// "Resultado observado"). Se arma con tres fuentes del propio sistema, nunca con el texto de la respuesta:
// el resultado de cada turno (decisión, causa, eventos), las llamadas al core que reporta el observador
// y las lecturas del estado final del core por su cliente MCP.

import type { ResultadoConversacion } from "../agente/agente.ts";
import type { ClienteCore } from "../agente/cliente-core.ts";
import type { InfoHerramienta } from "../agente/adaptador.ts";
import { CAMPOS_CERTIFICADO } from "./esperado.ts";
import type {
  CampoObservado,
  EstadoCoreObservado,
  LlamadaObservada,
  ModoEjecucion,
  Observado,
} from "./veredicto.ts";

export interface Recolector {
  alUsarHerramienta: (info: InfoHerramienta) => void;
  /** Toma lo que importa de un turno: eventos y, si escaló, la señal y la entrega. */
  registrarTurno: (resultado: ResultadoConversacion) => void;
  /** Lee el estado final del core y arma el observado. Nunca lanza. */
  leerCore: (core: ClienteCore, correlationId: string) => Promise<Observado>;
}

/**
 * Una lectura que falla se toma como «no consta». Es coherente con la falla simulada `siempre`: si todas
 * las llamadas fallan, el core nunca llegó a guardar nada; con `una-vez` solo falla la primera.
 */
async function leer<T>(lectura: () => Promise<{ ok: boolean; datos?: T }>): Promise<T | null> {
  try {
    const respuesta = await lectura();
    return respuesta.ok && respuesta.datos !== undefined ? respuesta.datos : null;
  } catch {
    return null;
  }
}

export function crearRecolector(modo: ModoEjecucion): Recolector {
  const llamadas: LlamadaObservada[] = [];
  const eventos: string[] = [];
  let escalamiento: ResultadoConversacion["escalamiento"] = null;
  let causa: string | undefined;
  let entrega: Observado["entrega"] = null;

  return {
    alUsarHerramienta(info) {
      llamadas.push({
        herramienta: info.herramienta,
        intento: info.intento,
        resultado: info.resultado,
      });
    },

    registrarTurno(resultado) {
      for (const evento of resultado.eventos) eventos.push(evento.tipo);
      if (resultado.tipo !== "escalada" || escalamiento !== null) return;
      escalamiento = resultado.escalamiento;
      entrega = resultado.entrega;
      const evento = resultado.eventos.findLast((e) => e.tipo === "escalamiento");
      const deLaCausa = evento?.valores?.["causaEscalamiento"];
      causa = typeof deLaCausa === "string" ? deLaCausa : undefined;
    },

    async leerCore(core, correlationId) {
      const solicitud = await leer(async () => {
        const r = await core.consultarSolicitudRegistrada(correlationId);
        return r.ok ? { ok: true, datos: r.datos.solicitud } : { ok: false };
      });
      const verificacion = await leer(async () => {
        const r = await core.consultarVerificacionIngreso(correlationId);
        return r.ok ? { ok: true, datos: r.datos.verificacion } : { ok: false };
      });
      const registros = await leer(async () => {
        const r = await core.consultarExtracciones(correlationId);
        return r.ok ? { ok: true, datos: r.datos.extracciones } : { ok: false };
      });
      const resumen = await leer(async () => {
        const r = await core.consultarEscalamiento(correlationId);
        return r.ok ? { ok: true, datos: r.datos.escalamiento } : { ok: false };
      });

      const campos: CampoObservado[] = [];
      for (const registro of registros ?? []) {
        if (registro.estado !== "extraido" || registro.documento.tipo !== "certificado_laboral") {
          continue;
        }
        for (const campo of CAMPOS_CERTIFICADO) {
          campos.push({
            documento: registro.nombre,
            campo,
            valor: registro.documento[campo]?.valor ?? null,
          });
        }
      }
      const estadoCore: EstadoCoreObservado = {
        solicitudRegistrada: solicitud !== null,
        preaprobada: solicitud?.estado === "preaprobada",
        ingresoVerificado: verificacion?.ingreso?.monto ?? null,
        campos,
        escalamientoRegistrado: resumen !== null,
      };

      // Precedencia (data-model.md): escalada > preaprobada > bloqueada > solicitud_de_dato > en_curso.
      const decision: Observado["decision"] =
        escalamiento !== null
          ? "escalada"
          : estadoCore.preaprobada
            ? "preaprobada"
            : eventos.includes("bloqueo_por_regla")
              ? "bloqueada"
              : eventos.includes("solicitud_de_dato")
                ? "solicitud_de_dato"
                : "en_curso";

      const senal = escalamiento as ResultadoConversacion["escalamiento"];
      return {
        modo,
        decision,
        ...(causa !== undefined ? { causa } : {}),
        ...(senal !== null ? { motivo: senal.motivo } : {}),
        ...(senal?.codigo !== undefined ? { codigoBloqueo: senal.codigo } : {}),
        llamadas: [...llamadas],
        eventos: [...eventos],
        estadoCore,
        entrega,
      };
    },
  };
}
