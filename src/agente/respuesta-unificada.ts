// Respuesta unificada: cuando un mensaje trae varios asuntos, la respuesta final es una sola y termina con
// el estado de cada uno (specs/014-atencion-mensajes-varios-asuntos: research.md, R4; contracts/agente.md).
// El bloque lo compone el código con frases fijas a partir del estado de cada asunto: el modelo no lo
// escribe, así que no puede decir «resuelto» de lo que no se resolvió. En una escalada el cuerpo es el aviso
// de siempre y el bloque conserva lo que ya se había resuelto, como la cuota.

import {
  ASUNTOS,
  type Asunto,
  type AsuntoObservado,
  type MotivoPendiente,
} from "../politica/asuntos.ts";

const NOMBRES: Readonly<Record<Asunto, string>> = {
  solicitud: "Solicitud",
  documentos: "Documentos",
  cuota: "Cuota",
};

const FRASES_PENDIENTE: Readonly<Record<MotivoPendiente, string>> = {
  falta_identidad: "necesito verificar tu identidad para continuar",
  falta_dato: "falta un dato que debes aportar",
  lo_revisara_el_analista: "lo revisará el analista",
  sin_atender: "no pude atenderlo en esta respuesta",
};

const FRASE_ESCALADO = "un analista de crédito lo revisará";

const conPunto = (frase: string): string => (frase.endsWith(".") ? frase : `${frase}.`);

/** La frase de un asunto según su estado; un estado sin su dato (`resultado` o `motivo`) es un error de programación. */
function frase(asunto: AsuntoObservado): string {
  switch (asunto.estado) {
    case "resuelto":
      return asunto.resultado ?? "listo";
    case "escalado":
      return FRASE_ESCALADO;
    case "pendiente":
      return FRASES_PENDIENTE[asunto.motivo ?? "sin_atender"];
  }
}

export interface EntradaRespuesta {
  /** El texto del modelo, o el aviso de escalamiento con su referencia. */
  cuerpo: string;
  asuntos: readonly AsuntoObservado[];
  /** Si el caso escaló por la petición de una persona antes del modelo: con un solo asunto ya basta. */
  regla4: boolean;
}

/**
 * La respuesta final del mensaje. Con menos de dos asuntos devuelve el cuerpo sin cambios, y en la rama
 * de la Regla 4 con uno solo ya agrega el bloque, porque esos asuntos no se atenderán. Si no, agrega
 * «Estado de tus asuntos» con una línea por asunto, en el orden del catálogo. Pura y determinista.
 */
export function componerRespuesta({ cuerpo, asuntos, regla4 }: EntradaRespuesta): string {
  if (asuntos.length < (regla4 ? 1 : 2)) return cuerpo;
  const lineas = ASUNTOS.flatMap((nombre) =>
    asuntos
      .filter((asunto) => asunto.asunto === nombre)
      .map((asunto) => `- ${NOMBRES[nombre]}: ${asunto.estado} — ${conPunto(frase(asunto))}`),
  );
  return [cuerpo, "", "Estado de tus asuntos:", ...lineas].join("\n");
}
