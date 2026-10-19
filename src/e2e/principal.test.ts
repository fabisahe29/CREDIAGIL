import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { leerOpciones } from "./arranque.ts";
import { ejecutarCasos } from "./comando.ts";
import { fijarDestino } from "../compartido/logs.ts";
import { CAUSA_SIN_CLAVE } from "./ejecutor.ts";

describe("arranque: lectura de las opciones del comando", () => {
  it("sin argumentos: los siete casos en modo guionado, sin JSON", () => {
    assert.deepEqual(leerOpciones([]), { modo: "guionado", json: false });
  });

  it("acepta --modelo-real, --caso y --json, combinados", () => {
    assert.deepEqual(leerOpciones(["--modelo-real", "--caso", "4", "--json"]), {
      modo: "modelo_real",
      caso: 4,
      json: true,
    });
  });

  it("acepta los casos de 1 a 7", () => {
    for (const n of [1, 2, 3, 4, 5, 6, 7]) {
      assert.equal(leerOpciones(["--caso", String(n)])?.caso, n);
    }
  });

  it("rechaza una opción desconocida, un caso fuera de 1 a 7 y un --caso sin número", () => {
    assert.equal(leerOpciones(["--rapido"]), null);
    assert.equal(leerOpciones(["--caso", "0"]), null);
    assert.equal(leerOpciones(["--caso", "8"]), null);
    assert.equal(leerOpciones(["--caso", "12"]), null);
    assert.equal(leerOpciones(["--caso", "uno"]), null);
    assert.equal(leerOpciones(["--caso"]), null);
    assert.equal(leerOpciones(["--caso", "--json"]), null);
  });
});

describe("comando: ejecución de los casos", () => {
  let vacia: string;
  before(() => {
    fijarDestino({ write: () => true });
    vacia = mkdtempSync(join(tmpdir(), "crediagil-comando-"));
  });
  after(() => {
    fijarDestino(null);
    rmSync(vacia, { recursive: true, force: true });
  });

  it("un caso cuya carpeta no existe es no ejecutable y el informe es incompleto", async () => {
    const informe = await ejecutarCasos({ modo: "guionado", json: false }, { carpetaCasos: vacia });
    assert.equal(informe.casos.length, 7);
    assert.ok(informe.casos.every((c) => c.resultado === "no_ejecutable"));
    assert.equal(informe.codigoSalida, 3);
  });

  it("un caso que no carga lleva el número de su carpeta en el informe", async () => {
    mkdirSync(join(vacia, "4-roto"), { recursive: true });
    writeFileSync(join(vacia, "4-roto", "caso.json"), "{ no es json");
    const informe = await ejecutarCasos(
      { modo: "guionado", caso: 4, json: false },
      { carpetaCasos: vacia },
    );
    assert.equal(informe.casos[0]?.numero, 4);
    assert.equal(informe.casos[0]?.resultado, "no_ejecutable");
  });

  it("--caso ejecuta solo ese caso", async () => {
    const informe = await ejecutarCasos(
      { modo: "guionado", caso: 4, json: false },
      { carpetaCasos: vacia },
    );
    assert.deepEqual(
      informe.casos.map((c) => c.numero),
      [4],
    );
  });

  it("--modelo-real sin ANTHROPIC_API_KEY informa todos los casos no ejecutables con la causa y código 3", async () => {
    const informe = await ejecutarCasos(
      { modo: "modelo_real", json: false },
      {
        carpetaCasos: join(process.cwd(), "casos", "obligatorios"),
        ejecucion: { entorno: {} },
      },
    );
    assert.equal(informe.modo, "modelo_real");
    assert.equal(informe.casos.length, 7);
    assert.ok(informe.casos.every((c) => c.resultado === "no_ejecutable"));
    assert.ok(informe.casos.every((c) => c.causa === CAUSA_SIN_CLAVE));
    assert.equal(informe.codigoSalida, 3);
  });
});
