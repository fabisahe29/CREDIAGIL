import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { crearAdaptador, crearEstado } from "../agente/adaptador.ts";
import { CORE_NO_SIMULADO } from "../agente/core-no-simulado.ts";
import { exito } from "../compartido/errores.ts";
import { cargarCaso, type CasoPrueba } from "../chat/casos.ts";
import {
  HERRAMIENTAS_DEL_MODELO,
  esquemaGuion,
  leerGuion,
  validarGuion,
  type Guion,
} from "./guion.ts";

const CARPETA = resolve("casos", "obligatorios", "1-ejemplo-consistente");
const leerAdjunto = (ruta: string) => readFile(ruta, "utf8");

let caso: CasoPrueba;
let guion: Guion;

before(async () => {
  const carga = await cargarCaso(CARPETA, process.cwd());
  assert.ok(carga.ok, "el caso 1 debe cargar");
  caso = carga.caso;
  const lectura = await leerGuion(CARPETA);
  assert.ok(lectura.ok, "el guion del caso 1 debe cargar");
  guion = lectura.guion;
});

const copia = (): Guion => structuredClone(guion);

describe("guion: lectura de guion.json", () => {
  it("lee el guion del caso 1", () => {
    assert.equal(guion.pasos.length, caso.pasos.length);
  });

  it("informa una carpeta sin guion.json", async () => {
    const vacia = mkdtempSync(join(tmpdir(), "crediagil-guion-"));
    try {
      const r = await leerGuion(vacia);
      assert.equal(r.ok, false);
      if (!r.ok) assert.match(r.problema, /guion\.json/);
    } finally {
      rmSync(vacia, { recursive: true, force: true });
    }
  });

  it("informa un JSON inválido y un guion fuera del esquema", async () => {
    const carpeta = mkdtempSync(join(tmpdir(), "crediagil-guion-"));
    try {
      writeFileSync(join(carpeta, "guion.json"), "{ no es json");
      const invalido = await leerGuion(carpeta);
      assert.equal(invalido.ok, false);
      if (!invalido.ok) assert.match(invalido.problema, /JSON/);
      writeFileSync(join(carpeta, "guion.json"), JSON.stringify({ pasos: [] }));
      const fuera = await leerGuion(carpeta);
      assert.equal(fuera.ok, false);
    } finally {
      rmSync(carpeta, { recursive: true, force: true });
    }
  });

  it("rechaza una herramienta que el modelo no tiene y un campo desconocido", () => {
    const malo = copia();
    malo.pasos[0]!.llamadas = [{ herramienta: "inventada" as never, entrada: {} }];
    assert.equal(esquemaGuion.safeParse(malo).success, false);
    assert.equal(esquemaGuion.safeParse({ ...copia(), extra: 1 }).success, false);
  });
});

describe("guion: coherencia con el caso", () => {
  it("el guion del caso 1 es coherente", async () => {
    assert.deepEqual(await validarGuion(guion, caso, leerAdjunto), []);
  });

  it("detecta un número de pasos distinto", async () => {
    const malo = copia();
    malo.pasos.pop();
    const problemas = await validarGuion(malo, caso, leerAdjunto);
    assert.match(problemas.join(" "), /pasos/);
  });

  it("detecta un adjunto sin clasificación y uno sin extracción", async () => {
    const sinClasificar = copia();
    delete sinClasificar.clasificacion["certificado-completo.md"];
    assert.match(
      (await validarGuion(sinClasificar, caso, leerAdjunto)).join(" "),
      /clasificación de certificado-completo\.md/,
    );
    const sinExtraer = copia();
    delete sinExtraer.extracciones["extracto-2026-07.md"];
    assert.match(
      (await validarGuion(sinExtraer, caso, leerAdjunto)).join(" "),
      /extracción de extracto-2026-07\.md/,
    );
  });

  it("detecta una extracción cuyo fragmento no está en el documento", async () => {
    const malo = copia();
    malo.extracciones["certificado-completo.md"]!.certificado!.cargo = {
      valor: "gerente",
      fragmento: "en el cargo de gerente general",
    };
    const problemas = await validarGuion(malo, caso, leerAdjunto);
    assert.match(problemas.join(" "), /no pasa la validación/);
  });
});

describe("guion: herramientas del modelo", () => {
  it("coinciden con las del adaptador", () => {
    const adaptador = crearAdaptador({
      core: {
        ...CORE_NO_SIMULADO,
        consultarSolicitud: async () => exito({ solicitud: null }),
        cerrar: async () => {},
      },
      estado: crearEstado("00000000-0000-4000-8000-000000000000"),
    });
    assert.deepEqual(
      Object.keys(adaptador.herramientas).sort(),
      [...HERRAMIENTAS_DEL_MODELO].sort(),
    );
  });
});
