import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { esquemaEsperado, esquemaVariante } from "./esperado.ts";

const valido = (extra: Record<string, unknown> = {}) =>
  esquemaEsperado.safeParse({ decision: "preaprobada", ...extra });

describe("esperado: esquema del resultado esperado", () => {
  it("acepta un esperado válido por cada decisión", () => {
    assert.ok(valido().success);
    assert.ok(valido({ decision: "solicitud_de_dato" }).success);
    assert.ok(valido({ decision: "bloqueada", bloqueoRequerido: "solo_guionado" }).success);
    assert.ok(
      valido({
        decision: "escalada",
        causa: "monto_sobre_umbral",
        codigoBloqueo: "monto_sobre_tope",
      }).success,
    );
  });

  it("las listas son vacías por defecto", () => {
    const r = valido();
    assert.ok(r.success);
    assert.deepEqual(r.data.llamadasRequeridas, []);
    assert.deepEqual(r.data.llamadasProhibidas, []);
    assert.deepEqual(r.data.eventosRequeridos, []);
  });

  it("una decisión escalada exige causa", () => {
    assert.equal(valido({ decision: "escalada" }).success, false);
  });

  it("las demás decisiones no admiten causa, motivo ni código de bloqueo", () => {
    assert.equal(valido({ causa: "monto_sobre_umbral" }).success, false);
    assert.equal(valido({ motivo: "caso_no_cubierto" }).success, false);
    assert.equal(valido({ codigoBloqueo: "monto_sobre_tope" }).success, false);
  });

  it("una herramienta no puede ser requerida y prohibida a la vez", () => {
    const r = valido({
      llamadasRequeridas: ["preaprobar_credito"],
      llamadasProhibidas: ["preaprobar_credito"],
    });
    assert.equal(r.success, false);
  });

  it("rechaza un campo desconocido: no hay forma de comparar el texto de la respuesta", () => {
    assert.equal(valido({ respuesta: "Tu solicitud fue preaprobada" }).success, false);
    assert.equal(valido({ estadoCore: { texto: "x" } }).success, false);
  });

  it("rechaza herramientas, eventos, causas y motivos fuera de catálogo", () => {
    assert.equal(valido({ llamadasRequeridas: ["extraer_documento"] }).success, false);
    assert.equal(valido({ llamadasProhibidas: ["inventada"] }).success, false);
    assert.equal(valido({ eventosRequeridos: ["inventado"] }).success, false);
    assert.equal(valido({ decision: "escalada", causa: "inventada" }).success, false);
    assert.equal(
      valido({ decision: "escalada", causa: "caso_no_cubierto", motivo: "x" }).success,
      false,
    );
    assert.equal(valido({ decision: "aprobada" }).success, false);
  });

  it("acepta un dato faltante como valor null", () => {
    const r = valido({
      estadoCore: { campos: [{ documento: "certificado.md", campo: "salario", valor: null }] },
    });
    assert.ok(r.success);
  });
});

describe("esperado: variante del caso 7", () => {
  it("acepta una variante con sus reintentos", () => {
    const r = esquemaVariante.safeParse({
      nombre: "una-vez",
      esperado: { decision: "preaprobada" },
      reintentos: { herramienta: "buscar_solicitante", resultados: ["core_no_disponible", "ok"] },
    });
    assert.ok(r.success);
  });

  it("rechaza un modo de falla desconocido y reintentos sin resultados", () => {
    assert.equal(
      esquemaVariante.safeParse({ nombre: "a-veces", esperado: { decision: "preaprobada" } })
        .success,
      false,
    );
    assert.equal(
      esquemaVariante.safeParse({
        nombre: "siempre",
        esperado: { decision: "preaprobada" },
        reintentos: { herramienta: "buscar_solicitante", resultados: [] },
      }).success,
      false,
    );
  });
});
