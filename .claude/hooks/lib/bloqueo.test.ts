import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { componerMensaje, enmascarar, type Bloqueo } from "./bloqueo.ts";

describe("enmascarar", () => {
  it("deja solo los últimos 4 dígitos", () => {
    assert.equal(enmascarar("0001 2345 6789"), "••••6789");
  });

  it("enmascara por completo un valor con menos de 4 dígitos", () => {
    assert.equal(enmascarar("12"), "••••");
  });
});

describe("componerMensaje", () => {
  const datos: Bloqueo = {
    control: "datos-reales",
    detectado: "tarjeta ••••6789 en a.md, línea 1",
    regla: "Principio II · FR-001",
    correccion: "Usa la convención ficticia",
  };
  const secretos: Bloqueo = {
    control: "secretos",
    detectado: "el comando lee .env",
    regla: "FR-006",
    correccion: "No abras .env",
  };

  it("indica la cantidad de motivos y el detalle de cada uno", () => {
    const mensaje = componerMensaje([datos]);
    assert.match(mensaje, /^Acción bloqueada por los guardarraíles de Crediágil \(1 motivo\)\./);
    assert.match(mensaje, /\[datos-reales\] tarjeta ••••6789 en a\.md, línea 1/);
    assert.match(mensaje, /Regla: Principio II · FR-001/);
    assert.match(mensaje, /Corrección: Usa la convención ficticia/);
  });

  it("ordena los controles: secretos antes que datos-reales", () => {
    const mensaje = componerMensaje([datos, secretos]);
    assert.match(mensaje, /\(2 motivos\)/);
    assert.ok(mensaje.indexOf("[secretos]") < mensaje.indexOf("[datos-reales]"));
  });
});
