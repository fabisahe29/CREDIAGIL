import { after, describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ConfiguracionInvalida, leerConfiguracion } from "./config-equipo.ts";

const temporales: string[] = [];
after(() => {
  for (const carpeta of temporales) rmSync(carpeta, { recursive: true, force: true });
});

/** Raíz temporal con, opcionalmente, un controles-equipo.json con el contenido dado. */
function raizConConfig(contenido?: string): string {
  const raiz = mkdtempSync(join(tmpdir(), "config-equipo-"));
  temporales.push(raiz);
  if (contenido !== undefined) {
    mkdirSync(join(raiz, ".claude"), { recursive: true });
    writeFileSync(join(raiz, ".claude", "controles-equipo.json"), contenido);
  }
  return raiz;
}

describe("leerConfiguracion", () => {
  it("usa el prefijo por defecto cuando no hay archivo", () => {
    assert.deepEqual(leerConfiguracion(raizConConfig()), {
      prefijoFicticio: "000",
      porDefecto: true,
    });
  });

  it("devuelve el prefijo que declara el equipo", () => {
    const config = leerConfiguracion(raizConConfig('{ "prefijoFicticio": "999" }'));
    assert.deepEqual(config, { prefijoFicticio: "999", porDefecto: false });
  });

  it("usa el prefijo por defecto si el archivo existe pero no declara el campo", () => {
    const config = leerConfiguracion(raizConConfig("{}"));
    assert.deepEqual(config, { prefijoFicticio: "000", porDefecto: false });
  });

  it("acepta un prefijo de 1 y de 6 dígitos", () => {
    assert.equal(
      leerConfiguracion(raizConConfig('{ "prefijoFicticio": "7" }')).prefijoFicticio,
      "7",
    );
    assert.equal(
      leerConfiguracion(raizConConfig('{ "prefijoFicticio": "123456" }')).prefijoFicticio,
      "123456",
    );
  });
});

describe("leerConfiguracion: errores", () => {
  const invalidos: [string, string, RegExp][] = [
    ["un prefijo con letras", '{ "prefijoFicticio": "abc" }', /"abc"/],
    ["un prefijo vacío", '{ "prefijoFicticio": "" }', /""/],
    ["un prefijo de 7 dígitos", '{ "prefijoFicticio": "1234567" }', /1234567/],
    ["un prefijo que no es texto", '{ "prefijoFicticio": 0 }', /0/],
    ["un campo desconocido", '{ "otroCampo": true }', /otroCampo/],
    ["un JSON ilegible", "{ esto no es json", /JSON/],
    ["un valor que no es un objeto", "[]", /objeto/],
  ];

  for (const [descripcion, contenido, esperado] of invalidos) {
    it(`lanza ConfiguracionInvalida con ${descripcion}`, () => {
      assert.throws(
        () => leerConfiguracion(raizConConfig(contenido)),
        (error: unknown) => {
          assert.ok(error instanceof ConfiguracionInvalida);
          assert.match(error.message, /controles-equipo\.json/);
          assert.match(error.message, esperado);
          return true;
        },
      );
    });
  }

  it("dice cómo corregirlo", () => {
    assert.throws(
      () => leerConfiguracion(raizConConfig('{ "prefijoFicticio": "abc" }')),
      /Edita .*controles-equipo\.json o bórralo/,
    );
  });
});
