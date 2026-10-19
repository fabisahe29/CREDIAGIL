# Implementation Plan: Escalamiento con criterio y handoff al analista

**Branch**: `15-escalamiento-con-criterio-y-handoff-al` | **Date**: 2026-10-18 | **Spec**: [spec.md](spec.md)

**Issue de origen**: [fabisahe29/CREDIAGIL#15](https://github.com/fabisahe29/CREDIAGIL/issues/15)

**Input**: Feature specification from `/specs/013-escalamiento-analista/spec.md`

## Summary

Cuando un caso pasa a una persona, el analista recibe un resumen estructurado y autocontenido, y el solicitante sabe que un analista revisará su caso. El resumen lo arma y valida el core con lo que ya guardó (solicitante, solicitud registrada, ingresos, discrepancias, datos extraídos con su procedencia), lleva una causa de un conjunto cerrado y una acción recomendada fija, y marca como pendiente lo que falta. La petición explícita de una persona se detecta por código antes de llamar al modelo, así que ninguna otra herramienta se ejecuta antes de escalar.

**Enfoque** (ver [research.md](research.md)):

- **Política** (`src/politica/escalamiento.ts`): funciones puras con los catálogos de causas, motivos, acciones y pendientes, `causaDeEscalamiento`, `accionRecomendada` y `detectarPeticionPersona`. Pasa a ser la única fuente de los motivos y de la regla de cada uno (R1, R2, R5, R14).
- **Dos niveles de clasificación** (R1): la causa es una de las cinco de la spec; el motivo preexistente (doce) y el código de la Regla 2 se conservan para no llamar «no cubierto» a una falla técnica sin explicarla.
- **El core arma el resumen** (R3): la nueva herramienta `escalar_a_analista` recibe solo la clasificación y toma lo demás de su propio estado. Es idempotente por conversación (R8) y no exige identidad ni solicitud registrada (aclaraciones Q1 y Q3). `consultar_escalamiento` la lee.
- **Regla 4 antes del modelo** (R5): `conversar` evalúa `detectarPeticionPersona` antes de `query()`. Si coincide, escala sin llamar al modelo.
- **Todas las causas** (R6): `dejarSenal` guarda cada señal observada y la principal sigue siendo la de mayor precedencia.
- **Escalar no puede fallar** (R7): la entrega al core usa reintentos acotados; si no llega, la conversación escala igual con `entrega: pendiente` y un log de error.
- **Avisos y vista de demostración** (R10): los textos dicen que un analista revisará el caso, el evento suma la causa y la entrega, y en `--demo` el chat imprime el resumen.
- **Pruebas sin modelo** (R12): tablas de la política fila por fila, el core, el servidor, el agente con un core falso y una consulta inyectada, y los dos casos que no deben escalar.

## Technical Context

**Language/Version**: TypeScript `strict`, solo sintaxis borrable, ejecutado por Node ≥ 22.18 sin compilar, como el #7 a #14.

**Primary Dependencies**: ninguna nueva.
- `@anthropic-ai/claude-agent-sdk` 0.3.302, `@modelcontextprotocol/sdk` 1.32.1 y `zod` 4.6.7, los del #14.

**Storage**: en memoria, en el core simulado: un `ResumenAnalista` por conversación. Sin base de datos.

**Testing**: `node --test` sobre `src/**/*.test.ts`, sin red ni modelo.
- Política: funciones puras; cada fila de las tablas de causa y de acción, los doce motivos por los cinco códigos y los casos de la petición de persona con sus negaciones.
- Contrato compartido: esquemas, invariantes y descripción de la herramienta.
- Core y servidor MCP: el cliente MCP en memoria del #7, con la validación de entrada y la auditoría.
- Agente: un core falso y una consulta inyectada, sin modelo.
- Chat: la vista del resumen y que solo aparece en demostración.
- Validación con el modelo real solo en el [quickstart](quickstart.md).

**Target Platform**: la misma del #8: terminal en Windows, macOS y Linux. El core también se usa desde Claude Code (`.mcp.json`).

**Project Type**: agente, servidor MCP y chat existentes. Se agregan un módulo de política, un módulo de contrato compartido, dos herramientas del core y una vista del chat.

**Performance Goals**: armar el resumen es leer mapas en memoria y copiarlos; responde en menos de 10 ms dentro del core. La petición de persona se detecta sin red. El tiempo límite de 5 s del cliente del core no cambia.

**Constraints**:
- La causa y la acción salen de funciones de la política; nunca de texto libre ni del modelo (FR-006).
- El resumen se arma con lo que guarda el core; la entrada no trae el solicitante, los ingresos ni los documentos (R3).
- El umbral de monto, el porcentaje de cuota y la tolerancia de ingreso no se repiten fuera de `politica.ts`, ni en la descripción que lee el modelo.
- Escalar nunca se rechaza por no poder comprobar la causa, y nunca falla por la entrega (Principios V y VI).
- Los logs y la auditoría no llevan nombres, montos de documentos, citas ni el contenido de los documentos (FR-012).
- Sin `any`.

**Scale/Scope**: 2 módulos nuevos con sus pruebas (`politica/escalamiento.ts`, `compartido/escalamiento.ts`), unos 16 archivos modificados y 3 casos de demostración nuevos. Unas 100 pruebas nuevas, por estimación.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principio / restricción | Evaluación | Resultado |
|-------------------------|-----------|-----------|
| I. Reglas de negocio inmutables | La **Regla 4** es el centro: la petición explícita de una persona escala de inmediato, sin investigar ni extraer antes, y se decide por código antes del modelo (R5). La **Regla 5** (moneda extranjera, documento no soportado) y la **Regla 2** (monto o cuota sobre el límite) siguen escalando como hoy y ahora con su causa. La **Regla 3** (discrepancia sobre el 10%) no se relaja. La **Regla 1** no se toca: escalar no registra nada, así que no hace falta identidad. El orden 4 → 5 → 1 → 3 → 2 se aplica con `prevalece`, con la Regla 4 antes del modelo, y las causas perdedoras se conservan como adicionales (R6). El 5.000.000, el 30% y el 10% viven solo en `politica.ts`. | ✅ |
| II. Datos exclusivamente ficticios | Pruebas, casos y quickstart usan a Ana Pérez Ficticia, documentos `000…` y correos `.example`; los tres casos nuevos son mensajes de una línea con montos inventados. | ✅ |
| III. Decisiones deterministas · esquemas | La causa, la acción, la regla y los pendientes salen de funciones puras o del core; el modelo solo clasifica el caso y cita lo que oyó. Todo lo que entra y todo el resumen se valida con Zod. Un dato que no pasa el esquema se trata como pendiente, no se adivina. La decisión de la Regla 2 va con regla, valores y motivo. | ✅ |
| IV. Acciones solo por herramientas MCP | El escalamiento pasa por `escalar_a_analista` del servidor MCP, que valida la forma, la coherencia causa–motivo y la procedencia aunque el agente ya lo haya hecho, y arma el resumen con su propio estado. | ✅ |
| V. Escalar ante la duda | La petición de persona, el caso no cubierto, el umbral superado, la discrepancia y toda falla escalan. El resumen lleva lo extraído, lo validado y lo pendiente, sin perder información. Escalar nunca se bloquea por no poder justificar la causa. Un error al entregar no impide escalar. | ✅ |
| VI. Observabilidad y resiliencia | `escalar_a_analista` es idempotente por conversación. Cada escalamiento deja `auditoria_escalamiento` con regla, entradas, resultado y marca de tiempo, y un log con `correlationId`. La entrega usa reintentos acotados con espera creciente; si se agotan, se escala igual y el error queda registrado, nunca silenciado. | ✅ |
| Entrada y moneda | Solo COP; la moneda extranjera sigue siendo un caso no cubierto. | ✅ |
| Secretos fuera del repositorio | Sin secretos nuevos. | ✅ |
| TypeScript `strict`, sin `any` | Los argumentos llegan como `unknown` al servidor y se validan con `safeParse`; la respuesta del core se valida en el cliente. | ✅ |
| Simplicidad (YAGNI) | Sin dependencias, sin persistencia en disco, sin evento de negocio nuevo (el catálogo ya trae `escalamiento`) y sin estado nuevo en la solicitud registrada (R13). Cada pieza nueva está en Complexity Tracking. | ✅ |
| Pruebas obligatorias | Los bordes de la política (cada motivo con cada código, y la petición de persona con sus negaciones); la herramienta MCP con su validación y su idempotencia; escenarios de punta a punta de petición de humano, cuota alta, ingreso inconsistente, moneda extranjera y datos faltantes. | ✅ |

**Gate**: aprobado.

**Re-check post-diseño**: aprobado, sin desviaciones. Los cambios al código ya entregado son aditivos, salvo estos, que se justifican:
- `SenalEscalamiento.motivo` y `ORDEN_REGLA` pasan de `adaptador.ts` a la política (R14). Los nombres exportados se mantienen, así que los importadores no cambian.
- `AVISOS` cambia de texto (R10). Las pruebas del #9 a #14 que fijan los textos viejos se actualizan: es el cambio que pide FR-009.
- `solicitar_analista` gana tres campos opcionales (R4). Sin ellos funciona como antes.
- `VERSION_POLITICA` sube de `2026-10-18.3` a `2026-10-18.4`.

## Project Structure

### Documentation (this feature)

```text
specs/013-escalamiento-analista/
├── spec.md
├── plan.md              # Este archivo
├── research.md          # Hechos del repo y decisiones R1–R14
├── data-model.md        # Catálogos, entrada, ResumenAnalista, errores
├── quickstart.md        # Escenarios 1–7
├── contracts/
│   ├── politica.md      # causa, acción, regla y detección de la petición de persona
│   ├── core-mcp.md      # escalar_a_analista y consultar_escalamiento
│   └── agente.md        # orden del turno, entrega, avisos y prompt
├── checklists/requirements.md
└── tasks.md             # /speckit-tasks
```

### Source Code (repository root)

```text
src/
├── politica/
│   ├── politica.ts               # MODIFICADO: versión
│   ├── escalamiento.ts           # NUEVO: catálogos, causa, acción, regla, petición de persona
│   └── escalamiento.test.ts      # NUEVO: tablas fila por fila y negaciones
├── compartido/
│   ├── escalamiento.ts           # NUEVO: esquemas de entrada y de ResumenAnalista, descripción de la herramienta
│   └── escalamiento.test.ts      # NUEVO
├── mcp/
│   ├── core-simulado.ts          # MODIFICADO: escalarAAnalista, consultarEscalamiento, almacén
│   ├── core-simulado.test.ts     # MODIFICADO
│   ├── servidor.ts               # MODIFICADO: escalar_a_analista y consultar_escalamiento
│   └── servidor.test.ts          # MODIFICADO
├── agente/
│   ├── cliente-core.ts           # MODIFICADO: escalarAAnalista, consultarEscalamiento
│   ├── cliente-core.test.ts      # MODIFICADO
│   ├── core-no-simulado.ts       # MODIFICADO
│   ├── adaptador.ts              # MODIFICADO: señales acumuladas, solicitar_analista con monto y plazo, constantes desde la política
│   ├── adaptador.test.ts         # MODIFICADO
│   ├── agente.ts                 # MODIFICADO: Regla 4 antes del modelo, entregarHandoff, avisos, evento, prompt
│   └── agente.test.ts            # MODIFICADO
├── chat/
│   ├── presentacion.ts           # MODIFICADO: formatearHandoff
│   ├── presentacion.test.ts      # MODIFICADO
│   ├── chat.ts                   # MODIFICADO: imprime el resumen en demostración
│   └── chat.test.ts              # MODIFICADO
casos/
├── escalamiento-pide-persona/              # NUEVO: caso de prueba 6
├── escalamiento-pide-persona-con-datos/    # NUEVO: la petición con datos, antes de identificarse
└── escalamiento-moneda-extranjera/         # NUEVO: la Regla 5 antes de identificar, con monto y plazo
CLAUDE.md                         # MODIFICADO: mapa del repositorio (#15)
DECISIONES.md                     # MODIFICADO: entrada del #15
```

**Structure Decision**:
- Los catálogos y las funciones van en `src/politica/`, la única fuente que fija la constitución. El core, el agente y las pruebas llaman a la misma función, así la causa y la acción que se escriben son las mismas en todas las capas.
- Los esquemas y la descripción que lee el modelo van en `src/compartido/`, porque los usan el servidor, el cliente y el adaptador.
- No hay hook nuevo: la Regla 4 se decide en `conversar` antes del modelo, porque un hook solo puede negar herramientas, no saber qué pidió el solicitante.
- `control-identidad.ts` y `control-preaprobacion.ts` no cambian: siguen negando las herramientas con una señal vigente y la entrega usa el cliente directo del core, no el adaptador.

## Complexity Tracking

| Complejidad | Por qué hace falta | Alternativa más simple descartada |
|-------------|--------------------|-----------------------------------|
| Herramienta nueva del core, `escalar_a_analista` (R3, R4) | La constitución nombra «escalar a analista» entre las herramientas MCP y el criterio pide un resumen validado y entregado; el core ya guarda todo lo que el analista necesita | Dejar el resumen solo en el log del agente: el analista no lo recibe y no hay clave de idempotencia |
| La Regla 4 por código antes del modelo (R5) | FR-003 y FR-007: «sin invocar otras herramientas antes» no puede depender de que el modelo respete el orden; un hook no sabe qué pidió el solicitante | Reforzar el prompt, que es el comportamiento de hoy y deja que el modelo busque antes de clasificar |
| Dos niveles, causa cerrada y motivo (R1) | La spec fija cinco causas y el código escala por doce motivos; perder el motivo dejaría a una falla técnica llamada «no cubierta» | Reducir los motivos a cinco, que oculta la razón al analista |
| Tres acciones recomendadas además de las cuatro de Q2 (R2) | Q2 no cubre identidad, documentos ni fallas técnicas; con una sola acción por causa, esas saldrían con una recomendación falsa | Una acción por cada una de las cinco causas, que recomienda «revisar tipo de documento o moneda» ante una falla técnica |
| Mover reglas y motivos a la política (R14) | El core necesita la regla de cada motivo y no puede importar del agente | Duplicar las constantes en el core, que parte la fuente única |
| Entrega al analista con reintentos y un estado pendiente (R7) | Escalar no puede fallar porque el core esté caído (Principios V y VI) | Escalar solo por el core, que no cubre que el core no arranque |
| `solicitar_analista` con monto, plazo y cita (R4) | Las reglas 4 y 5 escalan antes de identificar, así que nunca hay solicitud registrada que traiga esos datos | Dejarlos siempre pendientes en esos casos, que incumple «monto y plazo» justo donde más se escala |
| Vista del resumen en `--demo` (R10) | El core del chat vive en su propio proceso y el resumen no se puede consultar desde fuera; sin la vista, SC-004 no se puede demostrar | Un comando aparte para consultar el escalamiento, que añade una superficie al chat |

## Riesgos y pendientes

- **Interpretación del criterio «recibe un resumen»**: la herramienta lo produce, valida y entrega, pero su entrada no exige que el llamador lo componga ([R3](research.md#r3-el-core-arma-el-resumen-con-lo-que-ya-sabe)). Si el equipo lo quiere literal, se cambia el contrato de entrada del core; el resto del diseño no cambia.
- **Causas para identidad y fallas técnicas**: la spec no tiene una causa propia para ellas y se escalan como `caso_no_cubierto` con su motivo exacto ([R1](research.md#r1-dos-niveles-de-clasificación-la-causa-cerrada-y-el-motivo)). Si se quieren causas propias, es una enmienda de FR-006. Lo mismo para las tres acciones extra de [R2](research.md#r2-la-acción-recomendada-sale-de-un-catálogo-cerrado-de-la-política).
- **Paráfrasis de la Regla 4**: `detectarPeticionPersona` usa listas cerradas y una negación inmediata. Una frase que no reconozca llega al modelo, que sigue con el prompt y `solicitar_analista`; en ese caso no hay garantía de «sin herramientas antes». Una frase que reconoce de más escala de más, que es el lado seguro (Principio V).
- **El modelo puede omitir las citas** de monto y plazo en `solicitar_analista`: el escalamiento sigue y esos datos salen pendientes. Es válido, pero el resumen queda menos completo.
- **El resumen no se ve fuera del proceso del chat**: el core del chat es el único que lo guarda. El `--demo` lo imprime; consultarlo desde Claude Code (`.mcp.json`) mostraría otro core, vacío.
- **Entrega pendiente sin reintento posterior**: si la entrega falla, no hay un proceso que la reintente. Queda el log de error y la conversación escalada; reintentar a mano es posible con la clave determinista.
- **Pruebas que fijan los avisos viejos**: las del #9 a #14 que comparan los textos de `AVISOS` se actualizan con los nuevos. Es el cambio de FR-009, no una regresión.
- **Revisión de cumplimiento del #6**: se espera la Regla 4 ✅ (por código, antes del modelo), la Regla 5 ✅ (sigue escalando con su causa), la Regla 2 ✅ (no se relaja, solo se explica), la Regla 3 ✅, la Regla 1 ➖ (escalar no registra). El 5.000.000, el 30% y el 10% no deben aparecer como literal fuera de `politica.ts`.
