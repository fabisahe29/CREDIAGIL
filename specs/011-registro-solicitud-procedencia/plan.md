# Implementation Plan: Registro de la solicitud con procedencia

**Branch**: `13-registro-de-la-solicitud-con-procedencia` | **Date**: 2026-10-18 | **Spec**: [spec.md](spec.md)

**Issue de origen**: [fabisahe29/CREDIAGIL#13](https://github.com/fabisahe29/CREDIAGIL/issues/13)

**Input**: Feature specification from `/specs/011-registro-solicitud-procedencia/spec.md`

## Summary

El agente registra la solicitud de crédito en el core con la herramienta `registrar_solicitud`. La solicitud guarda solicitante, monto, plazo, ingreso declarado, ingreso verificado, discrepancias, inconsistencias y datos extraídos, y **cada dato lleva su procedencia**: el documento y el fragmento literal de donde salió, o la afirmación del solicitante de la que salió. Sin identidad verificada no se registra nada, y esa garantía es de código en dos capas: un hook `PreToolUse` del Agent SDK y una revalidación del lado del servidor.

**Enfoque** (ver [research.md](research.md)):

- **El core toma lo que ya sabe; el modelo solo aporta lo que oyó** (R2). Solicitante, ingreso verificado, discrepancia, inconsistencias, datos extraídos e ingreso declarado salen del estado del core (#9, #10, #11). El modelo envía `idSolicitante`, `monto`, `plazoMeses` y la procedencia de lo que dijo el solicitante.
- **Procedencia tipada** (R3): una afirmación del solicitante o un documento extraído. Un dato sin procedencia, o con una que no se puede comprobar, es un error de validación que nombra el dato y no guarda nada. El adaptador comprueba que la cita esté en lo que dijo el solicitante; el core, que el documento esté entre los extraídos.
- **Regla 1 en dos capas** (R4, R5): `registrar_solicitud` entra en `HERRAMIENTAS_CON_IDENTIDAD` y el core la vuelve a aplicar. Una solicitud con discrepancia o inconsistencia (Regla 3) se puede registrar aunque la conversación ya tenga la señal de escalamiento, porque es justo el caso que el analista necesita ver (FR-015).
- **Idempotencia y solicitud abierta** (R6, R7): la clave la calcula el código desde el solicitante, el monto y el plazo. La misma clave devuelve la solicitud ya registrada; otra clave con una solicitud abierta se rechaza (FR-017).
- **Pruebas sin modelo** (R10): el bloqueo se prueba con el hook y un core falso, y el rechazo del servidor con el cliente MCP en memoria.

## Technical Context

**Language/Version**: TypeScript `strict`, solo sintaxis borrable, ejecutado por Node ≥ 22.18 sin compilar, como el #7 a #12. En este equipo, Node v24.21.0.

**Primary Dependencies**: ninguna nueva.
- `@anthropic-ai/claude-agent-sdk` 0.3.302, `@modelcontextprotocol/sdk` 1.32.1 y `zod` 4.6.7, los del #12.

**Storage**: en memoria, en el core simulado, por conversación: un mapa de solicitudes registradas y un contador de identificadores. Sin base de datos.

**Testing**: `node --test` sobre `src/**/*.test.ts`, sin red ni modelo.
- Política: la diferencia porcentual con sus bordes (10,00%).
- Contrato compartido: esquemas de procedencia y de la solicitud registrada.
- Core y servidor MCP: el cliente MCP en memoria del #7, con el rechazo del lado del servidor.
- Control de identidad: el hook con un core falso y la herramienta `registrar_solicitud` simulada (FR-013).
- Adaptador: core falso.
- Validación con el modelo real solo en el [quickstart](quickstart.md).

**Target Platform**: la misma del #8: terminal en Windows, macOS y Linux. El core también se usa desde Claude Code (`.mcp.json`).

**Project Type**: agente, servidor MCP y chat existentes. Se agregan un módulo de contrato compartido, dos herramientas del core (una con efectos y una de lectura), una herramienta del adaptador y una función de política.

**Performance Goals**: el registro es aritmética y copias en memoria; responde en menos de 10 ms dentro del core. El tiempo límite de 5 s del cliente del core no cambia.

**Constraints**:
- La solicitud no se guarda si falla cualquier validación: ni parcial ni con datos sin procedencia (FR-005).
- El ingreso verificado, las discrepancias y los datos extraídos no se pueden enviar: los lee el core (FR-004).
- La decisión de la Regla 1 sale del estado que guarda el core, no de argumentos del modelo (FR-007).
- Los logs y la auditoría no llevan el contenido de los documentos ni los fragmentos (FR-012).
- El registro no decide ni anticipa la preaprobación ni el escalamiento (FR-015).
- Sin `any`.

**Scale/Scope**: 2 módulos nuevos (`compartido/solicitud.ts` y su prueba) y unos 12 modificados. Unas 60 pruebas nuevas.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principio / restricción | Evaluación | Resultado |
|-------------------------|-----------|-----------|
| I. Reglas de negocio inmutables | La **Regla 1** es el centro: sin identidad verificada, y de la misma persona que se registra, el hook bloquea y el core rechaza (FR-006, FR-008, FR-016). La **Regla 3** se respeta: el ingreso verificado y las discrepancias salen de la verificación que guarda el core, nunca de lo que envíe el modelo (FR-004); la discrepancia se guarda con los dos valores y el porcentaje, sin corregirla. Las **reglas 4 y 5** no se tocan: una señal de la Regla 4 o 5 sigue bloqueando todas las herramientas, también el registro, y el core rechaza si hay un documento no cubierto. La **Regla 2** no se evalúa: registrar no preaprueba ni decide (FR-015). Umbrales y tasa: este ticket no agrega ninguno; la diferencia porcentual usa la función de `src/politica/`. | ✅ |
| II. Datos exclusivamente ficticios | Pruebas, casos y quickstart usan a Ana Pérez Ficticia, documentos `000…` y correos `.example`. Los casos nuevos reutilizan los documentos ficticios del #11. | ✅ |
| III. Decisiones deterministas · esquemas | El modelo comprende y cita; el código decide. Todo lo que entra se valida con Zod y lo que no pasa es un error de validación, no un valor adivinado. La diferencia porcentual se calcula con enteros (`BigInt`), sin flotantes. La clave de idempotencia la calcula el código, no el modelo. | ✅ |
| IV. Acciones solo por herramientas MCP | El registro pasa por `registrar_solicitud` del servidor MCP. El servidor revalida la Regla 1, la procedencia y la solicitud abierta aunque el hook y el adaptador ya lo hicieran. | ✅ |
| V. Escalar ante la duda | Se registra toda solicitud con identidad verificada, también la que irá a un analista, para que reciba lo extraído, lo validado y lo pendiente (FR-015). No se inventa ni se completa un dato: lo que falta queda sin valor. Si el core no responde al comprobar la identidad, se bloquea y se escala (FR-009). | ✅ |
| VI. Observabilidad y resiliencia | `registrar_solicitud` es idempotente por clave. Cada llamada deja un log con `correlationId`, y cada registro o rechazo por regla deja una auditoría con regla, entradas relevantes, resultado y marca de tiempo, sin fragmentos. La llamada usa los reintentos acotados y el tiempo límite del adaptador; si se agotan, escala. Los errores llevan tipo y causa. | ✅ |
| Entrada y moneda | Solo COP: monto e ingresos son pesos enteros. Una moneda extranjera ya escaló por la Regla 5 antes de llegar aquí. | ✅ |
| Secretos fuera del repositorio | Sin secretos nuevos. | ✅ |
| TypeScript `strict`, sin `any` | Los argumentos llegan como `unknown` al servidor y se validan con `safeParse`; la respuesta del core se valida en el cliente. | ✅ |
| Simplicidad (YAGNI) | Sin dependencias, sin persistencia en disco y sin evento de negocio nuevo: el chat muestra la respuesta del agente y el bloqueo ya tiene su evento. El adaptador no expone una herramienta de lectura del registro. | ✅ |
| Pruebas obligatorias | Bordes de la política; herramienta MCP con el rechazo del lado del servidor; bloqueo sin identidad con el hook sin modelo; escenarios de caso consistente, discrepancia, identidad no verificada y dato sin procedencia. | ✅ |

**Gate**: aprobado.

**Re-check post-diseño**: aprobado, sin desviaciones. Los cambios al código ya entregado son aditivos, salvo uno que se justifica:
- una función más en `politica/ingreso.ts` (`calcularDiferenciaPorcentaje`); `VERSION_POLITICA` no cambia porque no cambia ninguna regla ni umbral;
- dos herramientas más en el servidor del core y en el cliente, y una en el adaptador;
- `registrar_solicitud` entra en `HERRAMIENTAS_CON_IDENTIDAD`;
- **cambio de comportamiento**: el hook y el adaptador dejan de denegar `registrar_solicitud` cuando la señal de escalamiento es de la Regla 3 (`discrepancia_de_ingreso` o `inconsistencia_documental`). Todas las demás herramientas y señales siguen denegadas. Se justifica en R5 y se prueba.

## Project Structure

### Documentation (this feature)

```text
specs/011-registro-solicitud-procedencia/
├── spec.md
├── plan.md              # Este archivo
├── research.md          # Hechos del repo y decisiones R1–R11
├── data-model.md        # Procedencia, SolicitudRegistrada, entradas y errores
├── quickstart.md        # Escenarios 1–7
├── contracts/
│   ├── politica.md      # calcularDiferenciaPorcentaje
│   ├── core-mcp.md      # registrar_solicitud y consultar_solicitud_registrada
│   └── agente.md        # herramienta del adaptador, hook y prompt
├── checklists/requirements.md
└── tasks.md             # /speckit-tasks
```

### Source Code (repository root)

```text
src/
├── politica/
│   ├── ingreso.ts                # MODIFICADO: calcularDiferenciaPorcentaje
│   └── ingreso.test.ts           # MODIFICADO
├── compartido/
│   ├── solicitud.ts              # NUEVO: esquemas de procedencia, entrada y SolicitudRegistrada; descripción de la herramienta; contieneFragmento
│   └── solicitud.test.ts         # NUEVO
├── mcp/
│   ├── core-simulado.ts          # MODIFICADO: registrarSolicitud, consultarSolicitudRegistrada, estado de solicitudes
│   ├── core-simulado.test.ts     # MODIFICADO
│   ├── servidor.ts               # MODIFICADO: herramientas registrar_solicitud y consultar_solicitud_registrada
│   ├── servidor.test.ts          # MODIFICADO
│   └── registro.test.ts          # MODIFICADO: auditoría y logs del registro
├── agente/
│   ├── cliente-core.ts           # MODIFICADO: registrarSolicitud, consultarSolicitudRegistrada
│   ├── cliente-core.test.ts      # MODIFICADO
│   ├── adaptador.ts              # MODIFICADO: herramienta registrar_solicitud; MOTIVOS_QUE_ADMITEN_REGISTRO
│   ├── adaptador.test.ts         # MODIFICADO
│   ├── control-identidad.ts      # MODIFICADO: lista de herramientas y excepción de la Regla 3
│   ├── control-identidad.test.ts # MODIFICADO: bloqueo sin modelo (FR-013)
│   ├── agente.ts                 # MODIFICADO: prompt y mensajes del solicitante al adaptador
│   └── agente.test.ts            # MODIFICADO
casos/
├── registro-solicitud/           # NUEVO: caso consistente que termina en registro
└── registro-discrepancia/        # NUEVO: ingreso inflado que termina en registro y escalamiento
CLAUDE.md                         # MODIFICADO: mapa del repositorio (#13)
DECISIONES.md                     # MODIFICADO: entrada del #13
```

**Structure Decision**:
- El esquema, la descripción de la herramienta y la comprobación de citas van en `src/compartido/solicitud.ts` porque los usan el core, el servidor, el cliente y el adaptador; así la descripción que lee el modelo no se escribe dos veces (como en el #12).
- El almacén de solicitudes registradas vive dentro del core simulado, junto a las identidades, las extracciones y las verificaciones, que son lo que lee.
- La única aritmética nueva, la diferencia porcentual, va en `src/politica/`, junto a la discrepancia del #11.
- El hook sigue siendo `control-identidad.ts`: el #9 ya reservó el lugar para esta herramienta.

## Complexity Tracking

| Complejidad | Por qué hace falta | Alternativa más simple descartada |
|-------------|--------------------|-----------------------------------|
| Procedencia de dos clases (afirmación o documento) con comprobación en dos sitios (R3) | El enunciado pide que cada dato lleve su origen; lo que dice el solicitante no sale de un documento. El adaptador es el único que ve la conversación, y el core el único que ve los documentos extraídos | Aceptar cualquier cita sin comprobar: un dato con procedencia inventada es peor que uno sin ella |
| Excepción al «escalada, ninguna herramienta» para la Regla 3 (R5) | La discrepancia solo existe después de `verificar_ingreso`, que escala. Sin la excepción, el registro de la historia 1, escenario 3, sería inalcanzable | Dejar el registro al #15: el analista recibiría el escalamiento sin la solicitud registrada y el criterio de aceptación no se cumpliría |
| Clave de idempotencia calculada por el código (R6) | Debe repetirse igual entre turnos aunque el adaptador se cree de nuevo; si la generara el modelo, un error suyo duplicaría solicitudes | Una clave aleatoria por turno: en el turno siguiente chocaría con la solicitud abierta de la misma conversación |
| `consultar_solicitud_registrada` solo en el core y el cliente (R8) | Es la forma de ver la solicitud con su procedencia sin leer el almacén; la usan las pruebas, el quickstart y los tickets #14 y #15 | Exponerla también al modelo: no la necesita, porque el registro ya le devuelve el identificador |

## Riesgos y pendientes

- **La cita de lo que dijo el solicitante no prueba que el valor esté en ella**. El adaptador comprueba que el fragmento esté, literal, en un mensaje del solicitante; no que contenga el monto, porque la gente dice «cuatro millones» y no «4.000.000». El analista ve el valor y la cita juntos. Se descartó interpretar cantidades dichas (R3).
- **El registro depende de que el modelo lo llame** después de una discrepancia. El prompt se lo indica y el quickstart lo comprueba (Escenario 5). El escalamiento con entrega completa, que no depende del modelo, es del #15.
- **«Solicitud abierta» solo cuenta las registradas por esta herramienta**. Las solicitudes de ejemplo del #7 (por ejemplo `SOL-0001000001`, de Ana Pérez Ficticia) son datos de prueba de la consulta y no bloquean un registro nuevo (R7). Si se cuentan, ninguna demo de Ana podría registrar.
- **Conversación escalada por la Regla 4 o 5**: sigue bloqueando todo, incluido el registro. Es el comportamiento del #9 y no se cambia.
- **Verificación de ingreso de otra persona**: si en la conversación cambió el solicitante verificado, la verificación guardada se ignora y la solicitud se registra sin ingreso verificado. No se transfiere (R2).
- **Prompt «no reintentes un error»**: contradice corregir una cita rechazada. Se agrega una excepción explícita para `registrar_solicitud` y el quickstart la comprueba (Escenario 6).
- **Revisión de cumplimiento del #6**: se espera la Regla 1 ✅ (hook y core), la Regla 3 ✅ (ingreso y discrepancia del core), la Regla 2 ➖ (no se evalúa) y las reglas 4 y 5 ➖ o ✅ (siguen bloqueando). Ningún umbral debe aparecer como literal fuera de `politica.ts`.
