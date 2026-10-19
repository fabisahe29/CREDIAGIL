import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { componerRespuesta } from "./respuesta-unificada.ts";
import {
  ASUNTOS,
  MOTIVOS_PENDIENTE,
  type AsuntoObservado,
  type MotivoPendiente,
} from "../politica/asuntos.ts";

const CUERPO = "Hola, ya revisé tu mensaje.";
const AVISO = "Simulación no vinculante con el ingreso que declaraste.";

const cuotaResuelta: AsuntoObservado = {
  asunto: "cuota",
  estado: "resuelto",
  resultado: `cuota mensual simulada de $206.723. ${AVISO}`,
};
const solicitudPendiente: AsuntoObservado = {
  asunto: "solicitud",
  estado: "pendiente",
  motivo: "falta_identidad",
};
const documentosPendientes: AsuntoObservado = {
  asunto: "documentos",
  estado: "pendiente",
  motivo: "falta_identidad",
};

const lineas = (texto: string) => texto.split("\n");

describe("respuesta unificada: cuándo agrega el bloque", () => {
  it("con menos de dos asuntos devuelve el cuerpo sin cambios", () => {
    assert.equal(componerRespuesta({ cuerpo: CUERPO, asuntos: [], regla4: false }), CUERPO);
    assert.equal(
      componerRespuesta({ cuerpo: CUERPO, asuntos: [cuotaResuelta], regla4: false }),
      CUERPO,
    );
  });

  it("con dos o más asuntos agrega una línea en blanco y el bloque", () => {
    const texto = componerRespuesta({
      cuerpo: CUERPO,
      asuntos: [solicitudPendiente, cuotaResuelta],
      regla4: false,
    });
    const partes = lineas(texto);
    assert.equal(partes[0], CUERPO);
    assert.equal(partes[1], "");
    assert.equal(partes[2], "Estado de tus asuntos:");
    assert.equal(partes.length, 5);
  });

  it("en la rama de la Regla 4 agrega el bloque aunque haya un solo asunto", () => {
    const texto = componerRespuesta({
      cuerpo: CUERPO,
      asuntos: [{ asunto: "cuota", estado: "pendiente", motivo: "lo_revisara_el_analista" }],
      regla4: true,
    });
    assert.ok(texto.includes("Estado de tus asuntos:"));
    assert.ok(texto.includes("- Cuota: pendiente — lo revisará el analista."));
  });

  it("en la rama de la Regla 4 sin asuntos devuelve el cuerpo sin cambios", () => {
    assert.equal(componerRespuesta({ cuerpo: CUERPO, asuntos: [], regla4: true }), CUERPO);
  });
});

describe("respuesta unificada: una línea por asunto", () => {
  it("las líneas siguen el orden del catálogo aunque lleguen desordenadas", () => {
    const texto = componerRespuesta({
      cuerpo: CUERPO,
      asuntos: [cuotaResuelta, documentosPendientes, solicitudPendiente],
      regla4: false,
    });
    const nombres = lineas(texto)
      .filter((l) => l.startsWith("- "))
      .map((l) => l.slice(2, l.indexOf(":")));
    assert.deepEqual(nombres, ["Solicitud", "Documentos", "Cuota"]);
    assert.deepEqual(
      nombres.map((n) => n.toLowerCase()),
      [...ASUNTOS],
    );
  });

  it("la cuota resuelta lleva la cuota en pesos y el aviso del core", () => {
    const texto = componerRespuesta({
      cuerpo: CUERPO,
      asuntos: [solicitudPendiente, cuotaResuelta],
      regla4: false,
    });
    assert.ok(
      texto.includes(`- Cuota: resuelto — cuota mensual simulada de $206.723. ${AVISO}`),
      texto,
    );
  });

  it("una solicitud resuelta incluye su identificador", () => {
    const texto = componerRespuesta({
      cuerpo: CUERPO,
      asuntos: [
        { asunto: "solicitud", estado: "resuelto", resultado: "registrada (SOL-0002000001)" },
        cuotaResuelta,
      ],
      regla4: false,
    });
    assert.ok(texto.includes("- Solicitud: resuelto — registrada (SOL-0002000001)."), texto);
  });

  it("documentos resueltos dicen «listo»", () => {
    const texto = componerRespuesta({
      cuerpo: CUERPO,
      asuntos: [{ asunto: "documentos", estado: "resuelto", resultado: "listo" }, cuotaResuelta],
      regla4: false,
    });
    assert.ok(texto.includes("- Documentos: resuelto — listo."), texto);
  });

  it("un asunto escalado dice que un analista de crédito lo revisará", () => {
    const texto = componerRespuesta({
      cuerpo: CUERPO,
      asuntos: [{ asunto: "documentos", estado: "escalado" }, cuotaResuelta],
      regla4: false,
    });
    assert.ok(
      texto.includes("- Documentos: escalado — un analista de crédito lo revisará."),
      texto,
    );
  });

  const frases: Record<MotivoPendiente, string> = {
    falta_identidad: "necesito verificar tu identidad para continuar",
    falta_dato: "falta un dato que debes aportar",
    lo_revisara_el_analista: "lo revisará el analista",
    sin_atender: "no pude atenderlo en esta respuesta",
  };

  for (const motivo of MOTIVOS_PENDIENTE) {
    it(`un asunto pendiente por ${motivo} usa su frase fija`, () => {
      const texto = componerRespuesta({
        cuerpo: CUERPO,
        asuntos: [{ asunto: "solicitud", estado: "pendiente", motivo }, cuotaResuelta],
        regla4: false,
      });
      assert.ok(texto.includes(`- Solicitud: pendiente — ${frases[motivo]}.`), texto);
    });
  }

  it("no inventa texto: el resultado depende solo del cuerpo y de los asuntos", () => {
    const entrada = {
      cuerpo: CUERPO,
      asuntos: [solicitudPendiente, documentosPendientes, cuotaResuelta],
      regla4: false,
    };
    assert.equal(componerRespuesta(entrada), componerRespuesta(entrada));
  });
});
