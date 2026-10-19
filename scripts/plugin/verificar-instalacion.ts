// Verificación del plugin en un repositorio de prueba distinto de este.
// Crea un repositorio temporal con otra estructura, instala el plugin desde el catálogo con
// una configuración aislada y deja un resultado por pieza. No usa el modelo ni la red.

import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { analizar } from "./portabilidad.ts";

export type NombrePieza = "hook" | "subagente" | "skill";
export type EstadoPieza = "aprobada" | "reprobada" | "no_verificable";

export interface Comprobacion {
  nombre: string;
  resultado: "ok" | "falla";
}

export interface ResultadoPieza {
  pieza: NombrePieza;
  estado: EstadoPieza;
  causa?: string;
  comprobaciones: Comprobacion[];
}

export interface Resultado {
  version: string;
  fecha: string;
  repositorioDePrueba: string;
  piezas: ResultadoPieza[];
}

export interface RespuestaCli {
  codigo: number | null;
  salida: string;
}

/** Ejecuta la CLI de Claude Code con estos argumentos; en las pruebas se sustituye por una falsa. */
export type EjecutorCli = (
  args: string[],
  opciones: { cwd: string; env: NodeJS.ProcessEnv },
) => RespuestaCli;

export interface OpcionesVerificacion {
  /** Raíz de este repositorio: de ahí sale el catálogo. */
  raiz: string;
  /** `null` si la CLI no está disponible. */
  cli: EjecutorCli | null;
  ahora?: () => Date;
}

const PLUGIN = "crediagil-controles";
const CATALOGO = "crediagil";
const PIEZAS: readonly NombrePieza[] = ["hook", "subagente", "skill"];
const REVISOR = `${PLUGIN}:revisor-reglas`;
const ARCHIVO_CONFIGURACION = ".claude/controles-equipo.json";

// Ningún valor con forma real se escribe literal: se arma en tiempo de ejecución.
const cedulaReal = "10" + "4".repeat(8);
const cedulaFicticia = "000" + "4".repeat(7);
const cuentaReal = "12" + "7".repeat(10);

function esObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === "object" && valor !== null && !Array.isArray(valor);
}

function sinCli(causa: string): ResultadoPieza[] {
  return PIEZAS.map((pieza) => ({ pieza, estado: "no_verificable", causa, comprobaciones: [] }));
}

function todasReprobadas(causa: string): ResultadoPieza[] {
  return PIEZAS.map((pieza) => ({ pieza, estado: "reprobada", causa, comprobaciones: [] }));
}

function conResultado(pieza: NombrePieza, comprobaciones: Comprobacion[]): ResultadoPieza {
  const fallas = comprobaciones.filter((c) => c.resultado === "falla");
  if (fallas.length === 0) return { pieza, estado: "aprobada", comprobaciones };
  return {
    pieza,
    estado: "reprobada",
    causa: `fallaron ${fallas.length} comprobación(es): ${fallas.map((f) => f.nombre).join("; ")}`,
    comprobaciones,
  };
}

interface Decision {
  /** `deny` si el guardián bloqueó; `permite` si no imprimió nada; `ilegible` en otro caso. */
  tipo: "deny" | "permite" | "ilegible";
  motivo: string;
  salida: string;
}

/** Ejecuta el guardián instalado como lo hace Claude Code: JSON por stdin y raíz del proyecto. */
function ejecutarGuardian(guardian: string, entrada: string, raiz: string): Decision {
  const proceso = spawnSync(process.execPath, [guardian], {
    input: entrada,
    env: { ...process.env, CLAUDE_PROJECT_DIR: raiz },
    encoding: "utf8",
  });
  const salida = proceso.stdout.trim();
  if (salida === "") return { tipo: "permite", motivo: "", salida };
  try {
    const json: unknown = JSON.parse(salida);
    const resumen = esObjeto(json) ? json["hookSpecificOutput"] : undefined;
    if (esObjeto(resumen) && resumen["permissionDecision"] === "deny") {
      return { tipo: "deny", motivo: String(resumen["permissionDecisionReason"]), salida };
    }
  } catch {
    // La salida no es JSON: se informa como ilegible.
  }
  return { tipo: "ilegible", motivo: "", salida };
}

const escritura = (texto: string) =>
  JSON.stringify({
    tool_name: "Write",
    tool_input: { file_path: "app/notas.md", content: texto },
  });

function comprobarHook(directorio: string, repositorio: string): Comprobacion[] {
  const guardian = join(directorio, "hooks", "guardian-controles.ts");
  const comprobaciones: Comprobacion[] = [];
  const comprobar = (nombre: string, cumple: boolean) =>
    comprobaciones.push({ nombre, resultado: cumple ? "ok" : "falla" });

  const cedula = ejecutarGuardian(guardian, escritura(`cédula ${cedulaReal}`), repositorio);
  comprobar(
    "bloquea una cédula con forma real y la enmascara",
    cedula.tipo === "deny" && !cedula.salida.includes(cedulaReal),
  );
  comprobar(
    "permite un número con el prefijo ficticio",
    ejecutarGuardian(guardian, escritura(`cédula ${cedulaFicticia}`), repositorio).tipo ===
      "permite",
  );
  comprobar(
    "bloquea una cuenta con forma real junto a la palabra cuenta",
    ejecutarGuardian(guardian, escritura(`cuenta ${cuentaReal}`), repositorio).tipo === "deny",
  );
  comprobar(
    "bloquea la lectura de un .env",
    ejecutarGuardian(
      guardian,
      JSON.stringify({ tool_name: "Read", tool_input: { file_path: ".env" } }),
      repositorio,
    ).tipo === "deny",
  );
  comprobar(
    "bloquea con tipo y causa una entrada que no es JSON",
    /error-interno\] \w*Error/.test(
      ejecutarGuardian(guardian, "esto no es json", repositorio).motivo,
    ),
  );

  const configuracion = join(repositorio, ".claude", "controles-equipo.json");
  mkdirSync(join(repositorio, ".claude"), { recursive: true });
  writeFileSync(configuracion, '{ "prefijoFicticio": "abc" }');
  const invalida = ejecutarGuardian(guardian, escritura("sin datos"), repositorio);
  comprobar(
    "bloquea con un mensaje legible si controles-equipo.json no es válido",
    invalida.tipo === "deny" && /controles-equipo\.json no es válido/.test(invalida.motivo),
  );
  rmSync(configuracion, { force: true });

  const escribirConfiguracion = ejecutarGuardian(
    guardian,
    JSON.stringify({
      tool_name: "Write",
      tool_input: { file_path: ARCHIVO_CONFIGURACION, content: "{}" },
    }),
    repositorio,
  );
  comprobar(
    "impide que el agente escriba la configuración de los controles",
    escribirConfiguracion.tipo === "deny" &&
      /\[configuracion-protegida\]/.test(escribirConfiguracion.motivo),
  );
  return comprobaciones;
}

function leerHerramientas(archivo: string): string[] {
  const encabezado = /^---\r?\n([\s\S]*?)\r?\n---/.exec(readFileSync(archivo, "utf8"))?.[1] ?? "";
  const linea = /^tools:\s*(.*)$/m.exec(encabezado)?.[1] ?? "";
  return linea
    .split(",")
    .map((x) => x.trim())
    .filter((x) => x !== "");
}

function comprobarSubagente(directorio: string, repositorio: string): Comprobacion[] {
  const archivo = join(directorio, "agents", "revisor-reglas.md");
  const herramientas = existsSync(archivo) ? leerHerramientas(archivo) : [];
  const guardian = join(directorio, "hooks", "guardian-controles.ts");
  const intento = ejecutarGuardian(
    guardian,
    JSON.stringify({ ...JSON.parse(escritura("sin datos")), agent_type: REVISOR }),
    repositorio,
  );
  return [
    {
      nombre: "declara solo Read, Grep y Glob",
      resultado: herramientas.join(",") === "Read,Grep,Glob" ? "ok" : "falla",
    },
    {
      nombre: "el guardián le impide escribir",
      resultado: intento.tipo === "deny" && /\[revisores\]/.test(intento.motivo) ? "ok" : "falla",
    },
  ];
}

function comprobarSkill(directorio: string): Comprobacion[] {
  const archivo = join(directorio, "skills", "revisar-reglas", "SKILL.md");
  const existe = existsSync(archivo);
  return [
    { nombre: "el archivo de la skill está instalado", resultado: existe ? "ok" : "falla" },
    {
      nombre: "no contiene términos propios de otro repositorio",
      resultado: existe && analizar(archivo).length === 0 ? "ok" : "falla",
    },
  ];
}

/** Carpeta desde la que la CLI informa que lee el plugin instalado. */
function carpetaInstalada(salida: string): string | undefined {
  return /Read from:\s*(.+)/.exec(salida)?.[1]?.trim();
}

export function verificar(opciones: OpcionesVerificacion): Resultado {
  const { raiz, cli } = opciones;
  const ahora = opciones.ahora ?? (() => new Date());
  const manifiesto: unknown = JSON.parse(
    readFileSync(join(raiz, "plugins", PLUGIN, ".claude-plugin", "plugin.json"), "utf8"),
  );
  const version = esObjeto(manifiesto) ? String(manifiesto["version"]) : "desconocida";
  const encabezado = {
    version,
    fecha: ahora().toISOString(),
    repositorioDePrueba: "carpeta temporal",
  };

  if (cli === null) {
    return {
      ...encabezado,
      piezas: sinCli("la CLI de Claude Code no está disponible en este entorno"),
    };
  }

  const temporal = mkdtempSync(join(tmpdir(), "verificar-plugin-"));
  const repositorio = join(temporal, "repo");
  const entorno: NodeJS.ProcessEnv = {
    ...process.env,
    CLAUDE_CONFIG_DIR: join(temporal, "config"),
  };
  try {
    mkdirSync(join(repositorio, "app"), { recursive: true });
    mkdirSync(join(repositorio, "docs"), { recursive: true });
    spawnSync("git", ["init", "-q"], { cwd: repositorio });

    const ejecutar = (args: string[]) =>
      cli(["plugin", ...args], { cwd: repositorio, env: entorno });
    const agregar = ejecutar(["marketplace", "add", raiz, "--scope", "project"]);
    if (agregar.codigo !== 0) {
      return {
        ...encabezado,
        piezas: todasReprobadas(`no se pudo registrar el catálogo: ${agregar.salida}`),
      };
    }
    const instalar = ejecutar(["install", `${PLUGIN}@${CATALOGO}`, "--scope", "project"]);
    if (instalar.codigo !== 0) {
      return { ...encabezado, piezas: todasReprobadas(`no se pudo instalar: ${instalar.salida}`) };
    }
    const listado = ejecutar(["list"]);
    const directorio = carpetaInstalada(listado.salida);
    if (listado.codigo !== 0 || directorio === undefined || !existsSync(directorio)) {
      return {
        ...encabezado,
        piezas: todasReprobadas("el plugin no aparece instalado o no se encuentra su carpeta"),
      };
    }
    return {
      ...encabezado,
      piezas: [
        conResultado("hook", comprobarHook(directorio, repositorio)),
        conResultado("subagente", comprobarSubagente(directorio, repositorio)),
        conResultado("skill", comprobarSkill(directorio)),
      ],
    };
  } finally {
    rmSync(temporal, { recursive: true, force: true });
  }
}

/** Distinto de cero solo si alguna pieza quedó reprobada: lo no verificable se informa y no falla. */
export function codigoDeSalida(resultado: Resultado): number {
  return resultado.piezas.some((p) => p.estado === "reprobada") ? 1 : 0;
}

function ejecutorReal(binario: string): EjecutorCli {
  return (args, opciones) => {
    const proceso = spawnSync(binario, args, { ...opciones, encoding: "utf8" });
    return { codigo: proceso.status, salida: `${proceso.stdout}${proceso.stderr}`.trim() };
  };
}

/** Busca la CLI: variable CLAUDE_BIN, `claude` en el PATH o la que incluye la extensión de VS Code. */
function buscarCli(): EjecutorCli | null {
  const candidatos = [process.env["CLAUDE_BIN"], "claude"].filter((c): c is string => !!c);
  const extensiones = join(homedir(), ".vscode", "extensions");
  if (existsSync(extensiones)) {
    const nativo = process.platform === "win32" ? "claude.exe" : "claude";
    for (const carpeta of readdirSync(extensiones)) {
      if (carpeta.startsWith("anthropic.claude-code-")) {
        candidatos.push(join(extensiones, carpeta, "resources", "native-binary", nativo));
      }
    }
  }
  for (const candidato of candidatos) {
    const prueba = spawnSync(candidato, ["--version"], { encoding: "utf8" });
    if (prueba.status === 0) return ejecutorReal(candidato);
  }
  return null;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const raiz = fileURLToPath(new URL("../../", import.meta.url));
  const resultado = verificar({ raiz, cli: buscarCli() });
  const texto = `${JSON.stringify(resultado, null, 2)}\n`;
  process.stdout.write(texto);
  if (process.argv.includes("--guardar")) {
    writeFileSync(
      join(raiz, "specs", "016-plugin-reutilizable-equipos", "verificacion.json"),
      texto,
    );
  }
  process.exitCode = codigoDeSalida(resultado);
}
