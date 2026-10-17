// Datos de ejemplo del core simulado. Todos ficticios (constitución, Principio II;
// docs/datos-ficticios.md): identificadores y documentos con prefijo 000, correos .example
// y nombres inventados. Montos en pesos enteros.

export type EstadoSolicitud = "en_estudio" | "anulada" | "reservada";

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
