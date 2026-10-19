import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ejecutar, type Dependencias } from "./principal.ts";
import {
  ErrorEntrega,
  veredictoDe,
  type Comprobacion,
  type Hallazgo,
  type InformeEntrega,
} from "./tipos.ts";

const RAIZ = "/raiz-de-prueba";

function informe(comprobaciones: Comprobacion[], hallazgos: Hallazgo[] = []): InformeEntrega {
  return {
    zip: "p.zip",
    tamanoBytes: 1024,
    comprobaciones,
    hallazgos,
    veredicto: veredictoDe(comprobaciones, hallazgos),
  };
}

const dependencias = (resultado: InformeEntrega | Error): Dependencias => ({
  armar: () => ({ salida: "/raiz-de-prueba/dist/p.zip", archivos: 3 }),
  verificarZip: () => {
    if (resultado instanceof Error) throw resultado;
    return resultado;
  },
});

const OK: Comprobacion = { nombre: "nombres", estado: "ok" };

describe("comandos de entrega", () => {
  it("sale con 2 si falta la orden o es desconocida", () => {
    assert.equal(ejecutar([], RAIZ).codigo, 2);
    assert.equal(ejecutar(["borrar"], RAIZ).codigo, 2);
  });

  it("sale con 2 con opciones inválidas", () => {
    assert.equal(ejecutar(["verificar", "--zip"], RAIZ).codigo, 2);
    assert.equal(ejecutar(["verificar", "--rapido"], RAIZ).codigo, 2);
    assert.equal(ejecutar(["armar", "--salida"], RAIZ).codigo, 2);
  });

  it("sale con 0 si el veredicto es listo", () => {
    const salida = ejecutar(["verificar"], RAIZ, dependencias(informe([OK])));
    assert.equal(salida.codigo, 0);
    assert.match(salida.stdout, /Veredicto: listo/);
  });

  it("sale con 1 si el veredicto es bloqueado y lista el hallazgo sin su valor", () => {
    const hallazgo: Hallazgo = {
      tipo: "nombre-prohibido",
      ubicacion: ".env",
      detalle: "archivo de entorno (.env)",
    };
    const salida = ejecutar(
      ["verificar"],
      RAIZ,
      dependencias(informe([{ nombre: "nombres", estado: "hallazgos" }], [hallazgo])),
    );
    assert.equal(salida.codigo, 1);
    assert.match(salida.stdout, /nombre-prohibido · \.env · archivo de entorno/);
  });

  it("sale con 3 si el veredicto es incompleto: no es éxito", () => {
    const salida = ejecutar(
      ["verificar"],
      RAIZ,
      dependencias(
        informe([OK, { nombre: "historial", estado: "no verificable", nota: "sin origin/main" }]),
      ),
    );
    assert.equal(salida.codigo, 3);
    assert.match(salida.stdout, /historial\s+no verificable\s+\(sin origin\/main\)/);
  });

  it("sale con 2 si el .zip no se puede leer, con el tipo y la causa", () => {
    const salida = ejecutar(
      ["verificar"],
      RAIZ,
      dependencias(new ErrorEntrega("zip-invalido", "no es un .zip")),
    );
    assert.equal(salida.codigo, 2);
    assert.match(salida.stderr, /zip-invalido: no es un \.zip/);
  });

  it("--json imprime además el informe como JSON", () => {
    const esperado = informe([OK]);
    const salida = ejecutar(["verificar", "--json"], RAIZ, dependencias(esperado));
    const json = salida.stdout.slice(salida.stdout.indexOf("{"));
    assert.deepEqual(JSON.parse(json), esperado);
  });

  it("el armado informa la ruta y sale con 0; si se niega, sale con 1 y dice por qué", () => {
    assert.equal(ejecutar(["armar"], RAIZ, dependencias(informe([OK]))).codigo, 0);
    const negado: Dependencias = {
      armar: () => {
        throw new ErrorEntrega("arbol-sucio", "hay cambios sin commit");
      },
      verificarZip: () => informe([OK]),
    };
    const salida = ejecutar(["armar"], RAIZ, negado);
    assert.equal(salida.codigo, 1);
    assert.match(salida.stderr, /arbol-sucio: hay cambios sin commit/);
  });
});
