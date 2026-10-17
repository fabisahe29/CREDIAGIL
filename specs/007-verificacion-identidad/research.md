# Research: Identificación y verificación del solicitante

**Feature**: [spec.md](spec.md) · **Plan**: [plan.md](plan.md) · **Fecha**: 2026-10-17

Hechos verificados en el repositorio y en los tipos instalados (`@anthropic-ai/claude-agent-sdk` 0.3.302, `@modelcontextprotocol/sdk` 1.32.1, Node v24.21.0), seguidos de las decisiones R1–R9.

## Hechos de partida

- El core simulado ([src/mcp/core-simulado.ts](../../src/mcp/core-simulado.ts)) es un almacén en memoria con una sola operación, `consultarSolicitud`. Los datos de ejemplo ([src/mcp/datos-ejemplo.ts](../../src/mcp/datos-ejemplo.ts)) solo tienen solicitudes, con el solicitante embebido; no hay un registro de solicitantes.
- El servidor MCP ([src/mcp/servidor.ts](../../src/mcp/servidor.ts)) anuncia un esquema de entrada laxo y valida estricto en el manejador, para devolver siempre el contrato de errores del #7 con su `campo`.
- El agente no habla con el core directamente: lo hace un **adaptador MCP en su mismo proceso** ([src/agente/adaptador.ts](../../src/agente/adaptador.ts)), cuyos manejadores llaman al cliente del core con reintentos y emiten eventos de negocio. Es el único punto determinista del ciclo de herramientas (DECISIONES.md, #7, decisión 2).
- El chat arranca **un core por ejecución** y lo reutiliza en todas las conversaciones ([src/chat/chat.ts](../../src/chat/chat.ts)). Cada conversación tiene su `correlationId`. Lo que el core guarde en memoria vive mientras el chat está abierto.
- `Options.hooks` del Agent SDK acepta `PreToolUse` con `matcher` por nombre de herramienta. El callback devuelve `hookSpecificOutput.permissionDecision: "deny"` y un `permissionDecisionReason`, que el modelo recibe como resultado de la herramienta. Hoy el agente no registra hooks.
- `SenalEscalamiento.motivo` admite solo los cuatro motivos técnicos del #7. `conversar` traduce cada motivo a un aviso (`AVISOS`) y a una regla (`REGLAS`).
- `src/politica/` todavía no existe; el `CLAUDE.md` lo marca como previsto.
- El contrato de errores es estricto: un error no admite campos además de `categoria`, `reintentable`, `codigo`, `mensaje` y `campo`.

## R1. El estado de identidad vive en el core, por `correlationId`

**Decisión**: el core guarda un `EstadoIdentidad` por conversación (`correlationId`) y un contador de intentos fallidos por `(correlationId, idSolicitante)`. Solo `verificar_identidad` lo cambia. Una herramienta de solo lectura, `consultar_identidad`, lo devuelve.

**Motivo**:
- El issue pide una fuente confiable que no dependa de lo que afirme el modelo (FR-012, FR-013). El core es el sistema de registro, y el #13 necesita que el mismo core rechace un registro sin identidad (Principio IV).
- Como el core vive toda la ejecución del chat, el estado sobrevive entre turnos. Como se indexa por `correlationId`, una conversación nueva empieza sin verificar (US4, escenario 3).

**Alternativas descartadas**:
- Guardarlo en el `EstadoConversacion` del adaptador: el core no podría aplicar la Regla 1 del lado del servidor en el #13.
- Un archivo o base de datos: el core es una simulación en memoria (YAGNI).

## R2. Tres herramientas del core: buscar, verificar y consultar

**Decisión**:
- `buscar_solicitante`: entrada con **exactamente uno** de `documento` o `nombre`, más `correlationId`. Devuelve una lista de coincidencias, que puede estar vacía.
- `verificar_identidad`: entrada `idSolicitante`, `fechaExpedicion` y `correlationId`. Devuelve el `EstadoIdentidad` o un error del contrato.
- `consultar_identidad`: entrada `correlationId`. Devuelve el `EstadoIdentidad` de la conversación. No tiene efectos.

**Motivo**: una herramienta por intención mantiene cada contrato pequeño y tipado (Principio IV) y separa la lectura, que usan los controles, de la escritura.

**Alternativas descartadas**:
- Una sola herramienta `identificar` que busque y verifique: mezclaría la búsqueda, sin efectos, con el intento, que cuenta para el límite, y haría ambigua la distinción de errores de FR-008.
- Un criterio de búsqueda libre (`texto`), con el core adivinando si es un documento o un nombre: no es determinista.

## R3. Normalización y forma de las coincidencias

**Decisión**:
- **Documento**: se eliminan puntos, espacios y guiones, y el resultado debe ser de 6 a 10 dígitos. Si no, es un error `validacion` con `campo: "documento"`.
- **Nombre**: se pasa a minúsculas, se quitan las tildes (NFD sin marcas diacríticas) y se colapsan los espacios. Se compara por **igualdad del nombre completo normalizado**. Con menos de 3 letras o con caracteres que no son letras ni espacios, es un error `validacion` con `campo: "nombre"`.
- **Coincidencia**: `{ idSolicitante, nombre, documentoEnmascarado }`. El documento se enmascara dejando solo los últimos 4 dígitos visibles (`******4567`). Nunca incluye la fecha de expedición.

**Motivo**: FR-004 y los supuestos de la spec (sin búsqueda parcial). El enmascarado permite que el solicitante reconozca su documento sin que la búsqueda por nombre exponga el número completo.

**Alternativa descartada**: búsqueda aproximada (distancia de edición). No la pide el issue, y daría coincidencias que el agente tendría que interpretar.

## R4. Verificación: errores, límite de intentos y bloqueo

**Decisión** — `verificar_identidad` evalúa en este orden:

1. **Entrada mal formada** → `validacion`, código `formato_invalido`, con el `campo`. Aplica a `fechaExpedicion` si:
   - no cumple `^\d{4}-\d{2}-\d{2}$`;
   - no es una fecha de calendario válida;
   - es posterior a la fecha actual del core, que tiene un reloj inyectable.

   No cuenta como intento.
2. **Solicitante inexistente** → `negocio`, `solicitante_inexistente`. No cuenta como intento.
3. **Verificación ya bloqueada** para `(correlationId, idSolicitante)` → `negocio`, `verificacion_bloqueada`, aunque el dato sea correcto.
4. **Dato que no coincide** → suma un intento fallido.
   - Si con él se llega al máximo, se bloquea y se responde `verificacion_bloqueada`.
   - Si no, se responde `negocio`, `dato_no_coincide`. El mensaje dice cuántos intentos quedan y nunca el dato correcto (FR-010).
5. **Dato correcto** → el estado de la conversación pasa a `verificada` con ese `idSolicitante`. Si ya estaba verificado ese mismo solicitante, se devuelve el mismo estado, con la misma marca de tiempo y sin un registro de auditoría nuevo (FR-016). Si estaba verificado otro solicitante, el nuevo lo reemplaza.

El tercer fallo responde directamente `verificacion_bloqueada`, no `dato_no_coincide`. Así el adaptador escala en ese mismo turno, sin esperar un cuarto intento.

**Idempotencia** (Principio VI):
- La entrada suma `idIntento`, un string de 1 a 64 caracteres. El core guarda el **fallo** de cada `(correlationId, idIntento)`.
- Si se repite el `idIntento` de un fallo, el core devuelve el mismo fallo sin volver a contar el intento ni auditarlo. Los éxitos no se guardan: un éxito repetido se evalúa contra el estado actual, para no contradecirlo si la verificación se invalidó entretanto (revisión de código de `dea0951`).
- El adaptador usa como `idIntento` un UUID por **dato del turno** (`idSolicitante` + `fechaExpedicion`), memorizado mientras dura el turno. Lo repiten los reintentos del adaptador, una llamada repetida con el mismo dato y el reintento del turno completo cuando falla el modelo (corrección tras la revisión de código de `d37d3a7`). Un dato nuevo, o el mismo dato en otro turno, lleva otra clave.

Esto evita que un reintento tras un tiempo agotado cuente dos fallos.

**Motivo**: FR-007 a FR-010 y la aclaración Q2 (3 intentos y escalar). El límite lo aplica el core, no el modelo.

**Alternativa descartada**: responder el fallo como éxito con `{ verificada: false }`. La spec exige un error de negocio, y el contrato de errores ya da al agente la categoría para decidir sin leer el texto.

## R5. El máximo de intentos y la Regla 1 en el módulo de política

**Decisión**: crear `src/politica/` con:
- `politica.ts`: `VERSION_POLITICA` y `MAX_INTENTOS_VERIFICACION = 3`;
- `identidad.ts`: `evaluarRegla1(estado)`, una función pura que devuelve una decisión estructurada `{ regla, permitido, motivo, valores }`.

La usan el core, para el límite de intentos, y el control del agente (R7). El #13 la reutilizará para rechazar un registro del lado del servidor.

**Motivo**: la regla de la zona MCP pide tomar las reglas de `src/politica/` sin duplicarlas, y el Principio III pide una decisión explicable. Este ticket es el primero que necesita la política, así que la crea. Los umbrales de monto, cuota e ingreso y la tasa llegarán con el #12 y el #14 al mismo módulo.

**Alternativas descartadas**:
- Una constante en `core-simulado.ts`: el #13 la duplicaría en el control del agente.
- Esperar al #12 para crear la política: dejaría la Regla 1 sin un único dueño.

## R6. Eventos y escalamiento deterministas en el adaptador

**Decisión**: el adaptador expone al modelo `buscar_solicitante` y `verificar_identidad`, con los mismos reintentos del #7. No expone `consultar_identidad`: el modelo no la necesita, y así no puede "comprobar" su propia identidad. Según la respuesta del core, el **código** del manejador:
- **Varias coincidencias**: emite `solicitud_de_dato`, con `dato: "número de documento de identidad"`, la `regla` («Regla 1 · coincidencias sin desambiguar») y `valores.coincidencias`. Marca en el estado de la conversación que hubo una búsqueda ambigua.
- **Una búsqueda ambigua por turno**: dentro de un turno solo cuenta la primera, porque el solicitante todavía no pudo responder al pedido de documento (corrección tras la revisión de código de `d37d3a7`).
- **Una segunda búsqueda ambigua seguida**, en un turno posterior: deja la señal de escalamiento con el motivo nuevo `identidad_ambigua` y el número de coincidencias (FR-006).
- **El escalamiento por ambigüedad se decide al cerrar el turno** (`cerrarTurnoIdentidad`), no en la llamada. Si en el mismo turno el modelo busca por nombre y después por documento, no escala (revisión de código de `dea0951`).
- **Una búsqueda con exactamente una coincidencia** reinicia el contador y marca la conversación como desambiguada (`desambiguada`, que viaja entre turnos). Las búsquedas ambiguas posteriores ya no cuentan ni vuelven a pedir el documento. Hace falta porque el modelo repite `buscar_solicitante` en cada turno, ya que el historial solo lleva textos (visto con `--demo` en la validación manual, T044). Sin el reinicio, repetir la búsqueda por nombre después de dar el documento escalaba por error. Una búsqueda sin coincidencias no reinicia el contador.
- **`verificacion_bloqueada`**: deja la señal de escalamiento con el motivo nuevo `identidad_no_verificable` (FR-009).
- **Cero coincidencias, `dato_no_coincide` o una verificación exitosa**: no emite eventos; el modelo informa con su texto.

`SenalEscalamiento.motivo` suma los dos motivos de negocio, y `conversar` suma sus `AVISOS` y `REGLAS`.

**Motivo**: la Decisión 2 del #8: los eventos los emite el código, nunca el modelo. Reutilizar la señal de escalamiento hace que el chat muestre el escalamiento y cierre la conversación sin cambios.

**Alternativas descartadas**:
- Que el modelo decida escalar por instrucción del system prompt: no es determinista.
- Un tipo de evento nuevo `identidad_verificada`: el catálogo del #8 basta, y el estado de identidad no es un estado visible de la solicitud.

## R7. Control `PreToolUse` que exige identidad verificada

**Decisión**: `src/agente/control-identidad.ts` exporta:
- `HERRAMIENTAS_CON_IDENTIDAD`: los nombres de las herramientas que exigen identidad. Hoy está vacía; el #10 (extracción de documentos) y el #13 (registro) agregarán las suyas.
- `crearControlIdentidad({ core, estado })`: crea el callback del hook `PreToolUse`. Cuando la herramienta está en la lista:
  1. llama a `core.consultarIdentidad(correlationId)`, directamente y sin pasar por el modelo, con `conReintentos` del #7 (2 reintentos con backoff);
  2. evalúa `evaluarRegla1`; si la herramienta trae `idSolicitante`, además exige que sea el verificado. La verificación no se transfiere: el core también la invalida cuando hay un intento de verificación sobre otro solicitante (caso borde de la spec; corrección tras la revisión de código de `d37d3a7`);
  3. si no está permitido, responde `permissionDecision: "deny"` y emite `bloqueo_por_regla`;
  4. si la consulta falla, responde `deny` y emite `bloqueo_por_regla`. Si el error era transitorio y se agotaron los reintentos, deja además la señal `falla_transitoria_persistente` con `herramienta: "consultar_identidad"`, y la conversación escala (Principio VI: nunca se decide sin respuesta). Un error no transitorio (validación o fuera de contrato) no se reintenta. Ante la duda, bloquea.

`conversar` registra el hook en `Options.hooks.PreToolUse`, con un `matcher` que cubre las herramientas del servidor `originacion`. Las pruebas pasan una lista con una herramienta de prueba.

**Motivo**:
- El issue pide que los hooks del agente consulten una fuente confiable (FR-012, FR-014).
- El control corre antes de la herramienta, así que bloquea sin que el core reciba la llamada, y el #13 agrega además el rechazo del lado del servidor (defensa en profundidad, Principio IV).
- Cuando el #10 agregue su herramienta a la lista, FR-011a (no procesar documentos sin identidad) queda garantizado por código y no solo por el prompt.

**Alternativas descartadas**:
- Comprobar la identidad dentro de cada manejador del adaptador: funciona, pero cada ticket tendría que repetir la comprobación. Con el hook, basta un nombre en la lista.
- Leer el estado desde la memoria del adaptador: no sería la misma fuente que usa el core.

**Consecuencia**: la `query()` falsa de las pruebas del #7 no ejecuta hooks. El callback se prueba directamente, como función, y en `conversar` solo se comprueba que queda registrado en las `Options`.

## R8. Momento de identificar: instrucción del sistema y control por código

**Decisión**: el system prompt antepone el orden de evaluación 4 → 5 → 1. Si el solicitante pide una persona, o el caso no está cubierto (moneda extranjera, documento no soportado), el modelo no lo busca ni le pide datos: llama a `solicitar_analista` con el motivo tipado, y el código escala (FR-011b; DECISIONES.md, Decisión 6 del #9). Desde ese momento, el control niega cualquier otra herramienta. Lo exigieron las revisiones de cumplimiento de `d37d3a7` y `dea0951`. Después suma tres instrucciones:
- pedir número de documento o nombre en cuanto el solicitante quiera iniciar una solicitud;
- con varias coincidencias, pedir el número de documento;
- verificar con la fecha de expedición del documento, y no pedir ni usar documentos de soporte antes de verificar.

Las preguntas generales se responden sin identificar. Lo que debe cumplirse sí o sí no depende del prompt:
- la desambiguación y el escalamiento los hace el adaptador (R6);
- el uso de documentos y el registro quedan detrás del control de identidad (R7).

**Motivo**: aclaración Q3 (al inicio del trámite) y Principio III: el modelo guía la conversación y el código aplica la regla.

**Alternativa descartada**: bloquear todo mensaje del solicitante hasta identificarlo. Rompería las preguntas generales y la Regla 4, que debe escalar sin pedir datos.

## R9. Datos ficticios, auditoría y logs

**Decisión**:
- **Solicitantes de ejemplo**: `SOLICITANTES_EJEMPLO`, con identificadores `CLI-000…`:
  - un solicitante único: Ana Pérez Ficticia, el mismo documento que su solicitud de ejemplo;
  - dos homónimos: «Elena Martínez Inventada», con documentos y fechas de expedición distintos.

  Las constantes documentan además un documento y un nombre sin coincidencias. Todo según `docs/datos-ficticios.md`.
- **Auditoría**: cada verificación registra `evento: "auditoria"` con `regla: "Regla 1"`, `correlationId`, `idSolicitante`, `resultado` (`verificada`, `no_coincide`, `bloqueada`, `inexistente`, `formato_invalido`, este último con su `campo`) e `intentosFallidos`, que son los valores usados. No se audita de nuevo una repetición exitosa ni un `idIntento` repetido. **Nunca** registra la fecha presentada ni la guardada (FR-015, SC-004).
- **Logs de búsqueda**: `criterio` (`documento` o `nombre`) y número de coincidencias, sin el valor buscado.

**Motivo**: el Principio VI pide auditar cada decisión sin datos de más, y la spec prohíbe el dato de verificación en claro.

**Alternativa descartada**: registrar la fecha con un hash. No aporta a la auditoría, y una fecha tiene tan pocos valores posibles que el hash se revierte por fuerza bruta.
