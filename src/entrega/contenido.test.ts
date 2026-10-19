import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { detectarSecretos, esTexto, nombreProhibido } from "./contenido.ts";

// Los valores con forma de secreto se arman en tiempo de ejecución: ningún archivo los escribe literales.
const relleno = (n: number) => "a1B2c3D4e5".repeat(Math.ceil(n / 10)).slice(0, n);
const tokenGitHub = () => "gh" + "p_" + relleno(36);
const tokenGitHubFino = () => "github" + "_pat_" + relleno(30);
const claveClaude = () => "sk" + "-ant-" + relleno(30);
const claveSecreta = () => "-----BEGIN " + "PRIVATE KEY-----";

describe("nombres prohibidos en el .zip", () => {
  const prohibidos = [
    ".env",
    ".env.local",
    "a/.env.production",
    "node_modules/x/y.js",
    "dist/a.js",
    "logs/a.jsonl",
    "CLAUDE.local.md",
    ".claude/settings.local.json",
  ];
  for (const ruta of prohibidos) {
    it(`prohíbe ${ruta}`, () => {
      assert.notEqual(nombreProhibido(ruta), undefined);
    });
  }

  for (const ruta of [
    ".env.example",
    "src/a.ts",
    ".git/HEAD",
    ".git/logs/HEAD",
    "docs/logs/a.md",
  ]) {
    it(`admite ${ruta}`, () => {
      assert.equal(nombreProhibido(ruta), undefined);
    });
  }

  it("prohíbe un .env aunque esté bajo .git/", () => {
    assert.notEqual(nombreProhibido(".git/.env"), undefined);
  });

  it("acepta rutas con barra invertida de Windows", () => {
    assert.notEqual(nombreProhibido("node_modules\\x\\y.js"), undefined);
  });
});

describe("detectores de secretos", () => {
  const positivos: Array<[string, () => string]> = [
    ["token de GitHub", () => `token: ${tokenGitHub()}`],
    ["token de GitHub", () => `x ${tokenGitHubFino()}`],
    ["clave de la API de Claude", () => `clave=${claveClaude()}`],
    ["Authorization: Bearer con valor literal", () => `"Authorization": "Bearer ${relleno(30)}"`],
    ["variable de secreto con valor", () => `GIT_HUB=${relleno(20)}`],
    ["variable de secreto con valor", () => `ANTHROPIC_API_KEY = "${relleno(20)}"`],
    ["clave privada", () => `${claveSecreta()}\nabc`],
    [
      "credenciales dentro de una URL",
      () => `url = https://usuario:${relleno(12)}@github.example/repo.git`,
    ],
  ];
  for (const [tipo, construir] of positivos) {
    it(`detecta ${tipo}`, () => {
      const detecciones = detectarSecretos(construir());
      assert.ok(
        detecciones.some((d) => d.tipo === tipo),
        `faltó ${tipo}`,
      );
    });
  }

  it("no devuelve el valor encontrado, solo el tipo y la línea", () => {
    const valor = tokenGitHub();
    const detecciones = detectarSecretos(`primera\nsegunda ${valor}`);
    assert.deepEqual(detecciones, [{ tipo: "token de GitHub", linea: 2 }]);
    assert.ok(!JSON.stringify(detecciones).includes(valor));
  });

  it("no se dispara con las variables sin valor de .env.example ni con marcadores", () => {
    const plantilla = readFileSync(new URL("../../.env.example", import.meta.url), "utf8");
    assert.deepEqual(detectarSecretos(plantilla), []);
    assert.deepEqual(detectarSecretos('"Authorization": "Bearer ${GIT_HUB}"'), []);
    assert.deepEqual(detectarSecretos('$env:GIT_HUB = "<tu token>"'), []);
    assert.deepEqual(detectarSecretos("GIT_HUB="), []);
  });

  it("no se dispara con un valor ficticio reconocible ni con un marcador de plantilla", () => {
    assert.deepEqual(detectarSecretos("GIT_HUB=valor-de-prueba"), []);
    assert.deepEqual(detectarSecretos('ANTHROPIC_API_KEY="ficticio-1234567890"'), []);
    assert.deepEqual(detectarSecretos("url = https://usuario:token@github.example/r.git"), []);
    assert.deepEqual(
      detectarSecretos("url = https://usuario:${CLAVE_DEL_ENTORNO}@github.example/r.git"),
      [],
    );
    assert.deepEqual(
      detectarSecretos("url = https://usuario:<tu-clave-larga>@github.example/r.git"),
      [],
    );
  });

  it("sigue detectando un valor con forma real aunque la variable lleve un prefijo parecido", () => {
    const real = relleno(20);
    const variable = ["GIT", "HUB"].join("_");
    assert.equal(detectarSecretos([variable, real].join("=")).length, 1);
    assert.equal(detectarSecretos([variable, "valorreal" + real].join("=")).length, 1);
    assert.equal(detectarSecretos(`url = https://usuario:${real}@github.example/r.git`).length, 1);
  });

  it("no se dispara con una URL sin credenciales", () => {
    assert.deepEqual(detectarSecretos("https://github.com/fabisahe29/CREDIAGIL.git"), []);
  });
});

describe("texto y binario", () => {
  it("distingue un archivo de texto de uno binario", () => {
    assert.equal(esTexto(new TextEncoder().encode("hola")), true);
    assert.equal(esTexto(new Uint8Array([104, 0, 105])), false);
  });
});
