# Implementation Plan: Casos de prueba obligatorios de extremo a extremo

**Branch**: `17-casos-prueba-e2e` | **Date**: 2026-10-19 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/015-casos-prueba-extremo-a-extremo/spec.md`

## Summary

Un comando, `npm run casos`, ejecuta los siete casos obligatorios y entrega un informe por caso (esperado, observado, veredicto) y un veredicto global con código de salida. Cada caso es una carpeta en `casos/obligatorios/` con el mismo `caso.json` que ya reproduce el chat (`/caso`), sus documentos ficticios, su resultado esperado y, para el modo guionado, un guion de lo que «entiende» el modelo.

El veredicto sale de decisiones y llamadas a herramientas, nunca del texto de la respuesta. Para controlar la variabilidad del modelo (FR-019), la ejecución tiene dos modos con los mismos casos: **guionado** (por defecto, sin credenciales ni red, repetible) y **modelo real** (`--modelo-real`). En ambos corren de verdad el core MCP, los hooks, la política y el adaptador; en modo guionado solo se sustituyen la consulta al modelo, el subagente de extracción y el clasificador de documentos, que ya son puntos de inyección de `conversar` (`ejecutarConsulta`, `ejecutarSubagente`, `clasificarDocumento`). No se toca la lógica de negocio.

Además se audita y completa la cobertura de la lógica determinista sin modelo (bloqueos por hook, cuota, consistencia, contrato de errores, bordes de $5.000.000, 30% y 10%) y se agrega una verificación automática de que ningún documento de prueba tiene forma de dato real.

## Technical Context

**Language/Version**: TypeScript `strict` sobre Node.js ≥ 22.18 (ejecución directa de `.ts`, como el resto del repositorio)

**Primary Dependencies**: las existentes: `@anthropic-ai/claude-agent-sdk`, `@modelcontextprotocol/sdk`, `zod`. Ninguna nueva.

**Storage**: archivos. Casos y documentos en `casos/obligatorios/`; el estado del core es en memoria del proceso del servidor MCP, que se arranca limpio por caso.

**Testing**: `node --test` (`npm test`), sin red ni modelo. El comando de casos en modo guionado también corre sin red; el modo real necesita `ANTHROPIC_API_KEY`.

**Target Platform**: terminal local y CI (Windows y Linux).

**Project Type**: CLI sobre un proyecto único (agente + servidor MCP + chat).

**Performance Goals**: los siete casos en modo guionado terminan en menos de 60 s en total (arranque del core por caso incluido); no es un requisito de producto, solo para que corra en cada commit.

**Constraints**: el veredicto no depende del texto de la respuesta (FR-004); cada caso parte de un core nuevo (FR-017); un caso que no puede correr es «no ejecutable», nunca «pasó» (FR-018); la lógica de negocio no cambia.

**Scale/Scope**: 7 casos (el 7 con dos variantes), unos 25 documentos ficticios, un módulo nuevo `src/e2e/`.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principio | Verificación | Resultado |
|-----------|--------------|-----------|
| I. Reglas de negocio inmutables | No se cambia ningún umbral ni regla. Los casos 3, 4, 5 y 6 verifican las reglas 3, 2, 1 y 5; el caso 1 verifica el camino feliz de la regla 2. El orden 4 → 5 → 1 → 3 → 2 se comprueba con los mismos hooks reales. | Cumple |
| II. Datos ficticios | Todos los documentos nuevos son ficticios y reconocibles (correos `.example`, NIT y documentos con prefijo inventado). Una prueba automática recorre `casos/` y falla ante un dato con forma real (FR-016). | Cumple |
| III. Decisiones deterministas | El informe decide con código sobre eventos y llamadas; no hay comparación de texto de la respuesta. El modelo guionado no decide nada: repite llamadas fijas y la decisión sigue siendo del código. | Cumple |
| IV. Acciones solo por MCP | El ejecutor llama a `conversar` con un cliente real del core MCP. Para leer el estado final (solicitud registrada, escalamiento) usa los métodos de lectura del mismo cliente, no el estado interno. | Cumple |
| V. Escalar ante la duda | Los casos 3, 4, 6 y 7b verifican el escalamiento con su causa y la entrega del resumen. | Cumple |
| VI. Observabilidad y resiliencia | El caso 7 verifica el reintento acotado y la honestidad de la respuesta. Los logs no cambian. El informe nunca imprime el contenido de los documentos. | Cumple |

**Resultado**: sin violaciones; la tabla de Complexity Tracking queda vacía. Re-evaluación tras el diseño (Phase 1): sin cambios, el diseño no agrega herramientas, ni umbrales ni acciones al core.

## Project Structure

### Documentation (this feature)

```text
specs/015-casos-prueba-extremo-a-extremo/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── caso-obligatorio.md   # formato de caso.json ampliado y del guion
│   └── comando-casos.md      # opciones, informe y códigos de salida del comando
├── auditoria-cobertura.md    # auditoría de la cobertura de la lógica determinista (HU4)
└── tasks.md                  # lo genera /speckit-tasks
```

### Source Code (repository root)

```text
casos/
└── obligatorios/
    ├── 1-ejemplo-consistente/     caso.json · guion.json · certificado y extractos
    ├── 2-certificado-sin-salario/ caso.json · guion.json · certificado-sin-salario.md
    ├── 3-discrepancia-ingreso/    caso.json · guion.json · documentos
    ├── 4-monto-8-millones/        caso.json · guion.json · documentos
    ├── 5-preaprobar-sin-identidad/caso.json · guion.json
    ├── 6-moneda-extranjera/       caso.json · guion.json · certificado-dolares.md
    └── 7-falla-transitoria/       caso.json · guion.json · documentos (con las variantes una-vez y siempre)

src/
├── chat/
│   └── casos.ts                   # el esquema acepta `esperado` y `falla` opcionales; el chat los ignora
└── e2e/                           # NUEVO
    ├── esperado.ts                # esquema y tipos del resultado esperado y de la variante
    ├── guion.ts                   # esquema, lectura y validación del guion contra su caso
    ├── veredicto.ts               # función pura: esperado + observado → veredicto con diferencias
    ├── observado.ts               # recolector: arma el resultado observado desde conversar y el core
    ├── modelo-guionado.ts         # QueryFn, subagente y clasificador guionados; corre los hooks reales
    ├── ejecutor.ts                # ejecuta un caso con un core nuevo, en el modo pedido
    ├── informe.ts                 # tabla por caso, veredicto global y código de salida
    ├── arranque.ts                # opciones del comando (`--modelo-real`, `--caso`, `--json`)
    ├── comando.ts                 # recorre los siete casos y arma el informe
    ├── principal.ts               # `npm run casos`
    └── *.test.ts                  # pruebas de cada pieza, de los siete casos, de datos ficticios y sin credenciales
```

**Structure Decision**: un módulo nuevo `src/e2e/` junto a `chat`, `agente` y `mcp`, porque ejecutar los casos es una tercera «interfaz» sobre `conversar`, igual que el chat. Los casos van en una subcarpeta `casos/obligatorios/` para distinguir los siete casos del evaluador de los casos de prueba de cada ticket, que se conservan sin cambios. Los documentos se copian dentro de cada carpeta porque `cargarCaso` exige que los adjuntos estén dentro de la carpeta del caso.

## Complexity Tracking

Sin violaciones de la constitución que justificar. La única complejidad añadida, el modelo guionado, se justifica en [research.md](research.md), R2 y R3, y se registra en `DECISIONES.md`.
