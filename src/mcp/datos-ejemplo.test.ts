import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { datosReales } from "../../.claude/hooks/lib/datos-reales.ts";
import { esquemaIdSolicitud } from "./core-simulado.ts";
import { SOLICITUDES_EJEMPLO } from "./datos-ejemplo.ts";

const archivo = (nombre: string) => fileURLToPath(new URL(nombre, import.meta.url));

describe("datos de ejemplo del core: solo ficticios (US4)", () => {
  it("el archivo no tiene datos con forma real según el detector del #5", () => {
    const texto = readFileSync(archivo("./datos-ejemplo.ts"), "utf8");
    const bloqueos = datosReales({
      herramienta: "Write",
      rutas: ["src/mcp/datos-ejemplo.ts"],
      textos: [{ origen: "src/mcp/datos-ejemplo.ts", texto }],
    });
    assert.deepEqual(
      bloqueos.map((b) => b.detectado),
      [],
    );
  });

  it("cumplen la convención de datos ficticios", () => {
    assert.ok(SOLICITUDES_EJEMPLO.length >= 3);
    for (const s of SOLICITUDES_EJEMPLO) {
      assert.ok(esquemaIdSolicitud.safeParse(s.idSolicitud).success, s.idSolicitud);
      assert.ok(s.solicitante.documento.startsWith("000"), s.solicitante.documento);
      assert.ok(s.solicitante.correo.endsWith(".example"), s.solicitante.correo);
      assert.ok(Number.isInteger(s.monto) && s.monto > 0, String(s.monto));
      assert.ok(s.plazoMeses >= 1 && s.plazoMeses <= 120, String(s.plazoMeses));
    }
  });

  it("hay una solicitud por estado: en_estudio, anulada y reservada", () => {
    const estados = new Set(SOLICITUDES_EJEMPLO.map((s) => s.estado));
    assert.deepEqual([...estados].sort(), ["anulada", "en_estudio", "reservada"]);
  });

  it("el core simulado no usa la red", () => {
    for (const nombre of ["./core-simulado.ts", "./datos-ejemplo.ts", "./falla.ts"]) {
      const texto = readFileSync(archivo(nombre), "utf8");
      assert.doesNotMatch(texto, /node:(net|http|https|dgram)|\bfetch\(/, nombre);
    }
  });
});
