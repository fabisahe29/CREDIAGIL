# Implementation Plan: Extracción estructurada de documentos con subagente

**Branch**: `10-extraccion-estructurada-de-documentos` | **Date**: 2026-10-17 | **Spec**: [spec.md](spec.md)

**Issue de origen**: [fabisahe29/CREDIAGIL#10](https://github.com/fabisahe29/CREDIAGIL/issues/10)

**Input**: Feature specification from `/specs/008-extraccion-documentos/spec.md`

## Summary

Cuando un solicitante verificado entrega un certificado laboral o un extracto bancario, el agente lo convierte en datos tipados. Cada dato lleva el fragmento del documento del que salió, y el código comprueba que ese fragmento existe. Lo que falta queda nulo y se pide como documento nuevo. Una moneda extranjera o un tipo no soportado escalan por la Regla 5. El resultado queda en el core para el #11 y el #13.

**Enfoque** (ver [research.md](research.md)):

- **Subagente** (`src/agente/extraccion.ts`): un `query()` aparte que lanza el código, sin herramientas, con salida estructurada. Recibe solo el documento y lo esperado. Hace hasta 3 intentos, y cada reintento lleva el error concreto del anterior (R1, R3).
- **Documentos numerados**: el chat numera cada `/adjuntar` y cada `/pegar` y los pasa a `conversar`. La herramienta recibe solo el número, y el código toma el texto exacto (R2).
- **Validación compartida** (`src/compartido/extraccion.ts`): esquema Zod, fragmento literal en el documento y dígitos del monto en su fragmento. La usan el agente y el core (R4).
- **Política** (`src/politica/documentos.ts`): tipos soportados, moneda COP, tabla de expresiones de moneda, límite de intentos y `evaluarDocumento`, que decide extraído, no cubierto o no extraíble (R5).
- **Core**: `registrar_extraccion` revalida, exige identidad verificada y es idempotente por huella del contenido. `consultar_extracciones` lee lo extraído (R6).
- **Adaptador**: `extraer_documento` y `consultar_extracciones`. Los eventos y escalamientos los decide el código, con un motivo nuevo, `documento_no_extraible` (R7).
- **Identidad**: `extraer_documento` entra en la lista del control del #9 (R8).
- **Prompt, logs y casos**: tres instrucciones nuevas en el prompt (R9); logs sin contenido y límite de 25 s por intento (R10); tres casos de demo con los cinco documentos (R11).

## Technical Context

**Language/Version**: TypeScript `strict`, solo sintaxis borrable, ejecutado por Node ≥ 22.18 sin compilar, como el #7 a #9. En este equipo, Node v24.21.0.

**Primary Dependencies**: ninguna nueva.
- `@anthropic-ai/claude-agent-sdk` 0.3.302: `query()`, `Options.outputFormat` y `structured_output`.
- `@modelcontextprotocol/sdk` 1.32.1 y `zod` 4.6.7 (`z.toJSONSchema`).
- `node:crypto` para la huella SHA-256.

**Storage**: en memoria del proceso del core, por `correlationId`, como el #9 (R6). Sin persistencia. El contenido de los documentos no se guarda en el core.

**Testing**: `node --test` sobre `src/**/*.test.ts`, sin red ni modelo.
- Política y validación: funciones puras con reloj inyectable.
- Subagente: se comprueban el prompt y las `Options` con una `query()` falsa.
- Adaptador: core falso y `ejecutarSubagente` falso.
- Servidor MCP: cliente MCP en memoria, como el #7.
- Chat: el arnés de pruebas del #8.
- Validación con el modelo real solo en el [quickstart](quickstart.md).

**Target Platform**: la misma del #8: terminal en Windows, macOS y Linux. El core también se usa desde Claude Code (`.mcp.json`).

**Project Type**: agente, servidor MCP y chat existentes. Se agregan un subagente, dos herramientas del core, dos del adaptador y un módulo de política.

**Performance Goals**:
- La validación de un documento de hasta 256 KiB tarda menos de 50 ms.
- Un intento del subagente tiene un límite de 25 s; tres intentos caben en el límite de 120 s de la conversación.

**Constraints**:
- El modelo nunca transcribe el documento: la herramienta recibe solo el número de adjunto.
- Ningún dato sin fragmento comprobado llega al resultado.
- La moneda la deduce el código.
- Los logs no llevan contenido ni fragmentos.
- Sin `any`.

**Scale/Scope**:
- Decenas de documentos por ejecución.
- 4 módulos nuevos (`compartido/extraccion.ts`, `politica/documentos.ts`, `agente/extraccion.ts` y sus pruebas) y unos 12 modificados.
- 5 documentos y 3 casos de demo.
- Unas 80 pruebas nuevas.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principio / restricción | Evaluación | Resultado |
|-------------------------|-----------|-----------|
| I. Reglas de negocio inmutables | Aplica la **Regla 5** sin improvisar: moneda distinta de COP o tipo no soportado escalan, y lo decide `evaluarDocumento`, no el modelo. Refuerza la **Regla 1**: sin identidad no se extrae (control) ni se registra (core). Prepara la **Regla 3**: el ingreso solo podrá salir de datos con fragmento comprobado, y un salario escrito no se usa. Orden 4 → 5 → 1: `solicitar_analista` sigue yendo primero, y un adjunto no soportado escala por la Regla 5. Las reglas 2 y 4 no se tocan. | ✅ |
| II. Datos exclusivamente ficticios | Los documentos de prueba usan a Ana Pérez Ficticia, Industrias Imaginarias del Valle S.A.S., NIT y cuentas `000…` y correos `.example`. Los documentos en dólares y no soportados viven en las pruebas con los mismos criterios. | ✅ |
| III. Decisiones deterministas · esquemas | El subagente solo comprende y extrae. Zod valida su salida. El código comprueba fragmentos y montos, deduce la moneda y decide con la política. Montos en pesos enteros; los centavos distintos de cero no se redondean, se rechazan. `evaluarDocumento` devuelve una decisión estructurada. | ✅ |
| IV. Acciones solo por herramientas MCP | El resultado se registra en el core con `registrar_extraccion`, que vuelve a aplicar la Regla 1 y la validación del lado del servidor. La lectura posterior pasa por `consultar_extracciones`. | ✅ |
| V. Escalar ante la duda | Tres intentos inválidos, valores en conflicto, centavos o moneda no reconocida → `documento_no_extraible`. Ningún dato se completa ni se supone. El analista recibe el adjunto y el último error; el resumen completo es del #15. | ✅ |
| VI. Observabilidad y resiliencia | Logs `extraccion` e `intento_extraccion` con `correlationId`, sin contenido ni fragmentos. Auditoría en el core con regla, resultado, huella y marca de tiempo. Idempotencia por huella. Tiempo límite por intento. Un subagente que no responde escala con `falla_transitoria_persistente`. | ✅ |
| Entrada y moneda | Solo texto `.txt`, `.md` o pegado; solo COP. Lo demás escala. | ✅ |
| Secretos fuera del repositorio | Sin secretos nuevos. El subagente usa la misma credencial del agente, por variable de entorno. | ✅ |
| TypeScript `strict`, sin `any` | La salida del subagente llega como `unknown` y solo se usa tras `safeParse`. | ✅ |
| Simplicidad (YAGNI) | Sin dependencias nuevas. El subagente es una función. El core no guarda el contenido. No se agregan tipos de documento ni consistencia entre documentos, que es del #11. | ✅ |
| Pruebas obligatorias | Política con el borde de intentos; herramientas MCP con el rechazo del lado del servidor (identidad y fragmento ajeno); sin red ni modelo. Los casos de punta a punta con documentos ficticios quedan en el quickstart y en el #17. | ✅ |

**Gate**: aprobado.

**Re-check post-diseño**: aprobado, sin desviaciones. `/pegar` sigue enviando su bloque como mensaje del solicitante, completo y en un solo mensaje (FR-012 del #8), y ahora además lo registra como el adjunto «texto pegado» con una marca al final. Durante la implementación se descartó enviarlo como bloque `<documento>`, que lo habría convertido en dato y habría anulado la Regla 4 en un mensaje pegado (research.md, R2). Los demás cambios al código del #7 a #9 son aditivos:
- herramientas nuevas;
- un motivo de escalamiento más;
- un campo más en la conversación del chat;
- un nombre en la lista del control de identidad.

## Project Structure

### Documentation (this feature)

```text
specs/008-extraccion-documentos/
├── spec.md
├── plan.md              # Este archivo
├── research.md          # Hechos del repo y del SDK, decisiones R1–R11
├── data-model.md        # Documento, procedencia, resultados, errores, almacén del core
├── quickstart.md        # Escenarios 1–6
├── contracts/
│   ├── subagente.md     # Invocación, prompt, esquema de salida y validación
│   ├── agente.md        # extraer_documento, consultar_extracciones, motivo nuevo, prompt y chat
│   └── core-mcp.md      # registrar_extraccion, consultar_extracciones y cliente del core
├── checklists/requirements.md
└── tasks.md             # /speckit-tasks
```

### Source Code (repository root)

```text
src/
├── politica/
│   ├── politica.ts               # MODIFICADO: TIPOS_DOCUMENTO_SOPORTADOS, MONEDA_SOPORTADA, tabla de moneda, MAX_INTENTOS_EXTRACCION
│   ├── documentos.ts             # NUEVO: deducirMoneda, evaluarDocumento → decisión estructurada
│   └── documentos.test.ts        # NUEVO
├── compartido/
│   ├── extraccion.ts             # NUEVO: esquemas, ResultadoExtraccion, validarSalida, validarResultado, huella
│   └── extraccion.test.ts        # NUEVO
├── mcp/
│   ├── core-simulado.ts          # MODIFICADO: almacén de extracciones, registrar y consultar
│   ├── core-simulado.test.ts     # MODIFICADO
│   ├── servidor.ts               # MODIFICADO: dos herramientas y auditoría
│   └── servidor.test.ts          # MODIFICADO
├── agente/
│   ├── extraccion.ts             # NUEVO: PROMPT_EXTRACCION, ejecutarSubagente real, ciclo de intentos
│   ├── extraccion.test.ts        # NUEVO
│   ├── cliente-core.ts           # MODIFICADO: registrarExtraccion, consultarExtracciones
│   ├── cliente-core.test.ts      # MODIFICADO
│   ├── adaptador.ts              # MODIFICADO: dos herramientas, motivo documento_no_extraible
│   ├── adaptador.test.ts         # MODIFICADO
│   ├── control-identidad.ts      # MODIFICADO: HERRAMIENTAS_CON_IDENTIDAD = ["extraer_documento"]
│   ├── control-identidad.test.ts # MODIFICADO
│   ├── agente.ts                 # MODIFICADO: AVISOS/REGLAS, opciones documentos y ejecutarSubagente, prompt
│   └── agente.test.ts            # MODIFICADO
└── chat/
    ├── documentos.ts             # MODIFICADO: atributo adjunto, componerPegado
    ├── documentos.test.ts        # MODIFICADO
    ├── sesion.ts                 # MODIFICADO: documentos y registrarDocumento
    ├── sesion.test.ts            # MODIFICADO
    ├── chat.ts                   # MODIFICADO: /adjuntar y /pegar registran; pasa documentos
    ├── chat.test.ts              # MODIFICADO
    └── presentacion.ts           # MODIFICADO: número de adjunto en el aviso
casos/
├── extraccion-certificado/       # NUEVO: caso.json, certificado-completo.md
├── extraccion-sin-salario/       # NUEVO: caso.json, certificado-sin-salario.md
└── extraccion-extractos/         # NUEVO: caso.json, extracto-2026-07.md, -08.md, -09.md
CLAUDE.md                         # MODIFICADO: mapa del repositorio (extracción en src/agente/ y src/compartido/)
DECISIONES.md                     # MODIFICADO (ya en el plan): entrada del #10
```

**Structure Decision**:
- El subagente va en `src/agente/` porque razona con el modelo y es parte del agente, no del core.
- La validación va en `src/compartido/` porque la aplican el agente y el core.
- Las decisiones de la Regla 5 y los límites van en `src/politica/`, la única fuente que fija la constitución.
- El resultado se guarda en `src/mcp/`, donde el #11 y el #13 lo vuelven a comprobar.

## Complexity Tracking

| Complejidad | Por qué hace falta | Alternativa más simple descartada |
|-------------|--------------------|-----------------------------------|
| Un `query()` anidado dentro del manejador de una herramienta (R1) | El issue pide un subagente con contexto explícito, y el código debe validar antes de que el modelo use el resultado | `Options.agents` con `Task`: el modelo redactaría el contexto y vería el resultado sin validar |
| El core revalida con el contenido del documento (R6) | Defensa en profundidad: el core no acepta un dato cuyo fragmento no está en el documento, aunque el agente falle | Confiar en la validación del agente: un error del adaptador llegaría al core |
| Numeración de documentos en el chat (R2) | La procedencia necesita el texto exacto y un identificador único | Que el modelo pase el contenido: podría alterarlo |

## Riesgos y pendientes

- **Costo y tiempo**: cada documento cuesta al menos una llamada más al modelo. Tres extractos en un turno pueden acercarse al límite de 120 s. El quickstart (Escenario 4) lo mide; si hace falta, se sube el límite de la conversación y se registra en DECISIONES.md.
- **Reintentos internos del SDK**: `outputFormat` reintenta solo dentro del mismo `query()`. Si los agota, el intento cuenta como fallido con la causa `sin_salida_estructurada`. Los 3 intentos de la spec son los del código.
- **Bloques `/pegar` que no son documentos**: todo bloque pegado queda registrado como adjunto, aunque sea un mensaje largo. El modelo solo llama a `extraer_documento` ante un certificado o un extracto (R9). Si lo llama sobre otro texto, el resultado es `documento_no_soportado` y escala.
- **Regla 5 antes de la Regla 1 con un adjunto no soportado**: si el modelo llama a `extraer_documento` sin identidad sobre un adjunto no soportado, el control bloquea por la Regla 1 antes de que el manejador escale por la Regla 5. El prompt ya pide `solicitar_analista` en ese caso, y el escalamiento por la Regla 5 sigue disponible.
- **Moneda solo con `$`**: un documento sin la palabra pesos ni `COP` deja la moneda nula y pide un documento. Es conservador a propósito: en Colombia `$` también se usa para dólares.
- **Revisión de cumplimiento del #6**: se espera la Regla 1 ✅, la Regla 5 ✅ y las reglas 2, 3 y 4 no aplicables. Ningún umbral de las reglas 2 y 3 debe aparecer como literal.
