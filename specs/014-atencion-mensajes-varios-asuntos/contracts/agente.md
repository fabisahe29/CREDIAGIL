# Contrato: agente, orden del turno y respuesta unificada

**Archivos**: `src/agente/agente.ts`, `adaptador.ts`, `control-identidad.ts`, `respuesta-unificada.ts` (nuevo) · **Decisiones**: [R2 a R8](../research.md)

## Orden de un turno

1. **Regla 4 por código** (sin cambios en cuándo ocurre). Si el mensaje pide una persona:
   1. `detectarAsuntos(mensaje, hayDocumentosNuevos)` calcula los demás asuntos.
   2. La señal `pide_persona` se deja como hoy.
   3. El estado de cada asunto detectado es `pendiente` con `lo_revisara_el_analista` (R6).
   4. Se escala sin llamar al modelo ni a ninguna herramienta; el resumen lleva `asuntosPendientes`.
2. Si no, `esperados = detectarAsuntos(mensaje, hayDocumentosNuevos)` y se llama al modelo como hoy.
3. Durante el ciclo, el adaptador registra una observación por llamada al core (R3).
4. Al cerrar el turno se revisa la Regla 5 y la identidad, como hoy.
5. `estadoDeAsuntos` calcula el estado de cada asunto y `conversar` compone la respuesta.
6. Si hay escalamiento, se entrega el resumen con `asuntosPendientes` y se responde como en 5.

## Qué herramientas siguen tras una señal (R5)

```ts
export const HERRAMIENTAS_QUE_SIGUEN_TRAS_ESCALAR = ["calcular_capacidad_pago"] as const;
export const MOTIVOS_QUE_LO_IMPIDEN = [
  "pide_persona",
  "falla_transitoria_persistente",
  "falla_del_agente",
  "limite_de_turnos",
  "respuesta_incompleta",
] as const;
export function admiteTrasEscalar(herramienta: string, estado: EstadoConversacion): boolean;
```

- `admiteTrasEscalar` es verdadero si la herramienta es `calcular_capacidad_pago` y el motivo de la señal vigente no está en `MOTIVOS_QUE_LO_IMPIDEN`; o si es el registro bajo una señal de la Regla 3, que es lo que cubre `admiteRegistro` hoy.
- `llamarConReintentos` y el hook de identidad usan el mismo predicado. Cualquier otra herramienta sigue negándose con `MOTIVO_ESCALADA`.
- La simulación no deja señal, no emite eventos y no cambia la causa del escalamiento.

## Respuesta unificada

`componerRespuesta({ cuerpo, asuntos, regla4 }): string`

- Si `asuntos` tiene menos de dos elementos y no es la rama de la Regla 4 con algún asunto detectado, devuelve `cuerpo` sin cambios (FR-009).
- Si no, devuelve `cuerpo`, una línea en blanco y el bloque:

```text
Estado de tus asuntos:
- Solicitud: pendiente — necesito verificar tu identidad para registrarla.
- Documentos: pendiente — necesito verificar tu identidad para leerlos.
- Cuota: resuelto — cuota mensual simulada de $1.234.567. <aviso del core>
```

Una línea por asunto, en el orden del catálogo, con el nombre, el estado y una frase de una tabla fija:

| Estado | Frase |
|--------|-------|
| `resuelto` | el resultado: para la cuota, la cuota y el aviso del core; para documentos y solicitud, «listo» y, de la solicitud, su identificador |
| `escalado` | «un analista de crédito lo revisará» |
| `pendiente`, `falta_identidad` | «necesito verificar tu identidad para continuar» |
| `pendiente`, `falta_dato` | «falta un dato que debes aportar» |
| `pendiente`, `lo_revisara_el_analista` | «lo revisará el analista» |
| `pendiente`, `sin_atender` | «no pude atenderlo en esta respuesta» |

- El cuerpo es el texto del modelo en una conversación normal y `AVISOS[motivo]` más la referencia en una escalada.
- Nunca incluye citas ni el contenido de documentos. La cuota y su aviso salen de la observación, no del texto del modelo.
- Sin `any`; el estado y el asunto se resuelven con tablas indexadas por los catálogos.

## `ResultadoConversacion`

Gana `asuntos: AsuntoObservado[]`. `respuesta` lleva el bloque cuando corresponde. Los demás campos no cambian.

## Prompt

Se agregan estas indicaciones a `SYSTEM_PROMPT` (R8), sin duplicar ninguna regla de la política:

- Atiende en la misma respuesta todos los asuntos del mensaje: la solicitud, los documentos y la pregunta por la cuota.
- Si un asunto queda pendiente o se escala, sigue con los demás que no dependen de él.
- Puedes usar `calcular_capacidad_pago` aunque otro asunto ya haya pasado a un analista, salvo que el solicitante haya pedido una persona.
- No escribas una lista con el estado de cada asunto: el sistema la agrega al final.

## Logs

`asuntos_atendidos`: `{ correlationId, asuntos: [{ asunto, estado, motivo? }] }`, una vez por mensaje con dos o más asuntos. Sin cuotas, sin texto del mensaje.

## Pruebas obligatorias

- Consulta inyectada con un core falso: mensaje con los tres asuntos, con uno pendiente por dato, con uno escalado y la cuota resuelta, y con la Regla 4 más cuota.
- La Regla 4 no llama al modelo ni a ninguna herramienta, y la respuesta lista la cuota como pendiente.
- El hook y el adaptador: la simulación pasa tras las señales de las reglas 1, 2, 3 y 5 y se niega tras la Regla 4 y las técnicas; registrar, extraer, verificar y preaprobar siguen negadas.
- Un mensaje de un solo asunto da la misma respuesta que antes del cambio.
- `componerRespuesta` por cada estado y motivo.
