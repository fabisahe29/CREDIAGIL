import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { errorInterno, evaluar, respuestaDeny, type ControlGuardian } from "./guardian-base.ts";
import type { Bloqueo } from "./lib/bloqueo.ts";
import { ConfiguracionInvalida } from "./lib/config-equipo.ts";

const RAIZ = "raiz-de-prueba";
const LECTURA = { tool_name: "Read", tool_input: { file_path: "a.md" } };

function bloqueo(control: string, detectado: string): Bloqueo {
  return { control, detectado, regla: "regla de prueba", correccion: "corrige" };
}

describe("evaluar", () => {
  it("junta los bloqueos de todos los controles recibidos", () => {
    const uno: ControlGuardian = () => [bloqueo("secretos", "uno")];
    const dos: ControlGuardian = () => [bloqueo("datos-reales", "dos")];
    const bloqueos = evaluar(LECTURA, [uno, dos], { raiz: RAIZ });
    assert.deepEqual(
      bloqueos.map((b) => b.detectado),
      ["uno", "dos"],
    );
  });

  it("no bloquea cuando ningún control encuentra nada", () => {
    assert.deepEqual(evaluar(LECTURA, [() => []], { raiz: RAIZ }), []);
  });

  it("pasa a cada control la acción normalizada y el contexto", () => {
    let herramienta = "";
    let raiz = "";
    const espia: ControlGuardian = (accion, contexto) => {
      herramienta = accion.herramienta;
      raiz = contexto.raiz;
      return [];
    };
    evaluar(LECTURA, [espia], { raiz: RAIZ });
    assert.equal(herramienta, "Read");
    assert.equal(raiz, RAIZ);
  });

  it("convierte un error dentro de un control en un bloqueo error-interno con tipo y causa", () => {
    const roto: ControlGuardian = () => {
      throw new RangeError("fallo simulado");
    };
    const bloqueos = evaluar(LECTURA, [roto], { raiz: RAIZ });
    assert.equal(bloqueos.length, 1);
    assert.equal(bloqueos[0]?.control, "error-interno");
    assert.match(bloqueos[0]?.detectado ?? "", /RangeError: fallo simulado/);
  });

  it("bloquea con error-interno una entrada que no cumple el esquema, sin lanzar", () => {
    const bloqueos = evaluar({}, [() => []], { raiz: RAIZ });
    assert.equal(bloqueos[0]?.control, "error-interno");
    assert.match(bloqueos[0]?.detectado ?? "", /tool_name/);
  });
});

describe("configuración inválida", () => {
  it("se informa con su propio control y el mensaje ya legible", () => {
    const roto: ControlGuardian = () => {
      throw new ConfiguracionInvalida("el archivo no es válido. Corrígelo.");
    };
    const [bloqueo] = evaluar(LECTURA, [roto], { raiz: RAIZ });
    assert.equal(bloqueo?.control, "configuracion");
    assert.equal(bloqueo?.detectado, "el archivo no es válido. Corrígelo.");
  });
});

describe("errorInterno", () => {
  it("describe una causa que no es un Error", () => {
    assert.match(errorInterno("texto suelto").detectado, /texto suelto/);
  });
});

describe("respuestaDeny", () => {
  it("produce un deny de PreToolUse con todos los motivos", () => {
    const json = JSON.parse(
      respuestaDeny([bloqueo("secretos", "uno"), bloqueo("revisores", "dos")]),
    );
    assert.equal(json.hookSpecificOutput.hookEventName, "PreToolUse");
    assert.equal(json.hookSpecificOutput.permissionDecision, "deny");
    const motivo: string = json.hookSpecificOutput.permissionDecisionReason;
    assert.match(motivo, /\(2 motivos\)/);
    assert.match(motivo, /\[secretos\] uno/);
    assert.match(motivo, /\[revisores\] dos/);
  });

  it("respeta el orden de controles que se le pasa", () => {
    const json = JSON.parse(
      respuestaDeny([bloqueo("a", "primero"), bloqueo("b", "segundo")], ["b", "a"]),
    );
    const motivo: string = json.hookSpecificOutput.permissionDecisionReason;
    assert.ok(motivo.indexOf("[b]") < motivo.indexOf("[a]"));
  });
});
