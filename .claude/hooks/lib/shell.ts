// Análisis estático mínimo de comandos de Bash y PowerShell para los controles.
// No pretende ser un intérprete: separa tuberías, comandos y palabras respetando comillas.
// Los comandos ofuscados a propósito quedan fuera de su alcance (research.md, R9).

/** Una tubería es una lista de comandos unidos por `|`; cada comando, una lista de palabras. */
export type Tuberia = string[][];

/**
 * Separa el comando en tuberías (por `;`, `&&`, `||`, `&` y saltos de línea), comandos (por `|`)
 * y palabras. Las redirecciones `<`, `>` y `>>` quedan como palabras propias.
 * La barra invertida se conserva literal, porque en Windows separa rutas.
 */
export function analizarComando(comando: string): Tuberia[] {
  const tuberias: Tuberia[] = [];
  let tuberia: string[][] = [];
  let palabras: string[] = [];
  let palabra = "";
  let enPalabra = false;
  let comilla: '"' | "'" | null = null;

  const cerrarPalabra = () => {
    if (enPalabra) palabras.push(palabra);
    palabra = "";
    enPalabra = false;
  };
  const cerrarComando = () => {
    cerrarPalabra();
    if (palabras.length > 0) tuberia.push(palabras);
    palabras = [];
  };
  const cerrarTuberia = () => {
    cerrarComando();
    if (tuberia.length > 0) tuberias.push(tuberia);
    tuberia = [];
  };

  for (let i = 0; i < comando.length; i++) {
    const c = comando[i]!;
    const siguiente = comando[i + 1];
    if (comilla !== null) {
      if (c === comilla) comilla = null;
      else palabra += c;
      continue;
    }
    if (c === '"' || c === "'") {
      comilla = c;
      enPalabra = true;
    } else if (c === " " || c === "\t") {
      cerrarPalabra();
    } else if (c === "\n" || c === "\r" || c === ";") {
      cerrarTuberia();
    } else if (c === "&") {
      if (siguiente === "&") i++;
      cerrarTuberia();
    } else if (c === "|") {
      if (siguiente === "|") {
        i++;
        cerrarTuberia();
      } else {
        cerrarComando();
      }
    } else if (c === "<" || c === ">") {
      cerrarPalabra();
      if (c === ">" && siguiente === ">") {
        palabras.push(">>");
        i++;
      } else {
        palabras.push(c);
      }
    } else {
      palabra += c;
      enPalabra = true;
    }
  }
  cerrarTuberia();
  return tuberias;
}

/** Nombre del programa en minúsculas, sin ruta ni `.exe`. */
export function nombreComando(palabra: string): string {
  const base = palabra.replace(/\\/g, "/").split("/").pop() ?? palabra;
  return base.toLowerCase().replace(/\.exe$/, "");
}

/** Ruta de un argumento con `/`, sin `./` inicial ni `/` final. */
export function rutaDeArgumento(palabra: string): string {
  let ruta = palabra.replace(/\\/g, "/");
  while (ruta.startsWith("./")) ruta = ruta.slice(2);
  if (ruta.length > 1) ruta = ruta.replace(/\/+$/, "");
  return ruta;
}

export function esComodin(palabra: string): boolean {
  return /[*?[]/.test(palabra);
}

/** Convierte un comodín de shell en una expresión anclada sobre rutas con `/`. */
export function comodinARegex(comodin: string): RegExp {
  let fuente = "";
  for (let i = 0; i < comodin.length; i++) {
    const c = comodin[i]!;
    if (c === "*" && comodin[i + 1] === "*") {
      fuente += ".*";
      i++;
    } else if (c === "*") {
      fuente += "[^/]*";
    } else if (c === "?") {
      fuente += "[^/]";
    } else {
      fuente += c.replace(/[.+^${}()|[\]\\]/g, "\\$&");
    }
  }
  return new RegExp(`^${fuente}$`);
}
