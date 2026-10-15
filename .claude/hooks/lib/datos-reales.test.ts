import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { Accion } from "./accion.ts";
import { datosReales } from "./datos-reales.ts";
import { enBloques, tarjetaLuhn } from "./generadores.ts";

// Ningún valor con forma real se escribe literal (FR-018): se arma en tiempo de ejecución.

function escribir(texto: string, origen = "notas.md"): Accion {
  return { herramienta: "Write", rutas: [origen], textos: [{ origen, texto }] };
}

function bloquea(texto: string): boolean {
  return datosReales(escribir(texto)).length > 0;
}

const cedula8 = "52" + "3".repeat(6);
const cedula10 = "10" + "4".repeat(8);
const nit = "9" + "0".repeat(2) + "1".repeat(6);
const cuenta10 = "45" + "6".repeat(8);
const cuenta20 = "12" + "7".repeat(18);

describe("datos-reales: se bloquean", () => {
  it("una tarjeta que pasa Luhn, sin separadores, con espacios y con guiones", () => {
    const t = tarjetaLuhn();
    assert.ok(bloquea(`pago con ${t}`));
    assert.ok(bloquea(`pago con ${enBloques(t, " ")}`));
    assert.ok(bloquea(`pago con ${enBloques(t, "-")}`));
  });

  it("una tarjeta en cualquier contexto, sin palabra clave", () => {
    assert.ok(bloquea(`const x = "${tarjetaLuhn()}";`));
  });

  it("una cédula de 8 y otra de 10 dígitos con su palabra clave", () => {
    assert.ok(bloquea(`cédula ${cedula8}`));
    assert.ok(bloquea(`CC ${cedula10}`));
    assert.ok(bloquea(`C.C. ${cedula8.slice(0, 2)}.${cedula8.slice(2, 5)}.${cedula8.slice(5)}`));
  });

  it("un NIT de 9 dígitos con dígito de verificación", () => {
    assert.ok(bloquea(`NIT ${nit}-3`));
    assert.ok(bloquea(`NIT ${nit.slice(0, 3)}.${nit.slice(3, 6)}.${nit.slice(6)}-3`));
  });

  it("una cuenta de 10 y otra de 20 dígitos", () => {
    assert.ok(bloquea(`cuenta de ahorros ${cuenta10}`));
    assert.ok(bloquea(`IBAN ${cuenta20}`));
  });

  it("un monto de 10 dígitos en la misma línea que la palabra cuenta (borde aceptado)", () => {
    assert.ok(bloquea(`la cuenta tiene saldo de ${"15" + "0".repeat(8)}`));
  });
});

describe("datos-reales: pasan", () => {
  const montos = [
    "const TOPE = 5_000_000;",
    "monto: $5.000.000 COP",
    "const monto = 5000000;",
    "cuota mensual 285.432",
    "saldo 1.250.000,50",
    "ingreso verificado: 4.800.000",
    "tasa 0,018 mensual",
    "plazo de 36 meses",
    "const cuota = Math.round(monto * i / (1 - (1 + i) ** -n));",
    "monto máximo $5.000.000 y cuota de 30%",
    "fecha 2026-10-15",
    "tener en cuenta que el monto es 4.800.000",
  ];
  for (const monto of montos) {
    it(`no bloquea el monto: ${monto}`, () => assert.equal(bloquea(monto), false));
  }

  it("un número de 16 dígitos que no pasa Luhn", () => {
    const t = tarjetaLuhn();
    const invalida = t.slice(0, -1) + String((Number(t.slice(-1)) + 1) % 10);
    assert.equal(bloquea(`referencia ${invalida}`), false);
  });

  it("un número de cédula sin palabra clave en su línea", () => {
    assert.equal(bloquea(`id interno ${cedula8}`), false);
  });

  it("identificadores ficticios con prefijo 000 de cada tipo", () => {
    assert.equal(bloquea("CC 0001234567"), false);
    assert.equal(bloquea("NIT 000123456-7"), false);
    assert.equal(bloquea("cuenta de ahorros 0001234567890"), false);
    assert.equal(bloquea("tarjeta 0000 1234 5678 9010"), false);
  });

  it("palabras que contienen CC o NIT sin serlo", () => {
    assert.equal(bloquea(`ACCESO ${cedula8}`), false);
    assert.equal(bloquea(`UNITARIO ${nit}-3`), false);
  });
});

describe("datos-reales: mensaje", () => {
  it("informa tipo, archivo y línea, con el dato enmascarado", () => {
    const t = tarjetaLuhn();
    const [bloqueo] = datosReales(escribir(`línea uno\npago ${t}`, "src/a.ts"));
    assert.ok(bloqueo);
    assert.equal(bloqueo.control, "datos-reales");
    assert.match(bloqueo.detectado, /^tarjeta ••••\d{4} en src\/a\.ts, línea 2$/);
    assert.ok(!bloqueo.detectado.includes(t));
    assert.match(bloqueo.correccion, /docs\/datos-ficticios\.md/);
  });

  it("informa una línea por dato detectado", () => {
    const bloqueos = datosReales(escribir(`cédula ${cedula8}\nNIT ${nit}-3`));
    assert.equal(bloqueos.length, 2);
  });
});
