import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { ResultadoCaso } from "./ejecutor.ts";
import { armarInforme, formatearInforme, informeJson, resumirLlamadas } from "./informe.ts";
import type { Observado } from "./veredicto.ts";

const observado = (cambios: Partial<Observado> = {}): Observado => ({
  modo: "guionado",
  decision: "preaprobada",
  llamadas: [
    { herramienta: "buscar_solicitante", intento: 1, resultado: "ok" },
    { herramienta: "registrar_extraccion", intento: 1, resultado: "ok" },
    { herramienta: "registrar_extraccion", intento: 1, resultado: "ok" },
  ],
  eventos: ["preaprobacion"],
  estadoCore: {
    solicitudRegistrada: true,
    preaprobada: true,
    ingresoVerificado: 3_800_000,
    campos: [],
    escalamientoRegistrado: false,
  },
  entrega: null,
  ...cambios,
});

const paso = (numero: number, extra: Partial<ResultadoCaso> = {}): ResultadoCaso => ({
  numero,
  nombre: `caso-${numero}`,
  resultado: "paso",
  diferencias: [],
  observado: observado(),
  ...extra,
});

const fallo = (numero: number): ResultadoCaso =>
  paso(numero, {
    resultado: "fallo",
    diferencias: [
      {
        campo: "llamadasProhibidas.preaprobar_credito",
        esperado: "ninguna",
        observado: "1 llamada(s) con éxito",
      },
    ],
  });

const noEjecutable = (numero: number): ResultadoCaso => ({
  numero,
  nombre: `caso-${numero}`,
  resultado: "no_ejecutable",
  diferencias: [],
  causa: "documento ausente.md: inexistente",
});

const siete = (cambios: Record<number, ResultadoCaso> = {}) =>
  [1, 2, 3, 4, 5, 6, 7].map((n) => cambios[n] ?? paso(n));

describe("informe: veredicto global y código de salida", () => {
  it("éxito solo con todos en paso, código 0", () => {
    const i = armarInforme("guionado", siete());
    assert.equal(i.global, "exito");
    assert.equal(i.codigoSalida, 0);
  });

  it("un fallo da fallo global, código 1, e identifica el caso y la diferencia", () => {
    const i = armarInforme("guionado", siete({ 4: fallo(4) }));
    assert.equal(i.global, "fallo");
    assert.equal(i.codigoSalida, 1);
    const texto = formatearInforme(i);
    assert.match(texto, /4 caso-4 {2}FALLÓ/);
    assert.match(texto, /diferencia: llamadasProhibidas\.preaprobar_credito — esperado: ninguna/);
    assert.match(texto, /Global: FALLO .*caso-4/);
  });

  it("sin fallos pero con un caso no ejecutable es incompleto, código 3, nunca éxito", () => {
    const i = armarInforme("guionado", siete({ 6: noEjecutable(6) }));
    assert.equal(i.global, "incompleto");
    assert.equal(i.codigoSalida, 3);
    const texto = formatearInforme(i);
    assert.match(texto, /6 caso-6 {2}NO EJECUTABLE/);
    assert.match(texto, /causa: documento ausente\.md/);
    assert.doesNotMatch(texto, /ÉXITO/);
  });

  it("fallos y no ejecutables a la vez dan código 1", () => {
    const i = armarInforme("guionado", siete({ 4: fallo(4), 6: noEjecutable(6) }));
    assert.equal(i.global, "fallo");
    assert.equal(i.codigoSalida, 1);
  });

  it("una lista vacía no es éxito", () => {
    const i = armarInforme("guionado", []);
    assert.equal(i.global, "incompleto");
    assert.equal(i.codigoSalida, 3);
  });

  it("ordena los casos por número", () => {
    const i = armarInforme("guionado", [paso(3), paso(1), paso(2)]);
    assert.deepEqual(
      i.casos.map((c) => c.numero),
      [1, 2, 3],
    );
  });
});

describe("informe: contenido", () => {
  it("la primera línea indica el modo", () => {
    assert.match(
      formatearInforme(armarInforme("guionado", siete())),
      /^Casos obligatorios · modo: guionado/,
    );
    assert.match(
      formatearInforme(armarInforme("modelo_real", siete())),
      /^Casos obligatorios · modo: modelo real/,
    );
  });

  it("cada caso muestra la decisión, los eventos y las llamadas observadas, para auditar el veredicto", () => {
    const texto = formatearInforme(armarInforme("guionado", [paso(1)]));
    assert.match(texto, /preaprobada/);
    assert.match(texto, /eventos: preaprobacion/);
    assert.match(texto, /llamadas: buscar_solicitante, registrar_extraccion×2/);
  });

  it("un reintento se ve en la llamada", () => {
    assert.equal(
      resumirLlamadas([
        { herramienta: "buscar_solicitante", intento: 1, resultado: "core_no_disponible" },
        { herramienta: "buscar_solicitante", intento: 2, resultado: "ok" },
      ]),
      "buscar_solicitante[core_no_disponible → ok]",
    );
  });

  it("la variante del caso 7 y la entrega pendiente se muestran", () => {
    const texto = formatearInforme(
      armarInforme("guionado", [
        paso(7, {
          variante: "siempre",
          observado: observado({
            decision: "escalada",
            entrega: "pendiente",
            causa: "caso_no_cubierto",
          }),
        }),
      ]),
    );
    assert.match(texto, /7 caso-7 \(siempre\)/);
    assert.match(texto, /entrega pendiente/);
  });

  it("no imprime el contenido de ningún documento ni texto de respuestas", () => {
    const secreto = "CONTENIDO-SECRETO-DEL-DOCUMENTO";
    const caso = { ...paso(1), respuesta: secreto, contenido: secreto } as ResultadoCaso;
    const i = armarInforme("guionado", [caso]);
    assert.doesNotMatch(formatearInforme(i), new RegExp(secreto));
  });

  it("el JSON repite el informe con los mismos veredictos", () => {
    const i = armarInforme("guionado", siete({ 4: fallo(4) }));
    const json = JSON.parse(informeJson(i)) as { global: string; casos: { resultado: string }[] };
    assert.equal(json.global, "fallo");
    assert.equal(json.casos.filter((c) => c.resultado === "fallo").length, 1);
  });
});
