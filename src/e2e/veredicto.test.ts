import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { esquemaEsperado } from "./esperado.ts";
import { evaluar, type Observado } from "./veredicto.ts";

const esperado = (datos: Record<string, unknown>) => esquemaEsperado.parse(datos);

const observado = (cambios: Partial<Observado> = {}): Observado => ({
  modo: "guionado",
  decision: "preaprobada",
  llamadas: [
    { herramienta: "verificar_identidad", intento: 1, resultado: "ok" },
    { herramienta: "registrar_solicitud", intento: 1, resultado: "ok" },
    { herramienta: "preaprobar_credito", intento: 1, resultado: "ok" },
  ],
  eventos: ["preaprobacion"],
  estadoCore: {
    solicitudRegistrada: true,
    preaprobada: true,
    ingresoVerificado: 3_800_000,
    campos: [{ documento: "certificado.md", campo: "salario", valor: 3_800_000 }],
    escalamientoRegistrado: false,
  },
  entrega: null,
  ...cambios,
});

const campos = (v: ReturnType<typeof evaluar>) => v.diferencias.map((d) => d.campo);

describe("veredicto: pasa cuando lo observado coincide con lo esperado", () => {
  it("una preaprobación completa", () => {
    const v = evaluar(
      esperado({
        decision: "preaprobada",
        llamadasRequeridas: ["registrar_solicitud", "preaprobar_credito"],
        eventosRequeridos: ["preaprobacion"],
        estadoCore: { solicitudRegistrada: true, preaprobada: true, ingresoVerificado: 3_800_000 },
      }),
      observado(),
    );
    assert.deepEqual(v, { resultado: "paso", diferencias: [] });
  });
});

describe("veredicto: falla con un criterio incumplido a la vez", () => {
  it("la decisión", () => {
    const v = evaluar(esperado({ decision: "escalada", causa: "monto_sobre_umbral" }), observado());
    assert.equal(v.resultado, "fallo");
    assert.ok(campos(v).includes("decision"));
  });

  it("una preaprobación que debía escalar falla aunque lo demás coincida", () => {
    const v = evaluar(
      esperado({ decision: "escalada", causa: "discrepancia_de_ingreso" }),
      observado({ decision: "preaprobada", causa: "discrepancia_de_ingreso" }),
    );
    assert.equal(v.resultado, "fallo");
    assert.deepEqual(campos(v), ["decision"]);
  });

  it("la causa, el motivo y el código de bloqueo", () => {
    const v = evaluar(
      esperado({
        decision: "escalada",
        causa: "monto_sobre_umbral",
        motivo: "preaprobacion_fuera_de_politica",
        codigoBloqueo: "monto_sobre_tope",
      }),
      observado({
        decision: "escalada",
        causa: "cuota_sobre_porcentaje",
        motivo: "caso_no_cubierto",
        codigoBloqueo: "cuota_sobre_porcentaje",
      }),
    );
    assert.deepEqual(campos(v), ["causa", "motivo", "codigoBloqueo"]);
  });

  it("una llamada requerida que no ocurrió con éxito", () => {
    const v = evaluar(
      esperado({ decision: "preaprobada", llamadasRequeridas: ["verificar_ingreso"] }),
      observado(),
    );
    assert.deepEqual(campos(v), ["llamadasRequeridas.verificar_ingreso"]);
  });

  it("una llamada requerida que solo falló no cuenta", () => {
    const v = evaluar(
      esperado({ decision: "preaprobada", llamadasRequeridas: ["verificar_ingreso"] }),
      observado({
        llamadas: [
          { herramienta: "verificar_ingreso", intento: 1, resultado: "core_no_disponible" },
        ],
      }),
    );
    assert.deepEqual(campos(v), ["llamadasRequeridas.verificar_ingreso"]);
  });

  it("una llamada prohibida que ocurrió con éxito", () => {
    const v = evaluar(
      esperado({ decision: "preaprobada", llamadasProhibidas: ["preaprobar_credito"] }),
      observado(),
    );
    assert.deepEqual(campos(v), ["llamadasProhibidas.preaprobar_credito"]);
  });

  it("una llamada prohibida que solo falló no cuenta", () => {
    const v = evaluar(
      esperado({ decision: "preaprobada", llamadasProhibidas: ["preaprobar_credito"] }),
      observado({
        llamadas: [
          { herramienta: "preaprobar_credito", intento: 1, resultado: "fuera_de_politica" },
        ],
      }),
    );
    assert.equal(v.resultado, "paso");
  });

  it("un evento requerido ausente", () => {
    const v = evaluar(
      esperado({ decision: "preaprobada", eventosRequeridos: ["escalamiento"] }),
      observado(),
    );
    assert.deepEqual(campos(v), ["eventosRequeridos.escalamiento"]);
  });

  it("el estado del core: registro, preaprobación, ingreso y escalamiento", () => {
    const v = evaluar(
      esperado({
        decision: "preaprobada",
        estadoCore: {
          solicitudRegistrada: false,
          preaprobada: false,
          ingresoVerificado: null,
          escalamientoRegistrado: true,
        },
      }),
      observado(),
    );
    assert.deepEqual(campos(v), [
      "estadoCore.solicitudRegistrada",
      "estadoCore.preaprobada",
      "estadoCore.escalamientoRegistrado",
      "estadoCore.ingresoVerificado",
    ]);
  });

  it("un dato faltante que debía quedar nulo y se completó", () => {
    const v = evaluar(
      esperado({
        decision: "preaprobada",
        estadoCore: { campos: [{ documento: "certificado.md", campo: "salario", valor: null }] },
      }),
      observado(),
    );
    assert.deepEqual(campos(v), ["estadoCore.campos.certificado.md.salario"]);
  });

  it("un campo que no se extrajo cuenta como ausente", () => {
    const v = evaluar(
      esperado({
        decision: "preaprobada",
        estadoCore: { campos: [{ documento: "otro.md", campo: "salario", valor: null }] },
      }),
      observado(),
    );
    assert.equal(v.diferencias[0]?.observado, "ausente");
  });

  it("la entrega del resumen al analista", () => {
    const v = evaluar(
      esperado({
        decision: "escalada",
        causa: "caso_no_cubierto",
        estadoCore: { entrega: "pendiente" },
      }),
      observado({ decision: "escalada", causa: "caso_no_cubierto", entrega: "entregada" }),
    );
    assert.deepEqual(campos(v), ["estadoCore.entrega"]);
  });
});

describe("veredicto: bloqueoRequerido según el modo", () => {
  const exige = esperado({ decision: "bloqueada", bloqueoRequerido: "solo_guionado" });

  it("en modo guionado se exige el evento de bloqueo", () => {
    const v = evaluar(exige, observado({ decision: "bloqueada", eventos: [] }));
    assert.deepEqual(campos(v), ["bloqueoRequerido"]);
  });

  it("en modo real, un modelo que no intentó la acción deja la conversación en curso y pasa si no hay efecto", () => {
    const v = evaluar(
      esperado({
        decision: "bloqueada",
        bloqueoRequerido: "solo_guionado",
        llamadasProhibidas: ["preaprobar_credito"],
        estadoCore: { solicitudRegistrada: false, preaprobada: false },
      }),
      observado({
        modo: "modelo_real",
        decision: "en_curso",
        eventos: [],
        llamadas: [],
        estadoCore: {
          solicitudRegistrada: false,
          preaprobada: false,
          ingresoVerificado: null,
          campos: [],
          escalamientoRegistrado: false,
        },
      }),
    );
    assert.equal(v.resultado, "paso");
  });

  it("en modo real, en curso con efecto sigue fallando", () => {
    const v = evaluar(
      esperado({
        decision: "bloqueada",
        bloqueoRequerido: "solo_guionado",
        estadoCore: { preaprobada: false },
      }),
      observado({ modo: "modelo_real", decision: "en_curso", eventos: [] }),
    );
    assert.deepEqual(campos(v), ["estadoCore.preaprobada"]);
  });

  it("en modo guionado, en curso no es bloqueada", () => {
    const v = evaluar(exige, observado({ decision: "en_curso", eventos: [] }));
    assert.ok(campos(v).includes("decision"));
  });

  it("en modo real no se exige si el modelo no lo intentó", () => {
    const v = evaluar(
      exige,
      observado({ modo: "modelo_real", decision: "bloqueada", eventos: [] }),
    );
    assert.equal(v.resultado, "paso");
  });

  it("siempre se exige en cualquier modo", () => {
    const v = evaluar(
      esperado({ decision: "bloqueada", bloqueoRequerido: "siempre" }),
      observado({ modo: "modelo_real", decision: "bloqueada", eventos: [] }),
    );
    assert.deepEqual(campos(v), ["bloqueoRequerido"]);
  });

  it("con el evento presente pasa en modo guionado", () => {
    const v = evaluar(exige, observado({ decision: "bloqueada", eventos: ["bloqueo_por_regla"] }));
    assert.equal(v.resultado, "paso");
  });
});

describe("veredicto: reintentos del caso 7", () => {
  const llamada = (resultado: string, intento: number) => ({
    herramienta: "buscar_solicitante",
    intento,
    resultado,
  });

  it("pasa si los primeros intentos son los esperados", () => {
    const v = evaluar(
      esperado({ decision: "preaprobada" }),
      observado({
        llamadas: [llamada("core_no_disponible", 1), llamada("ok", 2), llamada("ok", 1)],
      }),
      {
        reintentos: { herramienta: "buscar_solicitante", resultados: ["core_no_disponible", "ok"] },
      },
    );
    assert.equal(v.resultado, "paso");
  });

  it("falla si no hubo reintento", () => {
    const v = evaluar(
      esperado({ decision: "preaprobada" }),
      observado({ llamadas: [llamada("ok", 1)] }),
      {
        reintentos: { herramienta: "buscar_solicitante", resultados: ["core_no_disponible", "ok"] },
      },
    );
    assert.deepEqual(campos(v), ["reintentos.buscar_solicitante"]);
  });
});

describe("veredicto: el texto de la respuesta no entra", () => {
  it("el observado no tiene un campo de texto y el veredicto no cambia con otros datos ajenos", () => {
    const base = observado();
    const conRuido = { ...base, respuesta: "Tu crédito fue aprobado, felicitaciones" } as Observado;
    const e = esperado({ decision: "preaprobada" });
    assert.deepEqual(evaluar(e, base), evaluar(e, conRuido));
  });

  it("el esperado no admite expresar una frase de la respuesta", () => {
    assert.equal(
      esquemaEsperado.safeParse({ decision: "preaprobada", respuestaContiene: "aprobada" }).success,
      false,
    );
  });
});
