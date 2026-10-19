// Ningún documento de prueba contiene datos con forma real (#17, HU6; constitución, Principio II). Usa el
// mismo detector que el guardián del repositorio (docs/datos-ficticios.md): un número de identificación,
// cuenta o tarjeta ficticio empieza por 000; los correos terminan en .example.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { extname, join, relative, resolve } from "node:path";
import { datosReales } from "../../.claude/hooks/lib/datos-reales.ts";
import { enBloques, tarjetaLuhn } from "../../.claude/hooks/lib/generadores.ts";

const RAIZ = resolve("casos");
const EXTENSIONES = new Set([".md", ".txt", ".json"]);

function archivos(carpeta: string): string[] {
  return readdirSync(carpeta, { withFileTypes: true }).flatMap((entrada) => {
    const ruta = join(carpeta, entrada.name);
    if (entrada.isDirectory()) return archivos(ruta);
    return EXTENSIONES.has(extname(entrada.name)) ? [ruta] : [];
  });
}

const rutaRelativa = (ruta: string) => relative(process.cwd(), ruta).replaceAll("\\", "/");

/** Los hallazgos de datos con forma real en un texto, con su archivo y línea. */
const hallazgos = (origen: string, texto: string) =>
  datosReales({ herramienta: "Write", rutas: [origen], textos: [{ origen, texto }] }).map(
    (b) => b.detectado,
  );

/** Los correos de un texto cuyo dominio no termina en `.example`. */
const correosReales = (texto: string) =>
  [...texto.matchAll(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g)]
    .map((m) => m[0])
    .filter((correo) => !correo.endsWith(".example"));

describe("datos ficticios: todos los archivos de casos/", () => {
  const todos = archivos(RAIZ);

  it("hay archivos que revisar", () => {
    assert.ok(todos.length > 50);
  });

  it("ninguno tiene un documento, NIT, cuenta o tarjeta con forma real", () => {
    for (const ruta of todos) {
      const origen = rutaRelativa(ruta);
      assert.deepEqual(hallazgos(origen, readFileSync(ruta, "utf8")), [], origen);
    }
  });

  it("ningún correo tiene un dominio que no sea .example", () => {
    for (const ruta of todos) {
      assert.deepEqual(correosReales(readFileSync(ruta, "utf8")), [], rutaRelativa(ruta));
    }
  });

  it("cada documento de casos/obligatorios dice que es ficticio", () => {
    const documentos = archivos(join(RAIZ, "obligatorios")).filter((r) => extname(r) === ".md");
    assert.ok(documentos.length >= 10);
    for (const ruta of documentos) {
      assert.match(readFileSync(ruta, "utf8"), /Documento ficticio/, rutaRelativa(ruta));
    }
  });
});

describe("datos ficticios: la verificación detecta un dato con forma real", () => {
  // Los valores se arman en tiempo de ejecución: nunca se escribe uno con forma real (tests.md).
  const cedulaReal = ["CC", ["10", "203", "040"].join("")].join(" ");
  const nitReal = ["NIT", ["90", "012", "345", "6"].join("")].join(" ");

  it("señala una cédula, un NIT y una tarjeta con forma real", () => {
    assert.equal(hallazgos("doc.md", `Titular con ${cedulaReal}`).length, 1);
    assert.equal(hallazgos("doc.md", `Empresa ${nitReal}-1`).length, 1);
    assert.equal(hallazgos("doc.md", `Tarjeta ${enBloques(tarjetaLuhn(), " ")}`).length, 1);
  });

  it("señala un correo que no termina en .example", () => {
    const correo = ["ana", ["empresa", "com"].join(".")].join("@");
    assert.deepEqual(correosReales(`Contacto: ${correo}`), [correo]);
    assert.deepEqual(correosReales("Contacto: ana@empresa.example"), []);
  });

  it("deja pasar los identificadores ficticios que empiezan por 000", () => {
    assert.deepEqual(hallazgos("doc.md", "Titular con CC 0001234567"), []);
    assert.deepEqual(hallazgos("doc.md", "Empresa NIT 000123456-7"), []);
  });
});
