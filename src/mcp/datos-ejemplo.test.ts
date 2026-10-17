import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { datosReales } from "../../.claude/hooks/lib/datos-reales.ts";
import { esquemaIdSolicitud } from "./core-simulado.ts";
import {
  DOCUMENTO_SIN_COINCIDENCIAS,
  ID_EN_ESTUDIO,
  ID_HOMONIMO_1,
  ID_HOMONIMO_2,
  ID_SOLICITANTE_UNICO,
  NOMBRE_SIN_COINCIDENCIAS,
  SOLICITANTES_EJEMPLO,
  SOLICITUDES_EJEMPLO,
} from "./datos-ejemplo.ts";

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

  it("los solicitantes cumplen la convención de datos ficticios (FR-017)", () => {
    const ids = new Set<string>();
    const documentos = new Set<string>();
    const hoy = new Date().toISOString().slice(0, 10);
    for (const s of SOLICITANTES_EJEMPLO) {
      assert.match(s.idSolicitante, /^CLI-000\d{7}$/, s.idSolicitante);
      assert.match(s.documento, /^000\d{3,7}$/, s.documento);
      assert.ok(s.correo.endsWith(".example"), s.correo);
      assert.match(s.fechaExpedicion, /^\d{4}-\d{2}-\d{2}$/, s.idSolicitante);
      const fecha = new Date(`${s.fechaExpedicion}T00:00:00.000Z`);
      assert.equal(fecha.toISOString().slice(0, 10), s.fechaExpedicion, "fecha de calendario");
      assert.ok(s.fechaExpedicion <= hoy, "fecha no futura");
      ids.add(s.idSolicitante);
      documentos.add(s.documento);
    }
    assert.equal(ids.size, SOLICITANTES_EJEMPLO.length, "idSolicitante único");
    assert.equal(documentos.size, SOLICITANTES_EJEMPLO.length, "documento único");
  });

  it("hay un solicitante único, el mismo de la solicitud en estudio", () => {
    const unico = SOLICITANTES_EJEMPLO.find((s) => s.idSolicitante === ID_SOLICITANTE_UNICO);
    assert.ok(unico);
    assert.equal(unico.nombre, "Ana Pérez Ficticia");
    assert.equal(unico.documento, "0001234567");
    const solicitud = SOLICITUDES_EJEMPLO.find((s) => s.idSolicitud === ID_EN_ESTUDIO);
    assert.equal(solicitud?.solicitante.documento, unico.documento);
    assert.equal(SOLICITANTES_EJEMPLO.filter((s) => s.nombre === unico.nombre).length, 1);
  });

  it("hay dos homónimos con documento y fecha de expedición distintos", () => {
    const h1 = SOLICITANTES_EJEMPLO.find((s) => s.idSolicitante === ID_HOMONIMO_1);
    const h2 = SOLICITANTES_EJEMPLO.find((s) => s.idSolicitante === ID_HOMONIMO_2);
    assert.ok(h1 && h2);
    assert.equal(h1.nombre, "Elena Martínez Inventada");
    assert.equal(h2.nombre, h1.nombre);
    assert.equal(h1.documento, "0002020202");
    assert.equal(h2.documento, "0003030303");
    assert.notEqual(h1.fechaExpedicion, h2.fechaExpedicion);
  });

  it("el documento y el nombre sin coincidencias no están en el core", () => {
    assert.equal(DOCUMENTO_SIN_COINCIDENCIAS, "0009090909");
    assert.equal(NOMBRE_SIN_COINCIDENCIAS, "Nadie Registrado Ficticio");
    assert.ok(SOLICITANTES_EJEMPLO.every((s) => s.documento !== DOCUMENTO_SIN_COINCIDENCIAS));
    assert.ok(SOLICITANTES_EJEMPLO.every((s) => s.nombre !== NOMBRE_SIN_COINCIDENCIAS));
  });

  it("el core simulado no usa la red", () => {
    for (const nombre of ["./core-simulado.ts", "./datos-ejemplo.ts", "./falla.ts"]) {
      const texto = readFileSync(archivo(nombre), "utf8");
      assert.doesNotMatch(texto, /node:(net|http|https|dgram)|\bfetch\(/, nombre);
    }
  });
});
