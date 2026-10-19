import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CORE_NO_SIMULADO } from "../agente/core-no-simulado.ts";
import type { ClienteCore } from "../agente/cliente-core.ts";
import { exito } from "../compartido/errores.ts";
import { fijarDestino } from "../compartido/logs.ts";
import { CAUSA_SIN_CLAVE, ejecutarCaso } from "./ejecutor.ts";

let raiz: string;

before(() => {
  fijarDestino({ write: () => true });
  raiz = mkdtempSync(join(tmpdir(), "crediagil-ejecutor-"));
});
after(() => {
  fijarDestino(null);
  rmSync(raiz, { recursive: true, force: true });
});

const GUION_MINIMO = {
  clasificacion: {},
  extracciones: {},
  pasos: [
    {
      llamadas: [{ herramienta: "preaprobar_credito", entrada: {} }],
      respuesta: "Necesito identificarte primero.",
    },
  ],
};

const ESPERADO_MINIMO = {
  decision: "bloqueada",
  bloqueoRequerido: "solo_guionado",
  llamadasProhibidas: ["preaprobar_credito"],
  estadoCore: { solicitudRegistrada: false, preaprobada: false },
};

/** Un caso mínimo: el solicitante pide preaprobar sin identificarse y el hook bloquea. */
function caso(
  nombre: string,
  { caso: cambios = {}, guion = GUION_MINIMO }: { caso?: object; guion?: object | null } = {},
) {
  const carpeta = join(raiz, nombre);
  mkdirSync(carpeta, { recursive: true });
  writeFileSync(
    join(carpeta, "caso.json"),
    JSON.stringify({
      numero: 5,
      nombre,
      descripcion: "Caso mínimo de prueba",
      pasos: [{ mensaje: "Quiero que me preapruebes un crédito" }],
      esperado: ESPERADO_MINIMO,
      ...cambios,
    }),
  );
  if (guion !== null) writeFileSync(join(carpeta, "guion.json"), JSON.stringify(guion));
  return carpeta;
}

const opciones = { modo: "guionado", stderrCore: "ignore" } as const;

describe("ejecutor: veredicto de un caso con el core real", () => {
  it("pasa cuando la decisión y las llamadas coinciden con lo esperado", async () => {
    const [r] = await ejecutarCaso(caso("pasa"), opciones);
    assert.equal(r!.resultado, "paso", JSON.stringify(r));
    assert.equal(r!.observado?.decision, "bloqueada");
    assert.deepEqual(r!.diferencias, []);
  });

  it("falla si lo esperado difiere de lo observado, e indica en qué", async () => {
    const [r] = await ejecutarCaso(
      caso("falla", { caso: { esperado: { ...ESPERADO_MINIMO, decision: "preaprobada" } } }),
      opciones,
    );
    assert.equal(r!.resultado, "fallo");
    assert.deepEqual(
      r!.diferencias.map((d) => d.campo),
      ["decision"],
    );
  });

  it("dos ejecuciones seguidas del mismo caso dan el mismo veredicto: parte de un estado limpio", async () => {
    const carpeta = caso("repetido");
    const primera = await ejecutarCaso(carpeta, opciones);
    const segunda = await ejecutarCaso(carpeta, opciones);
    assert.equal(primera[0]!.resultado, "paso");
    assert.deepEqual(segunda[0]!.observado, primera[0]!.observado);
  });
});

describe("ejecutor: casos que no se pueden ejecutar", () => {
  it("un adjunto ausente es no ejecutable, nunca pasado ni fallido", async () => {
    const carpeta = caso("sin-adjunto", {
      caso: { pasos: [{ mensaje: "Hola" }, { adjuntar: "ausente.md" }] },
    });
    const [r] = await ejecutarCaso(carpeta, opciones);
    assert.equal(r!.resultado, "no_ejecutable");
    assert.match(r!.causa!, /ausente\.md/);
  });

  it("un guion ausente o incoherente es no ejecutable con su causa", async () => {
    const [sin] = await ejecutarCaso(caso("sin-guion", { guion: null }), opciones);
    assert.equal(sin!.resultado, "no_ejecutable");
    assert.match(sin!.causa!, /guion\.json/);
    const [incoherente] = await ejecutarCaso(
      caso("guion-corto", {
        guion: { ...GUION_MINIMO, pasos: [...GUION_MINIMO.pasos, ...GUION_MINIMO.pasos] },
      }),
      opciones,
    );
    assert.equal(incoherente!.resultado, "no_ejecutable");
    assert.match(incoherente!.causa!, /incoherente/);
  });

  it("un caso sin número o sin esperado es no ejecutable", async () => {
    const [sinNumero] = await ejecutarCaso(
      caso("sin-numero", { caso: { numero: undefined } }),
      opciones,
    );
    assert.equal(sinNumero!.resultado, "no_ejecutable");
    assert.match(sinNumero!.causa!, /numero/);
    const [sinEsperado] = await ejecutarCaso(
      caso("sin-esperado", { caso: { esperado: undefined } }),
      opciones,
    );
    assert.equal(sinEsperado!.resultado, "no_ejecutable");
    assert.match(sinEsperado!.causa!, /esperado/);
  });

  it("un caso.json inválido es no ejecutable", async () => {
    const [r] = await ejecutarCaso(caso("invalido", { caso: { pasos: [] } }), opciones);
    assert.equal(r!.resultado, "no_ejecutable");
  });

  it("una carpeta que no existe es no ejecutable", async () => {
    const [r] = await ejecutarCaso(join(raiz, "no-existe"), opciones);
    assert.equal(r!.resultado, "no_ejecutable");
  });

  it("el modo con modelo real sin credenciales es no ejecutable con la causa", async () => {
    const [r] = await ejecutarCaso(caso("sin-clave"), { modo: "modelo_real", entorno: {} });
    assert.equal(r!.resultado, "no_ejecutable");
    assert.equal(r!.causa, CAUSA_SIN_CLAVE);
  });
});

describe("ejecutor: errores durante el caso", () => {
  const coreFalso = (cerrar: () => Promise<void>): ClienteCore => ({
    ...CORE_NO_SIMULADO,
    consultarSolicitud: async () => exito({ solicitud: null }),
    cerrar,
  });

  it("una excepción al crear el core es un fallo con su causa, no se propaga", async () => {
    const [r] = await ejecutarCaso(caso("core-falla"), {
      ...opciones,
      crearCore: async () => {
        throw new Error("no arrancó");
      },
    });
    assert.equal(r!.resultado, "fallo");
    assert.match(r!.causa!, /no arrancó/);
  });

  it("cierra el core al terminar el caso, también cuando el caso falla", async () => {
    let cierres = 0;
    const [r] = await ejecutarCaso(caso("cierra"), {
      ...opciones,
      crearCore: async () =>
        coreFalso(async () => {
          cierres++;
        }),
    });
    assert.ok(r);
    assert.equal(cierres, 1);
  });

  it("un problema del propio guion hace fallar el caso con su causa", async () => {
    const guion = {
      ...GUION_MINIMO,
      pasos: [
        {
          llamadas: [{ herramienta: "consultar_solicitud", entrada: { idSolicitud: 5 } }],
          respuesta: "x",
        },
      ],
    };
    const [r] = await ejecutarCaso(caso("guion-malo", { guion }), opciones);
    assert.equal(r!.resultado, "fallo");
    assert.match(r!.causa!, /problemas del guion/);
  });
});
