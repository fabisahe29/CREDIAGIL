# Research: Registro de la solicitud con procedencia

**Feature**: [spec.md](spec.md) · **Plan**: [plan.md](plan.md) · **Fecha**: 2026-10-18

Hechos verificados en el repositorio (rama `13-registro-de-la-solicitud-con-procedencia`, sobre `ac8b0d0`), seguidos de las decisiones R1–R11. No hay dependencias nuevas, así que no se investigó el SDK de nuevo: se reutilizan las versiones del #12.

## Hechos de partida

- [src/agente/control-identidad.ts](../../src/agente/control-identidad.ts) ya decide la Regla 1 con el estado que guarda el core (`consultarIdentidad`), con reintentos, y bloquea ante la duda. Si el core no responde tras los reintentos, deja la señal `falla_transitoria_persistente` y bloquea. Su cabecera dice que «el registro de la solicitud (#13) agregará la suya» a `HERRAMIENTAS_CON_IDENTIDAD`, y que si la herramienta trae `idSolicitante` en su entrada, debe ser el verificado.
- Ese mismo hook, antes de mirar la lista, **deniega toda herramienta si `estado.escalamiento !== null`** («La conversación ya pasó a un analista»). Y `llamarConReintentos` del adaptador devuelve `transitorio_agotado` de inmediato si ya hay señal de escalamiento ([adaptador.ts](../../src/agente/adaptador.ts)).
- `verificar_ingreso` deja la señal `discrepancia_de_ingreso` o `inconsistencia_documental` (Regla 3, `ORDEN_REGLA` = 3) en el mismo turno en que la detecta. El modelo sigue ejecutándose hasta el final del turno: la señal solo se consume al cerrarlo ([agente.ts](../../src/agente/agente.ts), líneas 430–434).
- El bloqueo por identidad ya emite el evento `bloqueo_por_regla` con la Regla 1 y un siguiente paso («Indícame tu número de documento…»). El chat ya lo muestra (#8).
- El core ([core-simulado.ts](../../src/mcp/core-simulado.ts)) guarda por `correlationId`: `identidades`, `extracciones` (por huella), `declarados` y `verificaciones`. `registrarExtraccion` ya aplica la Regla 1 del lado del servidor con `evaluarRegla1`, y su patrón de «forma → identidad → repetición → revalidación → guardar» es el que sigue esta herramienta.
- Cada dato de un `RegistroExtraccion` `extraido` ya trae `procedencia { adjunto, nombre, fragmento }` ([extraccion.ts](../../src/compartido/extraccion.ts)), validada contra el documento en el #10. Un `VerificacionIngreso` trae `ingreso.usos` y las inconsistencias, también con procedencia ([ingreso.ts](../../src/compartido/ingreso.ts)).
- `Discrepancia` guarda `declarado`, `verificado`, `diferencia` en pesos y `supera`, pero **no el porcentaje** de diferencia que pide la historia 1 ([ingreso.ts](../../src/compartido/ingreso.ts)). `evaluarDiscrepancia` compara con `BigInt` y no expone el porcentaje.
- `esquemaIdSolicitud` exige `SOL-000` más 7 dígitos; `consultarSolicitud` lee de `almacen`, con las solicitudes de ejemplo ficticias del #7. Una de ellas, `SOL-0001000001`, está `en_estudio` a nombre de Ana Pérez Ficticia.
- El adaptador se crea de nuevo en cada turno de la conversación (`crearAdaptador` dentro de la función del turno): su memoria interna, como `clavesPorDato`, no sobrevive al turno siguiente. La conversación previa llega como `historial` y el mensaje nuevo como `mensaje` ([agente.ts](../../src/agente/agente.ts)).
- `LARGO_MAXIMO_FRAGMENTO` es 300 y vive en [documentos.ts](../../src/politica/documentos.ts).

## R1: una herramienta `registrar_solicitud` en el core, expuesta por el adaptador

**Decisión**: `registrar_solicitud` existe en el servidor del core, con su método en `Core`, su llamada en `ClienteCore` y su exposición en el adaptador, igual que `verificar_ingreso`. Es una herramienta con efectos: no lleva `readOnlyHint`.

**Motivo**: el Principio IV pide que el agente actúe solo por herramientas del servidor MCP y que el servidor revalide las reglas críticas. El #14 y el #15 van a leer la solicitud registrada del core.

**Alternativas descartadas**:
- **Guardar la solicitud dentro del adaptador del agente**: no pasaría por el contrato tipado ni por la revalidación del servidor.
- **Una herramienta por dato**: parte el registro y permite estados parciales, que FR-005 prohíbe.

## R2: qué envía el modelo y qué toma el core

**Decisión**: el modelo envía solo lo que oyó: `idSolicitante`, `monto`, `plazoMeses` y la procedencia de cada uno (más la del ingreso declarado si lo hay). El core toma de su propio estado:

| Dato | De dónde lo toma el core |
|------|--------------------------|
| Solicitante (nombre, documento enmascarado) | El solicitante registrado cuya identidad está verificada en la conversación |
| Ingreso declarado | `declarados` (lo que se envió a `verificar_ingreso`) |
| Ingreso verificado, discrepancia, inconsistencias | `verificaciones` (la última, si es del mismo solicitante) |
| Datos extraídos | `extracciones` de la conversación |

El porcentaje de diferencia lo calcula el core desde la discrepancia guardada (R9).

**Motivo**: FR-004 prohíbe que el ingreso verificado y las discrepancias salgan del modelo; por la misma razón, nada de lo que el core ya sabe viaja de vuelta por el modelo, que podría alterarlo. Con esto, «dato sin procedencia» solo puede ocurrir en lo que dijo el solicitante, que es lo único que sí pasa por el modelo.

**Casos de borde**:
- **Ingreso declarado**: si el core tiene uno guardado, la procedencia del ingreso declarado es obligatoria; si no tiene, enviarla es un error (`ingreso_declarado_no_verificado`, campo `procedencia.ingresoDeclarado`). Así el valor declarado es siempre el que `verificar_ingreso` ya comparó, y no hay dos versiones.
- **Verificación de otra persona**: si el `idSolicitante` de la última verificación no es el verificado ahora, se ignoran la verificación y el ingreso declarado que le acompañaba, y el registro queda sin ingreso verificado ni declarado. No se transfiere (FR-008) y no se inventa (Principio V).
- **Sin verificación**: se registra sin ingreso verificado ni discrepancia (FR-015, caso borde de la spec).

**Alternativas descartadas**:
- **Que el modelo envíe todo y el core compare**: más superficie de error y de manipulación sin ganancia.
- **Rechazar el registro sin ingreso verificado**: contradice la aclaración de FR-015, que registra siempre.

## R3: procedencia de lo que dijo el solicitante

**Decisión**: la procedencia de un dato del registro es una de dos clases:

- `{ tipo: "afirmacion", fragmento }`: el solicitante lo dijo en la conversación.
- `{ tipo: "documento", adjunto, nombre, fragmento }`: salió de un documento extraído.

Los datos extraídos que copia el core ya llevan la segunda clase. Para `monto`, `plazoMeses` e `ingresoDeclarado` las dos son válidas: normalmente la primera, y la segunda si el solicitante lo escribió en un documento que adjuntó.

**Comprobación en dos sitios**:
- **Adaptador** (el único que ve la conversación): una afirmación debe estar, literal, en un mensaje del solicitante (comparación sin tildes ni mayúsculas, con espacios colapsados, como `comparable` del #10). Un documento debe existir y su fragmento estar en su contenido. Si no, devuelve un error de validación `procedencia_invalida` con el campo.
- **Core** (el único que ve lo extraído): forma, largo (1 a 300), y que el documento citado esté entre las extracciones de la conversación con ese número y nombre (`procedencia_documento_desconocida`). Una afirmación solo se comprueba de forma.

**Motivo**: es lo máximo que cada lado puede garantizar; el core no guarda la conversación ni el contenido de los documentos (Principio VI). El Principio III pide validar todo lo extraído contra un esquema y tratar lo que no pasa como faltante.

**Alternativas descartadas**:
- **Comprobar que el monto aparezca en la cita**: la gente dice «cuatro millones», «4 palos» o «dos años»; interpretar cantidades dichas es una tarea de comprensión del modelo y rechazaría registros legítimos (YAGNI y Principio III al revés).
- **Guardar el texto de la conversación en el core para revalidar**: viola la regla de no guardar contenido en el core y agrega almacenamiento.
- **Solo la clase `afirmacion`**: dejaría sin camino real el escenario 2 de la historia 3 (documento que no está entre los extraídos).

## R4: la Regla 1 en tres capas y la identidad de la misma persona

**Decisión**:
1. **Prompt**: indica registrar solo con identidad verificada (guía, no garantía).
2. **Hook** (`control-identidad.ts`): `registrar_solicitud` entra en `HERRAMIENTAS_CON_IDENTIDAD`. El hook consulta el estado de identidad al core y compara con el `idSolicitante` de la entrada, sin usar nada que diga el modelo para decidir si la identidad está verificada (FR-007).
3. **Core**: `registrarSolicitud` aplica `evaluarRegla1(identidad, idSolicitante)` y rechaza con `identidad_no_verificada` (FR-016).

El `idSolicitante` es un argumento obligatorio del adaptador precisamente para que el hook pueda detectar el intento de registrar a otra persona (FR-008). El solicitante que se guarda es siempre el verificado, no el que diga el modelo: si coinciden se registra, si no se rechaza.

**Motivo**: una sola capa deja una puerta; las dos cubren que el hook no se ejecute o que se llame al servidor directamente (por ejemplo, desde Claude Code con `.mcp.json`). El caso del core que no responde ya lo resuelve el hook del #9 (FR-009): bloquea, deja la señal de falla persistente y la conversación escala.

**Alternativas descartadas**:
- **Solo el hook**: la constitución exige la defensa en profundidad en el servidor (aclaración de FR-016).
- **Sin `idSolicitante` en la entrada, usando solo la identidad verificada**: el hook no podría distinguir un intento de registrar a otra persona, y el criterio de «la verificación no se transfiere» quedaría sin prueba.

## R5: el registro después de una señal de escalamiento por la Regla 3

**Decisión**: el hook y el adaptador dejan de denegar `registrar_solicitud` cuando la señal de escalamiento vigente es de la Regla 3: `discrepancia_de_ingreso` o `inconsistencia_documental`. Una constante única, `MOTIVOS_QUE_ADMITEN_REGISTRO`, exportada por `adaptador.ts`, la usan los dos. Con cualquier otra señal (Regla 4, Regla 5, falla técnica, identidad) todo sigue denegado.

**Motivo**: la discrepancia solo existe después de `verificar_ingreso`, y esa misma llamada deja la señal. Sin la excepción, el escenario 3 de la historia 1 («la discrepancia queda guardada») sería inalcanzable, y el analista recibiría un caso sin la solicitud registrada. La aclaración de FR-015 establece que se registra igual. La Regla 4 («sin investigar ni extraer datos») y la 5 (caso no cubierto) no cambian.

**Efecto**: en el mismo turno, tras la señal de la Regla 3, el modelo puede llamar a `registrar_solicitud`. La señal no se pierde: al cerrar el turno la conversación pasa a un analista como hoy.

**Alternativas descartadas**:
- **Dejar el registro al escalamiento del #15**: no cumple el criterio del #13 y deja ese ticket con una dependencia no dicha.
- **Registrar por código al cerrar el turno escalado**: el código no tiene las citas de lo que dijo el solicitante; tendría que registrar con procedencia inventada.
- **Quitar el bloqueo por escalamiento para todas las herramientas**: rompe la Regla 4 y la 5.

## R6: idempotencia

**Decisión**: la clave la calcula el código del adaptador: `huella(JSON.stringify([idSolicitante, monto, plazoMeses]))`, el SHA-256 de `extraccion.ts`. No es un argumento del modelo. El core guarda la solicitud con su clave dentro de la conversación:
- La misma clave en la misma conversación devuelve la solicitud ya registrada, sin otro efecto ni otra auditoría, con `repetida: true`.
- Otra clave en la misma conversación, mientras la solicitud está abierta, es una solicitud abierta (R7).

**Motivo**: el adaptador se crea de nuevo en cada turno (hecho de partida): una clave aleatoria por turno daría una distinta cada vez, y repetir «registra mi solicitud» en el turno siguiente chocaría con la solicitud abierta en lugar de devolverla. Derivada del contenido, la repetición es idéntica entre turnos y entre reintentos. Un cambio de monto o plazo da otra clave, y eso es una solicitud nueva, que se rechaza si ya hay una abierta.

**Alternativas descartadas**:
- **Clave aleatoria por turno** (como `generarIdIntento`): rompe la repetición entre turnos.
- **Clave que envía el modelo**: un error suyo duplicaría solicitudes (Principio III).
- **Comparar además el contenido completo de la procedencia**: dos citas distintas del mismo monto no son dos solicitudes; la clave por solicitante, monto y plazo basta.

## R7: solicitud abierta (FR-017)

**Decisión**: una solicitud registrada queda `en_estudio` y se guarda también en el almacén de `consultarSolicitud`, así que se puede consultar por su identificador. «Abierta» significa registrada por esta herramienta para ese solicitante, en cualquier conversación y con estado `en_estudio`. Registrar con otra clave mientras exista una abierta devuelve el error de negocio `solicitud_abierta`, con el identificador de la existente. Las solicitudes de ejemplo del #7 no cuentan.

**Orden de comprobación en el core** (de menos a más costosa; la repetición va antes de la abierta para que repetir no falle):

1. falla simulada · 2. forma de la entrada · 3. Regla 1 · 4. repetición por clave · 5. solicitud abierta · 6. documentos aptos · 7. procedencia · 8. guardar y auditar.

**Motivo**: las solicitudes de ejemplo son datos de prueba de la consulta (#7), no solicitudes del flujo, y la de Ana Pérez Ficticia bloquearía toda demo que registre. Los identificadores nuevos salen de un contador del core (`SOL-0002000001`, `SOL-0002000002`…): son deterministas y cumplen `esquemaIdSolicitud`.

**Alternativas descartadas**:
- **Contar también las solicitudes de ejemplo**: ninguna demo de Ana podría registrar.
- **Devolver la existente en lugar de rechazar**: oculta que el solicitante intentó un monto o plazo distinto, y el analista debe verlo (Principio V). Es la opción B de la aclaración, descartada por el usuario al responder A.
- **Registrar otra independiente**: duplica solicitudes y trabajo del analista.

## R8: qué se guarda y cómo se consulta

**Decisión**: `SolicitudRegistrada` (ver [data-model.md](data-model.md)) agrupa solicitante, monto, plazo, ingreso declarado, verificación de ingreso (ingreso verificado, discrepancia con porcentaje, inconsistencias), datos extraídos y la clave. Se consulta con `consultar_solicitud_registrada`, de solo lectura, por `correlationId`: devuelve la de la conversación o `null`. `consultar_solicitud` también la encuentra por su identificador, con la forma resumida del #7.

El adaptador **no** expone una herramienta de lectura: `registrar_solicitud` ya le devuelve al modelo lo que necesita (el identificador, el estado y si fue una repetición), y no necesita releer la procedencia.

**Motivo**: la consulta con procedencia es lo que verifica el responsable de cumplimiento y lo que leerán el #14 y el #15. Leer por `correlationId`, y no por identificador, evita que una conversación lea la solicitud de otra.

**Alternativas descartadas**:
- **Extender `consultar_solicitud` con la procedencia**: cambia un contrato del #7 y mezcla las solicitudes de ejemplo con las del flujo.
- **Exponer la lectura al modelo**: más superficie sin necesidad.

## R9: auditoría y logs

**Decisión**:
- Cada registro nuevo deja `auditoria_solicitud` con `correlationId`, regla (Regla 1), `resultado: "registrada"`, `idSolicitud`, `idSolicitante`, `monto`, `plazoMeses`, `ingresoDeclarado`, `ingresoVerificado` (enteros), `estadoVerificacion`, número de documentos usados y `versionPolitica`, más la marca de tiempo del log. Un rechazo por una regla (identidad, solicitud abierta, procedencia) deja `resultado: "rechazada"` con el `codigo` y el `campo`. Nunca fragmentos ni contenido.
- Una repetición por clave no audita otra vez, como en #9 a #11.
- Cada llamada deja el log `herramienta` con `correlationId`, resultado e `idSolicitud` si fue correcta.
- El porcentaje de diferencia se calcula con una función de política, `calcularDiferenciaPorcentaje(declarado, verificado)`: dos decimales, `BigInt`, mitad hacia arriba, como `calcularRelacionCuotaIngreso` del #12. No cambia el umbral del 10% ni su comparación.

**Motivo**: el Principio VI pide auditar cada decisión, incluido el rechazo de registro, con regla, entradas, resultado y marca de tiempo. Los enteros son datos ficticios necesarios para auditar, y los fragmentos podrían contener contenido de documentos. `VERSION_POLITICA` no cambia porque no cambia ninguna regla ni umbral; la función nueva solo expone un valor derivado.

**Alternativas descartadas**:
- **No auditar los rechazos**: contradice el Principio VI.
- **Calcular el porcentaje en flotante en el core**: error de redondeo en el borde del 10%, que el Principio III prohíbe.
- **Subir `VERSION_POLITICA`**: marcaría un cambio de política que no ocurrió.

## R10: pruebas sin el modelo y evento de negocio

**Decisión**: el bloqueo se prueba (FR-013) en `control-identidad.test.ts`, con un core falso que devuelve la identidad sin verificar y una entrada de hook para `mcp__originacion__registrar_solicitud`, sin llamar al modelo: se comprueba el `deny`, el evento `bloqueo_por_regla` con la Regla 1 y que el core falso no recibió ningún registro. El rechazo del servidor se prueba con el cliente MCP en memoria. No se agrega un evento de negocio para el registro exitoso: el catálogo no tiene un tipo para él y el chat ya muestra la respuesta del agente.

**Motivo**: el criterio del issue pide una prueba que simule la llamada sin el modelo. El bloqueo ya tiene su evento desde el #9.

**Alternativas descartadas**: un evento `solicitud_registrada` (cambia el catálogo del #8 sin que el enunciado lo pida); probar el bloqueo con el modelo real (no determinista y con red).

## R11: documentos no aptos y casos de la demo

**Decisión**: el core rechaza el registro con el error de negocio `documentos_no_aptos`, con los números de adjunto, si alguna extracción de la conversación no está `extraido` (`no_cubierto` por la Regla 5, o `no_extraible`). Sin documentos se registra, con `datosExtraidos` vacío. Se agregan dos casos de la demo: `casos/registro-solicitud` (documentos consistentes, registro) y `casos/registro-discrepancia` (ingreso inflado, registro y escalamiento), que reutilizan los documentos ficticios del #11 y terminan con el mensaje de registrar.

**Motivo**: esos casos ya escalan antes (Regla 5 y falla de extracción) y la spec dice que no se registran como solicitud; el rechazo del servidor lo garantiza aunque el adaptador falle. Los casos de la demo muestran el criterio de aceptación de punta a punta.

**Alternativas descartadas**: incluir en el registro los documentos no aptos como «pendientes» (es lo que recibirá el analista por el escalamiento del #15; aquí agregaría un tercer estado); un caso nuevo con documentos propios (duplica ficticios sin aportar un escenario).
