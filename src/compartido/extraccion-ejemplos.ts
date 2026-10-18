// Solo para pruebas: documentos ficticios y las salidas del subagente que les corresponden
// (constitución, Principio II; docs/datos-ficticios.md). Los usan las pruebas del core, del
// servidor, del cliente y del adaptador, que no deben depender del modelo real.

import type { SalidaSubagente } from "./extraccion.ts";

export const HOY_EJEMPLO = new Date("2026-10-17T12:00:00.000Z");

export const CONTENIDO_CERTIFICADO = [
  "Certificado laboral ficticio",
  "Industrias Imaginarias del Valle S.A.S. certifica que Ana Pérez Ficticia",
  "trabaja como analista de operaciones desde el 1 de febrero de 2022.",
  "Salario básico mensual: $3.800.000 COP",
].join("\n");

export const CONTENIDO_CERTIFICADO_SIN_SALARIO = [
  "Certificado laboral ficticio",
  "Industrias Imaginarias del Valle S.A.S. certifica que Ana Pérez Ficticia",
  "trabaja como analista de operaciones desde el 1 de febrero de 2022.",
].join("\n");

export const CONTENIDO_CERTIFICADO_USD = [
  "Certificado laboral ficticio",
  "Compañía Inventada del Norte certifica un salario mensual de USD 1.200",
].join("\n");

export const CONTENIDO_EXTRACTO = [
  "Extracto de ahorros ficticio",
  "Titular: Ana Pérez Ficticia",
  "Periodo: 2026-09-01 a 2026-09-30",
  "Moneda: pesos colombianos",
  "2026-09-05 Nómina Industrias Imaginarias abono 3.800.000",
  "2026-09-12 Mercado del barrio cargo 250.000",
].join("\n");

export const CONTENIDO_OTRO = "Desprendible de nómina ficticio de Compañía Inventada";

export const salidaCertificado = (): SalidaSubagente => ({
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

/** Sin salario: ni el valor ni la moneda aparecen en el documento. */
export const salidaCertificadoSinSalario = (): SalidaSubagente => ({
  ...salidaCertificado(),
  certificado: { ...salidaCertificado().certificado!, salario: null, moneda: null },
});

export const salidaCertificadoUsd = (): SalidaSubagente => ({
  tipo: "certificado_laboral",
  certificado: {
    empleador: {
      valor: "Compañía Inventada del Norte",
      fragmento: "Compañía Inventada del Norte certifica",
    },
    cargo: null,
    fechaIngreso: null,
    salario: { valor: 1_200, fragmento: "salario mensual de USD 1.200" },
    moneda: { fragmento: "USD 1.200" },
  },
  extracto: null,
  conflictos: [],
});

export const salidaExtracto = (): SalidaSubagente => ({
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

export const salidaOtro = (): SalidaSubagente => ({
  tipo: "otro",
  certificado: null,
  extracto: null,
  conflictos: [],
});
