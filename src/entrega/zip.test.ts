import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { ErrorEntrega } from "./tipos.ts";
import { desempaquetar, empaquetar, escribirZip, leerZip } from "./zip.ts";

const texto = (s: string) => new TextEncoder().encode(s);

describe("lector y escritor de .zip", () => {
  it("lo que se escribe se lee con las mismas rutas, tamaños y contenido", () => {
    const leidas = desempaquetar(
      empaquetar([
        { ruta: "a/uno.txt", contenido: texto("hola") },
        { ruta: ".git/HEAD", contenido: texto("ref: refs/heads/main\n") },
        { ruta: "vacio.txt", contenido: new Uint8Array() },
      ]),
    );
    assert.deepEqual(
      leidas.map((e) => [e.ruta, e.tamano, Buffer.from(e.contenido).toString("utf8")]),
      [
        ["a/uno.txt", 4, "hola"],
        [".git/HEAD", 21, "ref: refs/heads/main\n"],
        ["vacio.txt", 0, ""],
      ],
    );
  });

  it("comprime y descomprime una entrada grande", () => {
    const grande = "línea repetida\n".repeat(100_000);
    const zip = empaquetar([{ ruta: "grande.txt", contenido: texto(grande) }]);
    assert.ok(zip.length < grande.length / 10);
    assert.equal(Buffer.from(desempaquetar(zip)[0]!.contenido).toString("utf8"), grande);
  });

  it("conserva rutas con tildes y espacios", () => {
    const [entrada] = desempaquetar(
      empaquetar([{ ruta: "docs/versión final.md", contenido: texto("x") }]),
    );
    assert.equal(entrada!.ruta, "docs/versión final.md");
  });

  it("rechaza una ruta con barra invertida", () => {
    assert.throws(
      () => empaquetar([{ ruta: "a\\b.txt", contenido: texto("x") }]),
      (error: unknown) => error instanceof ErrorEntrega && error.tipo === "zip-invalido",
    );
  });

  it("lanza un error tipado con causa si el archivo no es un .zip", () => {
    assert.throws(
      () => desempaquetar(Buffer.from("esto no es un zip, solo texto de relleno largo")),
      (error: unknown) => error instanceof ErrorEntrega && error.tipo === "zip-invalido",
    );
  });

  it("lanza un error tipado si el .zip está truncado", () => {
    const zip = empaquetar([{ ruta: "a.txt", contenido: texto("contenido de prueba") }]);
    assert.throws(
      () => desempaquetar(zip.subarray(0, zip.length - 10)),
      (error: unknown) => error instanceof ErrorEntrega && error.tipo === "zip-invalido",
    );
  });

  it("lanza un error tipado si los datos fueron alterados", () => {
    const zip = empaquetar([
      { ruta: "a.txt", contenido: texto("contenido sin comprimir ".repeat(50)) },
    ]);
    zip[40] = (zip[40]! ^ 0xff) & 0xff;
    assert.throws(
      () => desempaquetar(zip),
      (error: unknown) => error instanceof ErrorEntrega && error.tipo === "zip-invalido",
    );
  });

  it("escribe y lee desde disco, y falla con causa si el archivo no existe", () => {
    const carpeta = mkdtempSync(join(tmpdir(), "crediagil-zip-"));
    try {
      const ruta = join(carpeta, "p.zip");
      escribirZip(ruta, [{ ruta: "x.txt", contenido: texto("ok") }]);
      assert.equal(leerZip(ruta)[0]!.ruta, "x.txt");
      assert.throws(
        () => leerZip(join(carpeta, "no-existe.zip")),
        (error: unknown) => error instanceof ErrorEntrega && error.cause !== undefined,
      );
    } finally {
      rmSync(carpeta, { recursive: true, force: true });
    }
  });
});
