# Quickstart: validar el esqueleto del agente y del core

**Feature**: [spec.md](spec.md) · **Contratos**: [core-mcp.md](contracts/core-mcp.md), [agente.md](contracts/agente.md)

## Requisitos previos

- Node ≥ 22.18 y `npm install` hecho, con las dependencias opcionales: el binario de Claude Code que usa el Agent SDK viene en ellas.
- `npm ls @modelcontextprotocol/sdk zod` muestra **una sola** versión de cada una (R8).
- Para los Escenarios 3 y 4: `ANTHROPIC_API_KEY` definida en la sesión de la terminal. Nunca en un archivo versionado.

## Escenario 1: pruebas sin red ni modelo (FR-019, FR-020 · SC-002, SC-003, SC-003a, SC-005, SC-008)

```text
npm test
npm run typecheck
npm run format:check
```

Esperado: todo en verde, sin `ANTHROPIC_API_KEY`. Cubre:
- el contrato de errores (4 categorías, reintento, respuesta vacía);
- el core y el servidor por stdio;
- la política de reintentos (3 intentos, esperas exactas);
- el adaptador con la falla en `una-vez` y `siempre`;
- el agente con una consulta falsa para cada `subtype` y cada `stop_reason`.

## Escenario 2: el core desde Claude Code (FR-018 · SC-007)

1. Abrir una sesión **nueva** de Claude Code en el repositorio y aprobar el servidor del proyecto `crediagil-core`, que no pide credenciales.
2. Pedir: «usa `consultar_solicitud` con el identificador de la solicitud en estudio de los datos de ejemplo».

Esperado:
- devuelve la solicitud ficticia;
- con un identificador inexistente devuelve `solicitud: null`;
- con `SOL-123` devuelve `validacion` con `campo: idSolicitud`.

## Escenario 3: el agente con el modelo real (US1 · SC-001)

```text
node src/agente/demo.ts "¿En qué estado está mi solicitud <id en estudio>?"
node src/agente/demo.ts "Hola"
```

Esperado:
- la primera respuesta usa los datos del core, y stderr muestra `llamada_core` y `resultado` con el mismo `correlationId`;
- la segunda no llama a ninguna herramienta (`turnos` 1).

## Escenario 4: falla transitoria (US3 · SC-004)

```text
CREDIAGIL_FALLA=una-vez node src/agente/demo.ts "¿Estado de <id en estudio>?"
CREDIAGIL_FALLA=siempre node src/agente/demo.ts "¿Estado de <id en estudio>?"
```

En PowerShell: `$env:CREDIAGIL_FALLA = "siempre"`, y después `Remove-Item Env:CREDIAGIL_FALLA`.

Esperado:
- con `una-vez`: 2 `llamada_core`, la segunda `ok`, y respuesta con el dato real;
- con `siempre`: 3 `llamada_core` `core_no_disponible`, un evento `escalamiento` y el aviso fijo de escalamiento, sin datos de la solicitud.

## Escenario 5: datos ficticios (US4 · SC-006)

`npm test` incluye la prueba que pasa los datos de ejemplo por el detector `datos-reales` del #5: 0 bloqueos. Revisar a ojo que los correos son `.example` y que los documentos empiezan por `000`.
