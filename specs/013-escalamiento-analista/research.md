# Research: Escalamiento con criterio y handoff al analista

**Feature**: [spec.md](spec.md) · **Plan**: [plan.md](plan.md) · **Fecha**: 2026-10-18

Hechos verificados en el repositorio (rama `15-escalamiento-con-criterio-y-handoff-al`, sobre `56574f3`), seguidos de las decisiones R1–R14. No hay dependencias nuevas, así que no se investigó el SDK de nuevo: se reutilizan las versiones del #14.

## Hechos de partida

- **Escalamiento acotado del #9** ([adaptador.ts](../../src/agente/adaptador.ts)): la herramienta `solicitar_analista` recibe del modelo un motivo tipado (`pide_persona`, o `caso_no_cubierto` con su causa) y el código deja la señal. Desde ahí, el hook de identidad ([control-identidad.ts](../../src/agente/control-identidad.ts)) niega toda herramienta, salvo el registro tras una señal de la Regla 3.
- **Doce motivos de señal**: `SenalEscalamiento.motivo` tiene hoy doce valores. Siete llevan regla de negocio en `ORDEN_REGLA` (la 4, la 5, la 1 con las dos de identidad, la 3 con las dos documentales de ingreso, y la 2). Los otros cinco no: las cuatro fallas técnicas (`falla_transitoria_persistente`, `falla_del_agente`, `limite_de_turnos`, `respuesta_incompleta`) y `documento_no_extraible`, que cita el Principio V.
- **`dejarSenal` guarda una sola señal**: la primera, salvo que una de una regla anterior en el orden 4 → 5 → 1 → 3 → 2 la reemplace (`prevalece`). La señal que pierde se descarta sin dejar rastro, así que hoy no hay forma de registrar «todas las causas» (FR-008).
- **No hay resumen para el analista**: `escalar()` de [agente.ts](../../src/agente/agente.ts) compone el aviso (`AVISOS`) y el evento `escalamiento` con valores técnicos. Los avisos dicen «te contactará», que es una promesa de contacto, no «revisará tu caso» (FR-009).
- **El core no tiene herramienta de escalamiento.** Guarda por conversación la identidad, las extracciones, la verificación de ingreso y la solicitud registrada ([core-simulado.ts](../../src/mcp/core-simulado.ts)). La constitución (Principio IV) nombra «escalar a analista» entre las herramientas MCP, y [servidor-mcp.md](../../.claude/rules/servidor-mcp.md) exige clave de idempotencia para «escalar».
- **La Regla 4 hoy depende del modelo.** El prompt le dice que llame a `solicitar_analista`, pero nada impide que busque antes al solicitante. El comentario del #9 en el issue lo deja explícito: «hoy el modelo podría buscar al solicitante antes de clasificar».
- **La precedencia 4 sobre 5 ya está** en `prevalece` y `dejarSenal`. Falta una prueba de las dos aplicando en el mismo turno, y comprobar que `revisarRegla5AlCerrarTurno` no pisa una señal de la Regla 4.
- **Los bloqueos de la Regla 2** (hook de [control-preaprobacion.ts](../../src/agente/control-preaprobacion.ts)) dejan la señal `preaprobacion_fuera_de_politica` con el `codigo` de la decisión, para los cinco códigos: `monto_sobre_tope`, `cuota_sobre_porcentaje`, `discrepancia_registrada`, `ingreso_no_verificado` y `cuota_no_calculable`.
- **El chat ya cierra la conversación** con el evento `escalamiento` ([sesion.ts](../../src/chat/sesion.ts)) y ya muestra `[ESCALAMIENTO]` y «ESCALADA A ANALISTA» ([presentacion.ts](../../src/chat/presentacion.ts)). El indicador visible de FR-010 existe; falta que diga la causa.
- **Datos faltantes y homónimos** ya se resuelven sin escalar: un documento incompleto emite `solicitud_de_dato` y la primera búsqueda ambigua pide el documento. La ambigüedad escala solo si sigue en un turno posterior.
- **Casos de demostración**: hay casos para la cuota alta (`preaprobacion-cuota-alta`), el ingreso inflado (`ingreso-inflado`, `registro-discrepancia`) y la identidad no verificable, pero ninguno para la petición de persona (caso de prueba 6).
- `VERSION_POLITICA` vale `2026-10-18.3`.

## R1: dos niveles de clasificación, la causa cerrada y el motivo

**Decisión**: el resumen lleva una `causa` de las cinco de la spec (`peticion_de_persona`, `monto_sobre_umbral`, `cuota_sobre_porcentaje`, `discrepancia_de_ingreso`, `caso_no_cubierto`) y, además, el `motivo` preexistente de la señal (los doce) y el `codigo` de la Regla 2 cuando lo hay. La causa sale del motivo y del código con una función pura de la política, `causaDeEscalamiento`; nadie la escribe a mano.

**Motivo**: la spec fija cinco causas y dice que lo que no encaje se escala como «no cubierto por la política» (Assumptions). Pero el código ya escala por siete razones más: identidad ambigua o no verificable, documento no extraíble, inconsistencia documental y fallas técnicas. Llamar «no cubierto» a una falla técnica sin más sería engañar al analista. El `motivo` conserva el detalle exacto sin ampliar el conjunto de causas.

**Correspondencia**:

| Motivo de la señal | Código | Causa |
|--------------------|--------|-------|
| `pide_persona` | | `peticion_de_persona` |
| `preaprobacion_fuera_de_politica` | `monto_sobre_tope` | `monto_sobre_umbral` |
| `preaprobacion_fuera_de_politica` | `cuota_sobre_porcentaje` | `cuota_sobre_porcentaje` |
| `preaprobacion_fuera_de_politica` | `discrepancia_registrada` | `discrepancia_de_ingreso` |
| `discrepancia_de_ingreso` | | `discrepancia_de_ingreso` |
| `preaprobacion_fuera_de_politica` | `ingreso_no_verificado`, `cuota_no_calculable` | `caso_no_cubierto` |
| `caso_no_cubierto` | | `caso_no_cubierto` |
| `inconsistencia_documental`, `documento_no_extraible` | | `caso_no_cubierto` |
| `identidad_ambigua`, `identidad_no_verificable` | | `caso_no_cubierto` |
| `falla_transitoria_persistente`, `falla_del_agente`, `limite_de_turnos`, `respuesta_incompleta` | | `caso_no_cubierto` |

**Alternativas descartadas**: ampliar el conjunto de causas con identidad, documentos y fallas técnicas, porque cambia FR-006 y la spec ya clarificada; dejar el motivo fuera del resumen, porque el analista perdería por qué quedó «no cubierto».

**Pendiente de confirmar**: si el equipo prefiere causas propias para identidad y fallas técnicas, es una enmienda de FR-006 y de esta tabla; el resto del diseño no cambia.

## R2: la acción recomendada sale de un catálogo cerrado de la política

**Decisión**: `accionRecomendada({ motivo, codigo })` devuelve una de siete acciones. Las cuatro primeras son las de la aclaración Q2; las otras tres cubren los motivos que Q2 no nombra.

| Acción | Cuándo |
|--------|--------|
| `contactar_al_solicitante` | `pide_persona` |
| `revisar_con_simulacion_de_cuota` | monto o cuota por encima, y `cuota_no_calculable` |
| `verificar_ingresos_con_soporte` | discrepancia de ingreso |
| `revisar_tipo_de_documento_o_moneda` | `caso_no_cubierto` |
| `revisar_documentos_manualmente` | `inconsistencia_documental`, `documento_no_extraible`, `ingreso_no_verificado` |
| `verificar_identidad_manualmente` | `identidad_ambigua`, `identidad_no_verificable` |
| `atender_falla_tecnica` | las cuatro fallas técnicas |

**Motivo**: FR-006 pide una acción fija por causa, no redactada por el agente. Con una sola acción por causa, a una falla técnica le tocaría «revisar tipo de documento o moneda», que no tiene sentido. Las tres extra son la mínima ampliación para que la recomendación sea cierta.

**Alternativas descartadas**: una sola acción genérica («revisar el caso»), que la aclaración Q2 descartó; que el modelo la redacte, porque no sería reproducible ni auditable.

## R3: el core arma el resumen con lo que ya sabe

**Decisión**: la entrada de `escalar_a_analista` lleva solo la clasificación (`causa`, `motivo`, `codigo`, las causas adicionales) y la clave de idempotencia. El core arma todo lo demás de su propio estado: solicitante, solicitud registrada, ingreso declarado y verificado, discrepancias, datos extraídos con su procedencia, la decisión de la Regla 2 y los pendientes. Valida el resultado con `esquemaResumenAnalista` antes de guardarlo.

Una excepción: el monto y el plazo dichos por el solicitante cuando todavía no hay solicitud registrada (las reglas 4 y 5 escalan antes de identificar), con su procedencia (R4).

**Motivo**: es el mismo principio de #13 y #14: el modelo y el adaptador no transcriben datos que el core ya tiene, así que no pueden alterarlos. El analista recibe lo que el sistema guardó, no lo que el modelo cree recordar (Principio III).

**Interpretación del criterio**: el issue dice que `escalar_a_analista` «recibe un resumen estructurado y validado». Aquí lo recibe en el sentido de que la herramienta produce, valida y entrega el resumen completo; el contrato de entrada no exige que el llamador lo componga. Un resumen compuesto por el llamador obligaría a cuatro lecturas previas al core justo cuando escalar no puede fallar (R7).

**Alternativas descartadas**: que el adaptador componga el resumen entero y el core solo lo valide, porque duplica lecturas y deja al llamador alterar datos que el core ya tiene; que el modelo lo redacte, porque puede inventar.

## R4: una herramienta nueva del core, y `solicitar_analista` gana monto y plazo con cita

**Decisión**: el core suma `escalar_a_analista` (efecto, idempotente) y `consultar_escalamiento` (solo lectura). El modelo sigue usando `solicitar_analista`, sin cambiar de nombre: la herramienta clasifica y el código entrega al core al cerrar el turno (R7). `solicitar_analista` acepta además `monto`, `plazoMeses` y `origen` (la cita literal de cada uno), igual que `registrar_solicitud`.

**Motivo**: las reglas 4 y 5 escalan antes de identificar, así que nunca hay una solicitud registrada con monto y plazo. Sin esos dos datos, el resumen de esos casos saldría sin ellos y el criterio «monto y plazo» fallaría justo ahí. La cita se comprueba contra lo que dijo el solicitante con `armarProcedencia` del #13. Si no pasa, el dato queda como pendiente y el escalamiento sigue (no falla).

**Alternativas descartadas**: renombrar `solicitar_analista` a `escalar_a_analista`, porque rompe el prompt y las pruebas del #9 por un nombre; extraer monto y plazo con un subagente, que añade una llamada al modelo en el camino de la Regla 4.

## R5: la Regla 4 se detecta por código antes de llamar al modelo

**Decisión**: `detectarPeticionPersona(mensaje)`, función pura de la política, se evalúa en `conversar` **antes** de `query()`. Si detecta una petición explícita, deja la señal `pide_persona` y no llama al modelo: no hay búsqueda, extracción ni clasificación de documentos. Una negación inmediata («no quiero hablar con una persona») no coincide y decide el modelo.

**Motivo**: FR-003 y FR-007 piden que la Regla 4 no dependa de que el modelo respete el orden. Un hook solo puede negar herramientas, no saber qué pidió el solicitante, así que la única forma de garantizar «sin invocar otras herramientas antes» es decidir antes del modelo. Ante la duda se escala de más, no de menos (Principio V).

**Límites aceptados**: una paráfrasis que la lista no reconozca llega al modelo, que sigue con el prompt y `solicitar_analista`. Es el comportamiento de hoy, no una regresión, y se documenta como riesgo.

**Alternativas descartadas**: pedirle al modelo una clasificación previa en una llamada aparte, que agrega un modelo en el camino de la Regla 4 y no es determinista; un hook que obligue a llamar primero a `solicitar_analista`, que no puede saber si hay una petición.

## R6: las causas se acumulan

**Decisión**: `EstadoConversacion` suma `senales`, la lista de todas las señales observadas en el turno. `dejarSenal` agrega cada una, también la que pierde por precedencia o por llegar segunda, sin repetir motivo y código. La principal sigue siendo `estado.escalamiento`; las demás van como `causasAdicionales`.

**Motivo**: FR-008 pide registrar todas las causas y usar como principal la de mayor precedencia. Hoy la señal perdedora se descarta; con la lista no se pierde información (Principio V).

**Alternativas descartadas**: leer las causas adicionales de los logs, que no son un contrato; reevaluar todas las reglas al cerrar el turno, que repite lecturas y reglas.

## R7: la entrega al analista no puede fallar

**Decisión**: al cerrar un turno escalado, `conversar` llama a `entregarHandoff`, que envía `escalar_a_analista` al core con los reintentos acotados de `reintentos.ts`. Nunca lanza. Si el core responde, el resultado de la conversación lleva el resumen y `entrega: "entregada"`. Si los reintentos se agotan, o el core devuelve un error, la conversación **igual se escala**, con `entrega: "pendiente"` y un log de error con la causa.

**Motivo**: escalar es el camino seguro y no puede depender de que el core esté arriba (Principios V y VI). Al solicitante se le informa igual; la entrega pendiente queda visible en el evento y en los logs para reintentarla a mano.

**Alternativas descartadas**: no escalar si falla la entrega, que deja al solicitante sin respuesta; escalar solo por el core, que no cubre el caso de que el core no arranque.

## R8: idempotencia, una entrega por conversación

**Decisión**: la clave la calcula el código: `huella(JSON.stringify([correlationId, "escalamiento"]))`. El core guarda un registro por conversación; repetir devuelve el mismo con `repetida: true`, sin otra auditoría. Si llega otra clave para una conversación ya escalada, también devuelve el primero.

**Motivo**: el chat cierra la conversación tras el primer escalamiento, y `dejarSenal` ya hace que la primera señal prevalezca. Un solo registro por conversación evita dos casos para el mismo solicitante (Principio VI, spec edge case de la doble petición).

**Alternativas descartadas**: una clave con el motivo, que permitiría dos entregas del mismo caso; permitir sustituir el registro, que cambia lo que el analista ya recibió.

## R9: lo ausente se declara como pendiente, no se rechaza

**Decisión**: el resumen lleva `pendientes`, una lista cerrada (`identidad`, `monto`, `plazo`, `ingreso_verificado`, `documentos`) que el core calcula con lo que falta. El esquema rechaza un resumen inconsistente: un campo ausente que no está en `pendientes`, o uno en `pendientes` que sí está presente. Un valor ausente y declarado es válido.

**Motivo**: concilia FR-002 (rechazar un resumen que no valida) con el caso borde (escalar igual si faltan datos): lo que no se sabe va explícito como pendiente, y lo que no cuadra con los datos es un error. El analista siempre sabe qué falta (aclaración Q1).

**Alternativas descartadas**: rechazar el resumen incompleto, que impediría escalar un caso de la Regla 4; omitir los pendientes, que obligaría al analista a deducirlos.

## R10: avisos y evento

**Decisión**: los avisos de `AVISOS` dejan de prometer contacto y dicen que un analista revisará el caso, sin prometer un resultado. El evento `escalamiento` suma a `valores` la `causaEscalamiento`, la `entrega` y, si se entregó, el `idEscalamiento`. La clave se llama así para no chocar con la `causa` de un caso no cubierto del #9, que ya leen las pruebas. El estado final del chat no cambia.

**Motivo**: FR-009 y FR-010. El indicador visible del #8 ya existe; con la causa y la entrega el solicitante y quien opere la demo ven qué pasó.

**Alternativas descartadas**: un evento nuevo en el catálogo, porque `escalamiento` ya cierra la conversación y duplicar eventos desincroniza el estado; mostrar la acción recomendada al solicitante, que es contenido para el analista.

## R11: auditoría y logs

**Decisión**: el servidor registra `auditoria_escalamiento` por cada escalamiento nuevo, con la regla, la causa, el motivo, las causas adicionales, el identificador, los pendientes y la versión de la política; el log `herramienta` no lleva datos del caso. El agente ya registra `escalamiento`; suma `entrega_escalamiento` con la entrega y, si se entregó, el identificador, y `error_entrega_escalamiento` (nivel de error, con la causa) cuando queda pendiente. Ninguno lleva nombres, documentos ni fragmentos.

**Motivo**: Principio VI: cada decisión deja un registro con regla, entradas, resultado y marca de tiempo, y los logs no llevan contenido de documentos.

**Alternativas descartadas**: copiar el resumen completo al log, que sería duplicar datos del solicitante en un archivo sin control de acceso.

## R12: no escalar lo que el agente puede resolver

**Decisión**: no hay código nuevo para esto. Los dos casos del criterio (un dato faltante que se puede pedir y varias coincidencias que se pueden desambiguar) ya no escalan. Se agregan pruebas de regresión que lo fijan, y una línea en el prompt: no escales por un dato que puedes pedir ni por coincidencias que puedes desambiguar.

**Motivo**: SC-003 exige tasa de escalamiento 0% en esos casos, y hoy no hay una prueba que lo diga. Una regresión silenciosa saturaría a los analistas.

**Alternativas descartadas**: un detector determinista de «resoluble», que no tiene qué detectar: los caminos ya están en el adaptador.

## R13: la solicitud registrada no cambia de estado

**Decisión**: escalar no toca `SolicitudRegistrada.estado`. Una solicitud escalada sigue `en_estudio`; el resumen la referencia por `idSolicitud`.

**Motivo**: `en_estudio` ya significa que un analista la estudia. Agregar `escalada` cambia el esquema y las pruebas de #13 y #14 y la regla de «solicitud abierta» sin que el criterio lo pida.

**Alternativas descartadas**: un estado `escalada` en la solicitud, por el costo en esquemas ya entregados.

## R14: las reglas y sus nombres se mueven a la política

**Decisión**: `src/politica/escalamiento.ts` pasa a ser la única fuente de los motivos, las causas, las acciones, la regla de cada motivo y `REGLA_4`, que no tenía módulo. Las constantes `REGLA_PIDE_PERSONA`, `REGLA_AMBIGUA`, `REGLA_NO_VERIFICABLE` y `REGLA_NO_EXTRAIBLE` de `adaptador.ts`, la tabla `ORDEN_REGLA` de `adaptador.ts` y la tabla `REGLAS` de `agente.ts`, pasan a importarse de ahí, con los mismos nombres exportados.

**Motivo**: el core necesita la regla de cada motivo para armar el resumen y no puede importar del agente. Con una sola fuente, el core, el agente y las pruebas no discrepan.

**Alternativas descartadas**: duplicar las constantes en el core, que parte la fuente; que el agente envíe el texto de la regla, que deja un campo libre en la entrada.
