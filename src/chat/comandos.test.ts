import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { interpretarLinea, TEXTO_AYUDA } from "./comandos.ts";

describe("comandos: mensajes y líneas vacías", () => {
  it("un texto que no empieza por / es un mensaje, sin recortar espacios internos", () => {
    assert.deepEqual(interpretarLinea("Hola,   quiero un crédito"), {
      tipo: "mensaje",
      texto: "Hola,   quiero un crédito",
    });
  });

  it("recorta los espacios de los extremos del mensaje", () => {
    assert.deepEqual(interpretarLinea("  hola  "), { tipo: "mensaje", texto: "hola" });
  });

  for (const linea of ["", "   ", "\t"]) {
    it(`${JSON.stringify(linea)} es una línea vacía`, () => {
      assert.deepEqual(interpretarLinea(linea), { tipo: "vacia" });
    });
  }
});

describe("comandos: comandos válidos", () => {
  for (const nombre of ["ayuda", "pegar", "nueva", "salir"]) {
    it(`/${nombre} es un comando sin argumento`, () => {
      assert.deepEqual(interpretarLinea(`/${nombre}`), { tipo: "comando", nombre });
    });
  }

  it("ignora espacios alrededor del comando", () => {
    assert.deepEqual(interpretarLinea("  /salir  "), { tipo: "comando", nombre: "salir" });
  });

  for (const nombre of ["adjuntar", "caso"]) {
    it(`/${nombre} lleva la ruta como argumento, aunque tenga espacios`, () => {
      assert.deepEqual(interpretarLinea(`/${nombre} casos/mi caso/archivo.md`), {
        tipo: "comando",
        nombre,
        argumento: "casos/mi caso/archivo.md",
      });
    });
  }
});

describe("comandos: comandos desconocidos", () => {
  for (const linea of ["/adjuntar", "/caso   ", "/xyz", "/", "/ayuda extra", "/AYUDA"]) {
    it(`${JSON.stringify(linea)} es un comando desconocido`, () => {
      assert.deepEqual(interpretarLinea(linea), {
        tipo: "comando_desconocido",
        texto: linea.trim(),
      });
    });
  }
});

describe("comandos: ayuda", () => {
  it("lista los seis comandos y advierte cómo enviar texto de varias líneas", () => {
    for (const comando of ["/ayuda", "/adjuntar", "/pegar", "/caso", "/nueva", "/salir"]) {
      assert.ok(TEXTO_AYUDA.includes(comando), `falta ${comando}`);
    }
    assert.match(TEXTO_AYUDA, /\/fin/);
    assert.match(TEXTO_AYUDA, /varias líneas/);
  });
});
