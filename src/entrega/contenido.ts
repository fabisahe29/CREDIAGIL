// Reglas de contenido de la entrega (specs/017-paquete-de-entrega: contracts/comando-entrega.md).
// Nombres que no pueden ir en el `.zip` y detectores de secretos. Los detectores devuelven el tipo y la
// línea, nunca el valor encontrado: un informe no puede convertirse en una fuga (Principio VI).

export interface Deteccion {
  /** Tipo de secreto, en palabras. */
  tipo: string;
  /** Línea (desde 1) donde aparece. */
  linea: number;
}

const DETECTORES: ReadonlyArray<{ tipo: string; patron: RegExp }> = [
  {
    tipo: "token de GitHub",
    patron: /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{22,})/,
  },
  { tipo: "clave de la API de Claude", patron: /\bsk-ant-[A-Za-z0-9_-]{20,}/ },
  {
    tipo: "Authorization: Bearer con valor literal",
    patron: /Authorization["']?\s*[:=]\s*["']?Bearer\s+[A-Za-z0-9._-]{16,}/i,
  },
  {
    tipo: "variable de secreto con valor",
    patron: /\b(?:GIT_HUB|ANTHROPIC_API_KEY)\s*=\s*["']?[A-Za-z0-9_-]{8,}/,
  },
  { tipo: "clave privada", patron: /-----BEGIN (?:[A-Z]+ )*PRIVATE KEY-----/ },
  { tipo: "credenciales dentro de una URL", patron: /\bhttps?:\/\/[^\s/:@]+:[^\s/@]+@/ },
];

/** Tipos de secreto que aparecen en el texto, con su línea. Sin duplicar un tipo en la misma línea. */
export function detectarSecretos(texto: string): Deteccion[] {
  const detecciones: Deteccion[] = [];
  texto.split(/\r?\n/).forEach((contenidoLinea, indice) => {
    for (const { tipo, patron } of DETECTORES) {
      if (patron.test(contenidoLinea)) detecciones.push({ tipo, linea: indice + 1 });
    }
  });
  return detecciones;
}

/** Los archivos de texto se escanean; los binarios (con un byte nulo al inicio) se omiten. */
export function esTexto(bytes: Uint8Array): boolean {
  const muestra = bytes.subarray(0, 8000);
  return !muestra.includes(0);
}

const CARPETAS_FUERA_DE_LA_RAIZ = ["dist", "logs"] as const;
const ARCHIVOS_LOCALES = ["CLAUDE.local.md", ".claude/settings.local.json"] as const;

/** `.env` o `.env.*` en cualquier carpeta, salvo la plantilla `.env.example`. */
function esEntorno(ruta: string): boolean {
  const nombre = ruta.split("/").pop() ?? "";
  return nombre === ".env" || (nombre.startsWith(".env.") && nombre !== ".env.example");
}

/**
 * Por qué una ruta no puede ir en el `.zip`, o `undefined` si puede. Las carpetas `dist/` y `logs/` se
 * prohíben solo en la raíz y bajo `.git/` solo se comprueba el entorno: `.git/logs/` es del propio git.
 */
export function nombreProhibido(rutaEntrada: string): string | undefined {
  const ruta = rutaEntrada.replace(/\\/g, "/").replace(/^\.\//, "");
  if (esEntorno(ruta)) return "archivo de entorno (.env)";
  if (ruta === ".git" || ruta.startsWith(".git/")) return undefined;
  if (ruta.split("/").includes("node_modules")) return "dependencias instaladas (node_modules)";
  for (const carpeta of CARPETAS_FUERA_DE_LA_RAIZ) {
    if (ruta === carpeta || ruta.startsWith(`${carpeta}/`)) return `carpeta generada (${carpeta}/)`;
  }
  if ((ARCHIVOS_LOCALES as readonly string[]).includes(ruta))
    return "archivo de preferencias personales";
  return undefined;
}
