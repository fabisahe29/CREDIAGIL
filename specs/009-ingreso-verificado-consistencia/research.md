# Research: Ingreso verificado y validación de consistencia

**Feature**: [spec.md](spec.md) · **Plan**: [plan.md](plan.md) · **Fecha**: 2026-10-18

Hechos verificados en el repositorio (rama `11-ingreso-verificado-y-validacion-de-consistencia`, sobre `f726755`), seguidos de las decisiones R1–R10. No hay dependencias nuevas, así que no se investigó el SDK de nuevo: se reutilizan las versiones del #10.

## Hechos de partida

- El #10 deja en el core, por `correlationId` y huella del contenido, un `RegistroExtraccion` de tres estados: `extraido`, `no_cubierto` y `no_extraible` ([src/compartido/extraccion.ts](../../src/compartido/extraccion.ts)). Un `extraido` trae un certificado laboral o un extracto bancario, y cada campo no nulo lleva su procedencia (adjunto, nombre de archivo y fragmento literal).
- El certificado tiene `empleador` y `salario`. El extracto tiene `titular`, `periodo` y `movimientos` (fecha, descripción, valor, sentido, procedencia). **No hay un campo «pagador»**: el pagador de un abono de nómina solo existe dentro de su descripción (por ejemplo, «Nómina Industrias Imaginarias»), como en [casos/extraccion-extractos/](../../casos/extraccion-extractos/).
- La moneda extranjera y el tipo no soportado ya escalan en el #10 (`caso_no_cubierto`, Regla 5), y el core no acepta un registro cuya causa no revalide. Un solo documento `no_cubierto` en la conversación significa que el caso ya escaló.
- `registrar_extraccion` es idempotente por huella: el mismo contenido devuelve el registro previo sin otro efecto ([src/mcp/core-simulado.ts](../../src/mcp/core-simulado.ts)). Hoy **no hay forma de reemplazar** un registro, y eso choca con el criterio de reintentar una inconsistencia (R6).
- El core conoce el nombre del solicitante verificado (`registrados`, [src/mcp/datos-ejemplo.ts](../../src/mcp/datos-ejemplo.ts)), pero `EstadoIdentidad` solo expone `idSolicitante`. El agente no necesita el nombre: la comparación de titular puede vivir en el core.
- [src/politica/politica.ts](../../src/politica/politica.ts) define hoy la versión, los intentos de verificación, los tipos soportados, la moneda y los intentos de extracción. **El 10% todavía no existe**: llega con esta feature.
- El orden de prevalencia entre señales de escalamiento está fijado en `[4, 5, 1]` ([src/agente/adaptador.ts](../../src/agente/adaptador.ts), `prevalece`). La constitución exige 4 → 5 → 1 → 3 → 2.
- El control de identidad bloquea las herramientas de `HERRAMIENTAS_CON_IDENTIDAD` (hoy `extraer_documento`) y niega toda herramienta cuando la conversación ya escaló ([src/agente/control-identidad.ts](../../src/agente/control-identidad.ts)). Un escalamiento es terminal en la conversación.
- El catálogo de eventos admite `valores` con textos o enteros, y `escalamiento` los acepta ([src/compartido/eventos.ts](../../src/compartido/eventos.ts)). No hace falta un tipo de evento nuevo.
- Los casos de demo del #10 (`casos/extraccion-*`) ya traen un certificado de 3.800.000 y tres extractos con un abono de nómina de 3.800.000 cada uno. Sirven de caso consistente.

## R1. El cálculo vive en la política, en funciones puras

**Decisión**: dos módulos nuevos en `src/politica/`: `ingreso.ts` (ingreso verificado, discrepancia y su decisión explicable) y `consistencia.ts` (comprobaciones entre documentos). Reciben registros ya validados y devuelven datos estructurados. No leen el reloj, el core ni el modelo. Los parámetros nuevos (el 10%, las palabras de nómina y los sufijos societarios) se definen en `politica.ts` y la versión de la política sube.

**Motivo**: la constitución exige un único módulo de política, versionado y con pruebas (Principio I); `.claude/rules/politica.md` pide que cada decisión devuelva regla, valores y motivo. El agente y el core usan las mismas funciones, como con `evaluarDocumento` en el #10.

**Alternativas descartadas**:
- Calcular dentro del core: la política quedaría repartida y el agente no podría anticipar el resultado en las pruebas.
- Que el modelo opine sobre la consistencia («parecen del mismo titular»): es justo lo que el Principio III prohíbe.

## R2. La discrepancia se compara con enteros, sin porcentajes en flotante

**Decisión**: hay discrepancia cuando `|declarado − verificado| × 100 > UMBRAL_DISCREPANCIA_INGRESO_PORCENTAJE × verificado`, con `UMBRAL_DISCREPANCIA_INGRESO_PORCENTAJE = 10`. Todo es entero de pesos. Con el ingreso verificado en 0 no se divide: no hay ingreso verificado (R5).

**Motivo**: la base del 10% es el ingreso verificado (aclaración de la constitución) y el borde exacto no debe depender de redondeos. Con 3.800.000: 4.180.000 y 3.420.000 son exactamente el 10% y no escalan; 4.180.001 y 3.419.999 escalan. Los productos caben en un entero seguro de `number` (pesos × 100 ≪ 2^53).

**Alternativas descartadas**:
- `Math.abs(d - v) / v > 0.1`: 0,1 no es exacto en flotante y el borde exacto podría quedar a un lado u otro.
- Una librería decimal: dependencia nueva que los enteros resuelven (YAGNI).

## R3. Abonos de nómina y promedio mensual

**Decisión**:
- Un movimiento es **abono de nómina** si su sentido es `abono` y su descripción, sin tildes y en minúsculas, contiene una palabra de `PALABRAS_NOMINA` (`nomina`, `salario`, `sueldo`) como palabra completa.
- El **pagador** de ese movimiento es su descripción sin esa palabra (y sin palabras como «pago» o «de» al inicio): «Nómina Industrias Imaginarias» → «Industrias Imaginarias».
- El **promedio mensual** es la suma de todos los abonos de nómina de los extractos extraídos, dividida entre el **número de extractos**, redondeada hacia abajo (`promediarHaciaAbajo`, nombrada y probada). Un extracto sin abonos de nómina cuenta con 0: baja el promedio.
- Un extracto cuyo periodo supera `MAX_DIAS_PERIODO_EXTRACTO` (31 días) no se puede tratar como un mes: es la inconsistencia `periodo_no_mensual` (R4).
- Si hay extractos y ninguno trae abonos de nómina, el origen (b) vale 0 y el ingreso verificado, por ser el menor, es 0: **no hay ingreso verificado** y se piden documentos (R5).

**Motivo**: el redondeo hacia abajo y el contar extractos vacíos son conservadores (Principio V): nunca inflan el ingreso. Detectar la nómina por palabra clave es determinista y se puede probar; el modelo no decide qué es nómina. Un extracto por mes es la forma de los documentos de prueba y del enunciado.

**Alternativas descartadas**:
- Promediar solo los meses con abonos: un solicitante con un solo mes de nómina entre tres extractos aparecería con el ingreso completo.
- Redondear al más cercano: puede subir el ingreso un peso; no cambia la decisión en la práctica, pero rompe la regla de no inflar.
- Pedirle al subagente que marque cada abono como nómina: pone la clasificación en el modelo y obliga a validarla.

**Riesgo conocido**: una descripción que no use ninguna de las palabras («Pago quincena empresa») no se reconoce como nómina y baja el ingreso. Escala o pide documentos, nunca aprueba de más. Se amplía la lista en `politica.ts` si hace falta.

## R4. Comprobaciones de consistencia

**Decisión**: `validarConsistencia` recibe el nombre del solicitante verificado y los registros `extraido`, y devuelve una lista de inconsistencias. Cada una lleva la regla, si **detiene** o solo se **reporta** (FR-010), si es **corregible** (FR-011) y los valores comparados con su procedencia (FR-009).

| Regla | Qué compara | Detiene | Corregible |
|-------|-------------|:-------:|:----------:|
| `titular_vs_solicitante` | titular de cada extracto frente al nombre del solicitante verificado | sí | sí |
| `empleador_vs_pagador` | empleador del certificado frente al pagador de cada abono de nómina | sí | sí |
| `periodos_superpuestos` | periodos de dos extractos distintos que se pisan | sí (afecta el ingreso) | no |
| `periodo_no_mensual` | un extracto con un periodo de más de 31 días | sí (afecta el ingreso) | sí |
| `huecos_entre_periodos` | meses sin extracto entre dos extractos | no, se reporta | no |

- **Nombres**: se comparan como conjuntos de palabras, sin tildes, mayúsculas ni puntuación y sin importar el orden. «Pérez Ficticia, Ana» es igual a «Ana Pérez Ficticia». Una palabra de más o de menos **no** es igual: el segundo apellido que falta es una diferencia, no una suposición de que son la misma persona (Principio V).
- **Empleador y pagador**: se quitan los sufijos societarios (`SUFIJOS_SOCIETARIOS`: S.A.S., S.A., Ltda., etc.) y las palabras vacías («de», «del», «la», «y»). Coinciden si el pagador es igual al empleador o es un **prefijo** de sus palabras, con al menos dos palabras: «Industrias Imaginarias» coincide con «Industrias Imaginarias del Valle S.A.S.». Un pagador de una sola palabra solo coincide si el empleador también es de una.
- Solo existen las comprobaciones cuyos documentos están. Sin certificado no hay `empleador_vs_pagador`; sin extractos tampoco. La lista de lo que no se pudo contrastar va en el resultado (FR-004).

**Motivo**: los dos primeros son los que pide el issue y los que detienen (aclaración Q4). La superposición y el periodo no mensual afectan el promedio, así que por la regla de la aclaración («salvo que afecte identidad o ingreso») también detienen. Los huecos no cambian el promedio por extracto, solo se reportan.

**Alternativas descartadas**:
- Igualdad exacta de cadenas: «S.A.S.» o la ausencia de «del Valle» escalarían casos legítimos.
- Distancia de edición o similitud difusa: no es explicable ni reproducible en un borde, y puede juntar a dos personas distintas.
- Agregar un campo «pagador» al esquema del extracto (#10): cambia el contrato de extracción, reabre las pruebas del #10 y le pide al modelo un dato más que validar. La descripción ya está validada con procedencia.

## R5. Estados del resultado y qué hace cada uno

**Decisión**: `VerificacionIngreso` tiene un solo `estado`, evaluado en este orden de prioridad (dentro de la Regla 3, y después de la Regla 5):

1. `no_cubierto`: algún documento de la conversación está `no_cubierto` (Regla 5). No se calcula nada; el caso ya escaló en el #10.
2. `inconsistencia`: hay una inconsistencia que detiene. El ingreso no es confiable. **Escala.**
3. `sin_ingreso`: no hay ingreso verificado (sin documentos de ingreso, o ingreso 0). Se piden documentos. No escala.
4. `falta_declarado`: hay ingreso verificado pero el solicitante no declaró el suyo (aclaración Q2 del #11). Se pide el dato. No escala.
5. `discrepancia`: la diferencia supera el 10%. **Escala.**
6. `verificado`: ingreso verificado y sin discrepancia.

**Motivo**: una inconsistencia se evalúa antes que el ingreso porque lo invalida; pedir el dato declarado va antes de la discrepancia porque sin él no hay comparación. El orden respeta 4 → 5 → 1 → 3: la Regla 5 prevalece sobre la 3 (US4, escenario 3).

**Alternativas descartadas**:
- Varios estados a la vez (por ejemplo, discrepancia e inconsistencia): el analista recibe igualmente la lista completa de inconsistencias y la discrepancia calculada; el estado es solo la decisión.
- Tratar `sin_ingreso` como escalamiento inmediato: pedir el documento primero es más barato; escalar por no darlo es del #15.

## R6. Reextracción de una inconsistencia corregible

**Decisión**:
- Tras registrar un documento `extraido`, el adaptador pide al core la verificación. Si hay inconsistencias `corregible` que lo involucran, **reextrae** ese documento y los demás involucrados, una sola ronda por `(adjunto, regla)` y de hasta 3 intentos (`MAX_INTENTOS_EXTRACCION`). Un documento entregado varias veces no multiplica las rondas.
- Al subagente se le pasa un error con el campo, el motivo `inconsistencia_entre_documentos` y un detalle con **la regla y el valor que él extrajo** («Regla titular_vs_solicitante: el titular del extracto debe ser el solicitante verificado. Valor extraído: …. Vuelve a leer el documento y copia el titular tal como aparece»). **No se le dice el valor esperado.**
- El core acepta el reemplazo solo si `registrar_extraccion` trae `reextraccion: { regla }` y el core **recalcula** que esa inconsistencia corregible existe hoy para ese documento y que no hubo ya una reextracción de esa regla (defensa en profundidad, Principio IV). Un reemplazo conserva `reextraidaPor` en el registro.
- Si tras la ronda la inconsistencia sigue, queda registrada como real y se aplica FR-010. Una inconsistencia no corregible (`periodos_superpuestos`) no se reintenta.

**Motivo**: es el criterio de aceptación del issue, y distingue un error de lectura de una contradicción real. No darle el valor esperado al subagente evita que lo copie en lugar de leer (la procedencia lo atraparía, pero el costo es un intento más). Limitar a una ronda y exigir la inconsistencia vigente en el core evita que un extractor reintente hasta que «cuadre».

**Alternativas descartadas**:
- Validar la consistencia antes de registrar el documento nuevo (modo de prueba sin efecto): el agente necesitaría el nombre del solicitante, que hoy no sale del core, y el resultado dependería del orden en que llegan los documentos.
- Dejar reemplazar libremente un registro: abre la puerta a reextraer hasta que el resultado convenga.
- Reintentar en un bucle hasta que desaparezca la inconsistencia: sin tope no es acotado (Principio VI).
- Decirle al subagente el valor esperado: ver arriba.

## R7. Escalamiento y orden de reglas

**Decisión**: dos motivos nuevos de `SenalEscalamiento`, ambos de la **Regla 3**: `discrepancia_de_ingreso` e `inconsistencia_documental`. `ORDEN_REGLA` incluye la Regla 3 y `prevalece` usa el orden completo de la constitución `[4, 5, 1, 3, 2]`, de modo que una señal de la Regla 4, 5 o 1 reemplaza a una de la 3, y una de la 3 a una de la 2 (del #14). El evento `escalamiento` lleva en `valores` el ingreso declarado, el verificado y el umbral (enteros), no la lista de inconsistencias.

**Motivo**: el orden de evaluación es obligatorio (Principio I) y el #14 y el #15 reutilizan el mismo mecanismo. Los valores son los de la decisión y no contienen datos personales ni el contenido de los documentos.

**Alternativas descartadas**:
- Reutilizar `caso_no_cubierto` (Regla 5): una discrepancia no es un caso fuera de política y el analista necesita el motivo exacto.
- Un único motivo `ingreso`: pierde la diferencia entre una contradicción documental y una declaración que no cuadra.

## R8. Herramientas nuevas y quién las llama

**Decisión**:
- **Core (MCP)**: `verificar_ingreso` (efecto: calcula con los registros guardados, guarda la verificación y la auditoría; recibe el ingreso declarado opcional, que guarda) y `consultar_verificacion_ingreso` (solo lectura, para el #13 y el #14). El core exige identidad verificada y es el único que calcula el ingreso: el agente nunca le pasa un ingreso verificado.
- **Adaptador del agente**: `verificar_ingreso({ ingresoDeclarado? })`, que entra en `HERRAMIENTAS_CON_IDENTIDAD`. Además, el adaptador verifica por código después de cada extracción nueva, para que una inconsistencia que detiene escale sin depender de que el modelo llame a la herramienta. En ese camino interno no se pide el ingreso declarado ni documentos: solo se aplica un `inconsistencia` o una reextracción.
- **Modelo**: llama a `verificar_ingreso` cuando el solicitante dice cuánto gana o ya entregó documentos de ingreso, con el entero que él declaró. Nunca calcula, compara ni da por verificado un ingreso por su cuenta.

**Motivo**: Principio IV (actuar solo por herramientas MCP) y III (decisión en código). La verificación interna evita que una contradicción pase solo porque el modelo no preguntó.

**Alternativas descartadas**:
- Que el agente calcule el ingreso y se lo pase al core: el core tendría que confiar en un valor que no calculó.
- Verificar solo cuando el modelo llame a la herramienta: una conversación sin esa llamada seguiría sin revisar la consistencia.
- Verificar el ingreso declarado dentro de `registrar_extraccion`: mezcla dos efectos y vuelve el registro dependiente de un dato que no es del documento.

## R9. Auditoría, logs e idempotencia

**Decisión**:
- Cada verificación que **cambia** el resultado guardado deja un `auditoria_ingreso` en el servidor, con `correlationId`, la regla (Regla 3, o Regla 5 si fue `no_cubierto`), el estado, los valores usados (ingresos y diferencia, enteros; nunca fragmentos ni contenido), la versión de la política y la marca de tiempo. Repetir la verificación con los mismos datos devuelve el mismo resultado y **no** audita otra vez.
- Una reextracción deja `auditoria_extraccion` con `reextraccion` y la regla.
- Los logs del agente (`verificacion_ingreso`) llevan estado, número de inconsistencias y sus reglas, sin valores de documentos.

**Motivo**: Principio VI y `.claude/rules/servidor-mcp.md`. La idempotencia del cálculo sale de que es una función pura de los registros y del declarado; no hace falta una clave aparte.

## R10. Documentos de prueba y casos de demo

**Decisión**: casos nuevos en `casos/`. Cada caso lleva sus propios documentos, porque el chat rechaza un adjunto fuera de la carpeta del caso ([src/chat/casos.ts](../../src/chat/casos.ts)); los del #10 se copian, no se enlazan:
- `ingreso-consistente`: certificado completo y tres extractos del #10. Ingreso verificado 3.800.000, declarado 3.800.000.
- `ingreso-inflado`: los mismos, con un ingreso declarado de 4.300.000 (13,2%).
- `ingreso-titular-distinto`: un extracto de otro titular ficticio.
- `ingreso-empleador-distinto`: extractos cuyo abono de nómina lo paga otro empleador ficticio.
- `ingreso-moneda-extranjera`: certificado con salario en dólares.

Los documentos nuevos siguen `docs/datos-ficticios.md`. El borde del 10% se cubre en pruebas unitarias, no en la demo: es un cálculo, no una conversación.

**Motivo**: FR-019 y los casos de prueba 3 y 6 del enunciado. Una prueba compara los documentos copiados con los del #10 para que no se desvíen.

## Hallazgos de la validación con el modelo real (2026-10-18)

Escenarios 2 a 6 de [quickstart.md](quickstart.md) con `ANTHROPIC_API_KEY`, `npm run chat -- --demo --caso …`. Los escenarios 3 a 6 corrieron a la vez, así que sus tiempos son una cota superior.

| Escenario | Caso | Resultado | Tiempo |
|-----------|------|-----------|--------|
| 2 | `ingreso-consistente` | Verificado: 3.800.000 de ambos orígenes, con declarado 3.800.000; sin escalamiento | 99 s |
| 3 | `ingreso-inflado` | `discrepancia_de_ingreso` (Regla 3) con declarado 4.300.000, verificado 3.800.000 y umbral 10 | 110 s |
| 4 | `ingreso-titular-distinto` | Una ronda de reextracción del extracto; persiste y escala con `inconsistencia_documental`, regla `titular_vs_solicitante` | 59 s |
| 5 | `ingreso-empleador-distinto` | Reextrae el certificado y los extractos involucrados; persiste y escala con `empleador_vs_pagador` | 69 s |
| 6 | `ingreso-moneda-extranjera` | `caso_no_cubierto`, causa `moneda_extranjera`, Regla 5; `verificar_ingreso` no llega a correr | 30 s |

- El escalamiento por inconsistencia no muestra al solicitante ningún nombre ni valor de documento: solo el aviso genérico y los nombres de las reglas.
- Ninguna ronda de reextracción se acercó al límite de 120 s de la conversación (el caso más largo fue el 3, de 8 pasos sin reextracción), así que el límite no cambia.
- Los escenarios 7 (sin declarado) y 8 (reextracción que corrige) se cubren con pruebas: el 7 se vio de paso en los escenarios 2 y 3, donde el modelo pidió el ingreso declarado tras cada documento antes de que el solicitante lo dijera.
