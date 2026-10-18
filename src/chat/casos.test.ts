import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { datosReales } from "../../.claude/hooks/lib/datos-reales.ts";
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

describe("casos: ingreso verificado y consistencia (#11)", () => {
  /** Documentos de cada caso que son copia exacta de los del #10; el resto son propios del caso. */
  const COPIAS: Record<string, Record<string, string>> = {
    "ingreso-consistente": {
      "certificado-completo.md": "extraccion-certificado",
      "extracto-2026-07.md": "extraccion-extractos",
      "extracto-2026-08.md": "extraccion-extractos",
      "extracto-2026-09.md": "extraccion-extractos",
    },
    "ingreso-inflado": {
      "certificado-completo.md": "extraccion-certificado",
      "extracto-2026-07.md": "extraccion-extractos",
      "extracto-2026-08.md": "extraccion-extractos",
      "extracto-2026-09.md": "extraccion-extractos",
    },
    // El extracto de julio cambia de titular y no es copia; los demás sí.
    "ingreso-titular-distinto": {
      "certificado-completo.md": "extraccion-certificado",
      "extracto-2026-08.md": "extraccion-extractos",
      "extracto-2026-09.md": "extraccion-extractos",
    },
    // El certificado en dólares es propio de este caso: no hay copias que comprobar.
    "ingreso-moneda-extranjera": {},
    // El certificado cambia de empleador y no es copia; los extractos sí.
    "ingreso-empleador-distinto": {
      "extracto-2026-07.md": "extraccion-extractos",
      "extracto-2026-08.md": "extraccion-extractos",
      "extracto-2026-09.md": "extraccion-extractos",
    },
  };

  const fechaExpedicion = SOLICITANTES_EJEMPLO.find(
    (s) => s.idSolicitante === ID_SOLICITANTE_UNICO,
  )!.fechaExpedicion;

  for (const nombre of Object.keys(COPIAS)) {
    it(`el caso versionado casos/${nombre} carga sin errores y verifica primero la identidad`, async () => {
      const r = await cargarCaso(resolve("casos", nombre), process.cwd());
      assert.equal(r.ok, true, r.ok ? "" : r.problema);
      const texto = readFileSync(resolve("casos", nombre, "caso.json"), "utf8");
      assert.ok(texto.includes(fechaExpedicion));
    });

    it(`los documentos copiados de casos/${nombre} son idénticos a los del #10`, () => {
      for (const [archivo, origen] of Object.entries(COPIAS[nombre]!)) {
        assert.equal(
          readFileSync(resolve("casos", nombre, archivo), "utf8"),
          readFileSync(resolve("casos", origen, archivo), "utf8"),
          archivo,
        );
      }
    });

    it(`los documentos de casos/${nombre} cumplen la convención de datos ficticios`, () => {
      const carpeta = resolve("casos", nombre);
      for (const archivo of readdirSync(carpeta)) {
        const texto = readFileSync(join(carpeta, archivo), "utf8");
        const bloqueos = datosReales({
          herramienta: "Write",
          rutas: [`casos/${nombre}/${archivo}`],
          textos: [{ origen: `casos/${nombre}/${archivo}`, texto }],
        });
        assert.deepEqual(
          bloqueos.map((b) => b.detectado),
          [],
          archivo,
        );
      }
    });
  }
});
