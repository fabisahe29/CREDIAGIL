import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { fijarDestino, registrar } from "./logs.ts";

function destinoFalso() {
  const lineas: string[] = [];
  return { lineas, write: (texto: string) => lineas.push(texto) };
}

describe("logs estructurados", () => {
  it("escribe una sola línea JSON con ts, nivel, evento, correlationId y los campos", () => {
    const destino = destinoFalso();
    registrar("llamada_core", { correlationId: "abc", intento: 1 }, { destino });
    assert.equal(destino.lineas.length, 1);
    const linea = destino.lineas[0]!;
    assert.ok(linea.endsWith("\n"));
    assert.equal(linea.trimEnd().includes("\n"), false);
    const registro = JSON.parse(linea) as Record<string, unknown>;
    assert.equal(registro["evento"], "llamada_core");
    assert.equal(registro["nivel"], "info");
    assert.equal(registro["correlationId"], "abc");
    assert.equal(registro["intento"], 1);
    assert.match(String(registro["ts"]), /^\d{4}-\d{2}-\d{2}T/);
  });

  it("incluye correlationId aunque falte, como null", () => {
    const destino = destinoFalso();
    registrar("arranque", {}, { destino, nivel: "warn" });
    const registro = JSON.parse(destino.lineas[0]!) as Record<string, unknown>;
    assert.equal(registro["correlationId"], null);
    assert.equal(registro["nivel"], "warn");
  });

  it("por defecto escribe en stderr, nunca en stdout", (t) => {
    const stdout = t.mock.method(process.stdout, "write", () => true);
    const stderr = t.mock.method(process.stderr, "write", () => true);
    registrar("prueba", { correlationId: "x" });
    assert.equal(stdout.mock.callCount(), 0);
    assert.equal(stderr.mock.callCount(), 1);
  });
});

describe("logs: destino por defecto configurable (chat, R6)", () => {
  it("tras fijarDestino, registrar sin destino escribe en el nuevo destino y no en stderr", (t) => {
    const stderr = t.mock.method(process.stderr, "write", () => true);
    const archivo = destinoFalso();
    fijarDestino(archivo);
    try {
      registrar("prueba", { correlationId: "x" });
    } finally {
      fijarDestino(null);
    }
    assert.equal(archivo.lineas.length, 1);
    assert.equal(stderr.mock.callCount(), 0);
  });

  it("un destino explícito sigue mandando sobre el fijado", () => {
    const archivo = destinoFalso();
    const explicito = destinoFalso();
    fijarDestino(archivo);
    try {
      registrar("prueba", {}, { destino: explicito });
    } finally {
      fijarDestino(null);
    }
    assert.equal(archivo.lineas.length, 0);
    assert.equal(explicito.lineas.length, 1);
  });

  it("fijarDestino(null) vuelve a stderr", (t) => {
    const stderr = t.mock.method(process.stderr, "write", () => true);
    fijarDestino(destinoFalso());
    fijarDestino(null);
    registrar("prueba");
    assert.equal(stderr.mock.callCount(), 1);
  });
});
