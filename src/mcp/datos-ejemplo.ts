// Datos de ejemplo del core simulado. Todos ficticios (constitución, Principio II;
// docs/datos-ficticios.md): identificadores y documentos con prefijo 000, correos .example
// y nombres inventados. Montos en pesos enteros.

export type EstadoSolicitud = "en_estudio" | "preaprobada" | "anulada" | "reservada";

export interface Solicitud {
  idSolicitud: string;
  solicitante: { nombre: string; documento: string; correo: string };
  monto: number;
  plazoMeses: number;
  estado: EstadoSolicitud;
  creadaEn: string;
}

/** Identificadores de ejemplo, uno por caso, para las pruebas y el quickstart. */
export const ID_EN_ESTUDIO = "SOL-0001000001";
export const ID_ANULADA = "SOL-0001000002";
export const ID_RESERVADA = "SOL-0001000003";
/** Formato válido, pero no existe: la consulta devuelve un éxito vacío. */
export const ID_INEXISTENTE = "SOL-0009999999";

/**
 * Solicitante registrado en el core (specs/007-verificacion-identidad, data-model.md).
 * `fechaExpedicion` es el dato de verificación: nunca sale del core.
 */
export interface Solicitante {
  idSolicitante: string;
  nombre: string;
  documento: string;
  /** AAAA-MM-DD. */
  fechaExpedicion: string;
  correo: string;
}

/** Casos de identificación (FR-017 del #9). */
export const ID_SOLICITANTE_UNICO = "CLI-0001000001";
export const ID_HOMONIMO_1 = "CLI-0001000002";
export const ID_HOMONIMO_2 = "CLI-0001000003";
/** Formato válido, pero sin solicitante: la búsqueda devuelve cero coincidencias. */
export const DOCUMENTO_SIN_COINCIDENCIAS = "0009090909";
export const NOMBRE_SIN_COINCIDENCIAS = "Nadie Registrado Ficticio";

export const SOLICITANTES_EJEMPLO: readonly Solicitante[] = [
  {
    idSolicitante: ID_SOLICITANTE_UNICO,
    nombre: "Ana Pérez Ficticia",
    documento: "0001234567",
    fechaExpedicion: "2012-05-14",
    correo: "ana.perez@cliente.example",
  },
  {
    idSolicitante: ID_HOMONIMO_1,
    nombre: "Elena Martínez Inventada",
    documento: "0002020202",
    fechaExpedicion: "2009-08-21",
    correo: "elena.martinez.uno@cliente.example",
  },
  {
    idSolicitante: ID_HOMONIMO_2,
    nombre: "Elena Martínez Inventada",
    documento: "0003030303",
    fechaExpedicion: "2015-11-03",
    correo: "elena.martinez.dos@cliente.example",
  },
];

export const SOLICITUDES_EJEMPLO: readonly Solicitud[] = [
  {
    idSolicitud: ID_EN_ESTUDIO,
    solicitante: {
      nombre: "Ana Pérez Ficticia",
      documento: "0001234567",
      correo: "ana.perez@cliente.example",
    },
    monto: 3_500_000,
    plazoMeses: 24,
    estado: "en_estudio",
    creadaEn: "2026-10-01T10:00:00.000Z",
  },
  {
    idSolicitud: ID_ANULADA,
    solicitante: {
      nombre: "Bruno Gómez Inventado",
      documento: "0007654321",
      correo: "bruno.gomez@cliente.example",
    },
    monto: 2_000_000,
    plazoMeses: 12,
    estado: "anulada",
    creadaEn: "2026-09-15T15:30:00.000Z",
  },
  {
    idSolicitud: ID_RESERVADA,
    solicitante: {
      nombre: "Carla Ruiz Supuesta",
      documento: "0001112223",
      correo: "carla.ruiz@cliente.example",
    },
    monto: 4_800_000,
    plazoMeses: 36,
    estado: "reservada",
    creadaEn: "2026-10-10T08:45:00.000Z",
  },
];
