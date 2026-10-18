# Research: Preaprobación automática dentro de la política

**Feature**: [spec.md](spec.md) · **Plan**: [plan.md](plan.md) · **Fecha**: 2026-10-18

Hechos verificados en el repositorio (rama `14-preaprobacion-automatica-dentro-de-la`, sobre `e80b0f5`), seguidos de las decisiones R1–R11. No hay dependencias nuevas, así que no se investigó el SDK de nuevo: se reutilizan las versiones del #13.

## Hechos de partida

- [src/politica/politica.ts](../../src/politica/politica.ts) es la única fuente de umbrales; su cabecera ya dice que «los de monto y cuota llegan con el #14». Hoy no define el tope ni el porcentaje. `VERSION_POLITICA` vale `2026-10-18.2`.
- [src/politica/cuota.ts](../../src/politica/cuota.ts) tiene `calcularCuota` (entero, redondeado al peso más cercano) y `calcularRelacionCuotaIngreso`, que redondea el porcentaje a **dos decimales**. Su cabecera dice que no evalúa la Regla 2.
- La solicitud registrada del #13 ([solicitud.ts](../../src/compartido/solicitud.ts)) trae `monto`, `plazoMeses` y `verificacionIngreso` con `estado`, `ingresoVerificado.monto` y `discrepancia`. Su `estado` es hoy el literal `en_estudio`.
- «Solicitud abierta» (R7 del #13) cuenta las solicitudes en `en_estudio` ([core-simulado.ts](../../src/mcp/core-simulado.ts)).
- El catálogo de eventos del #8 ya trae `preaprobacion` ([eventos.ts](../../src/compartido/eventos.ts)), que exige `regla` y `valores`. El chat ya lo presenta, y [sesion.ts](../../src/chat/sesion.ts) lo convierte en el estado final «preaprobada», que cierra la conversación.
- El hook de identidad ([control-identidad.ts](../../src/agente/control-identidad.ts)) decide la Regla 1 con el estado del core y niega todas las herramientas cuando hay una señal de escalamiento, salvo el registro tras la Regla 3. Las señales llevan un motivo, y `ORDEN_REGLA` y `ORDEN_EVALUACION` ya incluyen la Regla 2 («la Regla 2 llega con el #14»), aunque el tipo de `ORDEN_REGLA` solo admite 1, 3, 4 y 5.
- El agente tiene un `AVISOS` y un `REGLAS` por cada motivo de escalamiento ([agente.ts](../../src/agente/agente.ts)); un motivo nuevo exige las dos entradas.
- La descripción de `calcular_capacidad_pago` (#12) ya nombra `preaprobar_credito` y dice que «no reemplaza» a esa herramienta ([capacidad-pago.ts](../../src/compartido/capacidad-pago.ts)); una prueba fija esa frase.
- El fallo conocido del #13: tras una discrepancia de ingreso, el modelo no registra la solicitud, así que ese caso no llega a tener solicitud registrada.

## R1: dónde viven el tope y el porcentaje, y cómo se compara

**Decisión**: `politica.ts` define `TOPE_MONTO_PREAPROBACION = 5_000_000` y `PORCENTAJE_MAXIMO_CUOTA_INGRESO = 30`; la versión sube a `2026-10-18.3`. La comparación es con enteros: `monto ≤ tope` y `cuota · 100 ≤ porcentaje · ingreso`, con `BigInt`.

**Motivo**: la constitución fija una sola fuente versionada. La relación de `calcularRelacionCuotaIngreso` se redondea a dos decimales, así que 30,004% daría 30,00% y se preaprobaría un caso fuera de política; la comparación entera es exacta en el borde (FR-005, Principio III).

**Alternativas descartadas**: comparar la relación redondeada del #12 con 30, por el error en el borde; poner las constantes en el módulo de la herramienta, porque parte la fuente única; guardar el 30% como `0,30`, porque obliga a comparar flotantes.

## R2: la regla es una función pura, y su orden interno respeta el de la constitución

**Decisión**: `evaluarRegla2(solicitud)` en `src/politica/preaprobacion.ts` recibe el monto, el plazo y la verificación de ingreso de la solicitud registrada, y devuelve la decisión explicable (`permitido`, `codigo`, `motivo`, `valores`, `regla`, `versionPolitica`). Evalúa en este orden: estado de la verificación de ingreso (Regla 3), monto y cuota. La cuota es `calcularCuota` del #12.

**Motivo**: las tres capas (hook, core y pruebas) llaman a la misma función y no pueden discrepar. El orden respeta el 4 → 5 → 1 → 3 → 2 (FR-014): la discrepancia y el ingreso no verificado se miran antes del monto y la cuota.

**Códigos de bloqueo**: `ingreso_no_verificado`, `discrepancia_registrada`, `monto_sobre_tope`, `cuota_sobre_porcentaje` y `cuota_no_calculable`.

**Alternativas descartadas**: una función por criterio, que deja al llamador decidir el orden; devolver solo un booleano, porque la decisión debe ser explicable (Principio III).

## R3: el modelo no aporta ningún dato

**Decisión**: `preaprobar_credito` no tiene campos de entrada del modelo. El core y el hook toman todo de la solicitud registrada de la conversación (la de `consultar_solicitud_registrada`).

**Motivo**: FR-004 prohíbe confiar en montos, cuotas o ingresos que pase el modelo; sin campos no hay nada que alterar. Con un solo registro por conversación en el flujo, no hace falta identificarla.

**Alternativas descartadas**: recibir `idSolicitud` del modelo, que permitiría pedir la preaprobación de otra solicitud; recibir el monto o la cuota «para comprobar», que invita a confiar en ellos.

## R4: tres capas de código

**Decisión**:
1. **Hook de identidad** (#9): `preaprobar_credito` entra en `HERRAMIENTAS_CON_IDENTIDAD` y se aplica la Regla 1.
2. **Hook nuevo `control-preaprobacion.ts`**: antes de la herramienta, lee la solicitud registrada con `consultarSolicitudRegistrada` (con reintentos acotados), evalúa `evaluarRegla2` y deniega si no se permite. Sin solicitud registrada, deniega con un motivo accionable, sin escalar.
3. **Core**: `preaprobarSolicitud` repite todo: Regla 1, solicitud registrada, `evaluarRegla2`.

**Motivo**: el criterio pide un hook del Agent SDK que recalcule con la solicitud; el servidor repite la regla por defensa en profundidad (Principio IV), también cuando se usa directo desde Claude Code. La Regla 2 va en un hook propio para no mezclarla con la identidad.

**Alternativas descartadas**: ampliar `control-identidad.ts`, que mezcla dos reglas; solo el hook, que incumple la defensa en profundidad; solo el core, que no cumple el criterio del hook.

## R5: escalar, no insistir

**Decisión**: cuando la Regla 2 bloquea, el hook (y el adaptador, si el core rechaza fuera de política) deja la señal `preaprobacion_fuera_de_politica`, con la Regla 2 y su aviso, y emite el evento `bloqueo_por_regla`. El agente cierra el turno como escalado, igual que con las demás señales. Una falta de solicitud registrada no escala: es un error accionable («registra primero»).

**Interpretación de FR-007 con la identidad**: la Regla 1 sigue como en el #9: el hook bloquea y da el siguiente paso de identificarse, y solo escala si el core no responde. Con la identidad sin verificar no puede existir una solicitud registrada, así que la Regla 1 ya cubre ese camino.

**Motivo**: el escalamiento lo decide el código, nunca el modelo; cada motivo lleva su regla y su aviso. Sin ofrecer alternativas (FR-017).

**Alternativas descartadas**: dejar que el modelo decida si escala, que repite el fallo del #13; reusar `caso_no_cubierto`, que es de la Regla 5 y confunde la regla que se audita; escalar también la falta de solicitud registrada, que es un paso olvidado y no un caso fuera de política.

## R6: el estado de la solicitud y la solicitud abierta

**Decisión**: `SolicitudRegistrada.estado` pasa de `en_estudio` a `en_estudio | preaprobada`, y se agrega `preaprobacion` (la constancia, o `null`). La solicitud preaprobada cuenta como abierta: el registro de otra con otra clave se rechaza igual. El estado del resumen del #7 también admite `preaprobada`.

**Motivo**: la constancia debe quedar con la solicitud que leerá el #15, y el chat ya muestra «preaprobada». Si no contara como abierta, un solicitante podría registrar una segunda solicitud tras ser preaprobado.

**Alternativas descartadas**: guardar la preaprobación aparte, con dos registros por solicitud; no cambiar el estado, y dejar la solicitud «en estudio» tras preaprobarla.

## R7: idempotencia por solicitud

**Decisión**: preaprobar una solicitud ya preaprobada devuelve la misma preaprobación con `repetida: true`, sin otra auditoría ni otro efecto. No hay clave aparte.

**Motivo**: la constitución pide una clave de idempotencia por solicitud, y la solicitud registrada ya es única por conversación y por solicitante; su identificador cumple esa función sin que el modelo envíe nada.

**Alternativas descartadas**: una clave que envía el modelo, o calculada por el adaptador, que no aporta nada sobre el identificador de la solicitud.

## R8: descripción de la herramienta y prompt, sin umbrales

**Decisión**: `DESCRIPCION_PREAPROBAR_CREDITO` dice que compromete a la fintech, que solo opera sobre una solicitud registrada y que, para explorar o preguntar cuánto se pagaría, se usa `calcular_capacidad_pago`. No dice el 5.000.000 ni el 30%. El prompt indica llamarla después de registrar con el ingreso verificado, y que un bloqueo escala y no se ofrecen alternativas.

**Motivo**: FR-002. Con los umbrales a la vista, el modelo concluiría «sí califica» sin pedir la preaprobación, o intentaría ajustar los montos. La frase de la descripción del #12 («no reemplaza a `preaprobar_credito`») se mantiene y se prueba contra el nombre real.

**Alternativas descartadas**: citar el tope para «explicar» el bloqueo, que invita a negociar; dejar el criterio de cuándo preaprobar solo en el prompt, que no garantiza nada.

## R9: eventos de negocio

**Decisión**: una preaprobación exitosa emite el evento `preaprobacion` del catálogo, desde el adaptador y no desde el modelo, con la regla y los valores. Un bloqueo emite `bloqueo_por_regla` con la Regla 2, y el escalamiento el evento `escalamiento`. No se agregan tipos.

**Motivo**: el catálogo del #8 ya los define y el chat ya los presenta; emitirlos desde código evita que el modelo anuncie una preaprobación que no existe.

**Alternativas descartadas**: un evento nuevo, porque cambia el catálogo sin que el enunciado lo pida; dejar que el modelo diga «estás preaprobado», porque entonces la interfaz mostraría lo que diga el texto.

## R10: auditoría, logs y pruebas

**Decisión**: cada decisión del servidor deja `auditoria_preaprobacion` con la regla, el resultado (`preaprobada` o `bloqueada`), el código del bloqueo, los enteros usados, la versión de la política y la marca de tiempo. Una repetición no audita otra vez. El log `herramienta` lleva el resultado y el identificador de la solicitud, sin montos. Las pruebas de los hooks no usan el modelo: un core falso y la entrada del hook, con los bordes exactos de la política.

**Motivo**: el Principio VI pide auditar cada decisión y el criterio del issue pide pruebas de los hooks sin el modelo, incluidos los límites.

**Alternativas descartadas**: no auditar los bloqueos, porque contradice el Principio VI; probar con el modelo real, que no es determinista.

## R11: casos de demo

**Decisión**: tres casos que reutilizan los documentos ficticios del #11 y terminan pidiendo registrar y preaprobar: `preaprobacion-simple` (4.000.000 a 24 meses, ingreso verificado de 3.800.000), `preaprobacion-monto-alto` (6.000.000) y `preaprobacion-cuota-alta` (4.500.000 a 3 meses, cuota por encima del 30%).

**Motivo**: cubren los casos de prueba 1, 4 y 5 del enunciado de punta a punta, con las reglas visibles en el chat. El caso de discrepancia no tiene caso propio: depende de la solicitud registrada tras una discrepancia, que es el fallo conocido del #13.

**Alternativas descartadas**: casos con documentos propios, que duplican datos ficticios sin aportar un escenario.
