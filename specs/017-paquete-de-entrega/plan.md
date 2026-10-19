# Implementation Plan: Paquete de entrega

**Branch**: `19-paquete-de-entrega` | **Date**: 2026-10-19 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/017-paquete-de-entrega/spec.md`

## Summary

La entrega se califica con tres entregables: el repositorio en un `.zip`, el documento de decisiones y el video. Casi todo el contenido ya existe; este ticket lo ordena, lo verifica y evita el error de mayor costo (un secreto dentro del `.zip`).

Cuatro frentes:

1. **README**: una sección «Inicio rápido» al principio, con el camino sin credenciales (`npm install`, `npm test`, `npm run casos`), el camino con credenciales (el chat) y los enlaces al GitHub Project y al video.
2. **`DECISIONES.md`**: pasa a ser el resumen de dos páginas, con las 11 necesidades. El registro detallado actual se mueve sin cambios a `docs/registro-decisiones.md` con `git mv`, que conserva su historia. Se actualizan las tres referencias que hoy apuntan a `DECISIONES.md` (FR-006a).
3. **Comandos de entrega** (módulo nuevo `src/entrega/`, sin dependencias nuevas): `npm run entrega:armar` arma el `.zip` y `npm run entrega:verificar` lo revisa (contenido, secretos, tamaño, `.git`, artefactos de Spec Kit, historial sin reescribir). Reportan hallazgos y devuelven un código de salida que bloquea la entrega.
4. **Cierre con el GitHub Project**: revisión del estado de cada ticket por el servidor MCP de GitHub y un comentario con el estado real en los que no estén en Done. El video se verifica a mano, con una lista en `quickstart.md`: ninguna herramienta puede abrir un enlace de Drive sin sesión de forma fiable.

No cambia ninguna regla de negocio, ni el agente, ni los casos.

## Technical Context

**Language/Version**: TypeScript `strict` sobre Node.js ≥ 22.18 (ejecución directa de `.ts`, como el resto del repositorio)

**Primary Dependencies**: las existentes. Ninguna nueva: el `.zip` se escribe y se lee con `node:zlib` y `node:fs`, y el historial se revisa con `git` local.

**Storage**: archivos. El `.zip` se genera en `dist/` (ya ignorado por git) y no se versiona.

**Testing**: `node --test` (`npm test`), sin red ni modelo. Los datos con forma de secreto de las pruebas se construyen en tiempo de ejecución (regla de `tests.md`).

**Target Platform**: terminal local en Windows y Linux. Todo el código usa rutas con `/` dentro del `.zip`.

**Project Type**: CLI sobre un proyecto único, más documentación.

**Performance Goals**: armar y verificar el `.zip` en menos de 60 s sobre el repositorio actual (444 archivos versionados, `.git` de unos 12 MB).

**Constraints**: el `.zip` pesa como máximo 50 MB; el historial no se reescribe; sin dependencias nuevas; ningún informe imprime el valor de un secreto, solo su ubicación y tipo.

**Scale/Scope**: 3 documentos (`README.md`, `DECISIONES.md`, `docs/registro-decisiones.md`), 3 referencias actualizadas, un módulo nuevo `src/entrega/` con 6 archivos y sus pruebas.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principio | Verificación | Resultado |
|-----------|--------------|-----------|
| I. Reglas de negocio inmutables | No se toca `src/politica/`, ni el agente, ni el core. Ningún umbral cambia. | Cumple |
| II. Datos ficticios | Los documentos nuevos solo hablan de proceso y de decisiones. El verificador se prueba con valores generados en ejecución, nunca con un secreto o dato con forma real escrito en un archivo. `DECISIONES.md` y `docs/registro-decisiones.md` entran en la prueba `sin-datos-reales`. | Cumple |
| III. Decisiones deterministas | Los controles de la entrega (contenido, tamaño, secretos, páginas) son código determinista con resultado estructurado; el modelo no decide si la entrega está lista. | Cumple |
| IV. Acciones solo por MCP | Todo lo que se lee o escribe en GitHub (estado de tickets, comentarios) va por el servidor MCP de GitHub (Regla 1 de `flujo-github.md`). `git` local solo se usa para leer el historial y armar la lista de archivos. El servidor MCP del core no interviene. | Cumple |
| V. Escalar ante la duda | Un hallazgo bloquea la entrega y se reporta; el verificador no «arregla» ni borra nada por su cuenta. Un historial que no se puede comprobar se reporta como «no verificable», no como correcto. | Cumple |
| VI. Observabilidad y resiliencia | Cada comprobación devuelve su resultado con tipo y causa; los errores no se silencian. Los informes no incluyen el contenido de los archivos ni los valores de secretos. | Cumple |

**Resultado**: sin violaciones. Complexity Tracking justifica el módulo nuevo `src/entrega/`. Re-evaluación tras el diseño (Phase 1): sin cambios.

## Project Structure

### Documentation (this feature)

```text
specs/017-paquete-de-entrega/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── comando-entrega.md
│   ├── decisiones.md
│   └── estado-tickets.md
├── checklists/
│   └── requirements.md
└── tasks.md              # lo crea /speckit-tasks
```

### Source Code (repository root)

```text
README.md                          # «Inicio rápido» y enlaces al Project y al video
DECISIONES.md                      # resumen de dos páginas, 11 necesidades
docs/
└── registro-decisiones.md         # el contenido actual de DECISIONES.md, movido con git mv
CLAUDE.md                          # fila de DECISIONES.md y fila de src/entrega/
.claude/rules/specs.md             # dónde se anotan las decisiones del plan
.gitignore                         # *.zip
package.json                       # scripts entrega:armar y entrega:verificar
src/entrega/
├── principal.ts                   # CLI: armar | verificar
├── zip.ts                         # escritor y lector de .zip con node:zlib
├── contenido.ts                   # reglas de exclusión y detectores de hallazgos
├── armar.ts                       # lista de archivos (git ls-files + .git) y escritura del .zip
├── verificar.ts                   # contenido, tamaño, .git, historial y artefactos
├── specs.ts                       # completitud de specs/ y de la constitución
└── *.test.ts                      # junto a cada módulo, más pruebas de README y DECISIONES.md
```

**Structure Decision**: un módulo propio `src/entrega/`, hermano de `src/e2e/`, porque la verificación de la entrega no es parte del agente ni del core. Los documentos viven donde el enunciado y el evaluador los buscan: raíz y `docs/`.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| Módulo nuevo `src/entrega/` con escritor de `.zip` propio | Un secreto en el `.zip` es falta grave y la revisión manual falla justo cuando hay prisa. El armado y la revisión deben ser repetibles en Windows y Linux. | Revisar a mano o con `Compress-Archive` no filtra de forma fiable, cambia según el sistema y no deja un informe que bloquee la entrega. Una librería de zip agregaría una dependencia para 100 líneas de código. |
