// Bucle del chat de terminal (specs/006-interfaz-chat/contracts/chat-cli.md). La E/S y `conversar`
// se inyectan para probarlo sin red ni modelo. La interfaz solo llama a `conversar`: no toca el
// core ni decide nada de crédito (Principio IV); el estado sale solo de eventos validados (FR-007).

import { randomUUID } from "node:crypto";
import type { OpcionesConversar, ResultadoConversacion } from "../agente/agente.ts";
import type { ClienteCore } from "../agente/cliente-core.ts";
import { ETIQUETAS_DOCUMENTO, neutralizarEtiquetas } from "../compartido/etiquetas.ts";
import { validarEvento } from "../compartido/eventos.ts";
import { registrar } from "../compartido/logs.ts";
import { cargarCaso } from "./casos.ts";
import { interpretarLinea, TEXTO_AYUDA } from "./comandos.ts";
import { componerMensaje, detalleAdjunto, leerDocumento, metadatosParaLog } from "./documentos.ts";
import {
  TRABAJANDO,
  formatearAdjunto,
  formatearAgente,
  formatearCabecera,
  formatearEstado,
  formatearEvento,
  formatearHerramienta,
  formatearSolicitante,
  textoEstado,
} from "./presentacion.ts";
import {
  aplicarEventos,
  estaCerrada,
  nuevaConversacion,
  registrarTurno,
  type EventoMostrado,
} from "./sesion.ts";

/** Lo mínimo que el chat necesita de la terminal; `principal.ts` la conecta con readline. */
export interface Terminal {
  escribir(texto: string): void;
  /** Muestra el indicador de entrada: normal o dentro de un bloque /pegar. */
  pedir(modo: "normal" | "bloque"): void;
  alRecibirLinea(manejador: (linea: string) => void): void;
  /** Fin de la entrada (EOF): el chat espera el turno en curso y termina. */
  alCerrar(manejador: () => void): void;
}

export type FnConversar = (
  mensaje: string,
  opciones: OpcionesConversar,
) => Promise<ResultadoConversacion>;

export interface OpcionesChat {
  terminal: Terminal;
  conversar: FnConversar;
  /** El core se arranca una vez por ejecución y se reutiliza en todas las conversaciones. */
  core: ClienteCore;
  rutaLog: string;
  /** Modo de demostración: una línea por cada intento de herramienta (FR-009). */
  demo?: boolean;
  color?: boolean;
  /** Desde dónde se resuelven las rutas relativas de /adjuntar y /caso. */
  directorioBase?: string;
  /** Caso que se reproduce apenas arranca (opción --caso). */
  casoInicial?: string;
  nuevoId?: () => string;
}

const AVISO_OCUPADO = "Espera la respuesta del agente; tu mensaje no se envió.";

const pasos = (n: number) => (n === 1 ? "1 paso" : `${n} pasos`);

const causaDe = (error: unknown) =>
  error instanceof Error ? `${error.name}: ${error.message}` : String(error);

/** Arranca el chat; la promesa se resuelve al salir, con el core ya cerrado. */
export function iniciarChat({
  terminal,
  conversar,
  core,
  rutaLog,
  demo = false,
  color = false,
  directorioBase = process.cwd(),
  casoInicial,
  nuevoId = randomUUID,
}: OpcionesChat): Promise<void> {
  let conv = nuevaConversacion(nuevoId());
  let ocupado = false;
  let avisado = false;
  let bloque: string[] | null = null;
  let terminado = false;
  let tareaActual: Promise<void> = Promise.resolve();
  let resolverFin: () => void = () => {};
  const fin = new Promise<void>((resolver) => {
    resolverFin = resolver;
  });

  const escribir = (texto: string) => terminal.escribir(texto);

  function pedir(): void {
    if (!terminado && !ocupado) terminal.pedir(bloque === null ? "normal" : "bloque");
  }

  async function terminar(): Promise<void> {
    if (terminado) return;
    terminado = true;
    try {
      await core.cerrar();
    } catch (error) {
      registrar("error_cierre_core", { causa: causaDe(error) }, { nivel: "error" });
    }
    resolverFin();
  }

  /** Ejecuta una acción que habla con el agente; mientras dura, la entrada se descarta (FR-003). */
  function ejecutar(accion: () => Promise<void>): void {
    ocupado = true;
    avisado = false;
    tareaActual = accion()
      .catch((error: unknown) => {
        registrar(
          "error_chat",
          { correlationId: conv.correlationId, causa: causaDe(error) },
          { nivel: "error" },
        );
        escribir(
          "No pude completar la acción por un error inesperado; quedó registrado en los logs.",
        );
      })
      .finally(() => {
        ocupado = false;
        pedir();
      });
  }

  function recordarCerrada(): void {
    escribir(
      `La solicitud está ${textoEstado(conv.estado)}. Escribe /nueva para empezar otra conversación o /salir para terminar.`,
    );
    escribir(formatearEstado(conv.estado, color));
  }

  /** Valida otra vez cada evento (R3): uno inválido se muestra como no reconocido y no cambia el estado. */
  function mostrar(crudo: unknown): EventoMostrado {
    const validacion = validarEvento(crudo);
    if (validacion.ok) return { reconocido: true, evento: validacion.evento };
    const tipo = (crudo as { tipo?: unknown } | null)?.tipo;
    registrar(
      "evento_no_reconocido",
      {
        correlationId: conv.correlationId,
        tipo: typeof tipo === "string" ? tipo : null,
        problema: validacion.problema,
      },
      { nivel: "warn" },
    );
    return { reconocido: false, crudo, problema: validacion.problema };
  }

  async function turno(mensaje: string): Promise<void> {
    registrar("entrada_solicitante", {
      correlationId: conv.correlationId,
      caracteres: mensaje.length,
    });
    escribir(TRABAJANDO);
    let resultado: ResultadoConversacion;
    try {
      resultado = await conversar(mensaje, {
        core,
        correlationId: conv.correlationId,
        historial: conv.historial,
        ...(demo
          ? { alUsarHerramienta: (info) => escribir(formatearHerramienta(info, color)) }
          : {}),
      });
    } catch (error) {
      registrar(
        "error_turno",
        { correlationId: conv.correlationId, causa: causaDe(error) },
        { nivel: "error" },
      );
      escribir(
        "No pude completar el turno por un error inesperado; quedó registrado en los logs. Intenta de nuevo.",
      );
      return;
    }

    conv = registrarTurno(
      registrarTurno(conv, "solicitante", mensaje),
      "agente",
      resultado.respuesta,
    );
    escribir(formatearAgente(resultado.respuesta, color));
    const mostrados = (resultado.eventos as unknown[]).map(mostrar);
    for (const mostrado of mostrados) {
      escribir("");
      escribir(formatearEvento(mostrado, color));
    }
    const aplicado = aplicarEventos(conv, mostrados);
    conv = aplicado.conversacion;
    if (aplicado.cambio) {
      escribir("");
      escribir(formatearEstado(conv.estado, color));
    }
  }

  async function enviarMensaje(texto: string): Promise<void> {
    escribir(formatearSolicitante(texto, color));
    // Un mensaje escrito no puede hacerse pasar por un documento adjunto.
    await turno(neutralizarEtiquetas(texto, ETIQUETAS_DOCUMENTO));
  }

  async function adjuntar(ruta: string, base: string): Promise<void> {
    const documento = await leerDocumento(ruta, base);
    if (documento.tipo === "inexistente") {
      escribir(`No encontré el archivo ${ruta}; no se envió.`);
      return;
    }
    if (documento.tipo === "vacio") {
      escribir(`El archivo ${documento.nombre} está vacío; no se envió.`);
      return;
    }
    escribir(formatearAdjunto(documento.nombre, detalleAdjunto(documento), color));
    registrar("documento_adjunto", {
      correlationId: conv.correlationId,
      ...metadatosParaLog(documento),
    });
    await turno(componerMensaje(documento));
  }

  async function reproducirCaso(ruta: string): Promise<void> {
    const carga = await cargarCaso(ruta, directorioBase);
    if (!carga.ok) {
      escribir(`No pude cargar el caso: ${carga.problema}.`);
      return;
    }
    const { caso } = carga;
    const total = caso.pasos.length;
    escribir(`▶ Caso ${caso.nombre}: ${caso.descripcion} (${pasos(total)})`);
    for (const [indice, paso] of caso.pasos.entries()) {
      if (estaCerrada(conv)) {
        escribir(
          `▶ Caso detenido: la solicitud está ${textoEstado(conv.estado)}; ${pasos(total - indice)} sin enviar.`,
        );
        return;
      }
      escribir(`▶ paso ${indice + 1}/${total}`);
      if ("mensaje" in paso) await enviarMensaje(paso.mensaje);
      else await adjuntar(paso.ruta, caso.directorio);
    }
    escribir("▶ Caso terminado.");
  }

  function alRecibirLinea(linea: string): void {
    if (terminado) return;
    if (ocupado) {
      if (!avisado) escribir(AVISO_OCUPADO);
      avisado = true;
      return;
    }

    if (bloque !== null) {
      if (linea.trim() !== "/fin") {
        bloque.push(linea);
        pedir();
        return;
      }
      const texto = bloque.join("\n");
      bloque = null;
      if (texto.trim() === "") {
        escribir("El bloque está vacío; no se envió.");
        pedir();
        return;
      }
      ejecutar(() => enviarMensaje(texto));
      return;
    }

    const entrada = interpretarLinea(linea);
    switch (entrada.tipo) {
      case "vacia":
        pedir();
        return;
      case "comando_desconocido":
        escribir(`Comando no reconocido: ${entrada.texto}`);
        escribir(TEXTO_AYUDA);
        pedir();
        return;
      case "mensaje":
        if (estaCerrada(conv)) {
          recordarCerrada();
          pedir();
          return;
        }
        ejecutar(() => enviarMensaje(entrada.texto));
        return;
    }

    switch (entrada.nombre) {
      case "ayuda":
        escribir(TEXTO_AYUDA);
        pedir();
        return;
      case "salir":
        void terminar();
        return;
      case "nueva":
        conv = nuevaConversacion(nuevoId());
        escribir(`Conversación nueva: ${conv.correlationId}`);
        pedir();
        return;
    }

    // /adjuntar, /pegar y /caso envían algo al agente: no en una conversación cerrada (FR-007a).
    if (estaCerrada(conv)) {
      recordarCerrada();
      pedir();
      return;
    }
    const argumento = entrada.argumento ?? "";
    switch (entrada.nombre) {
      case "adjuntar":
        ejecutar(() => adjuntar(argumento, directorioBase));
        return;
      case "caso":
        ejecutar(() => reproducirCaso(argumento));
        return;
      case "pegar":
        bloque = [];
        escribir("Pega el texto y termínalo con una línea que diga /fin.");
        pedir();
        return;
    }
  }

  terminal.alRecibirLinea(alRecibirLinea);
  terminal.alCerrar(() => {
    void tareaActual.finally(() => terminar());
  });

  escribir(formatearCabecera({ rutaLog, correlationId: conv.correlationId }, color));
  if (casoInicial !== undefined) ejecutar(() => reproducirCaso(casoInicial));
  else pedir();
  return fin;
}
