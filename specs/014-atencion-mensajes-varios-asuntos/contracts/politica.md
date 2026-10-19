# Contrato: módulo de política, asuntos del mensaje

**Archivo**: `src/politica/asuntos.ts` · **Pruebas**: `src/politica/asuntos.test.ts` · **Decisiones**: [R1, R2, R3 y R6](../research.md)

Funciones puras: no llaman al modelo, no leen el core y no tienen estado. No repiten ningún umbral de `politica.ts`.

## Exportaciones

```ts
export const ASUNTOS = ["solicitud", "documentos", "cuota"] as const;
export type Asunto = (typeof ASUNTOS)[number];

export const ESTADOS_ASUNTO = ["resuelto", "pendiente", "escalado"] as const;
export type EstadoAsunto = (typeof ESTADOS_ASUNTO)[number];

export const MOTIVOS_PENDIENTE = [
  "falta_identidad",
  "falta_dato",
  "lo_revisara_el_analista",
  "sin_atender",
] as const;
export type MotivoPendiente = (typeof MOTIVOS_PENDIENTE)[number];

export interface AsuntoObservado {
  asunto: Asunto;
  estado: EstadoAsunto;
  resultado?: string;
  motivo?: MotivoPendiente;
}
```

## `detectarAsuntos(mensaje, hayDocumentosNuevos): Asunto[]`

Los asuntos que plantea el mensaje, en el orden del catálogo y sin repetidos.

- `documentos` se devuelve si `hayDocumentosNuevos` es verdadero, sin mirar el texto.
- `cuota` y `solicitud` salen de listas cerradas de expresiones, con el mismo tratamiento de tildes, mayúsculas y signos que `detectarPeticionPersona`.
- Una negación inmediata («no quiero un crédito») descarta la expresión, como en la Regla 4.
- Es conservadora: ante la duda no devuelve el asunto.

| Entrada | Salida |
|---------|--------|
| «¿Cuánto pagaría al mes por 4 millones a 24 meses?» | `["cuota"]` |
| «Quiero un crédito, te adjunto mi certificado» con adjuntos nuevos | `["solicitud", "documentos"]` |
| «Quiero un crédito y saber la cuota», con adjuntos nuevos | los tres |
| «Hola» | `[]` |
| El mensaje del enunciado: «Hola, quiero pedir un crédito de $4.000.000 a 24 meses. Te pego mi certificado laboral y mis extractos de los últimos tres meses. Gano más o menos $3.500.000 al mes. ¿En cuánto me quedaría la cuota?» con adjuntos nuevos | los tres: «pedir un crédito» → `solicitud`, adjuntos → `documentos`, «la cuota» → `cuota` |
| «No quiero un crédito, solo dime la cuota» | `["cuota"]` |

## `estadoDeAsuntos(entrada): AsuntoObservado[]`

```ts
interface EntradaEstado {
  esperados: readonly Asunto[];
  /** Adjuntos que la Regla 5 aún no había revisado al empezar el turno. */
  documentosNuevos: number;
  observaciones: readonly {
    herramienta: string;
    ok: boolean;
    codigoError?: string;
    simulacion?: { cuotaMensual: number; aviso: string };
    faltantes?: number;
  }[];
  bloqueosPorIdentidad: readonly string[]; // herramientas bloqueadas por la Regla 1
  senales: readonly { motivo: MotivoEscalamiento }[];
}
```

Devuelve un `AsuntoObservado` por cada asunto del conjunto (esperados más los que muestran las observaciones), en el orden del catálogo, aplicando la tabla de [data-model.md](../data-model.md#cómo-se-decide-el-estado-de-cada-asunto).

Invariantes:

- Un asunto aparece una sola vez.
- `resultado` solo con `resuelto`, y para `cuota` incluye la cuota y el aviso que devolvió el core.
- `motivo` solo con `pendiente`.
- La señal de la Regla 4 deja todos los asuntos en `pendiente` con `lo_revisara_el_analista`, sin mirar las observaciones.
- No decide el escalamiento: lo lee de las señales.

## `asuntosPendientes(asuntos): Asunto[]`

Los asuntos en estado `pendiente`, en el orden del catálogo. Es lo que el agente envía a `escalar_a_analista`.

## Pruebas obligatorias

- Cada fila de la tabla de estado, con cada asunto.
- La detección con tildes, mayúsculas y negaciones, y los mensajes sin asuntos.
- El mensaje literal del enunciado devuelve los tres asuntos.
- Un mensaje de un solo asunto devuelve un solo elemento.
- La Regla 4 con y sin asuntos detectados.
