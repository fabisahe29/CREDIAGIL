import { after, describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { analizar, analizarTexto } from "./portabilidad.ts";
import { CARPETA_PLUGIN } from "./piezas.ts";

const RAIZ = fileURLToPath(new URL("../../", import.meta.url));

const temporales: string[] = [];
after(() => {
  for (const carpeta of temporales) rmSync(carpeta, { recursive: true, force: true });
});

function carpetaTemporal(): string {
  const carpeta = mkdtempSync(join(tmpdir(), "portabilidad-"));
  temporales.push(carpeta);
  return carpeta;
}

function terminos(texto: string): string[] {
  return analizarTexto(texto, "a.md").map((h) => h.termino);
}

// Ningún valor con forma de credencial se escribe literal: se arma en tiempo de ejecución.
const credencialGitHub = "ghp_" + "a".repeat(36);
const credencialAnthropic = "sk-ant-" + "b".repeat(30);
const claveAws = "AKIA" + "C".repeat(16);
const encabezadoClave = "-----BEGIN " + "RSA PRIVATE KEY-----";

describe("portabilidad: lo que se detecta", () => {
  const casos: [string, string, string][] = [
    ["una ruta absoluta de Windows", "carpeta C:\\Users\\alguien\\proyecto", "ruta absoluta"],
    ["una ruta absoluta de Windows con barra normal", "ver C:/trabajo/archivo", "ruta absoluta"],
    ["una ruta absoluta de Unix", "ver /home/alguien/proyecto", "ruta absoluta"],
    ["una ruta absoluta de Unix bajo Users", "en (/Users/alguien/x)", "ruta absoluta"],
    ["un token de GitHub", `token ${credencialGitHub}`, "credencial"],
    ["una clave de Anthropic", `clave ${credencialAnthropic}`, "credencial"],
    ["una clave de AWS", `clave ${claveAws}`, "credencial"],
    ["una clave privada", encabezadoClave, "credencial"],
    ["una carpeta de specs", "lee specs/001-algo/spec.md", "specs/"],
    ["una carpeta de código", "edita src/agente/a.ts", "src/"],
    ["la carpeta de Spec Kit", "la carpeta .specify guarda plantillas", ".specify"],
    ["la constitución", "según la constitución del proyecto", "constitución"],
    ["el archivo de convenciones", "ver CLAUDE.md", "CLAUDE.md"],
    ["el registro de decisiones", "ver DECISIONES.md", "DECISIONES.md"],
    ["la convención de datos de este proyecto", "docs/datos-ficticios.md", "docs/datos-ficticios"],
    ["un número de requisito", "cumple FR-012", "número de requisito"],
    ["un número de issue", "como pide el ticket #18", "número de issue"],
    ["un documento de diseño", "ver research.md", "documento de diseño"],
    ["el usuario propietario del repositorio", "de fabisahe29/CREDIAGIL", "propietario"],
  ];

  for (const [descripcion, texto, esperado] of casos) {
    it(`detecta ${descripcion}`, () => {
      const encontrados = terminos(texto);
      assert.ok(
        encontrados.some((t) => t.includes(esperado)),
        `se esperaba un hallazgo «${esperado}» y salió [${encontrados.join(", ")}]`,
      );
    });
  }

  it("informa archivo, línea y término de cada hallazgo", () => {
    const hallazgos = analizarTexto("limpio\nver specs/a.md\nlimpio", "guia.md");
    assert.deepEqual(hallazgos, [{ archivo: "guia.md", linea: 2, termino: "specs/" }]);
  });
});

describe("portabilidad: lo que no se marca", () => {
  const limpios = [
    "Un texto sobre reglas del equipo y revisiones.",
    "El comando usa ${CLAUDE_PLUGIN_ROOT}/hooks/guardian-controles.ts",
    "Ver https://ejemplo.example/guia sobre datos ficticios.",
    "# Reglas del equipo",
    "Los montos van en enteros; usa un número que empiece por 000.",
    "Revisa app/modelo.ts y docs/guia.md",
    "El archivo .claude/reglas-equipo.md declara las reglas.",
  ];
  for (const texto of limpios) {
    it(`no marca «${texto.slice(0, 40)}»`, () => {
      assert.deepEqual(terminos(texto), []);
    });
  }
});

describe("portabilidad: analizar una carpeta", () => {
  it("recorre las subcarpetas y cita la ruta relativa del archivo", () => {
    const carpeta = carpetaTemporal();
    mkdirSync(join(carpeta, "hooks", "lib"), { recursive: true });
    writeFileSync(join(carpeta, "hooks", "lib", "a.ts"), "// ver specs/a.md\n");
    writeFileSync(join(carpeta, "README.md"), "limpio\n");
    const hallazgos = analizar(carpeta);
    assert.equal(hallazgos.length, 1);
    assert.equal(hallazgos[0]?.archivo, "hooks/lib/a.ts");
    assert.equal(hallazgos[0]?.linea, 1);
  });

  it("analiza un archivo suelto", () => {
    const carpeta = carpetaTemporal();
    writeFileSync(join(carpeta, "x.md"), "ver src/a.ts\n");
    assert.equal(analizar(join(carpeta, "x.md")).length, 1);
  });
});

describe("portabilidad: el plugin publicado", () => {
  it("no tiene ninguna coincidencia con términos propios, rutas ni credenciales", () => {
    const hallazgos = analizar(join(RAIZ, CARPETA_PLUGIN));
    const detalle = hallazgos.map((h) => `${h.archivo}:${h.linea} ${h.termino}`).join("\n");
    assert.deepEqual(hallazgos, [], `el plugin contiene referencias propias:\n${detalle}`);
  });
});

describe("portabilidad: el guardián del plugin en un repositorio con otra estructura", () => {
  it("bloquea un dato con forma real sin ningún archivo de este proyecto", () => {
    const repositorio = carpetaTemporal();
    mkdirSync(join(repositorio, "app"), { recursive: true });
    mkdirSync(join(repositorio, "docs"), { recursive: true });
    const guardian = join(RAIZ, CARPETA_PLUGIN, "hooks", "guardian-controles.ts");
    const cedulaReal = "10" + "4".repeat(8);
    const entrada = {
      tool_name: "Write",
      tool_input: { file_path: "app/notas.md", content: `cédula ${cedulaReal}` },
    };
    const proceso = spawnSync(process.execPath, [guardian], {
      input: JSON.stringify(entrada),
      env: { ...process.env, CLAUDE_PROJECT_DIR: repositorio },
      cwd: dirname(repositorio),
      encoding: "utf8",
    });
    const respuesta = JSON.parse(proceso.stdout) as {
      hookSpecificOutput: { permissionDecision: string; permissionDecisionReason: string };
    };
    assert.equal(respuesta.hookSpecificOutput.permissionDecision, "deny");
    assert.match(respuesta.hookSpecificOutput.permissionDecisionReason, /\[datos-reales\]/);
    assert.ok(!proceso.stdout.includes(cedulaReal));
  });
});
