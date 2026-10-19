// Informe de ejecución de los casos (specs/015-casos-prueba-extremo-a-extremo: contracts/comando-casos.md).
// Una línea por caso, con su decisión y las llamadas observadas para poder auditar el veredicto, y un
// veredicto global con su código de salida. Nunca imprime el contenido de un documento ni el texto de la
// respuesta del agente: el observado no los tiene.

import type { LlamadaObservada, ModoEjecucion } from "./veredicto.ts";
import type { ResultadoCaso } from "./ejecutor.ts";

export type VeredictoGlobal = "exito" | "fallo" | "incompleto";

export interface Informe {
  modo: ModoEjecucion;
  casos: ResultadoCaso[];
  global: VeredictoGlobal;
  /** 0 éxito · 1 fallo · 3 incompleto (el 2 es de las opciones inválidas, antes de ejecutar nada). */
  codigoSalida: 0 | 1 | 3;
}

export const CODIGO_EXITO = 0;
export const CODIGO_FALLO = 1;
export const CODIGO_OPCIONES_INVALIDAS = 2;
export const CODIGO_INCOMPLETO = 3;

const NOMBRE_MODO: Readonly<Record<ModoEjecucion, string>> = {
  guionado: "guionado",
  modelo_real: "modelo real",
};

/** Éxito solo si todos pasan; un fallo manda sobre un no ejecutable; un no ejecutable nunca es éxito. */
export function armarInforme(modo: ModoEjecucion, casos: readonly ResultadoCaso[]): Informe {
  const ordenados = [...casos].sort((a, b) => (a.numero ?? 99) - (b.numero ?? 99));
  const hayFallo = ordenados.some((c) => c.resultado === "fallo");
  const hayNoEjecutable = ordenados.some((c) => c.resultado === "no_ejecutable");
  const global: VeredictoGlobal = hayFallo
    ? "fallo"
    : hayNoEjecutable || ordenados.length === 0
      ? "incompleto"
      : "exito";
  const codigoSalida =
    global === "exito" ? CODIGO_EXITO : global === "fallo" ? CODIGO_FALLO : CODIGO_INCOMPLETO;
  return { modo, casos: ordenados, global, codigoSalida };
}

const EXITOSAS = new Set(["ok", "valida"]);

/** Las llamadas agrupadas por herramienta; un grupo con algún error muestra el resultado de cada intento. */
export function resumirLlamadas(llamadas: readonly LlamadaObservada[]): string {
  const grupos = new Map<string, string[]>();
  for (const llamada of llamadas) {
    grupos.set(llamada.herramienta, [
      ...(grupos.get(llamada.herramienta) ?? []),
      llamada.resultado,
    ]);
  }
  return [...grupos]
    .map(([herramienta, resultados]) =>
      resultados.every((r) => EXITOSAS.has(r))
        ? `${herramienta}${resultados.length > 1 ? `×${resultados.length}` : ""}`
        : `${herramienta}[${resultados.join(" → ")}]`,
    )
    .join(", ");
}

const VEREDICTO: Readonly<Record<ResultadoCaso["resultado"], string>> = {
  paso: "PASÓ",
  fallo: "FALLÓ",
  no_ejecutable: "NO EJECUTABLE",
};

const etiqueta = (c: ResultadoCaso) =>
  `${c.numero ?? "?"} ${c.nombre}${c.variante !== undefined ? ` (${c.variante})` : ""}`;

function lineasDe(c: ResultadoCaso): string[] {
  const o = c.observado;
  const detalle =
    c.resultado === "no_ejecutable" || o === undefined
      ? ""
      : `  ${o.decision}${o.causa !== undefined ? ` · ${o.causa}` : ""}${
          o.motivo !== undefined ? ` · motivo: ${o.motivo}` : ""
        }${o.entrega === "pendiente" ? " · entrega pendiente" : ""}${
          o.eventos.length > 0 ? ` · eventos: ${o.eventos.join(", ")}` : ""
        } · llamadas: ${resumirLlamadas(o.llamadas) || "ninguna"}`;
  const lineas = [` ${etiqueta(c)}  ${VEREDICTO[c.resultado]}${detalle}`];
  if (c.causa !== undefined) lineas.push(`     causa: ${c.causa}`);
  for (const d of c.diferencias) {
    lineas.push(
      `     diferencia: ${d.campo} — esperado: ${d.esperado} · observado: ${d.observado}`,
    );
  }
  return lineas;
}

const TEXTO_GLOBAL: Readonly<Record<VeredictoGlobal, string>> = {
  exito: "ÉXITO",
  fallo: "FALLO",
  incompleto: "INCOMPLETO",
};

export function formatearInforme(informe: Informe): string {
  const { casos } = informe;
  const con = (resultado: ResultadoCaso["resultado"]) =>
    casos.filter((c) => c.resultado === resultado);
  const nombres = (lista: ResultadoCaso[]) => lista.map(etiqueta).join(", ");
  const resumen =
    informe.global === "exito"
      ? `${casos.length} de ${casos.length} líneas pasaron`
      : [
          con("fallo").length > 0 ? `${con("fallo").length} falló: ${nombres(con("fallo"))}` : "",
          con("no_ejecutable").length > 0
            ? `${con("no_ejecutable").length} no ejecutable: ${nombres(con("no_ejecutable"))}`
            : "",
          casos.length === 0 ? "no hay casos que ejecutar" : "",
        ]
          .filter((parte) => parte !== "")
          .join(" · ");
  return [
    `Casos obligatorios · modo: ${NOMBRE_MODO[informe.modo]}`,
    ...casos.flatMap(lineasDe),
    `Global: ${TEXTO_GLOBAL[informe.global]} (${resumen})`,
  ].join("\n");
}

/** El mismo informe como JSON: sin documentos ni texto de respuestas. */
export const informeJson = (informe: Informe): string => JSON.stringify(informe, null, 2);
