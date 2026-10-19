// Control secretos: nadie abre, copia ni edita un archivo .env.
// Herramientas de archivos, comandos que nombran un .env y comandos recursivos que lo alcanzan.

import { readdirSync } from "node:fs";
import { join } from "node:path";
import type { Accion } from "./accion.ts";
import type { Bloqueo } from "./bloqueo.ts";
import {
  analizarComando,
  comodinARegex,
  esComodin,
  nombreComando,
  rutaDeArgumento,
} from "./shell.ts";

interface ContextoSecretos {
  raiz: string;
}

const REGLA_ARCHIVOS =
  "Los secretos solo se leen del entorno de la sesión, nunca de un archivo .env.";
const REGLA_NOMBRA = "Un comando no puede nombrar un archivo .env.";
const REGLA_RECURSIVO = "Un comando recursivo no puede alcanzar un archivo .env.";
const CORRECCION_ARCHIVO =
  "Los secretos solo se leen del entorno de la sesión: no abras, copies ni edites archivos .env. Para documentar variables usa .env.example.";
const CORRECCION_RECURSIVO =
  "Excluye los secretos (grep: --exclude='.env*'; rg: -g '!.env*'; find: -not -name '.env*'; Get-ChildItem o Copy-Item: -Exclude '.env*') o limita el comando a una carpeta sin .env.";

/** `.env` o `.env.*` en cualquier carpeta, salvo la plantilla `.env.example`. */
export function esProtegido(ruta: string): boolean {
  const nombre = ruta.replace(/\\/g, "/").split("/").pop() ?? "";
  return nombre === ".env" || (nombre.startsWith(".env.") && nombre !== ".env.example");
}

const OMITIR = new Set(["node_modules", ".git"]);

/** Archivos protegidos que existen bajo la raíz, como rutas relativas con `/`. */
function archivosProtegidos(raiz: string): string[] {
  const encontrados: string[] = [];
  const recorrer = (relativa: string) => {
    let entradas;
    try {
      entradas = readdirSync(join(raiz, relativa), { withFileTypes: true });
    } catch {
      return;
    }
    for (const entrada of entradas) {
      const ruta = relativa === "" ? entrada.name : `${relativa}/${entrada.name}`;
      if (entrada.isDirectory()) {
        if (!OMITIR.has(entrada.name)) recorrer(ruta);
      } else if (esProtegido(entrada.name)) {
        encontrados.push(ruta);
      }
    }
  };
  recorrer("");
  return encontrados;
}

/** Verdadero si el comodín de exclusión cubre un archivo llamado `.env`. */
function excluyeEnv(patron: string): boolean {
  const limpio = patron.replace(/^!/, "");
  return comodinARegex(limpio).test(".env") || comodinARegex(limpio).test("**/.env");
}

function valorDeOpcion(palabras: string[], i: number): string | undefined {
  const palabra = palabras[i]!;
  const igual = palabra.indexOf("=");
  return igual >= 0 ? palabra.slice(igual + 1) : palabras[i + 1];
}

/** Opciones de exclusión por programa: la primera captura su patrón. */
function tieneExclusion(programa: string, palabras: string[]): boolean {
  for (let i = 1; i < palabras.length; i++) {
    const palabra = palabras[i]!;
    const opcion = palabra.split("=")[0]!.toLowerCase();
    let patron: string | undefined;
    if (["grep", "egrep", "fgrep", "cp", "rsync", "tar", "zip"].includes(programa)) {
      if (opcion === "--exclude") patron = valorDeOpcion(palabras, i);
      if (programa === "zip" && opcion === "-x") patron = palabras[i + 1];
    } else if (programa === "rg") {
      if (opcion === "-g" || opcion === "--glob" || opcion === "--iglob")
        patron = valorDeOpcion(palabras, i);
    } else if (programa === "find") {
      const anterior = palabras[i - 1]?.toLowerCase();
      if (
        ["-name", "-iname", "-path"].includes(opcion) &&
        (anterior === "-not" || anterior === "!")
      ) {
        patron = palabras[i + 1];
      }
    } else if (opcion === "-exclude") {
      patron = valorDeOpcion(palabras, i);
    }
    if (patron !== undefined && excluyeEnv(patron)) return true;
  }
  return false;
}

const LISTADO_PS = new Set(["get-childitem", "gci", "ls", "dir"]);
const LECTURA_PS = new Set([
  "get-content",
  "gc",
  "cat",
  "type",
  "select-string",
  "sls",
  "copy-item",
  "cpi",
  "copy",
]);

/** Verdadero si el comando recorre carpetas leyendo o copiando el contenido de los archivos. */
function esRecursivo(
  programa: string,
  palabras: string[],
  tuberia: string[][],
  indice: number,
): boolean {
  const opciones = palabras.slice(1).filter((p) => p.startsWith("-"));
  const corta = (letras: RegExp) =>
    opciones.some((o) => /^-[a-zA-Z]+$/.test(o) && letras.test(o.slice(1)));
  const larga = (...nombres: string[]) =>
    opciones.some((o) => nombres.includes(o.split("=")[0]!.toLowerCase()));
  switch (programa) {
    case "grep":
    case "egrep":
    case "fgrep":
      return corta(/[rR]/) || larga("--recursive", "--dereference-recursive");
    case "rg":
      return (
        opciones.some((o) => /^-u+$/.test(o)) ||
        larga("--no-ignore", "--no-ignore-vcs", "--no-ignore-dot")
      );
    case "find":
      return (
        larga("-exec", "-execdir", "-ok", "-okdir") ||
        tuberia.slice(indice + 1).some((c) => nombreComando(c[0]!) === "xargs")
      );
    case "cp":
    case "rsync":
      return corta(/[rRa]/) || larga("--recursive", "--archive");
    case "zip":
      return corta(/r/) || larga("--recurse-paths");
    case "tar":
      return /c/.test(palabras[1] ?? "") || larga("--create");
    case "copy-item":
    case "cpi":
      return larga("-recurse");
    default:
      if (LISTADO_PS.has(programa) && larga("-recurse", "-r")) {
        return tuberia.slice(indice + 1).some((c) => LECTURA_PS.has(nombreComando(c[0]!)));
      }
      return false;
  }
}

/** Carpetas que recorre el comando: argumentos que son carpetas existentes, o la raíz por defecto. */
function alcance(palabras: string[], raiz: string): string[] {
  const carpetas = palabras
    .slice(1)
    .filter((p) => !p.startsWith("-") && !esComodin(p))
    .map(rutaDeArgumento)
    .filter((p) => {
      try {
        return readdirSync(join(raiz, p)) !== undefined;
      } catch {
        return false;
      }
    });
  return carpetas.length > 0 ? carpetas : ["."];
}

function alcanza(carpeta: string, archivo: string): boolean {
  return carpeta === "." || carpeta === "" || archivo.startsWith(`${carpeta}/`);
}

// Opciones cuyo valor es un patrón, no una ruta que se lee.
const OPCIONES_PATRON = new Set([
  "--exclude",
  "--include",
  "--exclude-dir",
  "--include-dir",
  "-e",
  "--regexp",
  "-g",
  "--glob",
  "--iglob",
  "-t",
  "--type",
  "-exclude",
  "-include",
  "-filter",
  "-pattern",
]);
// En find, -path es un patrón; en PowerShell, -Path es la ruta que se lee.
const OPCIONES_PATRON_FIND = new Set([
  "-name",
  "-iname",
  "-path",
  "-ipath",
  "-wholename",
  "-regex",
]);
const BUSCADORES = new Set([
  "grep",
  "egrep",
  "fgrep",
  "rg",
  "git",
  "select-string",
  "sls",
  "findstr",
]);

/** Palabras que son rutas candidatas: se omiten los valores de opciones de patrón y el patrón de búsqueda. */
function argumentosDeRuta(programa: string, palabras: string[]): string[] {
  const rutas: string[] = [];
  let patronVisto = palabras.some((p) =>
    ["-e", "--regexp", "-f", "--file", "-pattern"].includes(p.split("=")[0]!.toLowerCase()),
  );
  for (let i = 1; i < palabras.length; i++) {
    const palabra = palabras[i]!;
    const opcion = palabra.split("=")[0]!.toLowerCase();
    if (OPCIONES_PATRON.has(opcion) || (programa === "find" && OPCIONES_PATRON_FIND.has(opcion))) {
      if (!palabra.includes("=")) i++;
      continue;
    }
    if (!palabra.startsWith("-") && BUSCADORES.has(programa) && !patronVisto) {
      if (programa === "git" && i === 1) continue;
      patronVisto = true;
      continue;
    }
    rutas.push(palabra);
  }
  return rutas;
}

function revisarComando(comando: string, raiz: string): Bloqueo[] {
  const bloqueos: Bloqueo[] = [];
  let protegidos: string[] | undefined;
  const existentes = () => (protegidos ??= archivosProtegidos(raiz));

  for (const tuberia of analizarComando(comando)) {
    tuberia.forEach((palabras, indice) => {
      const programa = nombreComando(palabras[0]!);

      for (const palabra of argumentosDeRuta(programa, palabras)) {
        const argumento = rutaDeArgumento(
          palabra.includes("=") ? palabra.slice(palabra.lastIndexOf("=") + 1) : palabra,
        );
        let nombrado: string | undefined;
        if (esComodin(argumento)) {
          nombrado = existentes().find((archivo) => comodinARegex(argumento).test(archivo));
        } else if (esProtegido(argumento)) {
          nombrado = argumento;
        }
        if (nombrado !== undefined) {
          bloqueos.push({
            control: "secretos",
            detectado: `el comando ${programa} alcanza ${nombrado} (argumento "${palabra}")`,
            regla: REGLA_NOMBRA,
            correccion: CORRECCION_ARCHIVO,
          });
          return;
        }
      }

      if (esRecursivo(programa, palabras, tuberia, indice) && !tieneExclusion(programa, palabras)) {
        const carpetas = alcance(palabras, raiz);
        const alcanzado = existentes().find((archivo) => carpetas.some((c) => alcanza(c, archivo)));
        if (alcanzado !== undefined) {
          bloqueos.push({
            control: "secretos",
            detectado: `${programa} recorre ${carpetas.join(", ")} y alcanza ${alcanzado} sin excluirlo`,
            regla: REGLA_RECURSIVO,
            correccion: CORRECCION_RECURSIVO,
          });
        }
      }
    });
  }
  return bloqueos;
}

export function secretos(accion: Accion, contexto: ContextoSecretos): Bloqueo[] {
  if (accion.comando !== undefined) return revisarComando(accion.comando, contexto.raiz);
  return accion.rutas.filter(esProtegido).map((ruta) => ({
    control: "secretos",
    detectado: `${accion.herramienta} sobre ${ruta}`,
    regla: REGLA_ARCHIVOS,
    correccion: CORRECCION_ARCHIVO,
  }));
}
