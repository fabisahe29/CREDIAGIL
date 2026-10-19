# Implementation Plan: Atención de mensajes con varias preocupaciones

**Branch**: `16-atencion-de-mensajes-con-varias` | **Date**: 2026-10-18 | **Spec**: [spec.md](spec.md)

**Issue de origen**: [fabisahe29/CREDIAGIL#16](https://github.com/fabisahe29/CREDIAGIL/issues/16)

**Input**: Feature specification from `/specs/014-atencion-mensajes-varios-asuntos/spec.md`

## Summary

Un mensaje del solicitante puede traer a la vez una solicitud, documentos y la pregunta por la cuota. Hoy el agente puede atender los tres, pero nada lo garantiza: si un asunto escala, el resto se niega y la respuesta es un texto fijo que descarta lo que ya se resolvió. El agente debe atender cada asunto, aunque otro quede pendiente o escalado, y responder una sola vez con el estado de cada uno.

**Enfoque** (ver [research.md](research.md)):

- **Asuntos como catálogo cerrado** (R1): `solicitud`, `documentos` y `cuota`, con estado `resuelto`, `pendiente` o `escalado`, en `src/politica/asuntos.ts`.
- **El código sabe qué se planteó** (R2): `detectarAsuntos` reconoce por código, de forma conservadora, los asuntos del mensaje y los une a los que muestran las herramientas. Un asunto que el modelo olvidó sale `pendiente`, no desaparece.
- **El código decide el estado** (R3): el adaptador registra qué pasó con cada llamada y `estadoDeAsuntos`, una función pura, devuelve el estado de cada asunto.
- **Una respuesta con bloque de estado** (R4): con dos o más asuntos, la respuesta es el cuerpo de siempre más un bloque «Estado de tus asuntos» que compone el código. Con un solo asunto no cambia nada.
- **La cuota sigue tras escalar** (R5): una señal vigente sigue negando todo salvo la simulación de cuota, que es de solo lectura, y salvo la Regla 4 y las fallas técnicas.
- **Regla 4 con otros asuntos** (R6): la petición de persona sigue escalando sin modelo ni herramientas; los demás asuntos salen `pendiente` para el analista (aclaración de esta sesión).
- **El analista los recibe** (R7): `escalar_a_analista` acepta `asuntosPendientes`, un cambio aditivo al contrato del #15.
- **Prompt, casos y pruebas** (R8, R9, R12): el prompt guía y el código garantiza; tres casos de demostración; todo se prueba sin modelo.

## Technical Context

**Language/Version**: TypeScript `strict`, solo sintaxis borrable, ejecutado por Node ≥ 22.18 sin compilar, como el #7 a #15.

**Primary Dependencies**: ninguna nueva.
- `@anthropic-ai/claude-agent-sdk` 0.3.302, `@modelcontextprotocol/sdk` 1.32.1 y `zod` 4.6.7, los del #15.

**Storage**: en memoria. Las observaciones viven en el estado de la conversación; `asuntosPendientes` vive en el `ResumenAnalista` que ya guarda el core simulado. Sin base de datos.

**Testing**: `node --test` sobre `src/**/*.test.ts`, sin red ni modelo.
- Política: `detectarAsuntos` y `estadoDeAsuntos` fila por fila.
- Respuesta unificada y agente con una consulta inyectada y un core falso.
- Adaptador y hook: qué se admite y qué se niega tras cada señal.
- Core y servidor MCP: la entrada y el resumen con `asuntosPendientes`.
- Validación con el modelo real solo en el [quickstart](quickstart.md).

**Target Platform**: la misma del #8: terminal en Windows, macOS y Linux.

**Project Type**: agente, servidor MCP y chat existentes. Se agregan un módulo de política y un módulo del agente; el resto son cambios aditivos.

**Performance Goals**: detectar asuntos y calcular su estado es recorrer listas cortas en memoria: menos de 1 ms. No hay llamadas nuevas al core ni al modelo; el costo por mensaje no sube.

**Constraints**:
- El estado de cada asunto y el bloque de la respuesta salen de código, nunca del texto del modelo (Principio III).
- La simulación de cuota tras escalar no decide, no registra y no cambia la causa; ninguna regla se relaja ni se reordena (FR-007).
- El 5.000.000, el 30% y el 10% siguen solo en `politica.ts`; `asuntos.ts` no los repite.
- La Regla 4 sigue decidiéndose antes del modelo, sin investigar: la detección de asuntos es una función pura sobre el texto.
- Los logs y el resumen no llevan el texto del mensaje, citas ni el contenido de los documentos.
- Sin `any`.

**Scale/Scope**: 2 módulos nuevos con sus pruebas (`politica/asuntos.ts`, `agente/respuesta-unificada.ts`), unos 12 archivos modificados y 3 casos de demostración nuevos. Unas 60 pruebas nuevas, por estimación.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principio / restricción | Evaluación | Resultado |
|-------------------------|-----------|-----------|
| I. Reglas de negocio inmutables | El orden 4 → 5 → 1 → 3 → 2 y los umbrales no se tocan: `prevalece` sigue decidiendo la señal principal. La **Regla 4** sigue escalando por código antes del modelo, sin herramientas; los demás asuntos del mensaje se marcan pendientes sin investigarlos (R6). La **Regla 1** sigue negando extraer, verificar, registrar y preaprobar sin identidad, y tras una señal. La **Regla 5** sigue escalando; la única herramienta que sigue disponible es la simulación, que no decide (R5). Las **reglas 2 y 3** no cambian: no se preaprueba ni se registra nada más que antes. | ✅ |
| II. Datos exclusivamente ficticios | Los tres casos y el quickstart usan montos inventados y documentos ficticios; el certificado en dólares es el ya existente. | ✅ |
| III. Decisiones deterministas · esquemas | El estado de cada asunto, el conjunto esperado y el bloque de respuesta salen de funciones puras. El modelo solo comprende y llama herramientas. `asuntosPendientes` se valida con Zod y un valor fuera del catálogo se rechaza, no se corrige. | ✅ |
| IV. Acciones solo por herramientas MCP | No hay acciones nuevas: el único cambio al core es un campo aditivo de `escalar_a_analista`, que el servidor valida de nuevo aunque el agente ya lo haya hecho. | ✅ |
| V. Escalar ante la duda | Un asunto sin resolver nunca se oculta ni se completa: sale `pendiente` con su motivo, o `escalado`. Seguir con los independientes no evita ni retrasa escalar. El analista recibe además la lista de asuntos pendientes. | ✅ |
| VI. Observabilidad y resiliencia | Un solo `query()` por mensaje conserva un único `correlationId`; las decisiones dejan la misma auditoría (FR-010). Un log `asuntos_atendidos` sin datos del solicitante. Sin llamadas nuevas, así que los tiempos límite y reintentos no cambian. | ✅ |
| Entrada y moneda | Solo COP y documentos de texto; la moneda extranjera y los documentos no soportados siguen escalando por la Regla 5. | ✅ |
| Secretos fuera del repositorio | Sin secretos nuevos. | ✅ |
| TypeScript `strict`, sin `any` | Tablas indexadas por los catálogos; entrada del core como `unknown` validada con `safeParse`. | ✅ |
| Simplicidad (YAGNI) | Sin dependencias, sin herramienta nueva, sin evento de negocio nuevo y sin tercer estado persistente. Cada pieza nueva está en Complexity Tracking. | ✅ |
| Pruebas obligatorias | Bordes de la política (cada fila del estado y la detección con negaciones); la herramienta MCP con su validación; escenarios de punta a punta: petición de humano con cuota, asunto escalado con cuota resuelta, datos faltantes y el mensaje de ejemplo. | ✅ |

**Gate**: aprobado.

**Re-check post-diseño**: aprobado, sin desviaciones. Los cambios al código ya entregado son aditivos, salvo estos, que se justifican:
- `llamarConReintentos` y el hook de identidad dejan pasar `calcular_capacidad_pago` tras una señal que no sea la Regla 4 ni una falla técnica (R5). Las pruebas que fijan «toda herramienta se niega tras escalar» se actualizan para esa única excepción: es el cambio que pide FR-004.
- La respuesta de una conversación con dos o más asuntos lleva un bloque de estado al final (R4). Los mensajes de un solo asunto no cambian, así que las pruebas de los textos de `AVISOS` del #9 al #15 siguen igual.
- No se sube `VERSION_POLITICA`: ningún umbral, tasa ni decisión de política cambia.

## Project Structure

### Documentation (this feature)

```text
specs/014-atencion-mensajes-varios-asuntos/
├── spec.md
├── plan.md              # Este archivo
├── research.md          # Hechos del repo y decisiones R1–R12
├── data-model.md        # Catálogos, observaciones, tabla de estado, cambios al contrato del #15
├── quickstart.md        # Escenarios 1–7
├── contracts/
│   ├── politica.md      # detectarAsuntos, estadoDeAsuntos y asuntosPendientes
│   ├── core-mcp.md      # asuntosPendientes en escalar_a_analista
│   └── agente.md        # orden del turno, tras escalar, respuesta unificada y prompt
├── checklists/requirements.md
└── tasks.md             # /speckit-tasks
```

### Source Code (repository root)

```text
src/
├── politica/
│   ├── asuntos.ts                 # NUEVO: catálogos, detectarAsuntos, estadoDeAsuntos, asuntosPendientes
│   └── asuntos.test.ts            # NUEVO: tabla fila por fila y negaciones
├── compartido/
│   ├── escalamiento.ts            # MODIFICADO: asuntosPendientes en la entrada y en el resumen
│   └── escalamiento.test.ts       # MODIFICADO
├── mcp/
│   ├── core-simulado.ts           # MODIFICADO: guarda y audita asuntosPendientes
│   ├── core-simulado.test.ts      # MODIFICADO
│   └── servidor.test.ts           # MODIFICADO
├── agente/
│   ├── respuesta-unificada.ts     # NUEVO: componerRespuesta
│   ├── respuesta-unificada.test.ts  # NUEVO
│   ├── adaptador.ts               # MODIFICADO: observaciones, admiteTrasEscalar
│   ├── adaptador.test.ts          # MODIFICADO
│   ├── control-identidad.ts       # MODIFICADO: usa admiteTrasEscalar
│   ├── control-identidad.test.ts  # MODIFICADO
│   ├── agente.ts                  # MODIFICADO: asuntos del turno, respuesta, resumen, prompt, log
│   └── agente.test.ts             # MODIFICADO
├── chat/
│   ├── presentacion.ts            # MODIFICADO: formatearHandoff muestra los asuntos pendientes
│   └── presentacion.test.ts       # MODIFICADO
casos/
├── mensaje-varios-asuntos/             # NUEVO: caso de prueba 1, con el mensaje literal del enunciado
├── mensaje-varios-asuntos-con-persona/ # NUEVO: la petición de persona con cuota
└── mensaje-varios-asuntos-escalado/    # NUEVO: un solo mensaje, solicitud escalada por la Regla 5 y cuota resuelta
CLAUDE.md                          # MODIFICADO: mapa del repositorio (#16)
DECISIONES.md                      # MODIFICADO: entrada del #16 (ya registrada al planificar)
```

**Structure Decision**:
- Los catálogos y las funciones de decisión van en `src/politica/`, la única fuente que fija la constitución; el agente y el core importan los mismos catálogos, así no pueden discrepar.
- La composición del texto de la respuesta va en `src/agente/` porque es presentación del agente, no política.
- No hay hook nuevo: el existente de identidad pasa a usar el mismo predicado que el adaptador, para que haya una sola definición de qué sigue tras escalar.
- `control-preaprobacion.ts` no cambia: `preaprobar_credito` sigue negada tras cualquier señal.

## Complexity Tracking

| Complejidad | Por qué hace falta | Alternativa más simple descartada |
|-------------|--------------------|-----------------------------------|
| Detección de asuntos por código (R2) | FR-001 y el escenario 3 de US1: ningún asunto sin atender ni mencionar, y la rama de la Regla 4 no tiene modelo | Solo lo que llamó el modelo, que pierde el asunto que olvidó; una herramienta `declarar_asuntos`, que depende del modelo |
| Estado por función pura sobre observaciones (R3) | El estado es una decisión sobre el caso y debe ser reproducible (Principio III) | Que el modelo escriba el estado, que puede decir «resuelto» sin haberlo estado |
| Bloque de respuesta compuesto por código (R4) | En una escalada el texto del modelo se descarta y con él la cuota ya calculada; FR-002 y FR-003 piden una sola respuesta con estados | Reemplazar siempre el texto del modelo, que cambia los mensajes de un solo asunto |
| Excepción de la simulación tras escalar (R5) | FR-004: sin ella, un asunto escalado deja sin respuesta a la cuota | Permitir todas las herramientas, que rompería la Regla 1 y el orden de evaluación |
| `asuntosPendientes` en el contrato del #15 (R7) | La aclaración exige que la pregunta pendiente llegue al analista | Guardarlo solo en el log, que no es un contrato |
| Tres casos de demostración (R9) | El criterio es un comportamiento de conversación y el modelo real solo entra en el quickstart | Probar solo con pruebas unitarias |

## Riesgos y pendientes

- **Mensaje de ejemplo del enunciado**: `mensaje-varios-asuntos` usa su texto literal. La detección debe reconocer sus tres asuntos («pedir un crédito», los adjuntos y «la cuota»), y una prueba de `asuntos.test.ts` lo fija con esa frase exacta ([R9](research.md#r9-el-mensaje-de-ejemplo-y-los-casos-de-prueba)). El criterio se da por verificado cuando el escenario 1 del quickstart pasa con el modelo real.
- **Detección por expresiones**: `detectarAsuntos` usa listas cerradas y es conservadora. Una frase que no reconoce no crea un asunto esperado, pero lo que el modelo sí atienda aparece igual por sus herramientas. Una frase que reconoce de más muestra un asunto `pendiente` que el solicitante no pidió; es el lado menos dañino, pero se vigila con los casos.
- **Duplicación en la respuesta**: el bloque puede repetir la cuota que el modelo ya dijo. Se acepta porque el bloque es la fuente de verdad ([R4](research.md#r4-la-respuesta-es-una-sola-y-su-bloque-de-estado-lo-compone-el-código)).
- **Simulación tras la Regla 5**: se permite porque la política cubre una cuota en pesos con datos del solicitante. Si la revisión de cumplimiento del #6 lo ve como improvisar ante un caso no cubierto, se cierra por `MOTIVOS_QUE_LO_IMPIDEN`, que es una línea.
- **Un escalamiento por conversación**: `asuntosPendientes` queda fijo en el primer escalamiento; si después aparece otro asunto en la misma conversación, no se agrega al resumen ya entregado.
- **Límite de turnos**: `MAX_TURNOS = 8` debería alcanzar; el escenario 7 del quickstart lo comprueba ([R10](research.md#r10-el-límite-de-turnos-no-cambia)).
- **Pruebas que fijan «todo se niega tras escalar»**: las del hook y del adaptador del #9 al #15 se actualizan para la única excepción de R5. Es el cambio de FR-004, no una regresión.
- **Revisión de cumplimiento del #6**: se espera la Regla 4 ✅ (por código, sin herramientas), la Regla 1 ✅ (no se relaja), la Regla 5 ✅ (sigue escalando), la Regla 3 ✅ y la Regla 2 ✅ (sin cambios), y el 5.000.000, el 30% y el 10% sin literales fuera de `politica.ts`.
