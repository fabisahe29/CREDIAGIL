import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { cargarCaso } from "./casos.ts";
import { ID_HOMONIMO_1, ID_SOLICITANTE_UNICO, SOLICITANTES_EJEMPLO } from "../mcp/datos-ejemplo.ts";

let raiz: string;

function caso(nombre: string, contenido: unknown, adjuntos: Record<string, string> = {}) {
  const carpeta = join(raiz, nombre);
  mkdirSync(carpeta, { recursive: true });
  writeFileSync(
    join(carpeta, "caso.json"),
    typeof contenido === "string" ? contenido : JSON.stringify(contenido),
  );
  for (const [archivo, texto] of Object.entries(adjuntos)) {
    writeFileSync(join(carpeta, archivo), texto);
  }
  return carpeta;
}

const valido = {
  nombre: "demo",
  descripcion: "Caso de prueba ficticio",
  pasos: [{ mensaje: "Hola" }, { adjuntar: "certificado.md" }],
};

before(() => {
  raiz = mkdtempSync(join(tmpdir(), "crediagil-casos-"));
});
after(() => {
  rmSync(raiz, { recursive: true, force: true });
});

describe("casos: carga válida", () => {
  it("acepta la carpeta del caso y resuelve los adjuntos dentro de ella", async () => {
    const carpeta = caso("valido", valido, { "certificado.md": "Ficticio" });
    const r = await cargarCaso(carpeta, raiz);
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.caso.nombre, "demo");
      assert.equal(r.caso.descripcion, "Caso de prueba ficticio");
      assert.equal(r.caso.directorio, carpeta);
      assert.deepEqual(r.caso.pasos, [
        { mensaje: "Hola" },
        { adjuntar: "certificado.md", ruta: join(carpeta, "certificado.md") },
      ]);
    }
  });

  it("acepta también la ruta del propio caso.json, relativa al directorio base", async () => {
    caso("relativo", valido, { "certificado.md": "Ficticio" });
    const r = await cargarCaso(join("relativo", "caso.json"), raiz);
    assert.equal(r.ok, true);
  });

  it("el caso versionado casos/demo-consulta carga sin errores", async () => {
    const r = await cargarCaso(resolve("casos", "demo-consulta"), process.cwd());
    assert.equal(r.ok, true, r.ok ? "" : r.problema);
  });

  for (const nombre of ["identidad-unico", "identidad-homonimos", "identidad-no-verificable"]) {
    it(`el caso versionado casos/${nombre} carga sin errores (#9)`, async () => {
      const r = await cargarCaso(resolve("casos", nombre), process.cwd());
      assert.equal(r.ok, true, r.ok ? "" : r.problema);
    });
  }

  for (const nombre of [
    "extraccion-certificado",
    "extraccion-sin-salario",
    "extraccion-extractos",
  ]) {
    it(`el caso versionado casos/${nombre} carga sin errores y verifica primero la identidad (#10)`, async () => {
      const r = await cargarCaso(resolve("casos", nombre), process.cwd());
      assert.equal(r.ok, true, r.ok ? "" : r.problema);
      const texto = readFileSync(resolve("casos", nombre, "caso.json"), "utf8");
      assert.ok(
        texto.includes(
          SOLICITANTES_EJEMPLO.find((s) => s.idSolicitante === ID_SOLICITANTE_UNICO)!
            .fechaExpedicion,
        ),
      );
    });
  }

  it("los casos de identidad usan las fechas de expedición de los datos del core (#9)", () => {
    const fecha = (id: string) =>
      SOLICITANTES_EJEMPLO.find((s) => s.idSolicitante === id)!.fechaExpedicion;
    const texto = (nombre: string) => readFileSync(resolve("casos", nombre, "caso.json"), "utf8");
    assert.ok(texto("identidad-unico").includes(fecha(ID_SOLICITANTE_UNICO)));
    assert.ok(texto("identidad-homonimos").includes(fecha(ID_HOMONIMO_1)));
    // El caso no verificable no puede contener la fecha correcta: debe agotar los 3 intentos.
    assert.equal(texto("identidad-no-verificable").includes(fecha(ID_SOLICITANTE_UNICO)), false);
  });
});

describe("casos: rechazos antes de enviar nada", () => {
  const rechazos: [string, unknown, Record<string, string>?][] = [
    ["JSON mal formado", "{ nombre: "],
    ["sin pasos", { ...valido, pasos: [] }],
    ["nombre vacío", { ...valido, nombre: "" }],
    ["sin descripción", { nombre: "x", pasos: [{ mensaje: "Hola" }] }],
    ["un paso con las dos claves", { ...valido, pasos: [{ mensaje: "a", adjuntar: "b.md" }] }],
    ["un paso sin claves", { ...valido, pasos: [{}] }],
    ["un mensaje vacío", { ...valido, pasos: [{ mensaje: "" }] }],
    ["un campo desconocido", { ...valido, extra: true }],
    ["un adjunto inexistente", { ...valido, pasos: [{ adjuntar: "no-existe.md" }] }],
    ["un adjunto que sale de la carpeta", { ...valido, pasos: [{ adjuntar: "../otro.md" }] }],
  ];

  for (const [nombre, contenido, adjuntos] of rechazos) {
    it(`rechaza ${nombre} con un problema legible`, async () => {
      const carpeta = caso(`rechazo-${nombre.replaceAll(" ", "-")}`, contenido, adjuntos);
      writeFileSync(join(raiz, "otro.md"), "fuera de la carpeta");
      const r = await cargarCaso(carpeta, raiz);
      assert.equal(r.ok, false);
      if (!r.ok) assert.ok(r.problema.length > 0);
    });
  }

  it("rechaza un adjunto con ruta absoluta", async () => {
    const absoluta = join(raiz, "otro.md");
    writeFileSync(absoluta, "x");
    const carpeta = caso("absoluto", { ...valido, pasos: [{ adjuntar: absoluta }] });
    assert.equal((await cargarCaso(carpeta, raiz)).ok, false);
  });

  it("rechaza una ruta de caso que no existe", async () => {
    const r = await cargarCaso("casos/no-existe", raiz);
    assert.equal(r.ok, false);
    if (!r.ok) assert.match(r.problema, /no existe|no encontr/i);
  });
});
