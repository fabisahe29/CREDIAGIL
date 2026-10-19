# Modelo de datos: Atención de mensajes con varias preocupaciones

**Feature**: [spec.md](spec.md) · **Decisiones**: [research.md](research.md)

Todo vive en memoria, dentro de una conversación. Los tipos salen de catálogos cerrados; ninguno admite texto libre del modelo.

## Catálogos (`src/politica/asuntos.ts`)

| Catálogo | Valores |
|----------|---------|
| `ASUNTOS` | `solicitud` · `documentos` · `cuota` |
| `ESTADOS_ASUNTO` | `resuelto` · `pendiente` · `escalado` |

## Asunto observado

Lo que `estadoDeAsuntos` devuelve por cada asunto del turno.

| Campo | Tipo | Notas |
|-------|------|-------|
| `asunto` | uno de `ASUNTOS` | |
| `estado` | uno de `ESTADOS_ASUNTO` | |
| `resultado` | texto o ausente | Solo con `resuelto`: lo que se informa al solicitante |
| `motivo` | uno de `MOTIVOS_PENDIENTE` o ausente | Solo con `pendiente` |

`MOTIVOS_PENDIENTE` es cerrado: `falta_identidad`, `falta_dato`, `lo_revisara_el_analista`, `sin_atender`. El texto que ve el solicitante sale de una tabla fija, no del modelo.

## Observación de una llamada (estado de la conversación)

Se agrega a `EstadoConversacion`, junto a `senales`.

| Campo | Tipo | Notas |
|-------|------|-------|
| `herramienta` | texto | Nombre de la llamada al core que ya usa `llamarConReintentos`: `calcular_capacidad_pago`, `registrar_extraccion`, `registrar_solicitud`, `preaprobar_credito`, etc. |
| `ok` | booleano | Si la llamada al core salió bien |
| `codigoError` | texto o ausente | Código del error tipado |
| `simulacion` | `{ cuotaMensual, aviso }` o ausente | Solo de `calcular_capacidad_pago` con éxito |
| `faltantes` | entero o ausente | Solo de `registrar_extraccion` con éxito: cuántos campos faltan en el documento |
| `huella` | texto o ausente | Solo de `registrar_extraccion` con éxito: identifica el documento, para no contarlo dos veces al reextraer |
| `idSolicitud` | texto o ausente | Solo de `registrar_solicitud` con éxito |

No guarda entradas ni datos del solicitante. Los bloqueos por identidad ya se emiten como eventos `bloqueo_por_regla` con su `herramienta`; se leen de ahí.

## Cómo se decide el estado de cada asunto

`estadoDeAsuntos` evalúa cada asunto del conjunto del turno (los esperados más los observados) con la primera fila que aplique.

| Asunto | Condición, en orden | Estado |
|--------|---------------------|--------|
| `cuota` | `calcular_capacidad_pago` salió bien | `resuelto`, con la cuota y su aviso |
| | hubo un error de validación de la herramienta | `pendiente`, `falta_dato` |
| | hay una señal de la Regla 4 | `pendiente`, `lo_revisara_el_analista` |
| | no hubo llamada | `pendiente`, `sin_atender` |
| `documentos` | hay una señal de la Regla 5, de documento no extraíble o de inconsistencia documental | `escalado` |
| | `registrar_extraccion` salió bien al menos una vez por cada adjunto nuevo y ninguna con `faltantes` mayor que 0 | `resuelto` |
| | un evento `bloqueo_por_regla` de una herramienta de documentos | `pendiente`, `falta_identidad` |
| | un `registrar_extraccion` con éxito y `faltantes` mayor que 0 | `pendiente`, `falta_dato` |
| | hay una señal de la Regla 4 | `pendiente`, `lo_revisara_el_analista` |
| | ninguna | `pendiente`, `sin_atender` |
| `solicitud` | hay una señal de identidad, de la Regla 3 o de la Regla 2 | `escalado` |
| | `registrar_solicitud` o `preaprobar_credito` salió bien | `resuelto` |
| | un evento `bloqueo_por_regla` de registro o preaprobación | `pendiente`, `falta_identidad` |
| | hay una señal de la Regla 4 | `pendiente`, `lo_revisara_el_analista` |
| | ninguna | `pendiente`, `sin_atender` |

Una falla técnica deja el caso escalado pero no cambia el estado de cada asunto: los que no se resolvieron salen `pendiente`, `sin_atender`.

## Conjunto del turno

`asuntosDelTurno = detectarAsuntos(mensaje, hayDocumentosNuevos) ∪ asuntos observados en las herramientas`

- `documentos` es esperado si hay adjuntos que la Regla 5 aún no revisó.
- `cuota` y `solicitud` son esperados por las expresiones de la detección.
- Un asunto aparece una sola vez aunque lo vean la detección y las herramientas.

## Cambios al contrato del #15

`src/compartido/escalamiento.ts`, de forma aditiva:

| Dónde | Campo | Tipo |
|-------|-------|------|
| Entrada de `escalar_a_analista` | `asuntosPendientes` | lista de `ASUNTOS`, sin repetidos, opcional |
| `ResumenAnalista` | `asuntosPendientes` | lista de `ASUNTOS`, sin repetidos, vacía si no hay |

Sin el campo de entrada, la herramienta responde como en el #15 y el resumen sale con la lista vacía.

## Resultado de la conversación

`ResultadoConversacion` gana `asuntos`: la lista de asuntos observados del turno, vacía o de un elemento cuando el turno no tuvo varios asuntos. `tipo` y `escalamiento` no cambian.

## Validaciones

- Un asunto o un estado fuera de los catálogos es un error de programación, no se adivina.
- `asuntosPendientes` con un valor fuera del catálogo o repetido lo rechaza el core con un error de validación tipado.
- Nada de lo que contiene un asunto incluye el texto del mensaje, citas ni el contenido de los documentos (Principio VI).
