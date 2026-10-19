// Los siete casos obligatorios (#17) en modo guionado: carga, coherencia y veredicto de cada uno, con el
// core real y los hooks reales. Incluye la repetibilidad (el veredicto no depende de la redacción) y la
// sensibilidad (una decisión alterada cambia el veredicto).

import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { cargarCaso, type CasoPrueba } from "../chat/casos.ts";
import { fijarDestino } from "../compartido/logs.ts";
import { ejecutarCaso, type ResultadoCaso } from "./ejecutor.ts";
import { leerGuion, validarGuion } from "./guion.ts";
import { evaluar, type Observado } from "./veredicto.ts";

const CARPETA = resolve("casos", "obligatorios");
const opciones = { modo: "guionado", stderrCore: "ignore" } as const;

const carpetas = readdirSync(CARPETA, { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => e.name)
  .sort();

before(() => fijarDestino({ write: () => true }));
after(() => fijarDestino(null));

const cargar = async (carpeta: string): Promise<CasoPrueba> => {
  const carga = await cargarCaso(join(CARPETA, carpeta), process.cwd());
  assert.ok(carga.ok, `${carpeta}: ${carga.ok ? "" : carga.problema}`);
  return carga.caso;
};

describe("casos obligatorios: carga y coherencia", () => {
  it("hay siete carpetas, numeradas de 1 a 7 sin repetir", async () => {
    assert.equal(carpetas.length, 7);
    const numeros: number[] = [];
    for (const carpeta of carpetas) {
      const caso = await cargar(carpeta);
      assert.equal(carpeta.startsWith(`${caso.numero}-`), true, carpeta);
      numeros.push(caso.numero!);
    }
    assert.deepEqual(numeros.sort(), [1, 2, 3, 4, 5, 6, 7]);
  });

  for (const carpeta of carpetas) {
    it(`${carpeta}: trae esperado (o variantes en el 7), guion coherente y sus documentos`, async () => {
      const caso = await cargar(carpeta);
      if (caso.numero === 7) {
        assert.deepEqual(
          caso.variantes?.map((v) => v.nombre),
          ["una-vez", "siempre"],
        );
        assert.equal(caso.esperado, undefined);
      } else {
        assert.ok(caso.esperado, "falta el esperado");
        assert.equal(caso.variantes, undefined);
      }
      const lectura = await leerGuion(join(CARPETA, carpeta));
      assert.ok(lectura.ok, lectura.ok ? "" : lectura.problema);
      assert.deepEqual(await validarGuion(lectura.guion, caso, (r) => readFile(r, "utf8")), []);
    });
  }
});

describe("casos obligatorios: resultado de cada caso en modo guionado", () => {
  const resultados = new Map<string, ResultadoCaso[]>();

  before(async () => {
    for (const carpeta of carpetas) {
      resultados.set(carpeta, await ejecutarCaso(join(CARPETA, carpeta), opciones));
    }
  });

  for (const carpeta of carpetas) {
    it(`${carpeta} termina en su resultado esperado`, () => {
      for (const r of resultados.get(carpeta)!) {
        assert.equal(
          r.resultado,
          "paso",
          JSON.stringify({ r: r.variante, d: r.diferencias, c: r.causa }),
        );
      }
    });
  }

  it("el caso 7 da una entrada por variante", () => {
    const variantes = resultados.get(carpetas.find((c) => c.startsWith("7-"))!)!;
    assert.deepEqual(
      variantes.map((v) => v.variante),
      ["una-vez", "siempre"],
    );
  });

  it("caso 1: registra y preaprueba con el ingreso verificado de los documentos", () => {
    const o = resultados.get(carpetas[0]!)![0]!.observado!;
    assert.equal(o.decision, "preaprobada");
    assert.equal(o.estadoCore.solicitudRegistrada, true);
    assert.equal(o.estadoCore.ingresoVerificado, 3_800_000);
  });

  it("caso 2: el salario queda nulo, sin completarlo, y no se registra ni se preaprueba", () => {
    const o = resultados.get(carpetas[1]!)![0]!.observado!;
    assert.equal(o.estadoCore.campos.find((c) => c.campo === "salario")?.valor, null);
    assert.equal(o.estadoCore.solicitudRegistrada, false);
    assert.equal(o.estadoCore.preaprobada, false);
  });

  it("caso 4: el monto sobre el tope escala, se registra y no se preaprueba", () => {
    const o = resultados.get(carpetas[3]!)![0]!.observado!;
    assert.equal(o.decision, "escalada");
    assert.equal(o.causa, "monto_sobre_umbral");
    assert.equal(o.estadoCore.solicitudRegistrada, true);
    assert.equal(o.estadoCore.preaprobada, false);
  });

  it("caso 5: el hook bloquea antes de producir efecto y deja constancia", () => {
    const o = resultados.get(carpetas[4]!)![0]!.observado!;
    assert.equal(o.decision, "bloqueada");
    assert.ok(o.eventos.includes("bloqueo_por_regla"));
    assert.equal(o.estadoCore.solicitudRegistrada, false);
    assert.equal(o.estadoCore.preaprobada, false);
  });

  it("caso 6: no convierte la moneda ni estima el ingreso", () => {
    const o = resultados.get(carpetas[5]!)![0]!.observado!;
    assert.equal(o.decision, "escalada");
    assert.equal(o.estadoCore.ingresoVerificado, null);
  });

  it("caso 7: reintenta una vez con éxito, o agota los intentos y escala sin afirmar una decisión", () => {
    const [unaVez, siempre] = resultados.get(carpetas[6]!)!;
    assert.deepEqual(
      unaVez!
        .observado!.llamadas.filter((l) => l.herramienta === "buscar_solicitante")
        .map((l) => l.resultado),
      ["core_no_disponible", "ok"],
    );
    assert.equal(unaVez!.observado!.decision, "preaprobada");
    assert.equal(siempre!.observado!.decision, "escalada");
    assert.equal(siempre!.observado!.motivo, "falla_transitoria_persistente");
    assert.equal(siempre!.observado!.entrega, "pendiente");
    assert.equal(siempre!.observado!.estadoCore.preaprobada, false);
  });

  describe("sensibilidad: alterar una decisión cambia el veredicto (SC-003)", () => {
    const esperadoDe = async (prefijo: string) => {
      const caso = await cargar(carpetas.find((c) => c.startsWith(prefijo))!);
      return caso.esperado!;
    };
    const observadoDe = (prefijo: string): Observado =>
      structuredClone(resultados.get(carpetas.find((c) => c.startsWith(prefijo))!)![0]!.observado!);

    for (const prefijo of ["3-", "4-", "5-", "6-"]) {
      it(`caso ${prefijo[0]}: una preaprobación que no debía ocurrir falla`, async () => {
        const observado = observadoDe(prefijo);
        observado.llamadas.push({ herramienta: "preaprobar_credito", intento: 1, resultado: "ok" });
        observado.decision = "preaprobada";
        observado.estadoCore.preaprobada = true;
        const veredicto = evaluar(await esperadoDe(prefijo), observado);
        assert.equal(veredicto.resultado, "fallo");
        assert.ok(veredicto.diferencias.some((d) => d.campo === "decision"));
      });
    }

    it("caso 3: quitar el escalamiento falla", async () => {
      const observado = observadoDe("3-");
      observado.decision = "solicitud_de_dato";
      delete observado.causa;
      assert.equal(evaluar(await esperadoDe("3-"), observado).resultado, "fallo");
    });
  });
});

describe("casos obligatorios: el veredicto no depende de la redacción del modelo (HU3)", () => {
  let temporal: string;
  before(() => {
    temporal = mkdtempSync(join(tmpdir(), "crediagil-redaccion-"));
  });
  after(() => rmSync(temporal, { recursive: true, force: true }));

  it("el caso 3 con otra redacción de cada respuesta da el mismo veredicto, decisión y llamadas", async () => {
    const original = join(
      CARPETA,
      carpetas.find((c) => c.startsWith("3-"))!,
    );
    const [base] = await ejecutarCaso(original, opciones);

    const copia = join(temporal, "caso-3");
    cpSync(original, copia, { recursive: true });
    const guion = JSON.parse(readFileSync(join(copia, "guion.json"), "utf8")) as {
      pasos: { respuesta: string }[];
    };
    guion.pasos.forEach((p, i) => (p.respuesta = `Redacción distinta número ${i}: ¡Todo bien!`));
    writeFileSync(join(copia, "guion.json"), JSON.stringify(guion));
    const [otra] = await ejecutarCaso(copia, opciones);

    assert.equal(base!.resultado, "paso");
    assert.equal(otra!.resultado, base!.resultado);
    assert.deepEqual(otra!.observado, base!.observado);
  });
});
