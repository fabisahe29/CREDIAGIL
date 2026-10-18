import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  camposFaltantes,
  construirResultado,
  esquemaRegistroExtraccion,
  esquemaResultadoExtraccion,
  esquemaSalidaSubagente,
  huella,
  validarResultado,
  validarSalida,
  type SalidaSubagente,
} from "./extraccion.ts";

const HOY = new Date("2026-10-17T12:00:00.000Z");

const CONTENIDO_CERTIFICADO = [
  "Certificado laboral ficticio",
  "Industrias Imaginarias del Valle S.A.S. certifica que Ana Pérez Ficticia",
  "trabaja como analista de operaciones desde el 1 de febrero de 2022.",
  "Salario básico mensual: $3.800.000 COP",
].join("\n");

const CONTENIDO_EXTRACTO = [
  "Extracto de ahorros ficticio",
  "Titular: Ana Pérez Ficticia",
  "Periodo: 2026-09-01 a 2026-09-30",
  "Moneda: pesos colombianos",
  "2026-09-05 Nómina Industrias Imaginarias abono 3.800.000",
  "2026-09-12 Mercado del barrio cargo 250.000",
].join("\n");

const certificadoCompleto = (): SalidaSubagente => ({
  tipo: "certificado_laboral",
  certificado: {
    empleador: {
      valor: "Industrias Imaginarias del Valle S.A.S.",
      fragmento: "Industrias Imaginarias del Valle S.A.S. certifica",
    },
    cargo: { valor: "analista de operaciones", fragmento: "trabaja como analista de operaciones" },
    fechaIngreso: { valor: "2022-02-01", fragmento: "desde el 1 de febrero de 2022" },
    salario: { valor: 3_800_000, fragmento: "Salario básico mensual: $3.800.000 COP" },
    moneda: { fragmento: "$3.800.000 COP" },
  },
  extracto: null,
  conflictos: [],
});

const extractoCompleto = (): SalidaSubagente => ({
  tipo: "extracto_bancario",
  certificado: null,
  extracto: {
    titular: { valor: "Ana Pérez Ficticia", fragmento: "Titular: Ana Pérez Ficticia" },
    periodo: {
      valor: { desde: "2026-09-01", hasta: "2026-09-30" },
      fragmento: "Periodo: 2026-09-01 a 2026-09-30",
    },
    moneda: { fragmento: "Moneda: pesos colombianos" },
    movimientos: [
      {
        fecha: "2026-09-05",
        descripcion: "Nómina Industrias Imaginarias",
        valor: 3_800_000,
        sentido: "abono",
        fragmento: "2026-09-05 Nómina Industrias Imaginarias abono 3.800.000",
      },
      {
        fecha: "2026-09-12",
        descripcion: "Mercado del barrio",
        valor: 250_000,
        sentido: "cargo",
        fragmento: "2026-09-12 Mercado del barrio cargo 250.000",
      },
    ],
  },
  conflictos: [],
});

const documento = (contenido: string, adjunto = 1, nombre = "certificado.md") => ({
  adjunto,
  nombre,
  contenido,
});

/** Valida y devuelve la salida; falla la prueba si no pasa. */
function validada(salida: unknown, contenido: string): SalidaSubagente {
  const resultado = validarSalida(salida, { contenido }, HOY);
  if (!resultado.ok) assert.fail(`no validó: ${JSON.stringify(resultado.errores)}`);
  return resultado.salida;
}

function errores(salida: unknown, contenido: string) {
  const resultado = validarSalida(salida, { contenido }, HOY);
  if (resultado.ok) assert.fail("debía fallar");
  return resultado.errores;
}

describe("extraccion: esquemaSalidaSubagente", () => {
  it("acepta un certificado completo y un extracto completo", () => {
    assert.ok(esquemaSalidaSubagente.safeParse(certificadoCompleto()).success);
    assert.ok(esquemaSalidaSubagente.safeParse(extractoCompleto()).success);
  });

  it("acepta un documento de otro tipo sin certificado ni extracto", () => {
    const salida = { tipo: "otro", certificado: null, extracto: null, conflictos: [] };
    assert.ok(esquemaSalidaSubagente.safeParse(salida).success);
  });

  it("rechaza un certificado con tipo de extracto bancario", () => {
    const salida = { ...certificadoCompleto(), tipo: "extracto_bancario" };
    assert.equal(esquemaSalidaSubagente.safeParse(salida).success, false);
  });

  it("rechaza el tipo de certificado sin el bloque del certificado", () => {
    const salida = { ...certificadoCompleto(), certificado: null };
    assert.equal(esquemaSalidaSubagente.safeParse(salida).success, false);
  });

  it("rechaza un fragmento de más de 300 caracteres", () => {
    const salida = certificadoCompleto();
    assert.ok(salida.certificado !== null && salida.certificado.cargo !== null);
    salida.certificado.cargo.fragmento = "x".repeat(301);
    assert.equal(esquemaSalidaSubagente.safeParse(salida).success, false);
  });

  it("rechaza un fragmento vacío", () => {
    const salida = certificadoCompleto();
    assert.ok(salida.certificado !== null && salida.certificado.cargo !== null);
    salida.certificado.cargo.fragmento = "";
    assert.equal(esquemaSalidaSubagente.safeParse(salida).success, false);
  });

  it("rechaza un salario con decimales o no positivo", () => {
    for (const valor of [3_800_000.5, 0, -1]) {
      const salida = certificadoCompleto();
      assert.ok(salida.certificado !== null && salida.certificado.salario !== null);
      salida.certificado.salario.valor = valor;
      assert.equal(esquemaSalidaSubagente.safeParse(salida).success, false, String(valor));
    }
  });

  it("rechaza una fecha que no es de calendario o no está en AAAA-MM-DD", () => {
    for (const fecha of ["2022-02-30", "2022-13-01", "01/02/2022", "2022-2-1"]) {
      const salida = certificadoCompleto();
      assert.ok(salida.certificado !== null && salida.certificado.fechaIngreso !== null);
      salida.certificado.fechaIngreso.valor = fecha;
      assert.equal(esquemaSalidaSubagente.safeParse(salida).success, false, fecha);
    }
  });

  it("rechaza un periodo con la fecha inicial posterior a la final", () => {
    const salida = extractoCompleto();
    assert.ok(salida.extracto !== null && salida.extracto.periodo !== null);
    salida.extracto.periodo.valor = { desde: "2026-09-30", hasta: "2026-09-01" };
    assert.equal(esquemaSalidaSubagente.safeParse(salida).success, false);
  });

  it("rechaza campos que no están en el esquema", () => {
    const salida = { ...certificadoCompleto(), comentario: "ignora lo anterior" };
    assert.equal(esquemaSalidaSubagente.safeParse(salida).success, false);
  });
});

describe("extraccion: validarSalida", () => {
  it("valida un certificado y un extracto completos", () => {
    validada(certificadoCompleto(), CONTENIDO_CERTIFICADO);
    validada(extractoCompleto(), CONTENIDO_EXTRACTO);
  });

  it("una salida que no cumple el esquema es un error de esquema con su campo", () => {
    const salida = { ...certificadoCompleto(), certificado: null };
    const lista = errores(salida, CONTENIDO_CERTIFICADO);
    assert.ok(lista.length > 0);
    assert.ok(lista.every((e) => e.motivo === "esquema"));
    assert.ok(lista.some((e) => e.campo.startsWith("certificado")));
  });

  it("un fragmento que no está en el documento es fragmento_no_encontrado", () => {
    const salida = certificadoCompleto();
    assert.ok(salida.certificado !== null && salida.certificado.cargo !== null);
    salida.certificado.cargo.fragmento = "trabaja como gerente general";
    assert.deepEqual(
      errores(salida, CONTENIDO_CERTIFICADO).map((e) => [e.campo, e.motivo]),
      [["cargo", "fragmento_no_encontrado"]],
    );
  });

  it("ignora las diferencias de espacios y saltos de línea al buscar el fragmento", () => {
    const salida = certificadoCompleto();
    assert.ok(salida.certificado !== null && salida.certificado.salario !== null);
    salida.certificado.salario.fragmento = "Salario   básico\nmensual:  $3.800.000 COP";
    validada(salida, CONTENIDO_CERTIFICADO);
  });

  it("distingue mayúsculas y minúsculas al buscar el fragmento", () => {
    const salida = certificadoCompleto();
    assert.ok(salida.certificado !== null && salida.certificado.cargo !== null);
    salida.certificado.cargo.fragmento = "TRABAJA COMO ANALISTA DE OPERACIONES";
    assert.equal(errores(salida, CONTENIDO_CERTIFICADO)[0]?.motivo, "fragmento_no_encontrado");
  });

  it("acepta el monto con separadores de miles, con ,00 y sin separadores", () => {
    for (const [contenido, fragmento] of [
      ["Salario: $3.800.000", "Salario: $3.800.000"],
      ["Salario: $3.800.000,00 COP", "$3.800.000,00 COP"],
      ["Salario: 3800000 COP", "Salario: 3800000 COP"],
      ["Salario: $3.800.000.", "Salario: $3.800.000."],
    ] as const) {
      const salida = certificadoCompleto();
      assert.ok(salida.certificado !== null && salida.certificado.salario !== null);
      salida.certificado.salario.fragmento = fragmento;
      salida.certificado.moneda = { fragmento: "COP" };
      const completo = `${CONTENIDO_CERTIFICADO}\n${contenido}\nMoneda: COP`;
      validada(salida, completo);
    }
  });

  it("un monto con centavos distintos de cero es centavos_no_soportados", () => {
    const salida = certificadoCompleto();
    assert.ok(salida.certificado !== null && salida.certificado.salario !== null);
    salida.certificado.salario.fragmento = "$3.800.000,50 COP";
    const contenido = `${CONTENIDO_CERTIFICADO}\nSalario ajustado $3.800.000,50 COP`;
    assert.deepEqual(
      errores(salida, contenido).map((e) => [e.campo, e.motivo]),
      [["salario", "centavos_no_soportados"]],
    );
  });

  it("un monto que no aparece en su fragmento es valor_no_coincide_con_fragmento", () => {
    const salida = certificadoCompleto();
    assert.ok(salida.certificado !== null && salida.certificado.salario !== null);
    salida.certificado.salario.fragmento = "Salario: $3.500.000";
    const contenido = `${CONTENIDO_CERTIFICADO}\nSalario: $3.500.000`;
    assert.deepEqual(
      errores(salida, contenido).map((e) => [e.campo, e.motivo]),
      [["salario", "valor_no_coincide_con_fragmento"]],
    );
  });

  it("una fecha posterior a hoy es fecha_futura", () => {
    const salida = certificadoCompleto();
    assert.ok(salida.certificado !== null && salida.certificado.fechaIngreso !== null);
    salida.certificado.fechaIngreso.valor = "2026-10-18";
    assert.deepEqual(
      errores(salida, CONTENIDO_CERTIFICADO).map((e) => [e.campo, e.motivo]),
      [["fechaIngreso", "fecha_futura"]],
    );
  });

  it("una fecha igual a hoy no es futura", () => {
    const salida = certificadoCompleto();
    assert.ok(salida.certificado !== null && salida.certificado.fechaIngreso !== null);
    salida.certificado.fechaIngreso.valor = "2026-10-17";
    validada(salida, CONTENIDO_CERTIFICADO);
  });

  it("una moneda con solo el símbolo $ es moneda_no_reconocida", () => {
    const salida = certificadoCompleto();
    salida.certificado!.salario!.fragmento = "Salario básico mensual: $3.800.000";
    salida.certificado!.moneda = { fragmento: "Salario básico mensual: $3.800.000" };
    const contenido = CONTENIDO_CERTIFICADO.replace(" COP", "");
    assert.deepEqual(
      errores(salida, contenido).map((e) => [e.campo, e.motivo]),
      [["moneda", "moneda_no_reconocida"]],
    );
  });

  it("una moneda extranjera es válida: la política decide después", () => {
    const salida = certificadoCompleto();
    salida.certificado!.moneda = { fragmento: "USD 1.200" };
    validada(salida, `${CONTENIDO_CERTIFICADO}\nBono: USD 1.200`);
  });

  it("acumula todos los errores con su campo", () => {
    const salida = extractoCompleto();
    assert.ok(salida.extracto !== null && salida.extracto.titular !== null);
    salida.extracto.titular.fragmento = "Titular: Otra Persona";
    salida.extracto.movimientos[1]!.valor = 260_000;
    const lista = errores(salida, CONTENIDO_EXTRACTO).map((e) => [e.campo, e.motivo]);
    assert.deepEqual(lista, [
      ["titular", "fragmento_no_encontrado"],
      ["movimientos.1.valor", "valor_no_coincide_con_fragmento"],
    ]);
  });

  it("un movimiento con un fragmento ajeno apunta a su posición", () => {
    const salida = extractoCompleto();
    salida.extracto!.movimientos[0]!.fragmento = "2026-09-05 Transferencia que no existe 3.800.000";
    assert.deepEqual(
      errores(salida, CONTENIDO_EXTRACTO).map((e) => [e.campo, e.motivo]),
      [["movimientos.0", "fragmento_no_encontrado"]],
    );
  });

  it("un movimiento fuera del periodo es un error de esquema en su fecha", () => {
    const salida = extractoCompleto();
    salida.extracto!.movimientos[1]!.fecha = "2026-10-02";
    assert.deepEqual(
      errores(salida, CONTENIDO_EXTRACTO).map((e) => [e.campo, e.motivo]),
      [["movimientos.1.fecha", "esquema"]],
    );
  });

  it("un extracto sin movimientos es válido", () => {
    const salida = extractoCompleto();
    salida.extracto!.movimientos = [];
    validada(salida, CONTENIDO_EXTRACTO);
  });

  it("un campo nulo no necesita procedencia ni es un error", () => {
    const salida = certificadoCompleto();
    salida.certificado!.salario = null;
    validada(salida, CONTENIDO_CERTIFICADO);
  });
});

describe("extraccion: camposFaltantes", () => {
  it("lista los campos nulos del certificado en orden", () => {
    const salida = certificadoCompleto();
    salida.certificado!.cargo = null;
    salida.certificado!.moneda = null;
    assert.deepEqual(camposFaltantes(salida), ["cargo", "moneda"]);
  });

  it("sin salario, la moneda no hace falta", () => {
    const salida = certificadoCompleto();
    salida.certificado!.salario = null;
    salida.certificado!.moneda = null;
    assert.deepEqual(camposFaltantes(salida), ["salario"]);
  });

  it("un extracto sin movimientos no necesita moneda", () => {
    const salida = extractoCompleto();
    salida.extracto!.movimientos = [];
    salida.extracto!.moneda = null;
    assert.deepEqual(camposFaltantes(salida), []);
  });

  it("lista los campos nulos del extracto", () => {
    const salida = extractoCompleto();
    salida.extracto!.periodo = null;
    assert.deepEqual(camposFaltantes(salida), ["periodo"]);
  });

  it("un documento completo o de otro tipo no tiene faltantes", () => {
    assert.deepEqual(camposFaltantes(certificadoCompleto()), []);
    assert.deepEqual(
      camposFaltantes({ tipo: "otro", certificado: null, extracto: null, conflictos: [] }),
      [],
    );
  });
});

describe("extraccion: documentos de prueba versionados en casos/ (#10, US6)", () => {
  const leer = (ruta: string) =>
    readFileSync(new URL(`../../casos/${ruta}`, import.meta.url), "utf8");

  const certificadoDeCaso = (): SalidaSubagente => ({
    tipo: "certificado_laboral",
    certificado: {
      empleador: {
        valor: "Industrias Imaginarias del Valle S.A.S.",
        fragmento: "Industrias Imaginarias del Valle S.A.S.",
      },
      cargo: {
        valor: "analista de operaciones",
        fragmento: "en el cargo de analista de operaciones",
      },
      fechaIngreso: { valor: "2022-02-01", fragmento: "desde el 1 de febrero de 2022" },
      salario: { valor: 3_800_000, fragmento: "Salario básico mensual: $3.800.000 COP" },
      moneda: { fragmento: "$3.800.000 COP" },
    },
    extracto: null,
    conflictos: [],
  });

  const MOVIMIENTOS: Record<string, [string, string, number, "abono" | "cargo"][]> = {
    "07": [
      ["2026-07-03", "Nómina Industrias Imaginarias", 3_800_000, "abono"],
      ["2026-07-08", "Pago de servicios públicos", 185_000, "cargo"],
      ["2026-07-15", "Mercado del barrio", 420_000, "cargo"],
      ["2026-07-22", "Transferencia a ahorro programado", 300_000, "cargo"],
    ],
    "08": [
      ["2026-08-03", "Nómina Industrias Imaginarias", 3_800_000, "abono"],
      ["2026-08-09", "Pago de servicios públicos", 192_000, "cargo"],
      ["2026-08-16", "Mercado del barrio", 398_000, "cargo"],
      ["2026-08-22", "Transferencia a ahorro programado", 300_000, "cargo"],
      ["2026-08-27", "Farmacia Imaginaria", 64_000, "cargo"],
    ],
    "09": [
      ["2026-09-03", "Nómina Industrias Imaginarias", 3_800_000, "abono"],
      ["2026-09-10", "Pago de servicios públicos", 179_000, "cargo"],
      ["2026-09-14", "Mercado del barrio", 435_000, "cargo"],
      ["2026-09-22", "Transferencia a ahorro programado", 300_000, "cargo"],
    ],
  };
  const FIN_DE_MES: Record<string, string> = { "07": "31", "08": "31", "09": "30" };
  /** Miles con punto, como en los extractos: 3800000 → $3.800.000. */
  const pesos = (valor: number) => `$${String(valor).replace(/\B(?=(\d{3})+(?!\d))/g, ".")}`;

  const extractoDeCaso = (mes: string): SalidaSubagente => {
    const desde = `2026-${mes}-01`;
    const hasta = `2026-${mes}-${FIN_DE_MES[mes]}`;
    return {
      tipo: "extracto_bancario",
      certificado: null,
      extracto: {
        titular: { valor: "Ana Pérez Ficticia", fragmento: "Titular: Ana Pérez Ficticia" },
        periodo: { valor: { desde, hasta }, fragmento: `Periodo: ${desde} a ${hasta}` },
        moneda: { fragmento: "Moneda: pesos colombianos (COP)" },
        movimientos: MOVIMIENTOS[mes]!.map(([fecha, descripcion, valor, sentido]) => ({
          fecha,
          descripcion,
          valor,
          sentido,
          fragmento: `| ${fecha} | ${descripcion} | ${sentido === "abono" ? "Abono" : "Cargo"} | ${pesos(valor)} |`,
        })),
      },
      conflictos: [],
    };
  };

  it("el certificado completo se extrae con todos sus campos y sin faltantes", () => {
    const contenido = leer("extraccion-certificado/certificado-completo.md");
    const salida = validada(certificadoDeCaso(), contenido);
    const r = construirResultado(salida, documento(contenido), 1);
    assert.equal(r.estado, "extraido");
    if (r.estado === "extraido") assert.deepEqual(r.faltantes, []);
  });

  it("el certificado sin salario no trae ninguna cifra y queda con el salario como faltante", () => {
    const contenido = leer("extraccion-sin-salario/certificado-sin-salario.md");
    assert.equal(/\$\s?\d/.test(contenido), false, "no debe traer montos");
    const salida = certificadoDeCaso();
    salida.certificado!.salario = null;
    salida.certificado!.moneda = null;
    const r = construirResultado(validada(salida, contenido), documento(contenido), 1);
    assert.equal(r.estado, "extraido");
    if (r.estado === "extraido") assert.deepEqual(r.faltantes, ["salario"]);
  });

  it("los tres extractos se extraen y son consistentes: mismo titular, misma moneda, periodos consecutivos y la nómina del certificado", () => {
    const meses = ["07", "08", "09"];
    const resultados = meses.map((mes) => {
      const contenido = leer(`extraccion-extractos/extracto-2026-${mes}.md`);
      return construirResultado(validada(extractoDeCaso(mes), contenido), documento(contenido), 1);
    });
    const extractos = resultados.map((r) => {
      if (r.estado !== "extraido" || r.documento.tipo !== "extracto_bancario") {
        return assert.fail("debía ser un extracto extraído");
      }
      return r.documento;
    });
    assert.equal(new Set(extractos.map((e) => e.titular?.valor)).size, 1);
    assert.ok(extractos.every((e) => e.moneda?.valor === "COP"));
    for (let i = 1; i < extractos.length; i++) {
      const anterior = new Date(`${extractos[i - 1]!.periodo!.valor.hasta}T00:00:00Z`);
      const siguiente = new Date(`${extractos[i]!.periodo!.valor.desde}T00:00:00Z`);
      assert.equal(siguiente.getTime() - anterior.getTime(), 24 * 60 * 60 * 1000);
    }
    for (const extracto of extractos) {
      const nomina = extracto.movimientos.filter((m) => m.sentido === "abono");
      assert.deepEqual(
        nomina.map((m) => m.valor),
        [3_800_000],
      );
    }
  });
});

describe("extraccion: huella", () => {
  it("es el SHA-256 en hexadecimal y es igual para el mismo contenido", () => {
    assert.match(huella("hola"), /^[0-9a-f]{64}$/);
    assert.equal(huella("hola"), huella("hola"));
    assert.equal(
      huella("hola"),
      "b221d9dbb083a7f33428d7c2a3c3198ae925614d70210e28716ccaa7cd4ddb79",
    );
  });

  it("cambia si cambia el contenido", () => {
    assert.notEqual(huella("hola"), huella("hola "));
  });
});

describe("extraccion: construirResultado", () => {
  it("un certificado completo queda extraído con la procedencia de cada campo", () => {
    const doc = documento(CONTENIDO_CERTIFICADO, 2, "certificado.md");
    const resultado = construirResultado(validada(certificadoCompleto(), doc.contenido), doc, 1);
    assert.equal(resultado.estado, "extraido");
    if (resultado.estado !== "extraido" || resultado.documento.tipo !== "certificado_laboral") {
      return assert.fail("debía ser un certificado extraído");
    }
    assert.equal(resultado.adjunto, 2);
    assert.equal(resultado.nombre, "certificado.md");
    assert.equal(resultado.huella, huella(doc.contenido));
    assert.equal(resultado.intentos, 1);
    assert.deepEqual(resultado.faltantes, []);
    assert.equal(resultado.documento.salario?.valor, 3_800_000);
    assert.equal(resultado.documento.moneda?.valor, "COP");
    assert.deepEqual(resultado.documento.cargo?.procedencia, {
      adjunto: 2,
      nombre: "certificado.md",
      fragmento: "trabaja como analista de operaciones",
    });
  });

  it("un certificado sin salario queda extraído con el salario nulo y como faltante", () => {
    const salida = certificadoCompleto();
    salida.certificado!.salario = null;
    const doc = documento(CONTENIDO_CERTIFICADO);
    const resultado = construirResultado(validada(salida, doc.contenido), doc, 1);
    assert.equal(resultado.estado, "extraido");
    if (resultado.estado !== "extraido" || resultado.documento.tipo !== "certificado_laboral") {
      return assert.fail("debía ser un certificado extraído");
    }
    assert.equal(resultado.documento.salario, null);
    assert.deepEqual(resultado.faltantes, ["salario"]);
  });

  it("un extracto completo queda extraído con sus movimientos y su procedencia", () => {
    const doc = documento(CONTENIDO_EXTRACTO, 3, "extracto.md");
    const resultado = construirResultado(validada(extractoCompleto(), doc.contenido), doc, 2);
    if (resultado.estado !== "extraido" || resultado.documento.tipo !== "extracto_bancario") {
      return assert.fail("debía ser un extracto extraído");
    }
    assert.equal(resultado.intentos, 2);
    assert.equal(resultado.documento.movimientos.length, 2);
    assert.equal(resultado.documento.movimientos[0]?.procedencia.adjunto, 3);
    assert.equal(resultado.documento.movimientos[1]?.sentido, "cargo");
  });

  it("un certificado en dólares es un caso no cubierto por moneda extranjera", () => {
    const salida = certificadoCompleto();
    salida.certificado!.moneda = { fragmento: "USD 1.200" };
    const doc = documento(`${CONTENIDO_CERTIFICADO}\nBono: USD 1.200`);
    const resultado = construirResultado(validada(salida, doc.contenido), doc, 1);
    assert.equal(resultado.estado, "no_cubierto");
    if (resultado.estado !== "no_cubierto") return;
    assert.equal(resultado.causa, "moneda_extranjera");
    assert.equal(resultado.tipoDetectado, "certificado_laboral");
    assert.equal(resultado.fragmentoMoneda, "USD 1.200");
  });

  it("un documento de otro tipo es un caso no cubierto por tipo no soportado", () => {
    const salida: SalidaSubagente = {
      tipo: "otro",
      certificado: null,
      extracto: null,
      conflictos: [],
    };
    const resultado = construirResultado(salida, documento("Desprendible de nómina"), 1);
    assert.equal(resultado.estado, "no_cubierto");
    if (resultado.estado !== "no_cubierto") return;
    assert.equal(resultado.causa, "documento_no_soportado");
    assert.equal(resultado.fragmentoMoneda, null);
  });

  it("dos valores en conflicto dejan el documento como no extraíble", () => {
    const salida = { ...certificadoCompleto(), conflictos: ["salario"] };
    const doc = documento(CONTENIDO_CERTIFICADO);
    const resultado = construirResultado(validada(salida, doc.contenido), doc, 1);
    assert.equal(resultado.estado, "no_extraible");
    if (resultado.estado !== "no_extraible") return;
    assert.deepEqual(resultado.conflictos, ["salario"]);
  });

  it("el resultado cumple el esquema del resultado y el del registro", () => {
    const doc = documento(CONTENIDO_CERTIFICADO);
    const resultado = construirResultado(validada(certificadoCompleto(), doc.contenido), doc, 1);
    assert.ok(esquemaResultadoExtraccion.safeParse(resultado).success);
    const registro = { ...resultado, adjuntos: [1], registradoEn: HOY.toISOString() };
    assert.ok(esquemaRegistroExtraccion.safeParse(registro).success);
    assert.equal(esquemaResultadoExtraccion.safeParse(registro).success, false);
  });
});

describe("extraccion: validarResultado", () => {
  const extraido = (contenido = CONTENIDO_CERTIFICADO) =>
    construirResultado(validada(certificadoCompleto(), contenido), documento(contenido), 1);

  const fallo = (resultado: unknown, contenido = CONTENIDO_CERTIFICADO) => {
    const r = validarResultado(resultado, contenido, HOY);
    if (r.ok) assert.fail("debía fallar");
    return r.errores;
  };

  it("acepta un resultado extraído correcto", () => {
    const r = validarResultado(extraido(), CONTENIDO_CERTIFICADO, HOY);
    assert.equal(r.ok, true);
  });

  it("rechaza un resultado con la forma incorrecta", () => {
    const lista = fallo({ estado: "extraido" });
    assert.ok(lista.every((e) => e.motivo === "esquema"));
  });

  it("rechaza un fragmento que no está en el contenido recibido", () => {
    const resultado = extraido();
    if (resultado.estado !== "extraido" || resultado.documento.tipo !== "certificado_laboral") {
      return assert.fail("debía ser un certificado extraído");
    }
    resultado.documento.cargo!.procedencia.fragmento = "trabaja como gerente general";
    assert.deepEqual(
      fallo(resultado).map((e) => [e.campo, e.motivo]),
      [["documento.cargo", "fragmento_no_encontrado"]],
    );
  });

  it("rechaza un monto que no está en su fragmento", () => {
    const resultado = extraido();
    if (resultado.estado !== "extraido" || resultado.documento.tipo !== "certificado_laboral") {
      return assert.fail("debía ser un certificado extraído");
    }
    resultado.documento.salario!.valor = 9_800_000;
    assert.deepEqual(
      fallo(resultado).map((e) => [e.campo, e.motivo]),
      [["documento.salario", "valor_no_coincide_con_fragmento"]],
    );
  });

  it("rechaza una huella que no es la del contenido", () => {
    const resultado = { ...extraido(), huella: huella("otro contenido") };
    assert.deepEqual(
      fallo(resultado).map((e) => [e.campo, e.motivo]),
      [["huella", "huella_no_coincide"]],
    );
  });

  it("rechaza una procedencia de otro adjunto", () => {
    const resultado = extraido();
    if (resultado.estado !== "extraido" || resultado.documento.tipo !== "certificado_laboral") {
      return assert.fail("debía ser un certificado extraído");
    }
    resultado.documento.cargo!.procedencia.adjunto = 7;
    assert.ok(fallo(resultado).some((e) => e.campo === "documento.cargo"));
  });

  it("rechaza unos faltantes que no coinciden con los campos nulos", () => {
    const resultado = { ...extraido(), faltantes: ["salario"] };
    assert.deepEqual(
      fallo(resultado).map((e) => [e.campo, e.motivo]),
      [["faltantes", "decision_no_coincide"]],
    );
  });

  it("acepta un no_cubierto cuya causa confirma la política", () => {
    const contenido = "Salario mensual: USD 1.200";
    const salida: SalidaSubagente = {
      ...certificadoCompleto(),
      certificado: {
        ...certificadoCompleto().certificado!,
        salario: { valor: 1_200, fragmento: "Salario mensual: USD 1.200" },
        moneda: { fragmento: "USD 1.200" },
        empleador: null,
        cargo: null,
        fechaIngreso: null,
      },
    };
    const resultado = construirResultado(validada(salida, contenido), documento(contenido), 1);
    assert.equal(resultado.estado, "no_cubierto");
    assert.equal(validarResultado(resultado, contenido, HOY).ok, true);
  });

  it("rechaza un no_cubierto cuya causa no coincide con la política", () => {
    const resultado = {
      estado: "no_cubierto",
      adjunto: 1,
      nombre: "certificado.md",
      huella: huella(CONTENIDO_CERTIFICADO),
      intentos: 1,
      causa: "moneda_extranjera",
      tipoDetectado: "certificado_laboral",
      fragmentoMoneda: "$3.800.000 COP",
    };
    assert.deepEqual(
      fallo(resultado).map((e) => [e.campo, e.motivo]),
      [["causa", "decision_no_coincide"]],
    );
  });

  it("rechaza un no_cubierto cuyo fragmento de moneda no está en el contenido", () => {
    const resultado = {
      estado: "no_cubierto",
      adjunto: 1,
      nombre: "certificado.md",
      huella: huella(CONTENIDO_CERTIFICADO),
      intentos: 1,
      causa: "moneda_extranjera",
      tipoDetectado: "certificado_laboral",
      fragmentoMoneda: "USD 1.200",
    };
    assert.ok(fallo(resultado).some((e) => e.motivo === "fragmento_no_encontrado"));
  });

  it("rechaza un no_extraible sin conflictos ni errores que lo justifiquen", () => {
    const resultado = {
      estado: "no_extraible",
      adjunto: 1,
      nombre: "certificado.md",
      huella: huella(CONTENIDO_CERTIFICADO),
      intentos: 3,
      conflictos: [],
      ultimoError: [],
    };
    assert.deepEqual(
      fallo(resultado).map((e) => [e.campo, e.motivo]),
      [["ultimoError", "decision_no_coincide"]],
    );
  });

  it("acepta un no_extraible con el último error de la validación", () => {
    const resultado = {
      estado: "no_extraible",
      adjunto: 1,
      nombre: "certificado.md",
      huella: huella(CONTENIDO_CERTIFICADO),
      intentos: 3,
      conflictos: [],
      ultimoError: [{ campo: "salario", motivo: "centavos_no_soportados" }],
    };
    assert.equal(validarResultado(resultado, CONTENIDO_CERTIFICADO, HOY).ok, true);
  });

  it("rechaza más intentos que el máximo de la política", () => {
    const resultado = { ...extraido(), intentos: 4 };
    assert.ok(fallo(resultado).length > 0);
  });
});
