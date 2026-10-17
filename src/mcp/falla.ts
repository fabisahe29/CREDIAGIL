// Falla transitoria simulada del core (FR-010; data-model.md, "Falla simulada").
// Se configura al arrancar: opción del core en las pruebas o CREDIAGIL_FALLA en la demo.
// No es una herramienta MCP: el agente no puede activarla ni verla.

export type ModoFalla = "una-vez" | "siempre";

export class ModoFallaInvalido extends Error {
  override name = "ModoFallaInvalido";
}

export function leerFalla(valor: string | undefined): ModoFalla | null {
  const limpio = (valor ?? "").trim();
  if (limpio === "") return null;
  if (limpio === "una-vez" || limpio === "siempre") return limpio;
  throw new ModoFallaInvalido(
    `CREDIAGIL_FALLA="${limpio}" no es válido: usa una-vez, siempre o déjalo vacío.`,
  );
}

export interface Falla {
  /** Verdadero si la llamada actual debe fallar; cada consulta lo pregunta una vez. */
  debeFallar(): boolean;
}

export function crearFalla(modo: ModoFalla | null): Falla {
  let llamadas = 0;
  return {
    debeFallar() {
      llamadas++;
      if (modo === "siempre") return true;
      return modo === "una-vez" && llamadas === 1;
    },
  };
}
