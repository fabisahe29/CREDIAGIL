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

describe("casos: registro de la solicitud (#13)", () => {
  /** Documentos que son copia exacta de los del caso de ingreso del #11 que les corresponde. */
  const COPIAS: Record<string, string> = {
    "registro-solicitud": "ingreso-consistente",
    "registro-discrepancia": "ingreso-inflado",
  };
  const DOCUMENTOS = [
    "certificado-completo.md",
    "extracto-2026-07.md",
    "extracto-2026-08.md",
    "extracto-2026-09.md",
  ];

  const fechaExpedicion = SOLICITANTES_EJEMPLO.find(
    (s) => s.idSolicitante === ID_SOLICITANTE_UNICO,
  )!.fechaExpedicion;

  for (const [nombre, origen] of Object.entries(COPIAS)) {
    it(`el caso versionado casos/${nombre} carga sin errores y verifica primero la identidad`, async () => {
      const r = await cargarCaso(resolve("casos", nombre), process.cwd());
      assert.equal(r.ok, true, r.ok ? "" : r.problema);
      const texto = readFileSync(resolve("casos", nombre, "caso.json"), "utf8");
      assert.ok(texto.includes(fechaExpedicion));
    });

    it(`casos/${nombre} pide registrar la solicitud con un monto y un plazo que dice el solicitante`, async () => {
      const r = await cargarCaso(resolve("casos", nombre), process.cwd());
      assert.ok(r.ok);
      if (!r.ok) return;
      const mensajes = r.caso.pasos.flatMap((p) => ("mensaje" in p ? [p.mensaje] : []));
      const registro = mensajes.find((m) => /registrar/i.test(m));
      assert.ok(registro, "falta el mensaje que pide registrar");
      assert.match(registro, /4 millones a 24 meses/);
    });

    it(`los documentos de casos/${nombre} son idénticos a los de casos/${origen}`, () => {
      for (const archivo of DOCUMENTOS) {
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
describe("casos: preaprobación (#14)", () => {
  /** Documentos que son copia exacta de los del caso de registro del #13. */
  const ORIGEN = "registro-solicitud";
  const CASOS: Record<string, RegExp> = {
    "preaprobacion-simple": /4 millones a 24 meses/,
    "preaprobacion-monto-alto": /6 millones a 24 meses/,
    "preaprobacion-cuota-alta": /4\.500\.000 a 3 meses/,
  };
  const DOCUMENTOS = [
    "certificado-completo.md",
    "extracto-2026-07.md",
    "extracto-2026-08.md",
    "extracto-2026-09.md",
  ];

  const fechaExpedicion = SOLICITANTES_EJEMPLO.find(
    (s) => s.idSolicitante === ID_SOLICITANTE_UNICO,
  )!.fechaExpedicion;

  for (const [nombre, solicitud] of Object.entries(CASOS)) {
    it(`el caso versionado casos/${nombre} carga sin errores y verifica primero la identidad`, async () => {
      const r = await cargarCaso(resolve("casos", nombre), process.cwd());
      assert.equal(r.ok, true, r.ok ? "" : r.problema);
      const texto = readFileSync(resolve("casos", nombre, "caso.json"), "utf8");
      assert.ok(texto.includes(fechaExpedicion));
    });

    it(`casos/${nombre} pide registrar la solicitud y preaprobarla, con el monto y el plazo que dice el solicitante`, async () => {
      const r = await cargarCaso(resolve("casos", nombre), process.cwd());
      assert.ok(r.ok);
      if (!r.ok) return;
      const mensajes = r.caso.pasos.flatMap((p) => ("mensaje" in p ? [p.mensaje] : []));
      const ultimo = mensajes.at(-1) ?? "";
      assert.match(ultimo, /registrar/i);
      assert.match(ultimo, /preapru/i);
      assert.match(ultimo, solicitud);
    });

    it(`los documentos de casos/${nombre} son idénticos a los de casos/${ORIGEN}`, () => {
      for (const archivo of DOCUMENTOS) {
        assert.equal(
          readFileSync(resolve("casos", nombre, archivo), "utf8"),
          readFileSync(resolve("casos", ORIGEN, archivo), "utf8"),
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
describe("casos: escalamiento (#15)", () => {
  /** Cada caso es un solo mensaje: el escalamiento ocurre antes de identificar al solicitante. */
  const CASOS: Record<string, { mensaje: string; descripcion: RegExp }> = {
    "escalamiento-pide-persona": {
      mensaje: "Quiero hablar con una persona",
      descripcion: /Regla 4/,
    },
    "escalamiento-pide-persona-con-datos": {
      mensaje: "Hola, quiero 4 millones a 24 meses, pero prefiero hablar con una persona",
      descripcion: /Regla 4/,
    },
    "escalamiento-moneda-extranjera": {
      mensaje: "Quiero 4 millones a 24 meses y mi sueldo me lo pagan en dólares",
      descripcion: /Regla 5/,
    },
  };

  for (const [nombre, { mensaje, descripcion }] of Object.entries(CASOS)) {
    it(`el caso versionado casos/${nombre} carga sin errores`, async () => {
      const r = await cargarCaso(resolve("casos", nombre), process.cwd());
      assert.equal(r.ok, true, r.ok ? "" : r.problema);
    });

    it(`casos/${nombre} es un solo mensaje, sin adjuntos y sin identificarse`, async () => {
      const r = await cargarCaso(resolve("casos", nombre), process.cwd());
      assert.ok(r.ok);
      if (!r.ok) return;
      assert.deepEqual(r.caso.pasos, [{ mensaje }]);
      assert.match(r.caso.descripcion, descripcion);
    });

    it(`casos/${nombre} cumple la convención de datos ficticios`, () => {
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

  it("la petición de persona de los dos primeros casos la detecta el código, sin el modelo", async () => {
    const { detectarPeticionPersona } = await import("../politica/escalamiento.ts");
    for (const nombre of ["escalamiento-pide-persona", "escalamiento-pide-persona-con-datos"]) {
      assert.equal(detectarPeticionPersona(CASOS[nombre]!.mensaje), true, nombre);
    }
  });

  it("el caso de moneda extranjera no pide una persona: lo clasifica el modelo con la Regla 5", async () => {
    const { detectarPeticionPersona } = await import("../politica/escalamiento.ts");
    assert.equal(detectarPeticionPersona(CASOS["escalamiento-moneda-extranjera"]!.mensaje), false);
  });
});
describe("casos: mensajes con varios asuntos (#16)", () => {
  /** El mensaje de ejemplo del enunciado, literal (specs/014, historia 4). */
  const MENSAJE_ENUNCIADO =
    "Hola, quiero pedir un crédito de $4.000.000 a 24 meses. Te pego mi certificado laboral y mis extractos de los últimos tres meses. Gano más o menos $3.500.000 al mes. ¿En cuánto me quedaría la cuota?";
  const MENSAJE_CON_PERSONA =
    "Quiero hablar con una persona. Además, ¿cuánto pagaría de cuota por 4 millones a 24 meses?";
  const MENSAJE_ESCALADO =
    "Quiero pedir un crédito de 4 millones a 24 meses. Mi sueldo me lo pagan en dólares, pero igual dime en cuánto me quedaría la cuota si cuento con 5 millones de pesos al mes.";

  const NOMBRES = [
    "mensaje-varios-asuntos",
    "mensaje-varios-asuntos-con-persona",
    "mensaje-varios-asuntos-escalado",
  ];

  for (const nombre of NOMBRES) {
    it(`el caso versionado casos/${nombre} carga sin errores`, async () => {
      const r = await cargarCaso(resolve("casos", nombre), process.cwd());
      assert.equal(r.ok, true, r.ok ? "" : r.problema);
    });

    it(`los archivos de casos/${nombre} cumplen la convención de datos ficticios`, () => {
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

  it("el caso del enunciado adjunta el certificado y los tres extractos y luego envía el mensaje literal", async () => {
    const carpeta = resolve("casos", "mensaje-varios-asuntos");
    const r = await cargarCaso(carpeta, process.cwd());
    assert.ok(r.ok);
    if (!r.ok) return;
    assert.deepEqual(r.caso.pasos, [
      {
        adjuntar: "certificado-completo.md",
        ruta: join(carpeta, "certificado-completo.md"),
      },
      {
        adjuntar: "extracto-2026-07.md",
        ruta: join(carpeta, "extracto-2026-07.md"),
      },
      {
        adjuntar: "extracto-2026-08.md",
        ruta: join(carpeta, "extracto-2026-08.md"),
      },
      {
        adjuntar: "extracto-2026-09.md",
        ruta: join(carpeta, "extracto-2026-09.md"),
      },
      { mensaje: MENSAJE_ENUNCIADO },
    ]);
  });

  it("los documentos del caso del enunciado son idénticos a los del #10", () => {
    const origenes: Record<string, string> = {
      "certificado-completo.md": "extraccion-certificado",
      "extracto-2026-07.md": "extraccion-extractos",
      "extracto-2026-08.md": "extraccion-extractos",
      "extracto-2026-09.md": "extraccion-extractos",
    };
    for (const [archivo, origen] of Object.entries(origenes)) {
      assert.equal(
        readFileSync(resolve("casos", "mensaje-varios-asuntos", archivo), "utf8"),
        readFileSync(resolve("casos", origen, archivo), "utf8"),
        archivo,
      );
    }
  });

  it("el mensaje del enunciado plantea los tres asuntos y no pide una persona", async () => {
    const { detectarAsuntos } = await import("../politica/asuntos.ts");
    const { detectarPeticionPersona } = await import("../politica/escalamiento.ts");
    assert.deepEqual(detectarAsuntos(MENSAJE_ENUNCIADO, true), [
      "solicitud",
      "documentos",
      "cuota",
    ]);
    assert.equal(detectarPeticionPersona(MENSAJE_ENUNCIADO), false);
  });

  it("el caso con persona es un solo mensaje que la Regla 4 detecta y que además pregunta por la cuota", async () => {
    const r = await cargarCaso(
      resolve("casos", "mensaje-varios-asuntos-con-persona"),
      process.cwd(),
    );
    assert.ok(r.ok);
    if (!r.ok) return;
    assert.deepEqual(r.caso.pasos, [{ mensaje: MENSAJE_CON_PERSONA }]);
    assert.match(r.caso.descripcion, /Regla 4/);
    const { detectarAsuntos } = await import("../politica/asuntos.ts");
    const { detectarPeticionPersona } = await import("../politica/escalamiento.ts");
    assert.equal(detectarPeticionPersona(MENSAJE_CON_PERSONA), true);
    assert.deepEqual(detectarAsuntos(MENSAJE_CON_PERSONA, false), ["cuota"]);
  });

  it("el caso escalado es un solo mensaje con el sueldo en dólares y la pregunta por la cuota en pesos", async () => {
    const r = await cargarCaso(resolve("casos", "mensaje-varios-asuntos-escalado"), process.cwd());
    assert.ok(r.ok);
    if (!r.ok) return;
    assert.deepEqual(r.caso.pasos, [{ mensaje: MENSAJE_ESCALADO }]);
    const { detectarAsuntos } = await import("../politica/asuntos.ts");
    const { detectarPeticionPersona } = await import("../politica/escalamiento.ts");
    assert.deepEqual(detectarAsuntos(MENSAJE_ESCALADO, false), ["solicitud", "cuota"]);
    assert.equal(detectarPeticionPersona(MENSAJE_ESCALADO), false);
  });
});

describe("casos: casos obligatorios con resultado esperado (#17)", () => {
  const conEsperado = {
    ...valido,
    numero: 4,
    esperado: {
      decision: "escalada",
      causa: "monto_sobre_umbral",
      llamadasProhibidas: ["preaprobar_credito"],
    },
  };

  it("carga el número y el esperado, con sus listas vacías por defecto", async () => {
    const carpeta = caso("con-esperado", conEsperado, { "certificado.md": "Ficticio" });
    const r = await cargarCaso(carpeta, raiz);
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.caso.numero, 4);
      assert.equal(r.caso.esperado?.decision, "escalada");
      assert.deepEqual(r.caso.esperado?.llamadasRequeridas, []);
      assert.equal(r.caso.variantes, undefined);
    }
  });

  it("carga las variantes del caso 7", async () => {
    const carpeta = caso(
      "con-variantes",
      {
        ...valido,
        numero: 7,
        variantes: [
          { nombre: "una-vez", esperado: { decision: "preaprobada" } },
          {
            nombre: "siempre",
            esperado: { decision: "escalada", causa: "caso_no_cubierto" },
          },
        ],
      },
      { "certificado.md": "Ficticio" },
    );
    const r = await cargarCaso(carpeta, raiz);
    assert.equal(r.ok, true);
    if (r.ok)
      assert.deepEqual(
        r.caso.variantes?.map((v) => v.nombre),
        ["una-vez", "siempre"],
      );
  });

  it("rechaza un campo desconocido en el esperado, con un problema legible", async () => {
    const carpeta = caso(
      "esperado-invalido",
      { ...conEsperado, esperado: { ...conEsperado.esperado, respuesta: "Hola" } },
      { "certificado.md": "Ficticio" },
    );
    const r = await cargarCaso(carpeta, raiz);
    assert.equal(r.ok, false);
    if (!r.ok) assert.match(r.problema, /esperado/);
  });

  it("rechaza un número de caso fuera de 1 a 7", async () => {
    const carpeta = caso(
      "numero-8",
      { ...conEsperado, numero: 8 },
      { "certificado.md": "Ficticio" },
    );
    const r = await cargarCaso(carpeta, raiz);
    assert.equal(r.ok, false);
  });

  it("un caso sin esperado sigue cargando y no trae esos campos", async () => {
    const carpeta = caso("sin-esperado", valido, { "certificado.md": "Ficticio" });
    const r = await cargarCaso(carpeta, raiz);
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal("numero" in r.caso, false);
      assert.equal("esperado" in r.caso, false);
    }
  });
});
