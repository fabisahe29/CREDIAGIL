// Solo para pruebas: métodos de ClienteCore que una prueba no simula. Se esparcen en los cores
// falsos (`{ ...CORE_NO_SIMULADO, async consultarSolicitud() { … } }`) para que agregar una
// herramienta al cliente no obligue a tocar cada prueba existente. Responden un error de negocio
// explícito, nunca un éxito inventado.

import { errorNegocio, fallo } from "../compartido/errores.ts";
import type { ClienteCore } from "./cliente-core.ts";

const noSimulado = (metodo: string) =>
  Promise.resolve(fallo<never>(errorNegocio("no_simulado", `La prueba no simula ${metodo}.`)));

export const CORE_NO_SIMULADO: Omit<ClienteCore, "consultarSolicitud" | "cerrar"> = {
  buscarSolicitante: () => noSimulado("buscarSolicitante"),
  verificarIdentidad: () => noSimulado("verificarIdentidad"),
  consultarIdentidad: () => noSimulado("consultarIdentidad"),
  registrarExtraccion: () => noSimulado("registrarExtraccion"),
  consultarExtracciones: () => noSimulado("consultarExtracciones"),
};
