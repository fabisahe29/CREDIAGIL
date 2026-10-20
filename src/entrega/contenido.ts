// Reglas de contenido de la entrega (specs/017-paquete-de-entrega: contracts/comando-entrega.md).
// Nombres que no pueden ir en el `.zip` y detectores de secretos. Los detectores devuelven el tipo y la
// línea, nunca el valor encontrado: un informe no puede convertirse en una fuga (Principio VI).

export interface Deteccion {
  /** Tipo de secreto, en palabras. */
  tipo: string;
  /** Línea (desde 1) donde aparece. */
  linea: number;
}

/**
 * Valor que se reconoce como ficticio a simple vista (constitución, Principio II): empieza por una
 * palabra de ficticio seguida de `-` o `_`, o la contiene. Un secreto real no se escribe así. Solo lo
 * usan los detectores de variables y de URL, que no tienen un prefijo propio como los tokens.
 */
export function esMarcadorFicticio(valor: string): boolean {
  return (
    /^(?:valor|ficticio|falso|ejemplo|prueba|demo|test|dummy|fake|xxx+)[-_]/i.test(valor) ||
    /ficticio/i.test(valor)
  );
}

/** Un valor que es un marcador de posición de plantilla (`${…}`, `<…>`, `{…}`, `[…]`), no un valor. */
const ES_PLANTILLA = /^[$<{[]/;

interface Detector {
  tipo: string;
  patron: RegExp;
  /** Descarta una coincidencia que no es un secreto (marcador ficticio o de plantilla). */
  descartar?: (coincidencia: RegExpExecArray) => boolean;
}

const DETECTORES: readonly Detector[] = [
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
    patron: /\b(?:GIT_HUB|ANTHROPIC_API_KEY)\s*=\s*["']?([A-Za-z0-9_-]{8,})/,
    descartar: (c) => esMarcadorFicticio(c[1]!),
  },
  { tipo: "clave privada", patron: /-----BEGIN (?:[A-Z]+ )*PRIVATE KEY-----/ },
  {
    tipo: "credenciales dentro de una URL",
    patron: /\bhttps?:\/\/[^\s/:@]+:([^\s/@]{8,})@/,
    descartar: (c) => ES_PLANTILLA.test(c[1]!) || esMarcadorFicticio(c[1]!),
  },
];

/** Tipos de secreto que aparecen en el texto, con su línea. Sin duplicar un tipo en la misma línea. */
export function detectarSecretos(texto: string): Deteccion[] {
  const detecciones: Deteccion[] = [];
  texto.split(/\r?\n/).forEach((contenidoLinea, indice) => {
    for (const { tipo, patron, descartar } of DETECTORES) {
      const coincidencia = patron.exec(contenidoLinea);
      if (coincidencia !== null && !descartar?.(coincidencia))
        detecciones.push({ tipo, linea: indice + 1 });
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
