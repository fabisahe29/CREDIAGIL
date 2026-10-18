// Consistencia entre los documentos y con el solicitante verificado (Regla 3; specs/009-ingreso-
// verificado-consistencia: research.md, R4; contracts/politica.md). Funciones puras: el modelo no
// opina sobre la consistencia, solo cuenta lo que este módulo valida (Principio III).

import type { RegistroExtraccion } from "../compartido/extraccion.ts";
import {
  NOMBRE_IDENTIDAD_VERIFICADA,
  REGLAS_CONSISTENCIA,
  REGLAS_CORREGIBLES,
  type Inconsistencia,
  type ReglaConsistencia,
  type Uso,
} from "../compartido/ingreso.ts";
import { esAbonoDeNomina, extraidosUnicos, pagadorDe } from "./nomina.ts";
import {
  MAX_DIAS_PERIODO_EXTRACTO,
  PALABRAS_VACIAS_NOMBRE,
  SUFIJOS_SOCIETARIOS,
} from "./politica.ts";
import { palabras } from "./texto.ts";

type Extraido = Extract<RegistroExtraccion, { estado: "extraido" }>;

/** Igualdad de nombres como conjuntos de palabras, sin tildes, mayúsculas ni puntuación (R4). */
export function mismoNombre(a: string, b: string): boolean {
  const ordenadas = (texto: string) => palabras(texto).toSorted().join(" ");
  const izquierda = ordenadas(a);
  return izquierda !== "" && izquierda === ordenadas(b);
}

/** Las palabras de un empleador o pagador que cuentan: sin formas societarias ni palabras vacías. */
const palabrasDeEmpresa = (texto: string): string[] =>
  palabras(texto).filter(
    (palabra) =>
      !SUFIJOS_SOCIETARIOS.includes(palabra) && !PALABRAS_VACIAS_NOMBRE.includes(palabra),
  );

/**
 * Empleador y pagador coinciden si son iguales o si uno es prefijo del otro con al menos dos palabras
 * (R4). Un pagador de una sola palabra solo coincide con un empleador de una sola palabra igual.
 */
export function mismoEmpleador(empleador: string, pagador: string): boolean {
  const e = palabrasDeEmpresa(empleador);
  const p = palabrasDeEmpresa(pagador);
  if (e.length === 0 || p.length === 0) return false;
  const [corto, largo] = e.length <= p.length ? [e, p] : [p, e];
  const esPrefijo = corto.every((palabra, i) => palabra === largo[i]);
  if (!esPrefijo) return false;
  return corto.length === largo.length || corto.length >= 2;
}

const DIA_MS = 86_400_000;
const aDia = (fecha: string) => Date.parse(`${fecha}T00:00:00.000Z`) / DIA_MS;
/** Índice de mes calendario: años × 12 + mes, para contar meses entre dos fechas. */
const aMes = (fecha: string) => Number(fecha.slice(0, 4)) * 12 + Number(fecha.slice(5, 7));

interface Periodo {
  registro: Extraido;
  desde: string;
  hasta: string;
  uso: Uso;
}

const usoDe = (
  registro: Extraido,
  campo: string,
  valor: string | number,
  fragmento: string,
): Uso => ({ adjunto: registro.adjunto, nombre: registro.nombre, campo, valor, fragmento });

const usoDeIdentidad = (nombre: string): Uso => ({
  adjunto: null,
  nombre: NOMBRE_IDENTIDAD_VERIFICADA,
  campo: "nombre",
  valor: nombre,
  fragmento: null,
});

function inconsistencia(
  regla: ReglaConsistencia,
  descripcion: string,
  detiene: boolean,
  adjuntos: number[],
  valores: Uso[],
): Inconsistencia {
  return {
    regla,
    descripcion,
    detiene,
    corregible: REGLAS_CORREGIBLES.includes(regla),
    adjuntos: [...new Set(adjuntos)].toSorted((a, b) => a - b),
    valores,
  };
}

/**
 * Las inconsistencias entre los documentos y con el solicitante verificado (FR-008). Solo mira
 * registros `extraido`; un campo nulo no es una inconsistencia: queda en `sinContrastar`. La lista sale
 * en un orden estable, por regla y luego por documento, para que dos corridas den lo mismo.
 */
export function validarConsistencia({
  nombreSolicitante,
  registros,
}: {
  nombreSolicitante: string;
  registros: readonly RegistroExtraccion[];
}): { inconsistencias: Inconsistencia[]; sinContrastar: string[] } {
  const extraidos = extraidosUnicos(registros);
  const certificados = extraidos.flatMap((r) =>
    r.documento.tipo === "certificado_laboral" ? [r] : [],
  );
  const extractos = extraidos.flatMap((r) => (r.documento.tipo === "extracto_bancario" ? [r] : []));
  const inconsistencias: Inconsistencia[] = [];
  const sinContrastar: string[] = [];

  // Titular de cada extracto frente al solicitante verificado.
  for (const registro of extractos) {
    if (registro.documento.tipo !== "extracto_bancario") continue;
    const titular = registro.documento.titular;
    if (titular === null) {
      sinContrastar.push(`titular del extracto ${registro.nombre}: el documento no lo trae`);
    } else if (!mismoNombre(titular.valor, nombreSolicitante)) {
      inconsistencias.push(
        inconsistencia(
          "titular_vs_solicitante",
          "Titular del extracto frente al solicitante verificado",
          true,
          [registro.adjunto],
          [
            usoDe(registro, "titular", titular.valor, titular.procedencia.fragmento),
            usoDeIdentidad(nombreSolicitante),
          ],
        ),
      );
    }
  }

  // Empleador del certificado frente al pagador de los abonos de nómina.
  const abonos = extractos.flatMap((registro) =>
    registro.documento.tipo === "extracto_bancario"
      ? registro.documento.movimientos.flatMap((movimiento, indice) =>
          esAbonoDeNomina(movimiento) ? [{ registro, movimiento, indice }] : [],
        )
      : [],
  );
  if (certificados.length === 0 && extractos.length > 0) {
    sinContrastar.push("empleador frente al pagador: falta el certificado laboral");
  }
  if (certificados.length > 0 && extractos.length === 0) {
    sinContrastar.push("empleador frente al pagador: faltan los extractos bancarios");
  }
  if (certificados.length > 0 && extractos.length > 0 && abonos.length === 0) {
    sinContrastar.push("empleador frente al pagador: los extractos no traen abonos de nómina");
  }
  for (const certificado of certificados) {
    if (certificado.documento.tipo !== "certificado_laboral") continue;
    const empleador = certificado.documento.empleador;
    if (empleador === null) {
      sinContrastar.push(
        `empleador del certificado ${certificado.nombre}: el documento no lo trae`,
      );
      continue;
    }
    // Una inconsistencia por cada pagador distinto que no coincide con el empleador.
    const porPagador = new Map<string, typeof abonos>();
    for (const abono of abonos) {
      const clave = palabras(pagadorDe(abono.movimiento)).join(" ");
      porPagador.set(clave, [...(porPagador.get(clave) ?? []), abono]);
    }
    for (const [, deEstePagador] of porPagador) {
      const primero = deEstePagador[0];
      if (primero === undefined) continue;
      if (mismoEmpleador(empleador.valor, pagadorDe(primero.movimiento))) continue;
      inconsistencias.push(
        inconsistencia(
          "empleador_vs_pagador",
          "Empleador del certificado frente al pagador de los abonos de nómina",
          true,
          [certificado.adjunto, ...deEstePagador.map((a) => a.registro.adjunto)],
          [
            usoDe(certificado, "empleador", empleador.valor, empleador.procedencia.fragmento),
            usoDe(
              primero.registro,
              `movimientos[${primero.indice}]`,
              primero.movimiento.descripcion,
              primero.movimiento.procedencia.fragmento,
            ),
          ],
        ),
      );
    }
  }

  // Periodos de los extractos.
  const periodos: Periodo[] = [];
  for (const registro of extractos) {
    if (registro.documento.tipo !== "extracto_bancario") continue;
    const periodo = registro.documento.periodo;
    if (periodo === null) {
      sinContrastar.push(`periodo del extracto ${registro.nombre}: el documento no lo trae`);
      continue;
    }
    periodos.push({
      registro,
      desde: periodo.valor.desde,
      hasta: periodo.valor.hasta,
      uso: usoDe(
        registro,
        "periodo",
        `${periodo.valor.desde} a ${periodo.valor.hasta}`,
        periodo.procedencia.fragmento,
      ),
    });
  }
  for (const p of periodos) {
    // Cuenta los dos extremos: del 1 al 31 son 31 días.
    if (aDia(p.hasta) - aDia(p.desde) + 1 > MAX_DIAS_PERIODO_EXTRACTO) {
      inconsistencias.push(
        inconsistencia(
          "periodo_no_mensual",
          "Un extracto cubre más de un mes y no se puede promediar como un mes",
          true,
          [p.registro.adjunto],
          [p.uso],
        ),
      );
    }
  }
  for (const [i, a] of periodos.entries()) {
    for (const b of periodos.slice(i + 1)) {
      if (a.desde <= b.hasta && b.desde <= a.hasta) {
        inconsistencias.push(
          inconsistencia(
            "periodos_superpuestos",
            "Dos extractos cubren días en común: los abonos se contarían dos veces",
            true,
            [a.registro.adjunto, b.registro.adjunto],
            [a.uso, b.uso],
          ),
        );
      }
    }
  }
  const porFecha = periodos.toSorted((a, b) => a.desde.localeCompare(b.desde));
  for (const [i, anterior] of porFecha.entries()) {
    const siguiente = porFecha[i + 1];
    if (siguiente !== undefined && aMes(siguiente.desde) - aMes(anterior.hasta) > 1) {
      inconsistencias.push(
        inconsistencia(
          "huecos_entre_periodos",
          "Hay al menos un mes sin extracto entre dos extractos",
          false,
          [anterior.registro.adjunto, siguiente.registro.adjunto],
          [anterior.uso, siguiente.uso],
        ),
      );
    }
  }

  const orden = (i: Inconsistencia) => REGLAS_CONSISTENCIA.indexOf(i.regla);
  return {
    inconsistencias: inconsistencias.toSorted(
      (a, b) => orden(a) - orden(b) || (a.adjuntos[0] ?? 0) - (b.adjuntos[0] ?? 0),
    ),
    sinContrastar,
  };
}
