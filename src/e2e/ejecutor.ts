// Ejecutor de un caso obligatorio (specs/015-casos-prueba-extremo-a-extremo: research.md, R2, R11).
// Reproduce los pasos del `caso.json` con `conversar`, igual que el chat (mismos documentos, mismo
// historial), contra un core nuevo por caso y, en modo guionado, con el modelo guionado. Nunca lanza:
// un caso que no puede correr es `no_ejecutable` y una excepción durante el caso es `fallo`.

import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { conversar, type ResultadoConversacion } from "../agente/agente.ts";
import {
  crearClienteCore,
  type ClienteCore,
  type OpcionesClienteCore,
} from "../agente/cliente-core.ts";
import { cargarCaso, type CasoPrueba } from "../chat/casos.ts";
import { componerMensaje, leerDocumento } from "../chat/documentos.ts";
import {
  aplicarEventos,
  estaCerrada,
  nuevaConversacion,
  registrarDocumento,
  registrarTurno,
  type EventoMostrado,
} from "../chat/sesion.ts";
import { ETIQUETAS_DOCUMENTO, neutralizarEtiquetas } from "../compartido/etiquetas.ts";
import { validarEvento } from "../compartido/eventos.ts";
import type { Esperado } from "./esperado.ts";
import { leerGuion, validarGuion, type Guion } from "./guion.ts";
import { crearModeloGuionado } from "./modelo-guionado.ts";
import { crearRecolector } from "./observado.ts";
import { evaluar, type Diferencia, type ModoEjecucion, type Observado } from "./veredicto.ts";

export interface ResultadoCaso {
  numero?: number;
  nombre: string;
  /** Solo el caso 7: `una-vez` o `siempre`. */
  variante?: string;
  resultado: "paso" | "fallo" | "no_ejecutable";
  diferencias: Diferencia[];
  /** Solo con `no_ejecutable`, o con `fallo` por una excepción o por un problema del guion. */
  causa?: string;
  /** Lo que se observó, para que el informe lo muestre; ausente si el caso no corrió. */
  observado?: Observado;
}

export interface OpcionesEjecucion {
  modo: ModoEjecucion;
  /** Desde dónde se resuelve la ruta del caso; por defecto, el directorio actual. */
  directorioBase?: string;
  /** Entorno donde se busca ANTHROPIC_API_KEY; por defecto, el del proceso. */
  entorno?: Record<string, string | undefined>;
  /** Destino del stderr del core (el comando lo manda a su archivo de logs). */
  stderrCore?: OpcionesClienteCore["stderr"];
  /** Crea el core de cada caso; inyectable en las pruebas. Por defecto, el servidor MCP real. */
  crearCore?: (env: Record<string, string>) => Promise<ClienteCore>;
}

export const CAUSA_SIN_CLAVE = "falta ANTHROPIC_API_KEY";

const noEjecutable = (nombre: string, causa: string, numero?: number): ResultadoCaso => ({
  ...(numero !== undefined ? { numero } : {}),
  nombre,
  resultado: "no_ejecutable",
  diferencias: [],
  causa,
});

const causaDe = (error: unknown) =>
  error instanceof Error ? `${error.name}: ${error.message}` : String(error);

/** Los eventos de un turno, validados otra vez como hace el chat antes de cambiar el estado visible. */
const mostrar = (crudo: unknown): EventoMostrado => {
  const validacion = validarEvento(crudo);
  return validacion.ok
    ? { reconocido: true, evento: validacion.evento }
    : { reconocido: false, crudo, problema: validacion.problema };
};

interface Variante {
  nombre?: string;
  esperado: Esperado;
  reintentos?: { herramienta: string; resultados: readonly string[] };
}

/** Las variantes que se ejecutan: las del caso 7, o una sola sin falla simulada. */
function variantesDe(caso: CasoPrueba): Variante[] | string {
  if (caso.numero === undefined) return "el caso no trae `numero`";
  if (caso.variantes !== undefined) {
    return caso.variantes.map((v) => ({
      nombre: v.nombre,
      esperado: v.esperado,
      ...(v.reintentos !== undefined ? { reintentos: v.reintentos } : {}),
    }));
  }
  if (caso.esperado === undefined) return "el caso no trae `esperado`";
  return [{ esperado: caso.esperado }];
}

async function ejecutarVariante(
  caso: CasoPrueba,
  variante: Variante,
  guion: Guion | null,
  { modo, stderrCore, crearCore }: OpcionesEjecucion,
): Promise<ResultadoCaso> {
  const base = {
    ...(caso.numero !== undefined ? { numero: caso.numero } : {}),
    nombre: caso.nombre,
    ...(variante.nombre !== undefined ? { variante: variante.nombre } : {}),
  };
  const modelo = guion !== null ? crearModeloGuionado(guion) : null;
  const recolector = crearRecolector(modo);
  const sinEspera = modo === "guionado" ? { dormir: async () => {}, azar: () => 0.5 } : {};
  let core: ClienteCore | null = null;
  try {
    // Un core nuevo por caso: nada depende de lo que dejó una ejecución anterior (FR-017).
    const env = { CREDIAGIL_FALLA: variante.nombre ?? "" };
    core = await (crearCore !== undefined
      ? crearCore(env)
      : crearClienteCore({ env, ...(stderrCore !== undefined ? { stderr: stderrCore } : {}) }));
    const correlationId = randomUUID();
    let conv = nuevaConversacion(correlationId);

    for (const [indice, paso] of caso.pasos.entries()) {
      if (estaCerrada(conv)) break;
      if (modelo !== null) modelo.cursor.paso = indice;
      let mensaje: string;
      if ("mensaje" in paso) {
        mensaje = neutralizarEtiquetas(paso.mensaje, ETIQUETAS_DOCUMENTO);
      } else {
        const documento = await leerDocumento(paso.ruta, caso.directorio);
        if (documento.tipo === "inexistente" || documento.tipo === "vacio") {
          return {
            ...noEjecutable(
              caso.nombre,
              `documento ${paso.adjuntar}: ${documento.tipo}`,
              caso.numero,
            ),
            ...(variante.nombre !== undefined ? { variante: variante.nombre } : {}),
          };
        }
        const registro = registrarDocumento(
          conv,
          documento.tipo === "soportado"
            ? { nombre: documento.nombre, soportado: true, contenido: documento.contenido }
            : { nombre: documento.nombre, soportado: false },
        );
        conv = registro.conversacion;
        mensaje = componerMensaje(documento, registro.documento.adjunto);
      }
      const resultado: ResultadoConversacion = await conversar(mensaje, {
        core,
        correlationId,
        historial: conv.historial,
        busquedasAmbiguas: conv.busquedasAmbiguas,
        desambiguada: conv.desambiguada,
        documentos: conv.documentos,
        documentosRevisados: conv.documentosRevisados,
        alUsarHerramienta: recolector.alUsarHerramienta,
        ...(modelo !== null
          ? {
              ejecutarConsulta: modelo.ejecutarConsulta,
              ejecutarSubagente: modelo.ejecutarSubagente,
              clasificarDocumento: modelo.clasificarDocumento,
            }
          : {}),
        ...sinEspera,
      });
      recolector.registrarTurno(resultado);
      conv = {
        ...registrarTurno(
          registrarTurno(conv, "solicitante", mensaje),
          "agente",
          resultado.respuesta,
        ),
        busquedasAmbiguas: resultado.busquedasAmbiguas,
        desambiguada: resultado.desambiguada,
        documentosRevisados: resultado.documentosRevisados,
      };
      conv = aplicarEventos(conv, (resultado.eventos as unknown[]).map(mostrar)).conversacion;
    }

    const observado = await recolector.leerCore(core, correlationId);
    const veredicto = evaluar(variante.esperado, observado, {
      ...(variante.reintentos !== undefined ? { reintentos: variante.reintentos } : {}),
    });
    const problemas = modelo?.problemas ?? [];
    if (problemas.length > 0) {
      return {
        ...base,
        resultado: "fallo",
        diferencias: veredicto.diferencias,
        causa: `problemas del guion: ${problemas.join("; ")}`,
        observado,
      };
    }
    return {
      ...base,
      resultado: veredicto.resultado,
      diferencias: veredicto.diferencias,
      observado,
    };
  } catch (error) {
    return { ...base, resultado: "fallo", diferencias: [], causa: causaDe(error) };
  } finally {
    await core?.cerrar().catch(() => {});
  }
}

/**
 * Ejecuta el caso de la carpeta `ruta`: una entrada por variante (una sola salvo en el caso 7). Un caso
 * que no puede correr da una sola entrada `no_ejecutable`; nunca se cuenta como pasado ni como fallido.
 */
export async function ejecutarCaso(
  ruta: string,
  opciones: OpcionesEjecucion,
): Promise<ResultadoCaso[]> {
  const nombreDeRuta = basename(ruta);
  const carga = await cargarCaso(ruta, opciones.directorioBase ?? process.cwd());
  if (!carga.ok) return [noEjecutable(nombreDeRuta, carga.problema)];
  const { caso } = carga;

  const variantes = variantesDe(caso);
  if (typeof variantes === "string") return [noEjecutable(caso.nombre, variantes, caso.numero)];

  let guion: Guion | null = null;
  if (opciones.modo === "guionado") {
    const lectura = await leerGuion(caso.directorio);
    if (!lectura.ok) return [noEjecutable(caso.nombre, lectura.problema, caso.numero)];
    const problemas = await validarGuion(lectura.guion, caso, (r) => readFile(r, "utf8"));
    if (problemas.length > 0) {
      return [noEjecutable(caso.nombre, `guion incoherente: ${problemas.join("; ")}`, caso.numero)];
    }
    guion = lectura.guion;
  } else if (!(opciones.entorno ?? process.env)["ANTHROPIC_API_KEY"]) {
    return [noEjecutable(caso.nombre, CAUSA_SIN_CLAVE, caso.numero)];
  }

  const resultados: ResultadoCaso[] = [];
  for (const variante of variantes) {
    resultados.push(await ejecutarVariante(caso, variante, guion, opciones));
  }
  return resultados;
}
