// Entrada normalizada del guardián.
// Se valida con guardas de tipo propias, sin Zod, para no depender de node_modules.
import { posix } from "node:path";

/** Texto que revisan los controles, con el origen que se cita en el mensaje. */
export interface TextoRevisable {
  origen: string;
  texto: string;
}

export interface Accion {
  herramienta: string;
  /** Rutas relativas a la raíz del repositorio, siempre con `/`. */
  rutas: string[];
  textos: TextoRevisable[];
  /** Comando de Bash o PowerShell, si la herramienta es una shell. */
  comando?: string;
  /** `agent_type` del subagente que llama a la herramienta; ausente en la sesión principal. */
  agente?: string;
  /** `tool_input` original, para los controles que necesitan un parámetro concreto (p. ej. `head`). */
  parametros?: Record<string, unknown>;
}

/** La entrada del hook no cumple el esquema mínimo: se bloquea, no se adivina. */
export class EntradaInvalida extends Error {
  override name = "EntradaInvalida";
}

const HERRAMIENTAS_SHELL = new Set(["Bash", "PowerShell"]);
const CAMPOS_RUTA = ["file_path", "notebook_path", "path"] as const;
const CAMPOS_TEXTO = ["content", "new_string", "new_source"] as const;

function esObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === "object" && valor !== null && !Array.isArray(valor);
}

/**
 * Ruta relativa a la raíz, con `/` y con los segmentos `.` y `..` resueltos, para que
 * `app/../.git/x` no esquive un control que compara prefijos. Las rutas fuera de la raíz
 * quedan absolutas.
 */
export function normalizarRuta(ruta: string, raiz: string): string {
  const base = raiz.replace(/\\/g, "/").replace(/\/+$/, "");
  let normalizada = ruta.replace(/\\/g, "/");
  if (base !== "" && !/^(?:[A-Za-z]:)?\//.test(normalizada)) normalizada = `${base}/${normalizada}`;
  normalizada = posix.normalize(normalizada);
  if (base !== "" && normalizada.toLowerCase() === base.toLowerCase()) return ".";
  if (base !== "" && normalizada.toLowerCase().startsWith(`${base.toLowerCase()}/`)) {
    normalizada = normalizada.slice(base.length + 1);
  }
  while (normalizada.startsWith("./")) normalizada = normalizada.slice(2);
  return normalizada;
}

function textosAnidados(valor: unknown, salida: string[]): void {
  if (typeof valor === "string") {
    salida.push(valor);
  } else if (Array.isArray(valor)) {
    for (const elemento of valor) textosAnidados(elemento, salida);
  } else if (esObjeto(valor)) {
    for (const elemento of Object.values(valor)) textosAnidados(elemento, salida);
  }
}

export function normalizarAccion(entrada: unknown, raiz: string): Accion {
  if (!esObjeto(entrada)) throw new EntradaInvalida("la entrada no es un objeto JSON");
  const herramienta = entrada["tool_name"];
  const datos = entrada["tool_input"];
  if (typeof herramienta !== "string" || herramienta === "") {
    throw new EntradaInvalida("la entrada no tiene tool_name");
  }
  if (!esObjeto(datos)) throw new EntradaInvalida(`tool_input de ${herramienta} no es un objeto`);

  const rutas: string[] = [];
  for (const campo of CAMPOS_RUTA) {
    const valor = datos[campo];
    if (typeof valor === "string" && valor !== "") rutas.push(normalizarRuta(valor, raiz));
  }
  const origen = rutas[0] ?? herramienta;

  const textos: TextoRevisable[] = [];
  let comando: string | undefined;

  if (herramienta.startsWith("mcp__")) {
    const encontrados: string[] = [];
    textosAnidados(datos, encontrados);
    for (const texto of encontrados) textos.push({ origen: herramienta, texto });
  } else if (HERRAMIENTAS_SHELL.has(herramienta)) {
    const valor = datos["command"];
    if (typeof valor === "string") {
      comando = valor;
      textos.push({ origen: "comando", texto: valor });
    }
  } else {
    for (const campo of CAMPOS_TEXTO) {
      const valor = datos[campo];
      if (typeof valor === "string") textos.push({ origen, texto: valor });
    }
    const ediciones = datos["edits"];
    if (Array.isArray(ediciones)) {
      for (const edicion of ediciones) {
        if (esObjeto(edicion) && typeof edicion["new_string"] === "string") {
          textos.push({ origen, texto: edicion["new_string"] });
        }
      }
    }
  }

  const accion: Accion = { herramienta, rutas, textos, parametros: datos };
  if (comando !== undefined) accion.comando = comando;
  const agente = entrada["agent_type"];
  if (typeof agente === "string" && agente !== "") accion.agente = agente;
  return accion;
}
