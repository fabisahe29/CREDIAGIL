// Módulo único de política de crédito (constitución, Principio I; specs/007-verificacion-identidad,
// research.md, R5). Es la única fuente de los límites de las reglas de negocio: ningún otro archivo
// los repite como literal. Los umbrales de monto, cuota e ingreso y la tasa llegan con el #12 y el #14.

/** Versión de la política; acompaña cada decisión para poder auditarla. */
export const VERSION_POLITICA = "2026-10-17.1";

/** Regla 1: intentos fallidos de verificación de identidad antes de bloquearla (aclaración Q2 del #9). */
export const MAX_INTENTOS_VERIFICACION = 3;
