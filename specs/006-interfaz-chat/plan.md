# Implementation Plan: Interfaz de chat

**Branch**: `8-interfaz-de-chat` | **Date**: 2026-10-17 | **Spec**: [spec.md](spec.md)

**Issue de origen**: [fabisahe29/CREDIAGIL#8](https://github.com/fabisahe29/CREDIAGIL/issues/8)

**Input**: Feature specification from `/specs/006-interfaz-chat/spec.md`

## Summary

Un chat de terminal que conversa con el agente del #7 turno a turno, entrega documentos `.txt`/`.md` y reproduce casos de prueba ficticios. Además define el **catálogo único de eventos de negocio**: los tickets siguientes solo tienen que emitir un evento para que la interfaz lo muestre de forma uniforme y para que el estado visible de la solicitud cambie.

**Enfoque** (ver [research.md](research.md)):

- **Contexto entre turnos**: historial explícito que `conversar` antepone al mensaje; cada turno sigue siendo un `query()` independiente, con `persistSession: false` (R1).
- **Eventos** (`src/compartido/eventos.ts`):
  - Catálogo Zod estricto con cuatro tipos.
  - Los emite solo el código, con `emitirEvento` desde el adaptador; la señal de escalamiento del #7 se convierte en evento.
  - `conversar` los devuelve y la interfaz los valida de nuevo (R2, R3).
- **Interfaz** (`src/chat/`):
  - `readline` con etiquetas de texto y color opcional, sin dependencias nuevas (R4).
  - Módulos puros para comandos, documentos, casos, estado y presentación; un bucle con E/S inyectada.
- **Modo de demostración**: un observador del adaptador muestra en vivo cada intento de herramienta (R5).
- **Logs**: a `logs/chat-<fecha>.jsonl`, junto con el stderr del core, para no mezclarlos con la conversación (R6).
- **Documentos y casos**:
  - Lectura con límites y bloque delimitado `<documento>` (R7).
  - Texto de varias líneas con `/pegar` … `/fin` (R8).
  - Casos JSON validados en `casos/<nombre>/` (R9).

## Technical Context

**Language/Version**: TypeScript `strict`, solo sintaxis borrable, ejecutado por Node ≥ 22.18 sin compilar, como el #7. En este equipo, Node v24.21.0.

**Primary Dependencies**: ninguna nueva.
- Las del #7: `@anthropic-ai/claude-agent-sdk` 0.3.302, `@modelcontextprotocol/sdk` 1.32.1 y `zod` 4.6.7.
- De Node: `node:readline`, `node:util` (`styleText`), `node:fs`.

**Storage**: en memoria durante la ejecución. Los casos de prueba son archivos versionados en `casos/`. Los logs van a `logs/` (ignorado por git).

**Testing**: `node --test` sobre `src/**/*.test.ts`, sin red ni modelo.
- Pruebas unitarias de cada módulo puro: eventos, sesión, presentación, comandos, documentos y casos.
- Pruebas del bucle del chat con `conversar` falso y E/S en memoria.
- Pruebas de `conversar` con la `query()` falsa del #7: historial, eventos y `persistSession`.
- Validación con el modelo real solo en el [quickstart](quickstart.md).

**Target Platform**: terminal de Windows (PowerShell, Windows Terminal), macOS y Linux.

**Project Type**: aplicación de línea de comandos interactiva sobre el agente existente.

**Performance Goals**: la interfaz arranca en menos de 3 s, sin contar el modelo. Lo que agrega a cada turno es despreciable frente al modelo: menos de 50 ms.

**Constraints**:
- Sin dependencias nuevas.
- La salida se lee sin color.
- El contenido de los documentos nunca va a los logs.
- El estado solo cambia con eventos validados.
- La interfaz no llama al core ni decide nada de crédito.

**Scale/Scope**:
- Una persona por ejecución.
- Conversaciones de decenas de turnos.
- Unos 7 módulos nuevos, 4 modificados, 1 caso de ejemplo y unas 70 pruebas nuevas.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principio / restricción | Evaluación | Resultado |
|-------------------------|-----------|-----------|
| I. Reglas de negocio inmutables | No se implementa ninguna regla. La interfaz solo **muestra** eventos que otros emiten. El catálogo exige que una preaprobación o un bloqueo lleven regla y valores, pero no decide nada. | ✅ N/A, sin improvisación |
| II. Datos exclusivamente ficticios | El caso de ejemplo y su certificado usan la convención `000`, correos `.example` y nombres inventados; el guardián del #5 los revisa al escribirlos. Las pruebas generan en ejecución cualquier dato con forma real. | ✅ |
| III. Decisiones deterministas · esquemas | Eventos validados con Zod al emitirlos y otra vez al mostrarlos. El estado visible es una función pura de los eventos, **nunca** del texto del modelo (FR-007). Casos y entradas validados con esquema. | ✅ |
| IV. Acciones solo por herramientas MCP | La interfaz solo llama a `conversar`; no toca el core. Los eventos se emiten desde los manejadores del adaptador, no los declara el modelo. | ✅ |
| V. Escalar ante la duda | Un documento no soportado llega al agente como metadatos para que escale (regla 5, en #15); la interfaz no lo descarta en silencio. Un evento inválido se muestra como no reconocido y no cambia el estado. Los estados finales cierran la conversación. | ✅ |
| VI. Observabilidad y resiliencia | `correlationId` visible y en cada log. `evento_negocio` registrado por cada evento. Documentos solo con metadatos en los logs. Tiempos límite y reintentos heredados del #7. Errores del observador registrados, no silenciados. La idempotencia no aplica: no hay herramientas nuevas con efectos. | ✅ |
| Entrada `.txt`/`.md`, lo demás no soportado | R7: extensión, tamaño y UTF-8 válido; lo demás es no soportado. | ✅ |
| Secretos fuera del repositorio | `ANTHROPIC_API_KEY` solo por entorno; el mensaje de error no muestra valores. `logs/` ignorado por git. | ✅ |
| TypeScript `strict`, Node LTS, sin `any` | Mismo `tsconfig`. | ✅ |
| Simplicidad (YAGNI) | Terminal sin dependencias, JSON para los casos, sin persistencia. | ✅ |
| Pruebas obligatorias | FR-022: eventos, estado, presentación, documentos, casos y bucle, sin red ni modelo. | ✅ |

**Gate**: aprobado. **Re-check post-diseño**: sin cambios, aprobado. Las únicas modificaciones al código del #7 son aditivas y conservan su comportamiento sin historial ([contracts/eventos.md](contracts/eventos.md)).

## Project Structure

### Documentation (this feature)

```text
specs/006-interfaz-chat/
├── spec.md
├── plan.md              # Este archivo
├── research.md          # Hechos del SDK y del #7, decisiones R1–R9
├── data-model.md        # Evento, conversación, estado, entrada, documento, caso
├── quickstart.md        # Escenarios 1–7
├── contracts/
│   ├── chat-cli.md      # arranque, comandos, formato de salida, documentos, casos
│   └── eventos.md       # catálogo, emitirEvento y cambios en conversar/adaptador/logs
├── checklists/requirements.md
└── tasks.md             # /speckit-tasks
```

### Source Code (repository root)

```text
src/
├── compartido/
│   ├── eventos.ts              # NUEVO: catálogo Zod, validarEvento
│   ├── eventos.test.ts
│   ├── logs.ts                 # MODIFICADO: + fijarDestino
│   └── logs.test.ts            # MODIFICADO
├── agente/
│   ├── adaptador.ts            # MODIFICADO: estado.eventos, emitirEvento, alUsarHerramienta
│   ├── adaptador.test.ts       # MODIFICADO
│   ├── agente.ts               # MODIFICADO: historial, persistSession false, eventos, system prompt
│   ├── agente.test.ts          # MODIFICADO
│   ├── cliente-core.ts         # MODIFICADO: opción stderr
│   └── cliente-core.test.ts    # MODIFICADO
└── chat/
    ├── sesion.ts               # NUEVO: conversación, historial, estado y transiciones
    ├── sesion.test.ts
    ├── presentacion.ts         # NUEVO: formato de mensajes, eventos, herramientas y estado
    ├── presentacion.test.ts
    ├── comandos.ts             # NUEVO: interpreta una línea
    ├── comandos.test.ts
    ├── documentos.ts           # NUEVO: lee y clasifica adjuntos, compone el bloque
    ├── documentos.test.ts
    ├── casos.ts                # NUEVO: carga y valida un caso
    ├── casos.test.ts
    ├── chat.ts                 # NUEVO: bucle con E/S y conversar inyectados
    ├── chat.test.ts
    └── principal.ts            # NUEVO: arranque (opciones, clave, logs, core, readline)
casos/
└── demo-consulta/
    ├── caso.json               # NUEVO: caso de ejemplo ficticio
    └── certificado-laboral.md  # NUEVO: documento ficticio
README.md                       # NUEVO: qué es, requisitos, npm run chat, comandos, casos
package.json                    # MODIFICADO: script "chat"
.gitignore                      # MODIFICADO: logs/
CLAUDE.md                       # MODIFICADO: src/chat/ y casos/ en el mapa del repositorio
DECISIONES.md                   # MODIFICADO (ya en el plan): entrada del #8
```

**Structure Decision**: la interfaz va en `src/chat/` porque es un tercer componente que consume al agente sin que el agente la conozca. El catálogo de eventos va en `src/compartido/`, porque lo usan el agente, que emite, y el chat, que valida y muestra, igual que el contrato de errores del #7. Los casos de prueba van en `casos/`, en la raíz, porque son datos de demostración y no código de producción; el #17 agregará ahí los escenarios obligatorios.

## Complexity Tracking

| Complejidad | Por qué hace falta | Alternativa más simple descartada |
|-------------|--------------------|-----------------------------------|
| Historial reenviado en cada turno (R1) | Mantiene el modelo de un turno igual a un `query()` del #7, con reintento y escalamiento por turno, y no persiste documentos en disco | `resume` del SDK: guarda la transcripción con los documentos en `~/.claude/projects/` y un reintento hereda mensajes parciales |
| Doble validación de eventos, al emitir y al mostrar (R3) | Un emisor futuro con un error no puede cambiar el estado visible | Confiar solo en el tipo de TypeScript |
| Modo `/pegar` … `/fin` (R8) | `readline` entrega línea por línea y el *bracketed paste* no es uniforme entre terminales | Detectar el pegado por tiempo: no es determinista |

## Riesgos y pendientes

- **Costo del historial**: el prompt crece con cada turno y reenvía los documentos. Se acota porque toda conversación termina en un estado final o con `/nueva`. Si una demo larga lo hace notar, se puede resumir el historial en un ticket propio.
- **`styleText` y Windows**: se verifica en PowerShell y Windows Terminal en el Escenario 2. Las etiquetas de texto garantizan que se lea aunque no haya color.
- **Pegado sin `/pegar`**: si alguien pega varias líneas como mensaje normal, la primera se envía y las demás se descartan por FR-003, con aviso. Se documenta en el README y en `/ayuda`.
- **Tres tipos de evento sin emisor real**: solo `escalamiento` ocurre de verdad hoy. Los otros tres se validan con el modelo simulado; el primer ticket que los emita confirma el contrato.
- **El agente aún no escala por documento no soportado**: la interfaz entrega los metadatos; la regla 5 la aplica el #15. Hasta entonces, el agente solo responde con texto.
- **Revisión de cumplimiento del #6**: se espera que las 5 reglas resulten no aplicables, porque no hay lógica de originación. Hay que verificar que el catálogo no lleve umbrales literales: solo describe eventos.
