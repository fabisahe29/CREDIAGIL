import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mismoEmpleador, mismoNombre, validarConsistencia } from "./consistencia.ts";
import { esquemaInconsistencia } from "../compartido/ingreso.ts";
import {
  aRegistro,
  ejemploCertificado,
  ejemploExtracto,
  extractosTrimestre,
  nominaDelMes,
  type Ejemplo,
} from "../compartido/ingreso-ejemplos.ts";

const NOMBRE = "Ana Pérez Ficticia";

const validar = (ejemplos: Ejemplo[], nombreSolicitante = NOMBRE) =>
  validarConsistencia({ nombreSolicitante, registros: ejemplos.map((e) => aRegistro(e)) });

const consistentes = () => [ejemploCertificado(), ...extractosTrimestre()];

describe("consistencia: mismoNombre", () => {
  it("«Pérez Ficticia, Ana» y «ana perez ficticia» son el mismo nombre", () => {
    assert.equal(mismoNombre("Pérez Ficticia, Ana", "ana perez ficticia"), true);
    assert.equal(mismoNombre("ANA PÉREZ FICTICIA", "Ana Pérez Ficticia"), true);
  });

  it("un apellido de menos o una palabra de más no es el mismo nombre", () => {
    assert.equal(mismoNombre("Ana Pérez", "Ana Pérez Ficticia"), false);
    assert.equal(mismoNombre("Ana Pérez Ficticia Inventada", "Ana Pérez Ficticia"), false);
  });

  it("otro nombre, o un nombre vacío, no coincide", () => {
    assert.equal(mismoNombre("Otra Persona Inventada", "Ana Pérez Ficticia"), false);
    assert.equal(mismoNombre("", ""), false);
  });

  it("repetir una palabra no la iguala con una sola", () => {
    assert.equal(mismoNombre("Ana Ana Pérez", "Ana Pérez"), false);
  });
});

describe("consistencia: mismoEmpleador", () => {
  it("«Industrias Imaginarias» coincide con «Industrias Imaginarias del Valle S.A.S.»", () => {
    assert.equal(
      mismoEmpleador("Industrias Imaginarias del Valle S.A.S.", "Industrias Imaginarias"),
      true,
    );
  });

  it("es simétrica: el empleador puede ser el prefijo del pagador", () => {
    assert.equal(
      mismoEmpleador("Industrias Imaginarias", "Industrias Imaginarias del Valle S.A.S."),
      true,
    );
  });

  it("ignora la forma societaria, las mayúsculas y las tildes", () => {
    assert.equal(mismoEmpleador("Compañía Inventada S.A.S.", "COMPANIA INVENTADA LTDA"), true);
  });

  it("un pagador de una palabra no coincide con un empleador de varias", () => {
    assert.equal(mismoEmpleador("Industrias Imaginarias del Valle S.A.S.", "Industrias"), false);
  });

  it("una palabra sola coincide con un empleador de una sola palabra igual", () => {
    assert.equal(mismoEmpleador("Inventada S.A.S.", "Inventada"), true);
    assert.equal(mismoEmpleador("Inventada S.A.S.", "Imaginaria"), false);
  });

  it("otro empleador no coincide", () => {
    assert.equal(
      mismoEmpleador("Industrias Imaginarias del Valle S.A.S.", "Compañía Inventada del Norte"),
      false,
    );
  });

  it("un texto sin palabras que cuenten no coincide con nada", () => {
    assert.equal(mismoEmpleador("S.A.S.", "S.A.S."), false);
    assert.equal(mismoEmpleador("", "Industrias Imaginarias"), false);
  });
});

describe("consistencia: validarConsistencia", () => {
  it("con documentos consistentes no hay inconsistencias ni nada sin contrastar", () => {
    assert.deepEqual(validar(consistentes()), { inconsistencias: [], sinContrastar: [] });
  });

  it("un titular distinto es titular_vs_solicitante, con el titular y la identidad como valores", () => {
    const { inconsistencias } = validar([
      ejemploCertificado(),
      ejemploExtracto({ titular: "Otra Persona Inventada" }),
    ]);
    assert.equal(inconsistencias.length, 1);
    const i = inconsistencias[0]!;
    assert.equal(i.regla, "titular_vs_solicitante");
    assert.equal(i.detiene, true);
    assert.equal(i.corregible, true);
    assert.deepEqual(i.adjuntos, [2]);
    assert.deepEqual(i.valores, [
      {
        adjunto: 2,
        nombre: "extracto-2026-09.md",
        campo: "titular",
        valor: "Otra Persona Inventada",
        fragmento: "Titular: Otra Persona Inventada",
      },
      {
        adjunto: null,
        nombre: "identidad verificada",
        campo: "nombre",
        valor: NOMBRE,
        fragmento: null,
      },
    ]);
  });

  it("un titular con otro orden y con tildes no es una inconsistencia", () => {
    const { inconsistencias } = validar([ejemploExtracto({ titular: "PÉREZ FICTICIA ANA" })]);
    assert.deepEqual(inconsistencias, []);
  });

  it("un apellido de menos en el titular sí es una inconsistencia", () => {
    const { inconsistencias } = validar([ejemploExtracto({ titular: "Ana Pérez" })]);
    assert.equal(inconsistencias[0]?.regla, "titular_vs_solicitante");
  });

  it("un pagador distinto es empleador_vs_pagador, con el empleador y el abono, cada uno con su procedencia", () => {
    const pagado = ejemploExtracto({
      adjunto: 2,
      movimientos: [
        {
          fecha: "2026-09-05",
          descripcion: "Nómina Compañía Inventada del Norte",
          valor: 3_800_000,
          sentido: "abono",
        },
      ],
    });
    const { inconsistencias } = validar([ejemploCertificado(), pagado]);
    assert.equal(inconsistencias.length, 1);
    const i = inconsistencias[0]!;
    assert.equal(i.regla, "empleador_vs_pagador");
    assert.equal(i.detiene, true);
    assert.equal(i.corregible, true);
    assert.deepEqual(i.adjuntos, [1, 2]);
    assert.equal(i.valores[0]?.campo, "empleador");
    assert.equal(i.valores[0]?.adjunto, 1);
    assert.equal(i.valores[0]?.fragmento, "Industrias Imaginarias del Valle S.A.S. certifica");
    assert.equal(i.valores[1]?.campo, "movimientos[0]");
    assert.equal(i.valores[1]?.adjunto, 2);
    assert.equal(i.valores[1]?.valor, "Nómina Compañía Inventada del Norte");
    assert.match(i.valores[1]?.fragmento ?? "", /Compañía Inventada del Norte abono/);
  });

  it("una inconsistencia por cada pagador distinto que no coincide", () => {
    const otro = (adjunto: number, desde: string, hasta: string, descripcion: string) =>
      ejemploExtracto({
        adjunto,
        nombre: `extracto-${desde}.md`,
        desde,
        hasta,
        movimientos: [{ ...nominaDelMes(desde), descripcion }],
      });
    const { inconsistencias } = validar([
      ejemploCertificado(),
      otro(2, "2026-07-01", "2026-07-31", "Nómina Compañía Inventada del Norte"),
      otro(3, "2026-08-01", "2026-08-31", "Nómina Compañía Inventada del Norte"),
      otro(4, "2026-09-01", "2026-09-30", "Nómina Empresa Imaginaria del Sur"),
    ]);
    const reglas = inconsistencias.map((i) => i.regla);
    assert.deepEqual(reglas, ["empleador_vs_pagador", "empleador_vs_pagador"]);
    assert.deepEqual(inconsistencias[0]?.adjuntos, [1, 2, 3]);
    assert.deepEqual(inconsistencias[1]?.adjuntos, [1, 4]);
  });

  it("un extracto de 31 días no es una inconsistencia y uno de 32 sí (periodo_no_mensual)", () => {
    const sin = validar([
      ejemploExtracto({ desde: "2026-08-01", hasta: "2026-08-31" }),
    ]).inconsistencias;
    assert.deepEqual(sin, []);
    const con = validar([
      ejemploExtracto({
        desde: "2026-08-01",
        hasta: "2026-09-01",
        movimientos: [nominaDelMes("2026-08-01")],
      }),
    ]).inconsistencias;
    assert.equal(con.length, 1);
    assert.equal(con[0]?.regla, "periodo_no_mensual");
    assert.equal(con[0]?.detiene, true);
    assert.equal(con[0]?.corregible, true);
  });

  it("dos extractos que se tocan en un día son periodos_superpuestos, no corregibles", () => {
    const a = ejemploExtracto({
      adjunto: 2,
      nombre: "a.md",
      desde: "2026-08-01",
      hasta: "2026-08-31",
    });
    const b = ejemploExtracto({
      adjunto: 3,
      nombre: "b.md",
      desde: "2026-08-31",
      hasta: "2026-09-30",
      movimientos: [{ ...nominaDelMes("2026-09-01") }],
    });
    const { inconsistencias } = validar([a, b]);
    assert.equal(inconsistencias.length, 1);
    const i = inconsistencias[0]!;
    assert.equal(i.regla, "periodos_superpuestos");
    assert.equal(i.detiene, true);
    assert.equal(i.corregible, false);
    assert.deepEqual(i.adjuntos, [2, 3]);
    assert.equal(i.valores.length, 2);
  });

  it("dos extractos consecutivos sin días en común no se superponen", () => {
    assert.deepEqual(
      validar([...extractosTrimestre()]).inconsistencias.map((i) => i.regla),
      [],
    );
  });

  it("extractos de meses no consecutivos son huecos_entre_periodos y no detienen", () => {
    const [julio, , septiembre] = extractosTrimestre();
    const { inconsistencias } = validar([julio!, septiembre!]);
    assert.equal(inconsistencias.length, 1);
    const i = inconsistencias[0]!;
    assert.equal(i.regla, "huecos_entre_periodos");
    assert.equal(i.detiene, false);
    assert.equal(i.corregible, false);
    assert.deepEqual(i.adjuntos, [2, 4]);
  });

  it("un titular nulo queda sin contrastar y no es una inconsistencia", () => {
    const sinTitular = ejemploExtracto();
    sinTitular.salida.extracto!.titular = null;
    const { inconsistencias, sinContrastar } = validar([ejemploCertificado(), sinTitular]);
    assert.deepEqual(inconsistencias, []);
    assert.ok(
      sinContrastar.some((m) => m.includes("titular")),
      JSON.stringify(sinContrastar),
    );
  });

  it("sin certificado o sin extractos dice qué no se pudo contrastar", () => {
    const soloExtractos = validar(extractosTrimestre()).sinContrastar;
    assert.ok(soloExtractos.some((m) => m.includes("falta el certificado")));
    const soloCertificado = validar([ejemploCertificado()]).sinContrastar;
    assert.ok(soloCertificado.some((m) => m.includes("faltan los extractos")));
  });

  it("extractos sin abonos de nómina lo dicen en lo que no se pudo contrastar", () => {
    const { sinContrastar } = validar([ejemploCertificado(), ejemploExtracto({ movimientos: [] })]);
    assert.ok(sinContrastar.some((m) => m.includes("no traen abonos de nómina")));
  });

  it("un certificado sin empleador queda sin contrastar", () => {
    const sinEmpleador = ejemploCertificado();
    sinEmpleador.salida.certificado!.empleador = null;
    const { sinContrastar } = validar([sinEmpleador, ...extractosTrimestre()]);
    assert.ok(sinContrastar.some((m) => m.includes("empleador del certificado")));
  });

  it("el orden es estable: por regla y luego por documento, sin importar el de entrada", () => {
    const [julio, agosto, septiembre] = extractosTrimestre({ primerAdjunto: 2 });
    const mal = (e: Ejemplo, titular: string) =>
      ejemploExtracto({
        adjunto: e.adjunto,
        nombre: e.nombre,
        desde: e.salida.extracto!.periodo!.valor.desde,
        hasta: e.salida.extracto!.periodo!.valor.hasta,
        titular,
      });
    const lista = [
      ejemploCertificado(),
      julio!,
      mal(agosto!, "Persona Inventada Uno"),
      mal(septiembre!, "Persona Inventada Dos"),
    ];
    const una = validar(lista);
    const otra = validar([...lista].reverse());
    assert.deepEqual(una, otra);
    assert.deepEqual(
      una.inconsistencias.map((i) => i.adjuntos[0]),
      [3, 4],
    );
    assert.deepEqual(validar(lista), una);
  });

  it("ninguna inconsistencia carece de un valor de un documento con su procedencia", () => {
    const todas = validar([
      ejemploCertificado({ empleador: "Compañía Inventada del Norte" }),
      ejemploExtracto({ adjunto: 2, nombre: "a.md", titular: "Otra Persona Inventada" }),
      ejemploExtracto({
        adjunto: 3,
        nombre: "b.md",
        desde: "2026-09-15",
        hasta: "2026-10-15",
        movimientos: [{ ...nominaDelMes("2026-09-01"), fecha: "2026-09-20" }],
      }),
    ]).inconsistencias;
    assert.ok(todas.length >= 3, JSON.stringify(todas.map((i) => i.regla)));
    for (const i of todas) {
      assert.ok(esquemaInconsistencia.safeParse(i).success, i.regla);
      assert.ok(
        i.valores.some((v) => v.adjunto !== null && v.fragmento !== null),
        i.regla,
      );
    }
  });

  it("ignora los registros que no son extraídos", () => {
    assert.deepEqual(validarConsistencia({ nombreSolicitante: NOMBRE, registros: [] }), {
      inconsistencias: [],
      sinContrastar: [],
    });
  });
});
