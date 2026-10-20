import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { formatearInforme } from "./principal.ts";
import { LIMITE_BYTES } from "./tipos.ts";
import { secretosEnHistorial, verificarZip, type OrigenGit } from "./verificar.ts";
import { empaquetar, type EntradaParaEscribir } from "./zip.ts";

// El valor con forma de secreto se arma en tiempo de ejecución: ningún archivo lo escribe literal.
const tokenFalso = () => "gh" + "p_" + "a1B2c3D4e5".repeat(4).slice(0, 36);
const texto = (s: string) => new TextEncoder().encode(s);

const GIT_LIMPIO: OrigenGit = {
  historial: () => "commit " + "a".repeat(40) + "\n+hola\n",
  origenEsAntepasado: () => true,
};
const SIN_SPECS = () => [];

let carpeta = "";
before(() => {
  carpeta = mkdtempSync(join(tmpdir(), "crediagil-verificar-"));
});
after(() => rmSync(carpeta, { recursive: true, force: true }));

let contador = 0;
function zipCon(entradas: EntradaParaEscribir[]): string {
  const ruta = join(carpeta, `p${contador++}.zip`);
  writeFileSync(ruta, empaquetar(entradas));
  return ruta;
}

const BASE: EntradaParaEscribir[] = [
  { ruta: ".git/HEAD", contenido: texto("ref: refs/heads/main\n") },
  { ruta: "src/a.ts", contenido: texto("export const a = 1;\n") },
  { ruta: ".env.example", contenido: texto("GIT_HUB=\n") },
];

describe("verificación del .zip de entrega", () => {
  it("da listo con un .zip válido", () => {
    const informe = verificarZip({
      zip: zipCon(BASE),
      raiz: carpeta,
      git: GIT_LIMPIO,
      specs: SIN_SPECS,
    });
    assert.equal(informe.veredicto, "listo");
    assert.deepEqual(informe.hallazgos, []);
    assert.deepEqual(
      informe.comprobaciones.map((c) => c.nombre),
      ["nombres", "git", "peso", "secretos", "historial", "specs"],
    );
  });

  it("bloquea un .zip con un .env", () => {
    const zip = zipCon([...BASE, { ruta: ".env", contenido: texto("X=1\n") }]);
    const informe = verificarZip({ zip, raiz: carpeta, git: GIT_LIMPIO, specs: SIN_SPECS });
    assert.equal(informe.veredicto, "bloqueado");
    assert.deepEqual(
      informe.hallazgos.map((h) => [h.tipo, h.ubicacion]),
      [["nombre-prohibido", ".env"]],
    );
  });

  it("bloquea un archivo con un token y el informe impreso no muestra el valor", () => {
    const valor = tokenFalso();
    const zip = zipCon([...BASE, { ruta: "docs/notas.md", contenido: texto(`token: ${valor}\n`) }]);
    const informe = verificarZip({ zip, raiz: carpeta, git: GIT_LIMPIO, specs: SIN_SPECS });
    assert.equal(informe.veredicto, "bloqueado");
    assert.deepEqual(
      informe.hallazgos.map((h) => [h.tipo, h.ubicacion, h.detalle]),
      [["secreto", "docs/notas.md:1", "token de GitHub"]],
    );
    assert.ok(!JSON.stringify(informe).includes(valor));
    assert.ok(!formatearInforme(informe).includes(valor));
  });

  it("no escanea los objetos comprimidos de .git ni los archivos binarios", () => {
    const valor = tokenFalso();
    const zip = zipCon([
      ...BASE,
      { ruta: ".git/objects/ab/cdef", contenido: texto(valor) },
      { ruta: "img/logo.bin", contenido: new Uint8Array([0, ...texto(valor)]) },
    ]);
    const informe = verificarZip({ zip, raiz: carpeta, git: GIT_LIMPIO, specs: SIN_SPECS });
    assert.equal(informe.veredicto, "listo");
  });

  it("detecta credenciales dentro de .git/config", () => {
    const zip = zipCon([
      ...BASE,
      {
        ruta: ".git/config",
        contenido: texto(
          `[remote "origin"]\n\turl = https://usuario:${tokenFalso()}@github.example/r.git\n`,
        ),
      },
    ]);
    const informe = verificarZip({ zip, raiz: carpeta, git: GIT_LIMPIO, specs: SIN_SPECS });
    assert.equal(informe.veredicto, "bloqueado");
    assert.equal(
      informe.hallazgos[0]!.detalle.includes("URL") ||
        informe.hallazgos[0]!.detalle.includes("token"),
      true,
    );
  });

  it("bloquea un .zip sin .git", () => {
    const zip = zipCon([{ ruta: "src/a.ts", contenido: texto("x") }]);
    const informe = verificarZip({ zip, raiz: carpeta, git: GIT_LIMPIO, specs: SIN_SPECS });
    assert.deepEqual(
      informe.hallazgos.map((h) => h.tipo),
      ["falta-git"],
    );
    assert.equal(informe.veredicto, "bloqueado");
  });

  it("el límite de peso es de 50 MB", () => {
    assert.equal(LIMITE_BYTES, 50 * 1024 * 1024);
  });

  it("da incompleto, no listo, si no se puede comprobar el historial publicado", () => {
    const sinOrigen: OrigenGit = { ...GIT_LIMPIO, origenEsAntepasado: () => undefined };
    const informe = verificarZip({
      zip: zipCon(BASE),
      raiz: carpeta,
      git: sinOrigen,
      specs: SIN_SPECS,
    });
    assert.equal(informe.veredicto, "incompleto");
    assert.equal(
      informe.comprobaciones.find((c) => c.nombre === "historial")!.estado,
      "no verificable",
    );
  });

  it("bloquea si lo publicado ya no es antepasado de lo entregado", () => {
    const reescrito: OrigenGit = { ...GIT_LIMPIO, origenEsAntepasado: () => false };
    const informe = verificarZip({
      zip: zipCon(BASE),
      raiz: carpeta,
      git: reescrito,
      specs: SIN_SPECS,
    });
    assert.equal(informe.veredicto, "bloqueado");
    assert.equal(informe.hallazgos[0]!.tipo, "historial");
  });

  it("incluye los hallazgos de specs", () => {
    const specs = () => [
      {
        tipo: "spec-incompleta" as const,
        ubicacion: "specs/001-a/tasks.md",
        detalle: "falta tasks.md",
      },
    ];
    const informe = verificarZip({ zip: zipCon(BASE), raiz: carpeta, git: GIT_LIMPIO, specs });
    assert.equal(informe.veredicto, "bloqueado");
    assert.equal(informe.comprobaciones.find((c) => c.nombre === "specs")!.estado, "hallazgos");
  });

  it("falla con un error tipado si el .zip no existe", () => {
    assert.throws(() =>
      verificarZip({
        zip: join(carpeta, "no-existe.zip"),
        raiz: carpeta,
        git: GIT_LIMPIO,
        specs: SIN_SPECS,
      }),
    );
  });
});

describe("secretos en el historial", () => {
  it("reporta el commit, el archivo y el tipo, nunca el valor", () => {
    const valor = tokenFalso();
    const sha = "b".repeat(40);
    const hallazgos = secretosEnHistorial(`commit ${sha}\n+++ b/docs/viejo.md\n+clave ${valor}\n`);
    assert.deepEqual(hallazgos, [
      {
        tipo: "historial",
        ubicacion: `commit ${sha.slice(0, 7)}`,
        detalle: "token de GitHub en docs/viejo.md",
      },
    ]);
    assert.ok(!JSON.stringify(hallazgos).includes(valor));
  });

  it("no reporta nada en un historial limpio", () => {
    assert.deepEqual(
      secretosEnHistorial("commit " + "c".repeat(40) + "\n+++ b/a.txt\n+hola\n"),
      [],
    );
  });
});
