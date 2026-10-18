# Implementation Plan: Preaprobación automática dentro de la política

**Branch**: `14-preaprobacion-automatica-dentro-de-la` | **Date**: 2026-10-18 | **Spec**: [spec.md](spec.md)

**Issue de origen**: [fabisahe29/CREDIAGIL#14](https://github.com/fabisahe29/CREDIAGIL/issues/14)

**Input**: Feature specification from `/specs/012-preaprobacion-automatica-politica/spec.md`

## Summary

El agente preaprueba automáticamente solo los casos simples con la herramienta `preaprobar_credito`. Una solicitud registrada (#13) se preaprueba si su monto es de hasta $5.000.000, su cuota no supera el 30% del ingreso mensual verificado y no hay discrepancia de ingresos. Cualquier otro caso se bloquea por código y el agente escala a un analista, sin ofrecer alternativas. La preaprobación es solo la constancia de que se cumple la política: deja la solicitud en estado «preaprobada» con la decisión explicable, sin vigencia ni condiciones.

**Enfoque** (ver [research.md](research.md)):

- **Política** (`src/politica/preaprobacion.ts`): la función pura `evaluarRegla2` decide con aritmética entera exacta (`cuota · 100 ≤ 30 · ingreso`, con `BigInt`) y devuelve la decisión explicable. El tope y el porcentaje viven solo en `politica.ts` (R1, R2).
- **El modelo no aporta ningún dato**: `preaprobar_credito` no tiene campos de entrada. Todo sale de la solicitud registrada del core (R3).
- **Tres capas de código** (R4): un hook nuevo `PreToolUse` que recalcula la Regla 2 con la solicitud del core; la Regla 1 del hook de identidad del #9; y la revalidación del servidor con la misma función de política.
- **Escalar, no insistir** (R5): un bloqueo por la Regla 2 deja la señal de escalamiento `preaprobacion_fuera_de_politica`, decidida por código. La falta de solicitud registrada no escala: pide registrar primero.
- **Estado de la solicitud** (R6): la solicitud registrada pasa de `en_estudio` a `preaprobada` y sigue contando como abierta.
- **Pruebas sin modelo** (R10): bordes exactos de la política, el hook con un core falso, el rechazo del servidor y los escenarios con el chat.

## Technical Context

**Language/Version**: TypeScript `strict`, solo sintaxis borrable, ejecutado por Node ≥ 22.18 sin compilar, como el #7 a #13. En este equipo, Node v24.21.0.

**Primary Dependencies**: ninguna nueva.
- `@anthropic-ai/claude-agent-sdk` 0.3.302, `@modelcontextprotocol/sdk` 1.32.1 y `zod` 4.6.7, los del #13.

**Storage**: en memoria, en el core simulado: la preaprobación se guarda en la solicitud registrada del #13. Sin base de datos.

**Testing**: `node --test` sobre `src/**/*.test.ts`, sin red ni modelo.
- Política: funciones puras con los bordes exactos de $5.000.000 y del 30%.
- Contrato compartido: esquemas y descripción de la herramienta.
- Core y servidor MCP: el cliente MCP en memoria del #7, con el rechazo del lado del servidor.
- Hooks: un core falso, sin modelo (FR-013).
- Adaptador y agente: core falso.
- Validación con el modelo real solo en el [quickstart](quickstart.md).

**Target Platform**: la misma del #8: terminal en Windows, macOS y Linux. El core también se usa desde Claude Code (`.mcp.json`).

**Project Type**: agente, servidor MCP y chat existentes. Se agregan un módulo de política, un módulo de contrato compartido, un hook, una herramienta del core y una del adaptador.

**Performance Goals**: la decisión es aritmética y copias en memoria; responde en menos de 10 ms dentro del core. El tiempo límite de 5 s del cliente del core no cambia.

**Constraints**:
- La decisión sale de la solicitud registrada, nunca de lo que envíe el modelo (FR-004).
- El tope y el porcentaje no se repiten como literal fuera de `politica.ts`, y no se dan al modelo (FR-002, FR-006).
- Un bloqueo no deja una preaprobación, ni parcial.
- La cuota es la del #12, redondeada al peso; la comparación con el 30% no usa flotantes.
- Los logs y la auditoría no llevan el contenido de los documentos.
- Sin `any`.

**Scale/Scope**: 5 módulos nuevos (`politica/preaprobacion.ts`, `compartido/preaprobacion.ts`, `agente/control-preaprobacion.ts` y sus pruebas) y unos 14 modificados. Unas 90 pruebas nuevas.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principio / restricción | Evaluación | Resultado |
|-------------------------|-----------|-----------|
| I. Reglas de negocio inmutables | La **Regla 2** es el centro: monto ≤ $5.000.000 y cuota ≤ 30% del ingreso verificado, con los bordes exactos incluidos, y cualquier otro caso a un analista. El orden 4 → 5 → 1 → 3 → 2 se respeta: `evaluarRegla2` mira primero la verificación de ingreso (Regla 3) y después el monto y la cuota, y la Regla 1 la aplican antes el hook de identidad y el servidor. La **Regla 3** no se relaja: sin ingreso verificado o con discrepancia no se preaprueba. Las **reglas 4 y 5** no se tocan: una señal de la Regla 4 o 5 sigue bloqueando todas las herramientas. El 5.000.000 y el 30% viven solo en `politica.ts`, versionados. | ✅ |
| II. Datos exclusivamente ficticios | Pruebas, casos y quickstart usan a Ana Pérez Ficticia, documentos `000…` y correos `.example`; los casos nuevos reutilizan los documentos ficticios del #11. | ✅ |
| III. Decisiones deterministas · esquemas | La decisión y la cuota se calculan en código con `calcularCuota` del #12. La comparación con el 30% usa enteros (`BigInt`), no el porcentaje redondeado a dos decimales. Todo lo que entra se valida con Zod, y el modelo no envía ningún dato. Cada decisión sale explicable: regla, valores y motivo. | ✅ |
| IV. Acciones solo por herramientas MCP | La preaprobación pasa por `preaprobar_credito` del servidor MCP, que revalida la Regla 1, la solicitud registrada, la Regla 3 y la Regla 2 aunque el hook ya lo hiciera. | ✅ |
| V. Escalar ante la duda | Un bloqueo por la Regla 2, un estado de verificación dudoso, una cuota no calculable o un core que no responde escalan a un analista. El agente no insiste ni ofrece alternativas (FR-017). | ✅ |
| VI. Observabilidad y resiliencia | `preaprobar_credito` es idempotente por solicitud. Cada decisión (preaprobada o bloqueada) deja `auditoria_preaprobacion` con regla, entradas, resultado y marca de tiempo, y un log con `correlationId`. La llamada usa los reintentos acotados y el tiempo límite del adaptador; si se agotan, escala. | ✅ |
| Entrada y moneda | Solo COP: monto, cuota e ingreso son pesos enteros. | ✅ |
| Secretos fuera del repositorio | Sin secretos nuevos. | ✅ |
| TypeScript `strict`, sin `any` | Los argumentos llegan como `unknown` al servidor y se validan con `safeParse`; la respuesta del core se valida en el cliente. | ✅ |
| Simplicidad (YAGNI) | Sin dependencias, sin persistencia en disco, sin clave de idempotencia aparte (la solicitud es la clave) y sin evento de negocio nuevo: el catálogo ya trae `preaprobacion`. Sin vigencia ni condiciones (aclaración Q1). | ✅ |
| Pruebas obligatorias | Bordes exactos de $5.000.000 y 30% con el valor inmediatamente por encima y por debajo; herramienta MCP con rechazo del lado del servidor; hooks sin modelo; escenarios de caso preaprobable, monto alto, cuota alta e identidad no verificada. | ✅ |

**Gate**: aprobado.

**Re-check post-diseño**: aprobado, sin desviaciones. Los cambios al código ya entregado son aditivos, salvo dos que se justifican:
- `SolicitudRegistrada.estado` del #13 pasa de un literal `en_estudio` a `en_estudio | preaprobada`, y se agrega el campo `preaprobacion`. Obliga a actualizar las pruebas del #13 que arman ese esquema.
- «Solicitud abierta» (R7 del #13) ahora cuenta también `preaprobada`; si no, un solicitante con una solicitud preaprobada podría registrar otra.
- `VERSION_POLITICA` sube de `2026-10-18.2` a `2026-10-18.3`.

## Project Structure

### Documentation (this feature)

```text
specs/012-preaprobacion-automatica-politica/
├── spec.md
├── plan.md              # Este archivo
├── research.md          # Hechos del repo y decisiones R1–R11
├── data-model.md        # Parámetros, Preaprobacion, DecisionRegla2, errores
├── quickstart.md        # Escenarios 1–8
├── contracts/
│   ├── politica.md      # evaluarRegla2: orden, bordes y códigos
│   ├── core-mcp.md      # preaprobar_credito: entrada, salida y errores
│   └── agente.md        # herramienta, hook, escalamiento y prompt
├── checklists/requirements.md
└── tasks.md             # /speckit-tasks
```

### Source Code (repository root)

```text
src/
├── politica/
│   ├── politica.ts               # MODIFICADO: TOPE_MONTO_PREAPROBACION, PORCENTAJE_MAXIMO_CUOTA; versión
│   ├── preaprobacion.ts          # NUEVO: evaluarRegla2 y REGLA_2
│   └── preaprobacion.test.ts     # NUEVO: bordes exactos
├── compartido/
│   ├── preaprobacion.ts          # NUEVO: esquemas Preaprobacion y DecisionRegla2, descripción de la herramienta
│   ├── preaprobacion.test.ts     # NUEVO
│   ├── solicitud.ts              # MODIFICADO: estado preaprobada y campo preaprobacion
│   └── solicitud.test.ts         # MODIFICADO
├── mcp/
│   ├── datos-ejemplo.ts          # MODIFICADO: EstadoSolicitud incluye preaprobada
│   ├── core-simulado.ts          # MODIFICADO: preaprobarSolicitud; solicitud abierta incluye preaprobada
│   ├── core-simulado.test.ts     # MODIFICADO
│   ├── servidor.ts               # MODIFICADO: herramienta preaprobar_credito
│   └── servidor.test.ts          # MODIFICADO
├── agente/
│   ├── cliente-core.ts           # MODIFICADO: preaprobarSolicitud
│   ├── cliente-core.test.ts      # MODIFICADO
│   ├── core-no-simulado.ts       # MODIFICADO
│   ├── adaptador.ts              # MODIFICADO: herramienta, señal preaprobacion_fuera_de_politica, evento
│   ├── adaptador.test.ts         # MODIFICADO
│   ├── control-preaprobacion.ts  # NUEVO: hook de la Regla 2
│   ├── control-preaprobacion.test.ts # NUEVO: sin modelo, con bordes
│   ├── control-identidad.ts      # MODIFICADO: preaprobar_credito exige identidad
│   ├── control-identidad.test.ts # MODIFICADO
│   ├── agente.ts                 # MODIFICADO: hook, aviso de la señal, prompt
│   └── agente.test.ts            # MODIFICADO
casos/
├── preaprobacion-simple/         # NUEVO: caso preaprobable
├── preaprobacion-monto-alto/     # NUEVO: monto por encima del tope
└── preaprobacion-cuota-alta/     # NUEVO: cuota por encima del 30%
CLAUDE.md                         # MODIFICADO: mapa del repositorio (#14)
DECISIONES.md                     # MODIFICADO: entrada del #14
```

**Structure Decision**:
- La regla, el tope y el porcentaje van en `src/politica/`, la única fuente que fija la constitución. El core, el hook y las pruebas llaman a la misma función, así la cifra que decide es la misma en las tres capas.
- El hook va en un archivo propio, `control-preaprobacion.ts`: `control-identidad.ts` decide la Regla 1 y no debe crecer con la Regla 2. Los dos corren sobre el mismo evento `PreToolUse`.
- Los esquemas y la descripción que lee el modelo van en `src/compartido/`, porque los usan el servidor, el cliente y el adaptador.

## Complexity Tracking

| Complejidad | Por qué hace falta | Alternativa más simple descartada |
|-------------|--------------------|-----------------------------------|
| Un hook nuevo además del hook de identidad (R4) | El criterio pide que un hook del Agent SDK bloquee la preaprobación y recalcule con la solicitud; la Regla 2 no debe mezclarse con el control de identidad | Ampliar `control-identidad.ts`: mezcla dos reglas en un archivo y complica sus pruebas |
| Comparación con el 30% con `BigInt` y no con la relación redondeada (R2) | La relación del #12 se redondea a dos decimales: 30,004% daría 30,00% y se preaprobaría un caso fuera de política | Reusar `calcularRelacionCuotaIngreso` y comparar con 30: error exacto en el borde |
| Tocar el esquema de la solicitud registrada del #13 (R6) | La constancia debe quedar en la solicitud y el chat ya muestra el estado «preaprobada»; sin el estado no hay nada que consultar | Guardar la preaprobación aparte: dos registros por solicitud y el #15 tendría que cruzarlos |
| Nuevo motivo de escalamiento `preaprobacion_fuera_de_politica` (R5) | El escalamiento se decide por código y cada motivo lleva su regla y su aviso; la Regla 2 todavía no tenía uno | Reusar `caso_no_cubierto`: es de la Regla 5 y confundiría la regla que se audita |

## Riesgos y pendientes

- **El modelo debe llamar a `preaprobar_credito`** tras registrar. Si no lo hace, el caso queda registrado y sin preaprobar; es seguro (nada se compromete) pero lento. El prompt se lo indica y el quickstart lo comprueba (Escenario 2).
- **Discrepancia registrada**: el fallo conocido del #13 (el modelo no registra tras una discrepancia) hace que ese caso no llegue a tener solicitud; por eso se rechaza por falta de solicitud registrada, no por discrepancia. El bloqueo por discrepancia solo se ejerce con pruebas del core y del hook, no con el chat.
- **Identidad (FR-007)**: la Regla 1 sigue como en el #9: el hook bloquea con el siguiente paso de identificarse y no escala. FR-007 pide escalar ante un bloqueo de la Regla 2; se interpreta así porque con la identidad sin verificar no puede haber solicitud registrada, y el bloqueo ya trae su camino.
- **Conversación cerrada tras la preaprobación**: el chat ya cierra la conversación con el evento `preaprobacion` (estado «preaprobada»). Es el comportamiento del #8 y no se cambia.
- **Revisión de cumplimiento del #6**: se espera la Regla 2 ✅, la Regla 1 ✅, la Regla 3 ✅ (no se relaja) y las reglas 4 y 5 ➖. El 5.000.000 y el 30% no deben aparecer como literal fuera de `politica.ts`, ni en la descripción que lee el modelo.
