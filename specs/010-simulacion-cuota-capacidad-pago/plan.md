# Implementation Plan: Simulación de cuota y capacidad de pago

**Branch**: `12-simulacion-de-cuota-y-capacidad-de-pago` | **Date**: 2026-10-18 | **Spec**: [spec.md](spec.md)

**Issue de origen**: [fabisahe29/CREDIAGIL#12](https://github.com/fabisahe29/CREDIAGIL/issues/12)

**Input**: Feature specification from `/specs/010-simulacion-cuota-capacidad-pago/spec.md`

## Summary

El agente responde «¿en cuánto me quedaría la cuota?» con la herramienta `calcular_capacidad_pago`. A partir de un monto, un plazo y un ingreso mensual devuelve la cuota de amortización francesa con la tasa fija del 1,8% mensual, redondeada al peso entero más cercano, y la proporción de esa cuota sobre el ingreso. Es una consulta pura: no registra, no reserva ni compromete nada, no exige identidad y rotula su resultado como no vinculante.

**Enfoque** (ver [research.md](research.md)):

- **Política** (`src/politica/cuota.ts`): funciones puras `calcularCuota`, `redondearAlPesoMasCercano` y `calcularRelacionCuotaIngreso`. La tasa vive solo en `politica.ts`, como puntos base enteros (R1, R2).
- **Contrato compartido** (`src/compartido/capacidad-pago.ts`): esquema de entrada y de salida, y el texto de la descripción de la herramienta, una sola vez para el core y el agente (R5, R7).
- **Core** (`src/mcp/`): herramienta `calcular_capacidad_pago` de solo lectura. El core decide si el ingreso es `verificado` o `declarado` comparándolo con la verificación que guardó; el modelo no lo declara (R3).
- **Agente**: la herramienta en el adaptador, sin entrar en la lista del control de identidad, y el prompt deja de decir «no estimas cuotas» para decir que la cuota la calcula la herramienta (R6, R8).
- **Pruebas**: el valor de referencia, los bordes de redondeo y de la proporción, las entradas inválidas y la ausencia de efectos (R9).

## Technical Context

**Language/Version**: TypeScript `strict`, solo sintaxis borrable, ejecutado por Node ≥ 22.18 sin compilar, como el #7 a #11. En este equipo, Node v24.21.0.

**Primary Dependencies**: ninguna nueva.
- `@anthropic-ai/claude-agent-sdk` 0.3.302, `@modelcontextprotocol/sdk` 1.32.1 y `zod` 4.6.7, los del #11.

**Storage**: ninguno. La simulación no guarda nada. Solo lee la verificación de ingreso que el core ya tiene en memoria por `correlationId`.

**Testing**: `node --test` sobre `src/**/*.test.ts`, sin red ni modelo.
- Política: funciones puras y tablas de casos con el valor de referencia y los bordes de .5.
- Core y servidor MCP: el cliente MCP en memoria del #7.
- Adaptador: core falso.
- Validación con el modelo real solo en el [quickstart](quickstart.md).

**Target Platform**: la misma del #8: terminal en Windows, macOS y Linux. El core también se usa desde Claude Code (`.mcp.json`).

**Project Type**: agente, servidor MCP y chat existentes. Se agregan un módulo de política, un módulo de contrato compartido, una herramienta del core y una del adaptador.

**Performance Goals**: el cálculo es aritmética de una fórmula; la herramienta responde en menos de 5 ms dentro del core. El tiempo límite de 5 s del cliente del core no cambia.

**Constraints**:
- La cuota se calcula en código; el modelo no la estima ni la redondea (Principio III).
- La tasa y los umbrales no se repiten como literal fuera de `politica.ts`.
- La herramienta no tiene efectos: no escribe en el core ni deja estado.
- El resultado no evalúa la Regla 2 ni ofrece nada vinculante.
- Los logs no llevan montos de documentos; solo el resultado y la fuente del ingreso.
- Sin `any`.

**Scale/Scope**: 3 módulos nuevos (`politica/cuota.ts`, `compartido/capacidad-pago.ts` y sus pruebas) y unos 8 modificados. Unas 40 pruebas nuevas.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principio / restricción | Evaluación | Resultado |
|-------------------------|-----------|-----------|
| I. Reglas de negocio inmutables | La **Regla 2** no se evalúa aquí: la simulación informa cuota y proporción, no decide (FR-009); el 30% y los $5.000.000 llegan con el #14. La **Regla 3** se respeta: la fuente `verificado` solo la asigna el core cuando el ingreso coincide con el que salió de los documentos; un ingreso que el solicitante dice se rotula `declarado`. Las **reglas 1, 4 y 5** no se tocan: el orden 4 → 5 → 1 → 3 → 2 sigue en `prevalece`. La tasa del 1,8% vive solo en `politica.ts`. | ✅ |
| II. Datos exclusivamente ficticios | Las pruebas y el quickstart usan montos e ingresos inventados, y a Ana Pérez Ficticia cuando hace falta una verificación. No hay documentos nuevos. | ✅ |
| III. Decisiones deterministas · esquemas | La cuota es `P · i / (1 − (1 + i)^−n)` con `i = 0,018` y se redondea con `redondearAlPesoMasCercano`, nombrada y probada con los bordes de .5. La proporción se calcula con enteros (`BigInt`), no con flotantes. La entrada se valida con Zod y lo que no pasa es un error de validación, no un valor adivinado. | ✅ |
| IV. Acciones solo por herramientas MCP | La simulación pasa por la herramienta del core, que revalida la entrada del lado del servidor aunque el adaptador ya la haya tipado. Es de solo lectura (`readOnlyHint`), por lo que la regla de idempotencia de las herramientas con efectos no aplica. | ✅ |
| V. Escalar ante la duda | Una entrada inválida no produce una cuota parcial ni se completa: el error pide corregirla. La simulación no escala por sí sola; la moneda extranjera y el documento no soportado ya escalan en el #10. | ✅ |
| VI. Observabilidad y resiliencia | Cada llamada deja el log estructurado con `correlationId`, resultado y `fuenteIngreso`. Una simulación no es una decisión, así que no genera auditoría de decisión. La llamada al core usa los reintentos acotados y el tiempo límite del adaptador; si se agotan, la conversación escala. Los errores llevan tipo y causa. | ✅ |
| Entrada y moneda | Solo COP: el monto y el ingreso son pesos enteros. | ✅ |
| Secretos fuera del repositorio | Sin secretos nuevos. | ✅ |
| TypeScript `strict`, sin `any` | Los argumentos llegan como `unknown` al servidor y se validan con `safeParse`; la respuesta del core se valida en el cliente. | ✅ |
| Simplicidad (YAGNI) | Sin dependencias nuevas, sin persistencia y sin campo nuevo en el estado de la conversación. No se agrega un evento de negocio: el modo de demostración ya muestra la llamada. | ✅ |
| Pruebas obligatorias | Política con el valor de referencia y los bordes; herramienta MCP con el rechazo de entradas inválidas y la ausencia de efectos; control de identidad sin bloqueo; adaptador con el escenario de «solo pregunta por la cuota». | ✅ |

**Gate**: aprobado.

**Re-check post-diseño**: aprobado, sin desviaciones. Los cambios al código ya entregado son aditivos:
- una constante más en `politica.ts` y la versión de la política sube;
- una herramienta más en el servidor del core, en el cliente y en el adaptador;
- una frase del prompt cambia: ya no dice «no estimas cuotas», dice que la cuota la calcula la herramienta y que no se simula por cuenta propia.

## Project Structure

### Documentation (this feature)

```text
specs/010-simulacion-cuota-capacidad-pago/
├── spec.md
├── plan.md              # Este archivo
├── research.md          # Hechos del repo y decisiones R1–R9
├── data-model.md        # Parámetros, EntradaSimulacion, SimulacionCapacidadPago
├── quickstart.md        # Escenarios 1–6
├── contracts/
│   ├── politica.md      # cuota.ts: funciones, redondeo y fronteras
│   ├── core-mcp.md      # calcular_capacidad_pago: entrada, salida y errores
│   └── agente.md        # herramienta del adaptador, control de identidad y prompt
├── checklists/requirements.md
└── tasks.md             # /speckit-tasks
```

### Source Code (repository root)

```text
src/
├── politica/
│   ├── politica.ts               # MODIFICADO: TASA_MENSUAL_PUNTOS_BASE, TASA_MENSUAL; versión
│   ├── cuota.ts                  # NUEVO: calcularCuota, redondearAlPesoMasCercano, calcularRelacionCuotaIngreso
│   └── cuota.test.ts             # NUEVO
├── compartido/
│   ├── capacidad-pago.ts         # NUEVO: esquemas Zod de entrada y salida, descripción de la herramienta, avisos
│   └── capacidad-pago.test.ts    # NUEVO
├── mcp/
│   ├── core-simulado.ts          # MODIFICADO: calcularCapacidadPago (solo lectura)
│   ├── core-simulado.test.ts     # MODIFICADO
│   ├── servidor.ts               # MODIFICADO: herramienta calcular_capacidad_pago
│   └── servidor.test.ts          # MODIFICADO
├── agente/
│   ├── cliente-core.ts           # MODIFICADO: calcularCapacidadPago
│   ├── cliente-core.test.ts      # MODIFICADO
│   ├── adaptador.ts              # MODIFICADO: herramienta calcular_capacidad_pago
│   ├── adaptador.test.ts         # MODIFICADO
│   ├── control-identidad.test.ts # MODIFICADO: la herramienta no exige identidad
│   ├── agente.ts                 # MODIFICADO: prompt
│   └── agente.test.ts            # MODIFICADO
CLAUDE.md                         # MODIFICADO: mapa del repositorio (cuota en src/politica/, contrato en src/compartido/)
DECISIONES.md                     # MODIFICADO: entrada del #12
```

**Structure Decision**:
- La aritmética, la tasa y el redondeo van en `src/politica/`, la única fuente que fija la constitución para umbrales y tasa; el core la llama.
- El esquema y la descripción van en `src/compartido/` porque los usan el servidor y el adaptador; así la descripción que lee el modelo (FR-007) no se escribe dos veces.
- El core en `src/mcp/` aplica la validación y decide la fuente del ingreso; el adaptador en `src/agente/` solo expone la herramienta al modelo.

## Complexity Tracking

| Complejidad | Por qué hace falta | Alternativa más simple descartada |
|-------------|--------------------|-----------------------------------|
| Pasar la simulación por el core MCP en lugar de calcularla dentro del adaptador (R4) | Principio IV: el agente actúa solo por herramientas MCP, y el #14 vuelve a calcular la cuota en el core para rechazar una preaprobación fuera de política; ambos deben usar la misma función | Calcular en el adaptador: dejaría dos caminos de cálculo y la simulación no pasaría por el contrato tipado del core |
| El core decide la fuente `verificado` o `declarado` (R3) | La Regla 3 prohíbe que un ingreso dicho por el solicitante se presente como verificado; si lo declarara el modelo, un error suyo rotularía mal | Un parámetro `fuente` que envía el modelo: pone la clasificación en el modelo |
| Proporción con `BigInt` (R2) | Evita decidir con flotantes y deja el cálculo listo para el 30% del #14 | `cuota / ingreso * 100` en flotante: error de redondeo en los bordes |

## Riesgos y pendientes

- **Nombre `preaprobar_credito`**: la descripción lo cita como la herramienta que no se reemplaza, pero se crea en el #14. Hasta entonces el modelo no la tiene; el texto no lo induce a buscarla (R7). Si el #14 le cambia el nombre, debe actualizar la descripción; una prueba fija la frase.
- **Prompt**: pasar de «no estimas cuotas» a «usa la herramienta» abre la puerta a que el modelo simule por su cuenta. El prompt lo prohíbe y el quickstart lo comprueba (Escenario 5).
- **Escalamiento previo**: una conversación ya escalada bloquea todas las herramientas, también la simulación. Es el comportamiento del #9 y no se cambia aquí.
- **Cuota fuera del rango seguro**: un monto cercano al máximo entero seguro puede dar una cuota que ya no es un entero seguro; se rechaza con un error de validación y no se redondea sin precisión (R2). No es un límite de negocio.
- **Ingreso negativo y sugerencia del modelo** (Principio V): con «Gano -500.000», el modelo sugirió en tres turnos un ingreso de 500.000 para que el solicitante lo confirme. La herramienta nunca recibió ese valor: devuelve `ingreso_invalido` y no hay cuota. Se acepta no corregir el prompt en este ticket; si el modelo reincide en otros datos, se agrega una línea al prompt con su prueba.
- **Revisión de cumplimiento del #6**: se espera la Regla 2 ➖ (no aplica, solo se informa la proporción), la Regla 3 ✅ (la fuente la asigna el core) y las reglas 1, 4 y 5 ➖. La tasa no debe aparecer como literal fuera de `politica.ts`.
