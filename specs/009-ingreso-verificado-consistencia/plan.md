# Implementation Plan: Ingreso verificado y validación de consistencia

**Branch**: `11-ingreso-verificado-y-validacion-de-consistencia` | **Date**: 2026-10-18 | **Spec**: [spec.md](spec.md)

**Issue de origen**: [fabisahe29/CREDIAGIL#11](https://github.com/fabisahe29/CREDIAGIL/issues/11)

**Input**: Feature specification from `/specs/009-ingreso-verificado-consistencia/spec.md`

## Summary

Con los datos que el #10 ya extrajo, el core calcula por código el ingreso mensual verificado: el menor entre el salario del certificado y el promedio mensual de abonos de nómina de los extractos. Lo compara con lo que declaró el solicitante: una diferencia de más del 10% sobre el verificado lleva el caso a un analista. Además contrasta los documentos entre sí y con el solicitante verificado, y registra cada inconsistencia con la procedencia de sus valores. Las que pueden ser un error de lectura se reextraen una vez, diciéndole al subagente la regla que falló pero no el valor esperado.

**Enfoque** (ver [research.md](research.md)):

- **Política** (`src/politica/ingreso.ts`, `consistencia.ts`): funciones puras con el ingreso verificado, la discrepancia con aritmética entera y las cinco comprobaciones de consistencia. El 10%, las palabras de nómina y los sufijos societarios viven en `politica.ts` (R1 a R4).
- **Estados**: un solo `estado` por verificación (`verificado`, `discrepancia`, `inconsistencia`, `sin_ingreso`, `falta_declarado`, `no_cubierto`), con un orden de prioridad que respeta 4 → 5 → 1 → 3 (R5).
- **Core**: `verificar_ingreso` calcula con lo que ya guardó y nunca recibe un ingreso verificado; `consultar_verificacion_ingreso` deja la decisión para el #13 y el #14. `registrar_extraccion` admite un reemplazo acotado tras una inconsistencia corregible vigente (R6, R8).
- **Adaptador**: la herramienta `verificar_ingreso`, la verificación interna tras cada extracción (reextracción y escalamiento) y dos motivos de escalamiento de la Regla 3 con el orden de reglas completo (R6 a R8).
- **Identidad y prompt**: `verificar_ingreso` entra en la lista del control del #9 y el prompt gana tres instrucciones (R8).
- **Auditoría y casos**: auditoría solo cuando el resultado cambia (R9) y cinco casos de demo con sus documentos ficticios (R10).

## Technical Context

**Language/Version**: TypeScript `strict`, solo sintaxis borrable, ejecutado por Node ≥ 22.18 sin compilar, como el #7 a #10. En este equipo, Node v24.21.0.

**Primary Dependencies**: ninguna nueva.
- `@anthropic-ai/claude-agent-sdk` 0.3.302, `@modelcontextprotocol/sdk` 1.32.1 y `zod` 4.6.7, los del #10.

**Storage**: en memoria del proceso del core, por `correlationId`, como el #9 y el #10. La verificación se guarda junto a las extracciones. Sin persistencia.

**Testing**: `node --test` sobre `src/**/*.test.ts`, sin red ni modelo.
- Política: funciones puras y tablas de casos con los bordes exactos del 10% y de los periodos.
- Core y servidor MCP: el cliente MCP en memoria del #7.
- Adaptador: core falso y subagente falso.
- Validación con el modelo real solo en el [quickstart](quickstart.md).

**Target Platform**: la misma del #8: terminal en Windows, macOS y Linux. El core también se usa desde Claude Code (`.mcp.json`).

**Project Type**: agente, servidor MCP y chat existentes. Se agregan dos módulos de política, dos herramientas del core, una del adaptador, dos motivos de escalamiento y cinco casos de demo.

**Performance Goals**:
- Verificar la conversación (política y consistencia) tarda menos de 20 ms con diez documentos.
- Una ronda de reextracción tiene el mismo límite de 25 s por intento del #10; el límite de 120 s de la conversación no cambia (ver Riesgos).

**Constraints**:
- El ingreso verificado no usa el ingreso declarado, ni como dato ni como desempate.
- Todo cálculo con enteros de pesos; ningún umbral se decide en flotante.
- El core es la única fuente del ingreso verificado y de las inconsistencias.
- Al subagente nunca se le dice el valor esperado.
- Los logs y la auditoría no llevan contenido, fragmentos ni valores de documentos.
- Sin `any`.

**Scale/Scope**:
- Decenas de documentos por ejecución, como el #10.
- 4 módulos nuevos (`politica/ingreso.ts`, `politica/consistencia.ts`, `compartido/ingreso.ts` y sus pruebas) y unos 12 modificados.
- 5 casos de demo y unos 22 documentos copiados o nuevos.
- Unas 70 pruebas nuevas.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principio / restricción | Evaluación | Resultado |
|-------------------------|-----------|-----------|
| I. Reglas de negocio inmutables | Implementa la **Regla 3**: el ingreso sale solo de los documentos y una diferencia mayor que el 10% sobre el verificado va a un analista, con el borde exacto (10% no escala) probado. La **Regla 5** prevalece: un documento `no_cubierto` corta antes de calcular, y la moneda extranjera ya escala en el #10. La **Regla 1** se refuerza: el core y el control de identidad exigen identidad también para verificar. La **Regla 4** no se toca. El orden 4 → 5 → 1 → 3 → 2 queda en `prevalece`. La Regla 2 (monto, cuota y 30%) es del #12 y del #14. El 10% vive solo en `politica.ts`. | ✅ |
| II. Datos exclusivamente ficticios | Los casos nuevos usan a Ana Pérez Ficticia, Industrias Imaginarias del Valle S.A.S. y otros nombres y NIT inventados, con documentos y cuentas `000…` y correos `.example`. Una prueba revisa la convención. | ✅ |
| III. Decisiones deterministas · esquemas | El modelo no calcula ni compara: el ingreso, la discrepancia y la consistencia son funciones puras. Comparaciones con enteros de pesos (`diferencia × 100 > 10 × verificado`); el redondeo del promedio es `promediarHaciaAbajo`, nombrado y probado. Cada decisión devuelve regla, valores y motivo. La entrada declarada y las respuestas del core se validan con Zod; lo que no pasa se trata como faltante o fuera de contrato. | ✅ |
| IV. Acciones solo por herramientas MCP | El cálculo y su registro pasan por `verificar_ingreso` del core, que vuelve a aplicar la Regla 1 y calcula con lo que guardó, sin aceptar un ingreso verificado de entrada. El reemplazo de un registro lo valida el core (defensa en profundidad). La decisión queda consultable por `consultar_verificacion_ingreso`. | ✅ |
| V. Escalar ante la duda | Una inconsistencia que detiene, o una discrepancia, escala. Los nombres de una palabra de más o de menos no se igualan. Un extracto sin nómina baja el ingreso y el redondeo va hacia abajo. Sin ingreso verificado se piden documentos y nada se supone. | ✅ |
| VI. Observabilidad y resiliencia | `auditoria_ingreso` con regla, valores, versión y marca de tiempo, solo si el resultado cambia. El cálculo es idempotente por construcción. La reextracción es una ronda acotada con tiempo límite por intento. Si el core no responde tras los reintentos, la conversación escala. Los errores llevan tipo y causa. | ✅ |
| Entrada y moneda | Solo COP: un documento en otra moneda no llega al cálculo. | ✅ |
| Secretos fuera del repositorio | Sin secretos nuevos. | ✅ |
| TypeScript `strict`, sin `any` | Las respuestas del core se validan con `safeParse`; el ingreso declarado llega como `unknown` al servidor. | ✅ |
| Simplicidad (YAGNI) | Sin dependencias nuevas. La reextracción reutiliza `extraerConIntentos`. No se agrega un campo «pagador» al esquema del #10. Cuota, monto y 30% no se tocan. | ✅ |
| Pruebas obligatorias | Política con los bordes exactos (10%, 31/32 días); herramientas MCP con el rechazo del lado del servidor (sin identidad, ingreso verificado inyectado, reemplazo sin inconsistencia); escenarios de punta a punta con los cinco casos. | ✅ |

**Gate**: aprobado.

**Re-check post-diseño**: aprobado, con tres puntos que quedan justificados en Complexity Tracking. Las decisiones que cambian código ya entregado son aditivas:
- campo `reextraidaPor` en el registro de extracción (por defecto `[]`);
- un motivo más en `MOTIVOS_ERROR`;
- dos motivos más de escalamiento y el orden de prevalencia completo;
- un parámetro opcional en `registrar_extraccion` y en `extraerConIntentos`;
- un nombre más en la lista del control de identidad.

## Project Structure

### Documentation (this feature)

```text
specs/009-ingreso-verificado-consistencia/
├── spec.md
├── plan.md              # Este archivo
├── research.md          # Hechos del repo y decisiones R1–R10
├── data-model.md        # Parámetros, IngresoVerificado, Discrepancia, Inconsistencia, VerificacionIngreso
├── quickstart.md        # Escenarios 1–9
├── contracts/
│   ├── politica.md      # ingreso.ts y consistencia.ts: funciones, estados y fronteras
│   ├── core-mcp.md      # verificar_ingreso, consultar_verificacion_ingreso, reextraccion y cliente
│   └── agente.md        # herramienta, verificación interna, reextracción, escalamiento y prompt
├── checklists/requirements.md
└── tasks.md             # /speckit-tasks
```

### Source Code (repository root)

```text
src/
├── politica/
│   ├── politica.ts               # MODIFICADO: umbral 10%, palabras de nómina, sufijos, días de periodo, reextracciones; versión
│   ├── ingreso.ts                # NUEVO: promediarHaciaAbajo, calcularIngresoVerificado, evaluarDiscrepancia, decidirIngreso
│   ├── ingreso.test.ts           # NUEVO
│   ├── consistencia.ts           # NUEVO: validarConsistencia, mismoNombre, mismoEmpleador
│   └── consistencia.test.ts      # NUEVO
├── compartido/
│   ├── ingreso.ts                # NUEVO: esquemas Zod de VerificacionIngreso, Inconsistencia, Discrepancia
│   ├── ingreso.test.ts           # NUEVO
│   ├── extraccion.ts             # MODIFICADO: reextraidaPor en el registro; motivo inconsistencia_entre_documentos
│   └── extraccion.test.ts        # MODIFICADO
├── mcp/
│   ├── core-simulado.ts          # MODIFICADO: verificarIngreso, consultarVerificacionIngreso, reextraccion
│   ├── core-simulado.test.ts     # MODIFICADO
│   ├── servidor.ts               # MODIFICADO: dos herramientas, reextraccion y auditoría
│   └── servidor.test.ts          # MODIFICADO
├── agente/
│   ├── extraccion.ts             # MODIFICADO: erroresIniciales en extraerConIntentos
│   ├── extraccion.test.ts        # MODIFICADO
│   ├── cliente-core.ts           # MODIFICADO: verificarIngreso, consultarVerificacionIngreso, reextraccion
│   ├── cliente-core.test.ts      # MODIFICADO
│   ├── adaptador.ts              # MODIFICADO: verificar_ingreso, verificación interna, motivos de la Regla 3, orden 4→5→1→3→2
│   ├── adaptador.test.ts         # MODIFICADO
│   ├── control-identidad.ts      # MODIFICADO: HERRAMIENTAS_CON_IDENTIDAD agrega verificar_ingreso
│   ├── control-identidad.test.ts # MODIFICADO
│   ├── agente.ts                 # MODIFICADO: AVISOS/REGLAS de los motivos nuevos, prompt
│   └── agente.test.ts            # MODIFICADO
casos/
├── ingreso-consistente/          # NUEVO: caso.json y copias de los documentos del #10
├── ingreso-inflado/              # NUEVO
├── ingreso-titular-distinto/     # NUEVO: caso.json, certificado y extractos, uno de otro titular ficticio
├── ingreso-empleador-distinto/   # NUEVO: nómina pagada por otro empleador ficticio
└── ingreso-moneda-extranjera/    # NUEVO: certificado con salario en dólares
CLAUDE.md                         # MODIFICADO: mapa del repositorio (Regla 3 en src/politica/, ingreso en src/compartido/)
DECISIONES.md                     # MODIFICADO (ya en el plan): entrada del #11
```

**Structure Decision**:
- La aritmética y las comparaciones van en `src/politica/`, la única fuente que fija la constitución para umbrales y reglas; el core y el agente las llaman.
- Los esquemas de la verificación van en `src/compartido/` porque los usan el core, el servidor y el cliente.
- El estado de la verificación se guarda en `src/mcp/`, donde el #13 y el #14 la leen y la vuelven a comprobar.
- El agente en `src/agente/` solo orquesta: llama al core, aplica los efectos del estado y reextrae.

## Complexity Tracking

| Complejidad | Por qué hace falta | Alternativa más simple descartada |
|-------------|--------------------|-----------------------------------|
| Reemplazo acotado de un registro en el core (R6) | El issue pide reintentar una inconsistencia corregible con la regla que falló; hoy el core devuelve siempre el registro previo | Validar la consistencia antes de registrar: el agente necesitaría el nombre del solicitante y el resultado dependería del orden de llegada de los documentos |
| Verificación interna en el adaptador además de la herramienta (R8) | Una inconsistencia debe escalar aunque el modelo no llame a `verificar_ingreso` | Solo la herramienta: una conversación sin esa llamada no revisaría la consistencia |
| Dos motivos de escalamiento y orden de reglas completo (R7) | La Regla 3 va después de la 1 en el orden de la constitución y el analista necesita el motivo exacto | Reutilizar `caso_no_cubierto`: confunde una discrepancia con un caso fuera de política |
| El ingreso se detecta por palabras clave de nómina (R3) | Determinista y probable; el campo «pagador» no existe en el esquema del #10 | Pedirle al subagente que marque la nómina: pone la clasificación en el modelo |

## Riesgos y pendientes

- **Costo y tiempo**: una ronda de reextracción cuesta hasta 3 llamadas más por documento involucrado, y un caso con dos inconsistencias corregibles puede reextraer varios documentos en el mismo turno. El Escenario 4 del quickstart lo mide. Si se acerca al límite de 120 s de la conversación, se sube el límite y se registra en DECISIONES.md, como hizo el #10.
- **Orden de llegada de los documentos**: la reextracción actúa sobre los documentos involucrados cuando llega el último; si el error estaba en un documento anterior, la ronda lo cubre porque reextrae a todos los involucrados. Lo que no se resuelve queda como inconsistencia real y escala (el lado seguro).
- **Descripciones de nómina no reconocidas** (R3): un abono sin las palabras de la lista baja el ingreso verificado. Nunca aprueba de más; si se ve en la práctica, se amplía la lista en `politica.ts`.
- **Extractos que no son de un mes**: se detiene por `periodo_no_mensual`. Es conservador; un extracto trimestral real se tendrá que dividir o escalar.
- **Preaprobación**: esta feature deja la decisión consultable, pero el rechazo de una preaprobación sobre una discrepancia o una inconsistencia lo cablea el #14 con `consultar_verificacion_ingreso`. SC-005 se cierra con el #14; aquí se prueba la consulta y el estado.
- **Escalamiento si no da el ingreso declarado o los documentos**: cuándo se considera que no los dará es del #15; hasta entonces el agente sigue pidiéndolos.
- **Revisión de cumplimiento del #6**: se espera la Regla 3 ✅ y la Regla 5 ✅; la Regla 1 ✅ por el control de identidad; las reglas 2 y 4 no aplican. El 10% no debe aparecer como literal fuera de `politica.ts`.
