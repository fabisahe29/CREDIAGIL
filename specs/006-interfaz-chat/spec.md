# Feature Specification: Interfaz de chat

**Feature Branch**: `8-interfaz-de-chat`

**Created**: 2026-10-17

**Status**: Draft

**Issue de origen**: [fabisahe29/CREDIAGIL#8 — Interfaz de chat](https://github.com/fabisahe29/CREDIAGIL/issues/8)

**Épica / Milestone**: `epica:agente-originacion` · M2 · Agente MVP · **Depende de**: #7 (Done)

**Trazabilidad con el enunciado**: Comportamiento 12 · Video de funcionamiento

**Input**: Contenido del issue #8, entregado por `/ticket-tomar`.

## Clarifications

### Session 2026-10-17

- Q: Cuando una regla de negocio bloquea una acción, ¿qué ve el solicitante en la interfaz? → A: Un aviso en lenguaje claro de que la acción no se puede hacer y qué sigue, más la regla aplicada y los valores que la dispararon.
- Q: ¿La interfaz muestra también las herramientas del core que invoca el agente, o solo los eventos de negocio? → A: Por defecto, solo los eventos de negocio. Un modo de demostración, que se activa al iniciar, agrega una línea discreta por cada herramienta invocada con su nombre y su resultado (éxito, error o reintento).
- Q: ¿Dónde corre la interfaz de chat: en la terminal o en el navegador? → A: En la terminal: chat interactivo en consola; adjuntar archivos y cargar casos de prueba con comandos de la propia interfaz.
- Q: Cuando la solicitud llega a un estado final («preaprobada» o «escalada a analista»), ¿puede el solicitante seguir enviando mensajes al agente en esa conversación? → A: No. Ambos estados cierran la conversación: la interfaz muestra el estado final y solo acepta comandos para iniciar una conversación nueva o salir.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Conversar con el agente turno a turno (Priority: P1)

Como solicitante, quiero escribirle al agente y leer sus respuestas en una conversación continua, turno a turno, para avanzar en mi solicitud de crédito sin repetir lo que ya dije.

**Why this priority**: es la base de la demo y de todas las capacidades siguientes. Hoy el agente solo atiende un mensaje suelto desde un comando de demostración.

**Independent Test**: iniciar la interfaz, enviar dos mensajes seguidos en los que el segundo depende del primero, y comprobar que se ven los cuatro mensajes en orden, cada uno identificado como del solicitante o del agente, y que el agente responde al segundo con el contexto del primero.

**Acceptance Scenarios**:

1. **Given** la interfaz recién iniciada, **When** el solicitante escribe un mensaje, **Then** el mensaje aparece identificado como del solicitante y, a continuación, la respuesta del agente identificada como del agente.
2. **Given** una conversación con varios turnos, **When** el solicitante envía un mensaje nuevo, **Then** el agente responde con el contexto de los turnos anteriores de la misma conversación.
3. **Given** que el agente está preparando su respuesta, **When** el solicitante mira la interfaz, **Then** ve una indicación de que el agente está trabajando, y no puede enviar otro mensaje hasta que termine ese turno.
4. **Given** una conversación en curso, **When** el solicitante la termina o inicia una nueva, **Then** la nueva conversación no arrastra contexto de la anterior y tiene su propio identificador de seguimiento.

---

### User Story 2 - Ver con claridad las decisiones y eventos de negocio (Priority: P1)

Como persona que ve la demo sin conocer el código, quiero que la interfaz destaque, aparte del texto del agente, cuándo se preaprobó la solicitud, cuándo se pidió un dato o documento, cuándo se escaló a un analista y cuándo una regla de negocio bloqueó una acción, para entender en qué estado queda la solicitud.

**Why this priority**: es el propósito del ticket (Comportamiento 12 y video de funcionamiento). Sin esto, la demo solo muestra texto y las decisiones quedan escondidas.

**Independent Test**: con el modelo simulado, provocar cada uno de los cuatro tipos de evento y comprobar que cada uno aparece en la conversación con la misma estructura, distinguible a simple vista del texto del agente, y que el estado visible de la solicitud cambia en consecuencia.

**Acceptance Scenarios**:

1. **Given** una conversación en curso, **When** el agente emite un evento de **preaprobación**, **Then** la interfaz lo muestra destacado, con el motivo y la regla aplicada, y el estado visible de la solicitud pasa a «preaprobada».
2. **Given** una conversación en curso, **When** el agente emite un evento de **solicitud de dato o documento**, **Then** la interfaz muestra destacado qué dato o documento se pide y por qué.
3. **Given** una conversación en curso, **When** el agente emite un evento de **escalamiento a analista** (incluida la señal que ya emite el agente del #7 cuando el core falla), **Then** la interfaz lo muestra destacado con el motivo, y el estado visible pasa a «escalada a analista».
4. **Given** una conversación en curso, **When** el agente emite un evento de **bloqueo por regla de negocio**, **Then** la interfaz lo muestra destacado con un aviso en lenguaje claro de que la acción no se puede hacer y qué sigue, la regla aplicada y los valores que la dispararon (FR-008).
5. **Given** una solicitud en estado `preaprobada` o `escalada a analista`, **When** el solicitante escribe un mensaje, **Then** la interfaz no lo envía al agente, recuerda el estado final e indica cómo iniciar una conversación nueva o salir (FR-007a).
6. **Given** la interfaz iniciada en modo de demostración, **When** el agente invoca una herramienta del core, **Then** aparece una línea discreta con el nombre de la herramienta y su resultado; sin ese modo, la línea no aparece (FR-009).
7. **Given** un turno en el que el texto del agente dice algo sobre el estado de la solicitud (por ejemplo, «quedó aprobada») sin que haya un evento que lo respalde, **When** se muestra el turno, **Then** el estado visible de la solicitud **no** cambia: solo los eventos estructurados lo cambian.

---

### User Story 3 - Un solo catálogo de eventos para los tickets siguientes (Priority: P1)

Como equipo, quiero que todos los eventos de negocio se muestren con una sola forma común, de modo que los tickets siguientes (#9 a #16) solo tengan que emitir el evento correcto y la interfaz lo presente sin cambios.

**Why this priority**: es un criterio de aceptación explícito del issue y evita que cada ticket invente su forma de mostrar decisiones.

**Independent Test**: emitir, desde una prueba con el modelo simulado, un evento válido de cada tipo y uno con un tipo desconocido; comprobar que los válidos se muestran con la estructura común sin código específico por ticket y que el desconocido se muestra como evento no reconocido, sin perderse.

**Acceptance Scenarios**:

1. **Given** el catálogo de eventos, **When** se emite un evento de cualquiera de los cuatro tipos con sus campos obligatorios, **Then** se muestra con la misma estructura: tipo, qué pasó, motivo y, cuando aplica, regla aplicada y valores usados.
2. **Given** un evento con un tipo que no está en el catálogo o al que le faltan campos obligatorios, **When** llega a la interfaz, **Then** se muestra como «evento no reconocido», queda registrado en los logs y no cambia el estado visible de la solicitud.
3. **Given** cualquier evento mostrado, **When** se revisan los logs de la conversación, **Then** el mismo evento aparece registrado con el identificador de seguimiento de la conversación.

---

### User Story 4 - Entregar documentos pegados o como archivos de texto (Priority: P2)

Como solicitante, quiero pegar el contenido de un documento (certificado laboral, extracto) en el chat o adjuntar un archivo `.txt` o `.md`, para que el agente lo use como soporte de mi solicitud.

**Why this priority**: el enunciado y la constitución fijan esos formatos de entrada. El uso del documento (extracción, verificación) es de #10 y #11; aquí solo se entrega al agente.

**Independent Test**: pegar un texto de varias líneas y adjuntar un archivo `.md` ficticio; comprobar que ambos llegan completos al agente y que la conversación muestra que se adjuntó un archivo con su nombre. Adjuntar un archivo de otro formato y comprobar que no se lee su contenido.

**Acceptance Scenarios**:

1. **Given** una conversación en curso, **When** el solicitante pega un texto de varias líneas con el comando de pegado (`/pegar` … `/fin`), **Then** el texto llega completo al agente como un solo mensaje, respetando los saltos de línea.
2. **Given** una conversación en curso, **When** el solicitante adjunta un archivo `.txt` o `.md` legible, **Then** su contenido llega al agente identificado como documento adjunto con su nombre, y la conversación muestra que se adjuntó ese archivo.
3. **Given** una conversación en curso, **When** el solicitante adjunta un archivo de otro formato (imagen, PDF u otro) o uno que no se puede leer como texto, **Then** la interfaz no lee su contenido y le informa al agente que se adjuntó un documento no soportado, con su nombre y tipo, para que el agente aplique la regla 5 (escalar).
4. **Given** un documento entregado, **When** se revisan los logs, **Then** solo aparecen sus metadatos (nombre, tipo, tamaño), nunca su contenido completo.

---

### User Story 5 - Iniciar con un comando y reproducir un caso de prueba (Priority: P2)

Como persona que prepara la demo, quiero iniciar la interfaz con un solo comando documentado en el README y poder cargar un caso de prueba ficticio que reproduce la conversación del solicitante, para grabar el video sin teclear cada mensaje.

**Why this priority**: lo pide el issue para la demo y el video. Depende de US1 y US4, que definen cómo se envían mensajes y documentos.

**Independent Test**: en un clon limpio con la clave de API configurada, seguir el README, iniciar la interfaz con el comando indicado, cargar el caso de ejemplo y comprobar que sus mensajes y documentos se envían en orden, turno a turno, y que se ven las respuestas y los eventos del agente.

**Acceptance Scenarios**:

1. **Given** un clon limpio con las dependencias instaladas y la clave de API configurada, **When** se ejecuta el comando documentado en el README, **Then** la interfaz inicia lista para conversar.
2. **Given** que falta la clave de API, **When** se ejecuta el comando, **Then** la interfaz no inicia y explica qué falta y dónde configurarlo, sin mostrar ningún secreto.
3. **Given** la interfaz iniciada, **When** se carga un caso de prueba, **Then** cada mensaje y documento del caso se envía en su orden, esperando la respuesta del agente antes del siguiente, y la conversación se ve igual que si se hubiera escrito a mano.
4. **Given** un caso de prueba con un formato inválido o inexistente, **When** se intenta cargar, **Then** la interfaz explica el problema y no envía nada al agente.

---

### Edge Cases

- **Mensaje vacío o solo espacios**: no se envía al agente ni cuenta como turno.
- **Comando de la interfaz desconocido o mal escrito**: no se envía al agente; la interfaz lo informa y muestra la ayuda (FR-015a).
- **El agente escala por falla del core o del modelo (#7)**: la señal de escalamiento que ya emite el agente se muestra como evento de escalamiento con su motivo; la conversación no queda colgada.
- **Varios eventos en un mismo turno** (por ejemplo, se pide un documento y luego se escala): se muestran todos, en el orden en que se emitieron. El primero que lleva a un estado final lo fija, y los siguientes no lo cambian (FR-007a).
- **Evento de tipo desconocido o incompleto**: se muestra como «evento no reconocido» y se registra; no se descarta en silencio ni cambia el estado (US3, escenario 2).
- **Texto del agente que contradice los eventos**: manda el evento; el estado visible sale solo de los eventos (US2, escenario 7).
- **Varias líneas pegadas sin `/pegar`**: la primera se envía como mensaje y las demás llegan mientras el agente trabaja, así que se descartan con el aviso de FR-003.
- **Archivo adjunto vacío**: se informa al solicitante que el archivo está vacío y no se envía como documento.
- **Archivo con extensión `.txt` o `.md` pero contenido no legible como texto**: se trata como documento no soportado (US4, escenario 3).
- **Caso de prueba que referencia un documento inexistente**: la carga falla antes de enviar nada (US5, escenario 4).
- **Caso de prueba que llega a un estado final antes de terminar**: los mensajes restantes no se envían; la interfaz indica cuántos quedaron sin enviar (FR-007a).
- **El solicitante pide hablar con una persona**: la interfaz no interpreta el mensaje; lo entrega al agente, que aplica la regla 4 en su ticket (#15/#16) y emite el evento de escalamiento.
- **El solicitante cierra la interfaz a mitad de un turno**: no hay persistencia de la conversación entre ejecuciones; al volver a iniciar, empieza una conversación nueva.

## Requirements *(mandatory)*

### Functional Requirements

**Conversación**

- **FR-001**: La interfaz MUST mostrar la conversación turno a turno, con cada mensaje identificado como del solicitante o del agente, en orden cronológico.
- **FR-002**: El agente MUST conservar el contexto de los turnos anteriores dentro de una misma conversación; una conversación nueva MUST empezar sin contexto previo y con un identificador de seguimiento (`correlationId`) nuevo.
- **FR-003**: Mientras el agente prepara una respuesta, la interfaz MUST indicarlo y MUST NOT aceptar otro mensaje del solicitante hasta que termine ese turno.
- **FR-004**: La interfaz MUST mostrar el identificador de seguimiento de la conversación, para poder cruzarla con los logs durante la demo.

**Eventos de negocio**

- **FR-005**: MUST existir un catálogo único de eventos de negocio con, al menos, cuatro tipos: `preaprobacion`, `solicitud_de_dato`, `escalamiento` y `bloqueo_por_regla`. Cada evento MUST llevar: tipo, descripción de qué pasó, motivo, marca de tiempo y, cuando aplica, regla aplicada y valores usados (constitución, Principio III: decisión explicable).
- **FR-006**: La interfaz MUST mostrar todos los eventos con una misma presentación común, distinguible a simple vista del texto del agente, sin lógica de presentación específica por ticket. Un ticket nuevo MUST poder mostrar sus eventos solo emitiéndolos según el catálogo.
- **FR-007**: El estado visible de la solicitud (`en curso`, `preaprobada`, `escalada a analista`) MUST derivarse exclusivamente de los eventos estructurados, nunca de interpretar el texto del agente.
- **FR-007a**: `preaprobada` y `escalada a analista` son estados finales. Al llegar a uno, la conversación MUST cerrarse: la interfaz muestra el estado final y MUST NOT enviar más mensajes al agente; solo acepta los comandos para iniciar una conversación nueva o salir. Los eventos posteriores del mismo turno se muestran, pero no reabren la conversación ni cambian el estado final.
- **FR-008**: Cuando una regla de negocio bloquea una acción, el solicitante MUST ver, en el evento `bloqueo_por_regla`:
  1. un aviso en lenguaje claro de que la acción no se puede hacer y qué sigue;
  2. la regla aplicada (p. ej. «Regla 2: cuota mayor al 30% del ingreso verificado»);
  3. los valores que la dispararon (p. ej. cuota e ingreso).

  Los tres son obligatorios en ese tipo de evento; si falta alguno, se aplica FR-011.
- **FR-009**: Por defecto, la interfaz MUST mostrar solo mensajes y eventos de negocio, sin las herramientas que invoca el agente. Al iniciar, MUST poder activarse un **modo de demostración** que agrega una línea discreta por cada herramienta invocada, con su nombre y su resultado (éxito, error con su categoría, o reintento), visualmente subordinada a los eventos. Esas líneas MUST NOT cambiar el estado visible de la solicitud ni mostrar contenido de documentos ni secretos.
- **FR-010**: La señal de escalamiento que ya emite el agente (#7: falla transitoria persistente, falla del agente, límite de turnos, respuesta incompleta) MUST mostrarse como evento `escalamiento` del catálogo, con su motivo.
- **FR-011**: Un evento con tipo fuera del catálogo o sin sus campos obligatorios MUST mostrarse como «evento no reconocido», registrarse en los logs y no cambiar el estado visible.

**Documentos**

- **FR-012**: El solicitante MUST poder pegar texto de varias líneas como un solo mensaje, que llega completo al agente, mediante el comando de pegado (`/pegar` … `/fin`, research R8). La ayuda y el README MUST advertir que, sin ese comando, solo se envía la primera línea.
- **FR-013**: El solicitante MUST poder adjuntar archivos `.txt` o `.md`. Su contenido MUST llegar al agente identificado como documento adjunto con su nombre, y la conversación MUST mostrar que se adjuntó.
- **FR-014**: Un archivo de otro formato, o que no se puede leer como texto, MUST NOT leerse; la interfaz MUST informar al agente que se adjuntó un documento no soportado (nombre y tipo) para que aplique la regla 5. La interfaz MUST NOT decidir por su cuenta sobre la solicitud.
- **FR-015**: Los logs MUST registrar solo metadatos de los documentos (nombre, tipo, tamaño), nunca su contenido completo (constitución, Principio VI).

**Inicio y casos de prueba**

- **FR-015a**: La interfaz MUST correr en la terminal, como chat interactivo en consola. Adjuntar un archivo, cargar un caso de prueba e iniciar una conversación nueva MUST hacerse con comandos de la propia interfaz, que se distinguen de un mensaje al agente y no se envían a él. Debe haber un comando de ayuda que los liste.

- **FR-016**: La interfaz MUST iniciarse con un solo comando, documentado en el README del repositorio junto con sus requisitos previos.
- **FR-017**: Si falta la configuración obligatoria (la clave de API), la interfaz MUST NOT iniciar y MUST explicar qué falta y dónde se configura, sin mostrar secretos.
- **FR-018**: MUST poder cargarse un caso de prueba: una secuencia ordenada de mensajes del solicitante y documentos adjuntos, que la interfaz envía en orden, esperando la respuesta del agente antes de enviar el siguiente.
- **FR-019**: Un caso de prueba con formato inválido o que referencia documentos inexistentes MUST rechazarse antes de enviar nada, con una explicación.
- **FR-020**: El repositorio MUST incluir al menos un caso de prueba de ejemplo, con datos exclusivamente ficticios según `docs/datos-ficticios.md` (constitución, Principio II).

**Observabilidad y pruebas**

- **FR-021**: Cada turno y cada evento mostrado MUST quedar en los logs estructurados con el `correlationId` de la conversación (constitución, Principio VI).
- **FR-022**: La presentación de los eventos, la derivación del estado y la carga de casos de prueba MUST tener pruebas automáticas que no dependan de red ni del modelo real: el modelo se simula.

### Key Entities

- **Conversación**: secuencia de turnos entre el solicitante y el agente, con un `correlationId` propio y el estado visible de la solicitud. Vive solo mientras la interfaz está abierta.
- **Mensaje**: texto del solicitante o del agente, con su autor y su orden en la conversación.
- **Documento adjunto**: contenido de un archivo `.txt` o `.md` entregado al agente, con su nombre; o, si no es soportado, solo su nombre y tipo.
- **Evento de negocio**: hecho estructurado que emite el agente (`preaprobacion`, `solicitud_de_dato`, `escalamiento`, `bloqueo_por_regla`) con tipo, qué pasó, motivo, marca de tiempo y, cuando aplica, regla aplicada y valores usados.
- **Estado visible de la solicitud**: `en curso` (inicial), `preaprobada` o `escalada a analista` (finales, cierran la conversación); cambia solo con eventos.
- **Caso de prueba**: archivo ficticio con la secuencia de mensajes y documentos de un solicitante, para reproducir una conversación en la demo.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Una persona que no conoce el código identifica correctamente, al ver una conversación de demo, el 100% de los eventos de negocio ocurridos (preaprobación, solicitud de dato o documento, escalamiento, bloqueo) y el estado final de la solicitud.
- **SC-002**: El 100% de los eventos de los cuatro tipos se muestran con la misma estructura, y un evento de un tipo del catálogo se muestra sin cambiar la interfaz.
- **SC-003**: El 0% de los cambios del estado visible proviene del texto del agente; el 100% proviene de eventos estructurados.
- **SC-004**: Un desarrollador con un clon limpio inicia la interfaz siguiendo solo el README, con un único comando, en menos de 5 minutos.
- **SC-005**: Un caso de prueba cargado reproduce el 100% de sus mensajes y documentos en el orden definido, sin intervención manual.
- **SC-006**: El 100% de los documentos `.txt` y `.md` adjuntos llegan completos al agente, y el 0% de los contenidos de documentos aparece en los logs.
- **SC-007**: Las pruebas de presentación de eventos, derivación del estado y carga de casos corren sin red ni modelo real, y pasan.

## Assumptions

- **Medio de la interfaz**: terminal (aclaración de 2026-10-17). Es local, de un solo usuario, sin autenticación y sin servidor web. La sintaxis exacta de los comandos se define en el plan.
- **Diseño visual**: fuera de alcance (lo dice el issue). Basta con que mensajes, eventos y estado sean distinguibles a simple vista.
- **Emisores de eventos**: de los cuatro tipos, hoy el agente solo produce el escalamiento (#7). Los demás los emitirán #9 a #16; en este ticket se prueban con el modelo simulado.
- **Uso de los documentos**: la interfaz solo los entrega al agente. Extraerlos, validarlos y verificar ingresos es de #10 y #11; escalar por formato no soportado es de #15.
- **Sin persistencia**: la conversación no se guarda entre ejecuciones; reproducir una demo se hace con un caso de prueba.
- **Casos de prueba**: este ticket trae al menos un caso de ejemplo. El juego completo de escenarios obligatorios de punta a punta es del #17.
- **Modelo**: la interfaz usa el agente del #7 con el modelo real; la clave de API llega solo por variable de entorno, documentada en `.env.example` sin valor.
- **Código de producción**: vive bajo `src/`, con esta spec, como exige el guardián del #5.
