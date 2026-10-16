import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { datosReales } from "../../hooks/lib/datos-reales.ts";
import { decidir } from "./decision.ts";
import { SHA, hallazgo, informeCodigo, informeCumplimiento, regla } from "./fixtures.ts";
import type { InformeCodigo, InformeCumplimiento } from "./informe.ts";
import { marcador, parsearComentario, renderComentario } from "./registro.ts";

const FECHA = "2026-10-16";
const codigo = (cambios: Record<string, unknown> = {}) =>
  informeCodigo(cambios) as unknown as InformeCodigo;
const cumplimiento = (cambios: Record<string, unknown> = {}) =>
  informeCumplimiento(cambios) as unknown as InformeCumplimiento;

describe("marcador", () => {
  it("identifica tipo y commit", () => {
    assert.equal(marcador("codigo", SHA), `<!-- crediagil:revision=codigo;commit=${SHA} -->`);
  });
});

describe("renderComentario", () => {
  it("revisión de código que bloquea: marcador, ⛔, conteos y lo que bloquea con archivo:línea", () => {
    const informe = codigo({
      hallazgos: [hallazgo({ severidad: "alta", linea: 9 }), hallazgo({ severidad: "baja" })],
    });
    const cuerpo = renderComentario({ tipo: "codigo", sha: SHA, informe, fecha: FECHA });
    const [primera] = cuerpo.split("\n");
    assert.equal(primera, marcador("codigo", SHA));
    assert.match(cuerpo, /Revisión de código\*\* · commit `aaaaaaa` · ⛔ bloquea · 2026-10-16/);
    assert.match(cuerpo, /crítica: 0 · alta: 1 · media: 0 · baja: 1/);
    assert.match(cuerpo, /alta — `\.claude\/revision\/lib\/decision\.ts:9` —/);
    assert.match(cuerpo, /<details><summary>Informe completo<\/summary>/);
  });

  it("revisión de código sin hallazgos: ✅ y lo dice explícitamente", () => {
    const cuerpo = renderComentario({
      tipo: "codigo",
      sha: SHA,
      informe: codigo({ hallazgos: [] }),
      fecha: FECHA,
    });
    assert.match(cuerpo, /✅ no bloquea/);
    assert.match(cuerpo, /Sin hallazgos/);
  });

  it("revisión de cumplimiento: estado de las 5 reglas y la incumplida con su evidencia", () => {
    const reglas = [regla(1), regla(2, "incumplida"), regla(3, "cumplida"), regla(4), regla(5)];
    const cuerpo = renderComentario({
      tipo: "cumplimiento",
      sha: SHA,
      informe: cumplimiento({ reglas }),
      fecha: FECHA,
    });
    assert.match(cuerpo, /⛔ bloquea/);
    assert.match(cuerpo, /1 ➖ · 2 ⛔ · 3 ✅ · 4 ➖ · 5 ➖/);
    assert.match(cuerpo, /Regla 2 — `src\/politica\/umbrales\.ts:3`/);
  });

  it("revisión fallida: ⛔, la causa y sin informe que reutilizar", () => {
    const cuerpo = renderComentario({
      tipo: "codigo",
      sha: SHA,
      fallo: {
        tipo: "codigo",
        sha: SHA,
        causa: "informe inválido tras la corrección",
        errores: ["V3: severidad"],
        fecha: FECHA,
      },
      fecha: FECHA,
    });
    assert.match(cuerpo, /⛔ revisión fallida/);
    assert.match(cuerpo, /informe inválido tras la corrección/);
    assert.equal(parsearComentario(cuerpo), null);
  });

  it("no contiene datos con forma real", () => {
    const cuerpo = renderComentario({
      tipo: "cumplimiento",
      sha: SHA,
      informe: cumplimiento(),
      fecha: FECHA,
    });
    const bloqueos = datosReales({
      herramienta: "mcp__github__add_issue_comment",
      rutas: [],
      textos: [{ origen: "comentario", texto: cuerpo }],
    });
    assert.deepEqual(bloqueos, []);
  });
});

describe("parsearComentario", () => {
  it("ida y vuelta: recupera tipo, sha e informe", () => {
    for (const [tipo, informe] of [
      ["codigo", codigo()],
      ["cumplimiento", cumplimiento()],
    ] as const) {
      const cuerpo = renderComentario({ tipo, sha: SHA, informe, fecha: FECHA });
      assert.deepEqual(parsearComentario(cuerpo), { tipo, sha: SHA, informe });
    }
  });

  it("ida y vuelta con un texto que contiene un bloque de código con comillas invertidas", () => {
    const informe = codigo({
      resumen: "El revisor cita ```json\n{}\n``` dentro de su resumen.",
      hallazgos: [hallazgo({ descripcion: "Usa `x` y ``` en el texto." })],
    });
    const cuerpo = renderComentario({ tipo: "codigo", sha: SHA, informe, fecha: FECHA });
    assert.deepEqual(parsearComentario(cuerpo), { tipo: "codigo", sha: SHA, informe });
  });

  it("un cuerpo sin marcador da null", () => {
    assert.equal(parsearComentario("Un comentario cualquiera."), null);
  });

  it("un cuerpo con el JSON roto da null", () => {
    const cuerpo = `${marcador("codigo", SHA)}\n\n\`\`\`json\n{ roto\n\`\`\`\n`;
    assert.equal(parsearComentario(cuerpo), null);
  });
});

describe("decidir y registro juntos", () => {
  it("el comentario de una revisión válida usa la gravedad propia de esa revisión", () => {
    const informeC = codigo({ hallazgos: [hallazgo({ severidad: "media" })] });
    const reglas = [regla(1), regla(2, "incumplida"), regla(3), regla(4), regla(5)];
    const decision = decidir(SHA, { codigo: informeC, cumplimiento: cumplimiento({ reglas }) });
    assert.equal(decision.permite, false);
    const cuerpo = renderComentario({ tipo: "codigo", sha: SHA, informe: informeC, fecha: FECHA });
    assert.match(cuerpo, /✅ no bloquea/);
  });
});
