# Feature Specification: Esqueleto del agente y del servidor MCP de originación

**Feature Branch**: `7-esqueleto-del-agente-y-del-servidor-mcp`

**Created**: 2026-10-17

**Status**: Draft

**Issue de origen**: [fabisahe29/CREDIAGIL#7 — Esqueleto del agente y del servidor MCP de originación](https://github.com/fabisahe29/CREDIAGIL/issues/7)

**Épica / Milestone**: `epica:agente-originacion` · M2 · Agente MVP · **Depende de**: #3 (Done), #5 (Done)

**Trazabilidad con el enunciado**: Comportamientos 1 y 4 · Caso de prueba 7 · Mínimo: servidor MCP propio

**Input**: Contenido del issue #7, entregado por `/ticket-tomar`.

## Clarifications

### Session 2026-10-17

- Q: Cuando el core falla de forma pasajera, ¿cuántas veces debe reintentar el agente y cuánto debe esperar entre un intento y otro? → A: 2 reintentos (3 intentos en total), con espera creciente de 0,5 s y 1 s y una pequeña variación aleatoria.
- Q: Si el core sigue fallando después de los reintentos, ¿qué hace el agente: solo avisa al solicitante, solo escala la solicitud a un analista, o las dos cosas? → A: Ambas. Informa al solicitante que su caso pasa a un analista y emite una señal estructurada de escalamiento (motivo, herramienta y `correlationId`), que el #15 convertirá en el handoff completo.
- Q: ¿Cómo se provoca a propósito la falla pasajera del core, tanto en las pruebas automáticas como en una demo en vivo? → A: Configuración al arrancar. En las pruebas, el core simulado recibe la falla como opción al crearse; en la demo, una variable de entorno del servidor (modos `una-vez` y `siempre`). El agente no puede activarla ni verla.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - El agente conversa usando el core de originación simulado (Priority: P1)

Como equipo de producto, quiero un agente mínimo que atienda una conversación y, cuando la necesite, consulte el core de originación simulado a través de sus herramientas. Así queda verificado de extremo a extremo que el agente y el core se comunican, antes de construir cada capacidad de negocio sobre esa base.

**Why this priority**: todas las capacidades del agente (#9 a #16) dependen de esta conexión. Sin ella, ninguna se puede probar.

**Independent Test**: iniciar una conversación con un mensaje que requiere consultar el core (por ejemplo, el estado de una solicitud ficticia existente), y comprobar que el agente llama a la herramienta del core, recibe el resultado y responde usándolo, sin inventar datos.

**Acceptance Scenarios**:

1. **Given** el core simulado con una solicitud ficticia registrada, **When** el solicitante pregunta por ella, **Then** el agente consulta el core con su herramienta y responde con los datos que el core devolvió.
2. **Given** un mensaje que el agente puede responder sin consultar el core (por ejemplo, un saludo), **When** el agente responde, **Then** no llama a ninguna herramienta y la conversación termina en ese turno.
3. **Given** un turno en el que el modelo pide usar una herramienta, **When** el core responde, **Then** el ciclo continúa hasta que el modelo indica que terminó; la decisión de seguir o parar sale de la razón de parada del modelo, no de un número fijo de vueltas ni de buscar palabras en el texto.
4. **Given** una conversación en la que el modelo encadena varias consultas, **When** cada una devuelve su resultado, **Then** el agente sigue el ciclo hasta que el modelo deja de pedir herramientas, sin superar un límite de seguridad que, al alcanzarse, se informa al solicitante y se escala a un analista, nunca como respuesta inventada.

---

### User Story 2 - Todas las herramientas hablan el mismo idioma de errores (Priority: P1)

Como equipo de producto, quiero que cada herramienta del core informe sus errores con el mismo contrato: la categoría (transitorio, de validación, de negocio o de permisos) y si se puede reintentar. Así el agente decide qué hacer ante un error por su tipo, no interpretando mensajes de texto, y cada herramienta nueva hereda el mismo comportamiento.

**Why this priority**: es la base de la resiliencia (US3) y de la escalada ante la duda (constitución, Principio V). Sin un contrato común, cada herramienta futura inventaría su propio formato de error.

**Independent Test**: provocar en una herramienta un error de cada categoría y comprobar que cada uno llega al agente con su categoría, su indicación de reintento y un mensaje legible; y que una consulta sin resultados llega como éxito vacío.

**Acceptance Scenarios**:

1. **Given** una herramienta del core, **When** recibe una entrada que no cumple su esquema, **Then** devuelve un error de **validación**, no reintentable, que indica qué campo falla.
2. **Given** una herramienta del core, **When** la operación viola una regla del core (por ejemplo, consultar algo en un estado que no lo permite), **Then** devuelve un error de **negocio**, no reintentable, con el motivo.
3. **Given** una herramienta del core, **When** la operación no está permitida para quien la pide, **Then** devuelve un error de **permisos**, no reintentable.
4. **Given** una herramienta del core, **When** ocurre una falla temporal del servidor, **Then** devuelve un error **transitorio**, reintentable.
5. **Given** una consulta válida que no encuentra resultados, **When** se ejecuta, **Then** devuelve una respuesta **exitosa vacía**, no un error.

---

### User Story 3 - El agente resiste una falla transitoria sin inventar resultados (Priority: P2)

Como solicitante, quiero que, si el core falla de forma pasajera, el agente lo intente de nuevo unas pocas veces y, si la falla persiste, me lo diga con claridad en lugar de darme una respuesta inventada.

**Why this priority**: el caso de prueba 7 del enunciado exige este comportamiento, y la constitución (Principio VI) prohíbe decidir sin respuesta. Depende de US2, que define qué es un error transitorio.

**Independent Test**: arrancar el core simulado con la falla transitoria activada y hacer una pregunta que requiere consultarlo. En modo `una-vez`, el agente reintenta y responde con el dato real. En modo `siempre`, hace 3 intentos, avisa al solicitante que su caso pasa a un analista, registra la señal de escalamiento y no inventa el resultado.

**Acceptance Scenarios**:

1. **Given** la falla transitoria simulada activada en modo `una-vez`, **When** el agente consulta el core, **Then** el reintento obtiene el resultado y el solicitante recibe la respuesta correcta.
2. **Given** la falla transitoria simulada activada en modo `siempre`, **When** el agente consulta el core, **Then** reintenta 2 veces (3 intentos en total), esperando unos 0,5 s antes del primer reintento y 1 s antes del segundo, y se detiene.
3. **Given** que los reintentos se agotaron, **When** el agente responde, **Then** informa al solicitante que no pudo consultar el core y que su caso pasa a un analista, y emite una señal estructurada de escalamiento con el motivo «falla transitoria persistente», la herramienta afectada y el `correlationId`, sin inventar el resultado de la consulta.
4. **Given** un error no reintentable (validación, negocio o permisos), **When** el agente lo recibe, **Then** no reintenta.

---

### User Story 4 - El core simulado guarda solo datos ficticios (Priority: P2)

Como equipo, quiero que el core de originación simulado guarde sus datos en memoria o en archivos locales, y que todos sigan la convención de datos ficticios del repositorio. Así el agente se puede probar sin servicios externos y sin riesgo de datos reales.

**Why this priority**: la constitución (Principio II) declara no negociable el uso de datos ficticios, y el enunciado pide un core simulado. Es la fuente de datos de US1 y US3.

**Independent Test**: arrancar el core simulado sin conexión a ningún servicio externo, consultar sus datos de ejemplo y comprobar que todos los identificadores siguen la convención ficticia (prefijo `000`, dominios `.example`).

**Acceptance Scenarios**:

1. **Given** el core simulado recién arrancado, **When** se consultan sus datos de ejemplo, **Then** existen y todos los identificadores, correos y nombres son ficticios según `docs/datos-ficticios.md`.
2. **Given** el core simulado, **When** funciona, **Then** no depende de red, bases de datos externas ni credenciales.

---

### User Story 5 - El servidor está disponible también en Claude Code y su contrato está probado (Priority: P3)

Como desarrollador, quiero que el servidor del core quede registrado en la configuración MCP de Claude Code del proyecto, sin credenciales, y que el contrato de errores tenga pruebas junto al código. Así puedo explorar las herramientas del core desde Claude Code y cualquier cambio que rompa el contrato se detecta.

**Why this priority**: mejora la experiencia de desarrollo y la confianza en el contrato, pero no cambia el comportamiento del agente.

**Independent Test**: abrir Claude Code en el repositorio y comprobar que el servidor del core aparece entre los servidores MCP del proyecto sin pedir credenciales; ejecutar las pruebas y comprobar que cubren cada categoría de error y la respuesta vacía.

**Acceptance Scenarios**:

1. **Given** la configuración MCP del proyecto, **When** se lee, **Then** declara el servidor del core sin ninguna credencial ni secreto.
2. **Given** las pruebas del contrato de errores, **When** se ejecutan, **Then** cubren las 4 categorías, la indicación de reintento y la respuesta exitosa vacía, y pasan.

---

### Edge Cases

- **Respuesta vacía frente a error**: una consulta por un identificador que no existe devuelve éxito vacío (US2, escenario 5). Un identificador mal formado devuelve error de validación.
- **El modelo nunca deja de pedir herramientas**: el ciclo tiene un límite de seguridad. Al alcanzarlo, la conversación termina con un aviso y una señal de escalamiento, no con una respuesta inventada (US1, escenario 4).
- **Razón de parada inesperada** (por ejemplo, límite de tokens, un rechazo del modelo o cualquier valor desconocido): el agente no la trata como respuesta final válida; informa que no pudo completar la respuesta y escala (FR-004, FR-012).
- **Falla de la llamada al modelo** (error de la API o de ejecución del agente): el agente reintenta la conversación una vez; si vuelve a fallar, informa y escala, sin decidir nada (FR-013).
- **Falla transitoria que se resuelve en el último reintento**: cuenta como éxito; el solicitante recibe el dato real.
- **Error no reintentable con mensaje que parece transitorio**: manda la categoría declarada, no el texto del mensaje.
- **Herramienta que responde fuera de contrato** (sin categoría o con una desconocida): el agente la trata como error no reintentable y no inventa el resultado.
- **Petición de hablar con una persona o caso fuera de política durante la prueba del esqueleto**: el esqueleto no implementa esas reglas (llegan en #15 y #16); no debe improvisar una decisión de negocio. Fuera de alcance aquí.
- **Dato con forma real en los datos de ejemplo**: el guardián del #5 lo bloquea al escribirlo; los datos de ejemplo siguen la convención `000`.
- **El core simulado se reinicia**: los datos en memoria vuelven a los de ejemplo; no se espera persistencia entre ejecuciones salvo que el plan elija archivos locales.

## Requirements *(mandatory)*

### Functional Requirements

**Agente y ciclo agéntico**

- **FR-001**: El agente MUST construirse con el Claude Agent SDK y MUST actuar sobre el core únicamente mediante las herramientas del servidor MCP propio (constitución, Principio IV).
- **FR-002**: El ciclo del agente MUST continuar o terminar según la razón de parada del modelo: sigue mientras el modelo pide herramientas y termina cuando el modelo indica que terminó. MUST NOT decidirse por un número fijo de iteraciones ni buscando palabras en el texto.
- **FR-003**: El ciclo MUST tener un límite de seguridad de vueltas que, al alcanzarse, termina la conversación con aviso y escalamiento (FR-012, motivo `limite_de_turnos`). Este límite es una protección, no el criterio normal de parada (FR-002).
- **FR-004**: Una razón de parada distinta de "terminó" y de "pide herramientas" (por ejemplo, límite de tokens, rechazo o un valor desconocido) MUST tratarse como respuesta incompleta: se informa y se escala (FR-012, motivo `respuesta_incompleta`), sin presentarse como respuesta final.

**Contrato de errores común**

- **FR-005**: Todas las herramientas del servidor MCP MUST compartir un contrato de error con: categoría (`transitorio`, `validacion`, `negocio` o `permisos`), indicación explícita de si se puede reintentar, un código estable y un mensaje legible para el agente.
- **FR-006**: Solo los errores `transitorio` MUST marcarse como reintentables. Los de `validacion`, `negocio` y `permisos` MUST marcarse como no reintentables.
- **FR-007**: Una consulta válida sin resultados MUST devolver una respuesta exitosa vacía, no un error.
- **FR-008**: Toda entrada de herramienta MUST validarse contra un esquema tipado; una entrada que no lo cumple MUST devolver un error `validacion` que indique el campo (constitución, Principio III).
- **FR-009**: El agente MUST decidir qué hacer ante un error por su categoría e indicación de reintento, nunca por el texto del mensaje. Una respuesta fuera de contrato MUST tratarse como error no reintentable.

**Resiliencia**

- **FR-010**: El core simulado MUST permitir provocar una falla transitoria de forma controlada, configurada **al arrancar**:
  1. **Pruebas**: el core simulado recibe la falla como opción al crearse, sin estado global, para que cada prueba sea reproducible.
  2. **Demo**: una variable de entorno del servidor MCP, documentada en `.env.example` sin valor, con los modos `una-vez` (falla la primera llamada y las siguientes responden) y `siempre` (todas las llamadas fallan). Sin la variable, no hay falla.
  3. El mecanismo MUST NOT exponerse como herramienta MCP ni depender de datos de negocio: el agente no puede activarlo ni verlo.
- **FR-011**: Ante un error `transitorio`, el agente MUST reintentar como máximo 2 veces (3 intentos en total), con espera creciente: 0,5 s antes del primer reintento y 1 s antes del segundo, más una variación aleatoria de hasta un 20% de cada espera. Ante un error no reintentable, MUST NOT reintentar.
- **FR-012**: Cuando la conversación no puede terminar con una respuesta válida, el agente MUST hacer las dos cosas (constitución, Principios V y VI):
  1. informar al solicitante, en lenguaje claro, que no pudo completar la atención y que su caso pasa a un analista;
  2. emitir una **señal de escalamiento** estructurada, que sirve de registro de auditoría: motivo, regla aplicada, resultado, `correlationId` y marca de tiempo, más la herramienta afectada y el número de intentos cuando aplica.

  Motivos:
  - `falla_transitoria_persistente`: el core sigue fallando tras los reintentos (FR-011);
  - `falla_del_agente`: la llamada al modelo o la ejecución del agente fallaron tras su reintento (FR-013);
  - `limite_de_turnos`: se alcanzó el límite de seguridad (FR-003);
  - `respuesta_incompleta`: razón de parada inesperada (FR-004).

  MUST NOT inventar el resultado de la consulta. El handoff completo al analista es del #15; aquí basta la señal, registrada en los logs JSON.
- **FR-013**: Las llamadas del agente al modelo y al servidor MCP MUST tener tiempo límite y reintentos acotados con backoff (constitución, Principio VI):
  1. **al core**: tiempo límite por llamada; agotarlo cuenta como error `transitorio` y se reintenta según FR-011;
  2. **al modelo**: tiempo límite por conversación; si la conversación termina en error de ejecución (incluido el tiempo agotado), el agente la reintenta **una vez**, tras 1 s ±20%; si vuelve a fallar, escala con el motivo `falla_del_agente`.

**Core simulado y datos**

- **FR-014**: El core simulado MUST guardar sus datos en memoria o en archivos locales del repositorio, sin red, bases de datos externas ni credenciales.
- **FR-015**: Todos los datos del core simulado MUST ser ficticios y seguir `docs/datos-ficticios.md`: identificadores con prefijo `000`, correos con dominio `.example` y nombres inventados (constitución, Principio II).
- **FR-016**: El esqueleto MUST exponer al menos una herramienta de consulta del core que permita demostrar una respuesta con datos, una respuesta vacía y cada categoría de error. No implementa reglas de negocio de originación (fuera de alcance).

**Observabilidad**

- **FR-017**: Cada conversación MUST tener un `correlationId` que acompañe cada turno del agente y cada llamada a herramienta en logs estructurados (JSON). Los logs MUST NOT contener secretos ni el contenido completo de documentos (constitución, Principio VI).

**Configuración y pruebas**

- **FR-018**: El servidor del core MUST quedar registrado en la configuración MCP de Claude Code del proyecto, sin credenciales ni secretos.
- **FR-019**: El contrato de errores MUST tener pruebas junto al código que cubran las 4 categorías, la indicación de reintento y la respuesta exitosa vacía. Las pruebas MUST NOT depender de red ni del modelo real: el modelo se simula.
- **FR-020**: El comportamiento de reintento y de falla persistente (US3) MUST tener pruebas con el modelo simulado y la falla controlada de FR-010.

### Key Entities

- **Agente de originación**: atiende la conversación con el solicitante y usa las herramientas del core. Su ciclo depende de la razón de parada del modelo.
- **Servidor MCP del core**: expone las herramientas del core de originación simulado, con contratos de entrada y salida tipados.
- **Herramienta del core**: operación con entrada validada por esquema y salida que es un resultado (posiblemente vacío) o un error del contrato común.
- **Error del contrato**: categoría (`transitorio`, `validacion`, `negocio`, `permisos`), reintentable (sí/no), código estable y mensaje legible.
- **Core simulado**: almacén de datos ficticios en memoria o en archivos locales, con una falla transitoria activable.
- **Señal de escalamiento**: registro estructurado y de auditoría de que la conversación debe pasar a un analista: motivo, regla aplicada, resultado, `correlationId`, marca de tiempo y, cuando aplica, herramienta afectada e intentos. En este ticket se emite y se registra en los logs JSON; el #15 la convierte en handoff.
- **Turno**: un intercambio del ciclo agéntico (mensaje del modelo, llamadas a herramientas y sus resultados), con su razón de parada y el `correlationId` de la conversación.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: En el 100% de las conversaciones de prueba que requieren el core, el agente responde con los datos que devolvió el core, sin datos inventados.
- **SC-002**: El 100% de los errores de las herramientas llegan al agente con categoría e indicación de reintento; el 0% depende del texto del mensaje para clasificarse.
- **SC-003**: El 100% de las consultas válidas sin resultados devuelven éxito vacío.
- **SC-003a**: Ante una falla transitoria persistente, el agente hace exactamente 3 intentos y su espera total entre intentos no supera 1,8 s.
- **SC-004**: Con la falla en modo `una-vez`, el 100% de las consultas terminan con el dato real; en modo `siempre`, el 100% terminan sin dato inventado, con el aviso al solicitante y con una señal de escalamiento registrada.
- **SC-005**: El 0% de los ciclos termina por un conteo fijo de vueltas en condiciones normales; solo el límite de seguridad (FR-003) puede cortarlos, y siempre con aviso y señal de escalamiento.
- **SC-005a**: El 100% de las conversaciones que no terminan con una respuesta válida (core caído, falla del agente, límite de turnos o razón de parada inesperada) terminan con aviso al solicitante y una señal de escalamiento con su motivo; el 0% termina sin escalar.
- **SC-006**: El 100% de los identificadores de los datos de ejemplo del core cumplen la convención de datos ficticios.
- **SC-007**: Un desarrollador con un clon limpio ve el servidor del core en Claude Code con 0 credenciales configuradas.
- **SC-008**: Las pruebas del contrato de errores y de la resiliencia corren sin red ni modelo real, y pasan.

## Assumptions

- **Herramienta mínima**: el esqueleto trae una sola herramienta de consulta (por ejemplo, el estado de una solicitud ficticia por su identificador) para ejercitar datos, vacío y errores. Las herramientas de negocio (verificar identidad, registrar, preaprobar, escalar) llegan en sus propios tickets (#9 a #15).
- **Sin reglas de negocio**: las reglas 1 a 5 de la constitución no se implementan en este ticket; el esqueleto no decide nada de originación. La revisión de cumplimiento del #6 las informará como no aplicables o verificará que no se improvisen.
- **Modelo**: el agente usa un modelo Claude a través del Claude Agent SDK; la clave de API llega solo por variable de entorno y se documenta en `.env.example` sin valor (constitución, Restricciones técnicas).
- **Interfaz**: la interfaz de chat es del #8. Aquí basta una forma mínima de iniciar una conversación (por ejemplo, desde una prueba o un comando de demostración).
- **Escalamiento**: el handoff completo al analista es del #15. Aquí basta la señal estructurada de escalamiento de FR-012, sin el flujo completo.
- **Código de producción**: todo lo de este ticket vive bajo `src/` (agente y servidor MCP), con su spec, que el guardián del #5 exige.
- **Fuera de alcance**: el comportamiento de negocio de cada herramienta, que se construye en su propio ticket.
