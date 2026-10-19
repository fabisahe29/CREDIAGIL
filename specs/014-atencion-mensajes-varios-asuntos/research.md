# Research: Atención de mensajes con varias preocupaciones

**Feature**: [spec.md](spec.md) · **Plan**: [plan.md](plan.md)

La spec no deja ningún `NEEDS CLARIFICATION`. Esta fase fija los hechos del repositorio que condicionan el diseño y decide cómo cumplir cada requisito.

## Hechos del repositorio

| # | Hecho | Dónde |
|---|-------|-------|
| H1 | Cada mensaje es un solo `query()` del Agent SDK: el modelo encadena herramientas hasta `end_turn` o hasta `MAX_TURNOS = 8`. Ya puede atender varios asuntos, pero nada lo exige ni lo verifica. | `src/agente/agente.ts` |
| H2 | Con una señal de escalamiento vigente, el hook de identidad y `llamarConReintentos` niegan **toda** herramienta. La única excepción es `registrar_solicitud` con una señal de la Regla 3. | `control-identidad.ts` (línea 188), `adaptador.ts` (línea 562) |
| H3 | La respuesta de una conversación escalada es `AVISOS[motivo]` más la referencia; el texto del modelo se descarta. | `agente.ts` (`escalar`) |
| H4 | La Regla 4 se decide por código antes de llamar al modelo. Si coincide, no hay modelo que conozca los demás asuntos del mensaje. | `agente.ts` (`detectarPeticionPersona`) |
| H5 | `calcular_capacidad_pago` es de solo lectura: no exige identidad, no deja señal ni emite eventos. Su resultado trae `cuotaMensual`, `relacionCuotaIngresoPorcentaje` y un `aviso` que pone el código. El core exige monto, plazo e ingreso. | `adaptador.ts`, `compartido/capacidad-pago.ts` |
| H6 | `escalar_a_analista` guarda un solo escalamiento por conversación y valida entrada y resumen con `strictObject` de Zod: un campo nuevo exige cambiar los esquemas. | `mcp/core-simulado.ts`, `compartido/escalamiento.ts` |
| H7 | El chat imprime `respuesta` tal cual y el resumen del analista solo en `--demo`. | `chat/chat.ts` |
| H8 | El mensaje de ejemplo del enunciado lo entregó el desarrollador durante la planificación y está citado en la spec (historia 4). Plantea tres asuntos: solicitud de $4.000.000 a 24 meses, certificado y extractos, y la pregunta por la cuota con ingreso declarado de $3.500.000. | [spec.md](spec.md) |

## R1. Un asunto es una categoría cerrada de tres, con un estado cerrado de tres

**Decisión**: los asuntos son `solicitud`, `documentos` y `cuota`, y su estado es `resuelto`, `pendiente` o `escalado`. Viven en `src/politica/asuntos.ts` como catálogos y tipos, igual que las causas y las acciones del #15.

**Motivo**: la spec limita los asuntos a lo que el agente ya sabe atender (Assumptions) y exige un estado por asunto (FR-003). Un catálogo cerrado se prueba fila por fila y no admite texto libre del modelo (Principio III).

**Alternativas descartadas**: asuntos como texto libre que redacta el modelo, porque no se puede verificar que ninguno se pierda; un cuarto asunto «petición de persona», porque esa petición no es un asunto que se resuelva sino la causa que escala todo el caso.

## R2. Los asuntos esperados se detectan por código y se unen a los observados

**Decisión**: `detectarAsuntos(mensaje, hayDocumentosNuevos)` devuelve los asuntos que el mensaje plantea, con listas cerradas de expresiones, normalizadas igual que `detectarPeticionPersona`. `documentos` sale de que haya adjuntos que la Regla 5 aún no revisó; `cuota` y `solicitud` salen de expresiones. El conjunto del turno es esos asuntos más los que las herramientas muestran que se atendieron.

**Motivo**: FR-001 y el escenario 3 de US1 piden que ningún asunto quede sin atender ni sin mencionar. Si solo contaran las herramientas que llamó el modelo, un asunto que olvidó desaparecería. Con el conjunto esperado, un asunto sin resultado sale como `pendiente`. La detección es conservadora, como la de la Regla 4: lo que no reconoce no inventa un asunto, y lo que el modelo sí atendió aparece igual por sus herramientas.

**Alternativas descartadas**: una herramienta `declarar_asuntos` que el modelo llame primero, porque depende de que la llame y no sirve en la Regla 4, donde no hay modelo; clasificar el mensaje con una llamada previa al modelo, que no es determinista y rompe «sin investigar» de la Regla 4.

## R3. El estado de cada asunto lo deduce una función pura con lo que el adaptador observó

**Decisión**: el adaptador registra en el estado de la conversación un resumen de cada llamada (herramienta, si salió bien y el código de error) y, de `calcular_capacidad_pago`, la cuota y su aviso. `estadoDeAsuntos` en la política recibe esas observaciones, las señales de escalamiento y los asuntos esperados, y devuelve un estado por asunto con su resultado o su motivo. La tabla está en [data-model.md](data-model.md).

**Motivo**: el estado es una decisión sobre el caso, así que va en código (Principio III). Se registra en un solo punto, `llamarConReintentos`, que ya ve todas las llamadas al core, y en los eventos `bloqueo_por_regla` del hook, que ya existen.

**Alternativas descartadas**: que el modelo escriba el estado de cada asunto, porque puede decir «resuelto» sin haberlo estado; instrumentar cada manejador de herramienta, que repite la misma lógica diez veces.

## R4. La respuesta es una sola y su bloque de estado lo compone el código

**Decisión**: cuando el turno tiene dos o más asuntos, la respuesta final es el cuerpo más un bloque «Estado de tus asuntos» con una línea por asunto. El cuerpo es el texto del modelo en una conversación normal y `AVISOS[motivo]` en una escalada, como hoy. Con un solo asunto no se agrega nada (FR-009). El formato está en [contracts/agente.md](contracts/agente.md).

**Motivo**: FR-002 y FR-003. En una escalada el texto del modelo se descarta (H3) y con él la cuota que ya calculó; el bloque la conserva porque sale de la observación del código, no del texto del modelo. Puede repetir algo que el modelo ya dijo, y se acepta: el bloque es la fuente de verdad del estado.

**Alternativas descartadas**: reemplazar siempre el texto del modelo por el bloque, que cambia la respuesta de los mensajes de un solo asunto; pedirle al modelo que arme el resumen de estados, que no es verificable; una respuesta por asunto, que incumple FR-002.

## R5. Tras escalar, la simulación de cuota sigue permitida

**Decisión**: una señal vigente sigue negando toda herramienta, salvo `calcular_capacidad_pago` cuando la señal no es de la Regla 4 ni una falla técnica. Es una constante junto a `MOTIVOS_QUE_ADMITEN_REGISTRO`, y el hook y `llamarConReintentos` usan el mismo predicado.

**Motivo**: FR-004 pide resolver los asuntos independientes aunque otro se escale, y H2 lo impide hoy. La simulación es de solo lectura, no decide ni registra (H5), así que no relaja ninguna regla (FR-007): la señal sigue siendo la que decide el caso. Con la Regla 4 queda negada (R6), y con una falla técnica también, porque el core no responde.

**Alternativas descartadas**: permitir todas las herramientas tras una señal, que dejaría extraer documentos o registrar con el caso ya escalado; negar la cuota también tras la Regla 5, que deja sin respuesta una pregunta que la política sí cubre; resolver la cuota antes de escalar con un orden fijo de herramientas, que depende del modelo.

## R6. Con la Regla 4, los demás asuntos quedan pendientes para el analista

**Decisión**: en la rama que escala antes del modelo, `detectarAsuntos` se ejecuta sobre el mensaje. Cada asunto detectado sale `pendiente` con la nota «lo revisará el analista», y la respuesta es `AVISOS.pide_persona` más ese bloque. No se llama a ninguna herramienta ni al modelo.

**Motivo**: es la aclaración de esta sesión (FR-006). La detección es una función pura sobre el texto, no investiga ni extrae datos, así que respeta la Regla 4. Cuando el mensaje solo pide una persona, no hay otros asuntos y la respuesta es la del #15.

**Alternativas descartadas**: llamar al modelo solo para listar los asuntos, que no es «sin investigar»; callar los demás asuntos, que deja al solicitante sin saber qué pasó con ellos.

## R7. El resumen del analista lleva los asuntos pendientes

**Decisión**: `escalar_a_analista` acepta un campo opcional `asuntosPendientes` (lista cerrada de asuntos, sin repetidos) y el resumen lo guarda, vacío por defecto. El agente lo arma con los asuntos en estado `pendiente` al escalar. Los asuntos `escalado` no se repiten: ya los cubren la causa y las causas adicionales.

**Motivo**: la aclaración dice que la pregunta por la cuota queda en el resumen para el analista. Sin este campo el analista no sabría que el solicitante preguntó algo. El cambio es aditivo: sin el campo, la herramienta funciona como en el #15. Como el core guarda un solo escalamiento por conversación (H6), el campo se fija al primer escalamiento.

**Alternativas descartadas**: mezclarlo en `pendientes`, que hoy son datos que faltan del caso (identidad, monto…) y no preguntas del solicitante; guardarlo solo en el log, que no es un contrato para el analista.

## R8. El prompt guía y el código garantiza

**Decisión**: el prompt agrega cuatro indicaciones: atender en el mismo turno todos los asuntos del mensaje, seguir con los independientes si uno queda pendiente o escalado, usar `calcular_capacidad_pago` aunque otro asunto haya escalado, y no escribir una lista de estados porque la agrega el sistema. Ninguna es la única barrera de nada.

**Motivo**: coherente con #9 a #15: el modelo guía, el código decide. Si el modelo no sigue la indicación, el asunto aparece `pendiente` en el bloque, no desaparece.

**Alternativas descartadas**: dejar el prompt como está, porque sin la indicación el modelo tiende a contestar un asunto por turno.

## R9. El mensaje de ejemplo y los casos de prueba

**Decisión**: tres casos nuevos en `casos/`, con datos ficticios:

- `mensaje-varios-asuntos`: el mensaje literal del enunciado (H8) con el certificado laboral y los tres extractos adjuntos. Es el caso de prueba 1. Se arma con documentos ficticios ya existentes de `casos/`.
- `mensaje-varios-asuntos-con-persona`: pide una persona y pregunta por la cuota (FR-006).
- `mensaje-varios-asuntos-escalado`: un solo mensaje con el sueldo en dólares: la solicitud escala por la Regla 5 y la pregunta por la cuota se resuelve (FR-004). No lleva adjuntos porque en el chat cada adjunto es un turno propio y la Regla 5 escalaría antes del mensaje.

**Motivo**: el criterio de aceptación habla del mensaje del enunciado, así que el caso usa su texto exacto, sin parafrasear. Los otros dos casos son nuestros y cubren FR-006 y FR-004. El quickstart los ejecuta con el modelo real.

**Alternativas descartadas**: parafrasear el mensaje del enunciado, porque ya no se podría decir que se cumple con él; no crear casos y probar solo con pruebas unitarias, porque el criterio es un comportamiento de conversación.

## R10. El límite de turnos no cambia

**Decisión**: `MAX_TURNOS` sigue en 8.

**Motivo**: el caso más largo (buscar, verificar identidad, extraer y verificar ingreso, registrar y responder) cabe en 5 o 6 turnos porque el modelo puede pedir varias herramientas a la vez. Si se agotara, el caso escala por `limite_de_turnos`, que es el comportamiento seguro de hoy.

**Alternativas descartadas**: subirlo a 12, que alarga el costo y la espera de cualquier conversación que se cicle sin necesidad. Se vigila en el quickstart; si falla, se decide con evidencia.

## R11. Observabilidad

**Decisión**: un log `asuntos_atendidos` por mensaje con `correlationId`, y por cada asunto su nombre y su estado, sin cuotas ni datos del solicitante. Las decisiones de política siguen dejando su auditoría como hasta ahora (FR-010).

**Motivo**: Principio VI. Un solo `query()` por mensaje ya mantiene un único `correlationId`. No se agrega un evento de negocio al catálogo: la respuesta ya lleva el bloque.

**Alternativas descartadas**: un evento de negocio nuevo, que amplía el catálogo del chat sin que el chat lo necesite.

## R12. Pruebas

**Decisión**: todo sin red ni modelo, como el #15.

- Política: `detectarAsuntos` y `estadoDeAsuntos` fila por fila, con las negaciones y los mensajes de un solo asunto.
- Respuesta unificada: el formato por estado y que con un solo asunto no se agrega nada.
- Adaptador y hook: `calcular_capacidad_pago` se admite tras las señales de las reglas 1, 2, 3 y 5 y se niega tras la Regla 4 y las técnicas; el resto de herramientas sigue negado.
- Core y servidor: `asuntosPendientes` aceptado, validado y devuelto; sin él, igual que antes.
- Agente: consulta inyectada con un core falso para los tres escenarios de casos, y la Regla 4 sin llamar al modelo.
- Los casos de las reglas de negocio del #9 al #15 se vuelven a ejecutar sin cambios (SC-005).

**Motivo**: la constitución exige las pruebas de bordes de la política y los escenarios de punta a punta; el modelo real solo entra en el quickstart.
