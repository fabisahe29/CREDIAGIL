# Research: Simulación de cuota y capacidad de pago

**Feature**: [spec.md](spec.md) · **Plan**: [plan.md](plan.md) · **Fecha**: 2026-10-18

Hechos verificados en el repositorio (rama `12-simulacion-de-cuota-y-capacidad-de-pago`, sobre `921a23e`), seguidos de las decisiones R1–R9. No hay dependencias nuevas, así que no se investigó el SDK de nuevo: se reutilizan las versiones del #11.

## Hechos de partida

- [src/politica/politica.ts](../../src/politica/politica.ts) es la única fuente de umbrales. Su cabecera ya anuncia que «los de monto y cuota y la tasa llegan con el #12 y el #14». Hoy no define la tasa.
- [src/agente/agente.ts](../../src/agente/agente.ts) dice al modelo «no apruebas, no rechazas ni estimas cuotas» (línea 46). Esa frase choca con esta feature y se cambia (R8).
- Todas las herramientas del core exigen `correlationId` UUID, validan con `z.looseObject` anunciado y `ENTRADAS` estrictas, y devuelven el contrato `Respuesta` con errores tipados ([src/mcp/servidor.ts](../../src/mcp/servidor.ts), [src/compartido/errores.ts](../../src/compartido/errores.ts)).
- `errorValidacion` crea siempre `categoria: "validacion"`, `reintentable: false` y exige `campo`. Eso cubre «error de validación no reintentable con el motivo» sin tipos nuevos.
- El core guarda la verificación de ingreso por `correlationId` y la expone con `consultarVerificacionIngreso`. Un `VerificacionIngreso` trae `estado` y `ingreso: { monto, origen } | null`; ese `origen` es de qué documento salió (certificado o extractos), no si el ingreso es declarado o verificado ([src/compartido/ingreso.ts](../../src/compartido/ingreso.ts)).
- El control de identidad del #9 solo bloquea las herramientas de `HERRAMIENTAS_CON_IDENTIDAD`; una herramienta fuera de la lista pasa. Una conversación ya escalada bloquea todas ([src/agente/control-identidad.ts](../../src/agente/control-identidad.ts)).
- Cálculo exacto del valor de referencia: `4.000.000 · 0,018 / (1 − 1,018^−24) = 206.723,34`. Al peso más cercano da 206.723, que es el valor del issue; hacia arriba daría 206.724.

## R1: dónde vive la tasa y cómo se escribe

**Decisión**: `politica.ts` define `TASA_MENSUAL_PUNTOS_BASE = 180` y `TASA_MENSUAL = TASA_MENSUAL_PUNTOS_BASE / 10_000`. La versión de la política sube.

**Motivo**: la constitución fija una sola fuente. En puntos base la tasa es un entero legible (180 = 1,8%) y se puede mostrar al solicitante sin ruido de flotante (`0,018 × 100` da `1,7999999999999998`). `180 / 10_000` da exactamente el mismo número que el literal `0.018`, y una prueba lo fija.

**Alternativas descartadas**:
- **`TASA_MENSUAL = 0.018` y calcular el porcentaje al mostrarlo**: obliga a redondear para mostrar 1,8.
- **La tasa en el módulo del cálculo** (`cuota.ts`): parte la fuente única en dos archivos y la regla de la zona lo prohíbe.

## R2: aritmética, redondeo y proporción

**Decisión**:
- `calcularCuota(monto, plazoMeses)` aplica `P · i / (1 − (1 + i)^−n)` con `Math.pow` y devuelve el entero de `redondearAlPesoMasCercano`.
- `redondearAlPesoMasCercano(x)` redondea la mitad hacia arriba (`206.723,5 → 206.724`) y es una función nombrada con sus pruebas de borde (FR-012).
- Si el resultado no es finito o no es un entero seguro, la función lanza un error propio y el core lo convierte en un error de validación sobre `monto`.
- `calcularRelacionCuotaIngreso(cuota, ingreso)` devuelve el porcentaje con dos decimales usando `BigInt`: `round(cuota · 10.000 / ingreso) / 100`, con la mitad hacia arriba.

**Motivo**: el redondeo al más cercano es la respuesta de la aclaración Q1 y es el que reproduce 206.723. La fórmula con flotantes es inevitable (potencia fraccionaria), pero su resultado entra a un único redondeo definido y probado, como pide el Principio III. La proporción sí puede evitar los flotantes: con enteros queda exacta, y el #14 compara el 30% con la misma aritmética (`cuota · 100 ≤ 30 · ingreso`).

**Alternativas descartadas**:
- **Aritmética decimal exacta con una librería**: agrega una dependencia para un solo cálculo (YAGNI).
- **Proporción en flotante (`cuota / ingreso * 100`)**: error de redondeo en los bordes, justo lo que el Principio III prohíbe para umbrales.
- **Devolver la proporción como fracción 0–1**: el solicitante piensa en porcentaje y el 30% de la política se expresa así.

## R3: quién decide si el ingreso es declarado o verificado

**Decisión**: la entrada lleva solo `ingresoMensual`. El core consulta su verificación de la conversación: si el estado es `verificado` y `ingreso.monto` es igual al `ingresoMensual` recibido, la `fuenteIngreso` es `verificado`; en cualquier otro caso es `declarado`.

**Motivo**: la Regla 3 dice que el ingreso verificado sale de los documentos, nunca de lo que dice el solicitante. Si el modelo marcara la fuente, un error suyo presentaría una cifra dicha como verificada. Si el modelo envía la cifra verificada que ya conoce, el core la reconoce; si envía otra, se rotula `declarado`, que es lo conservador. El aviso del resultado sale de esa fuente (FR-014).

**Alternativas descartadas**:
- **Un parámetro `fuente` que envía el modelo**: pone la clasificación en el modelo (Principio III).
- **Ignorar el ingreso recibido y usar siempre el verificado si existe**: contradice el issue («para un monto, un plazo y un ingreso») y impide simular un escenario hipotético.
- **Exigir identidad para obtener la fuente `verificado`**: la herramienta debe poder usarse sin identidad (FR-006); sin verificación guardada la fuente es `declarado` y no hace falta.

## R4: por el core y no dentro del adaptador

**Decisión**: la herramienta existe en el servidor del core, con su método en `Core`, su llamada en `ClienteCore` y su exposición en el adaptador, igual que `verificar_ingreso`.

**Motivo**: el Principio IV pide que el agente actúe solo por herramientas del servidor MCP. El #14 va a recalcular la cuota en el core para rechazar una preaprobación fuera de política; ambos usan la misma función de `src/politica/`. Así la cifra que ve el solicitante al simular es la misma que el core usa al decidir.

**Alternativas descartadas**:
- **Calcular en el adaptador**: dos caminos de cálculo y una herramienta que no pasa por el contrato tipado del core.
- **Solo el servidor MCP, sin pasar por el adaptador**: el modelo del agente solo ve las herramientas del adaptador.

## R5: contrato único de entrada, salida y descripción

**Decisión**: `src/compartido/capacidad-pago.ts` define:
- `esquemaEntradaCapacidadPago` y `esquemaSimulacionCapacidadPago` con Zod;
- `DESCRIPCION_CAPACIDAD_PAGO`, el texto que lee el modelo;
- los avisos por fuente de ingreso.

El servidor, el cliente y el adaptador lo importan.

**Motivo**: el texto que distingue simular de preaprobar es lo único que el modelo lee para elegir (FR-007). Escribirlo una vez evita que el servidor y el adaptador se desfasen, y una prueba fija las tres frases que debe tener.

**Alternativas descartadas**:
- **Dos descripciones, una en `servidor.ts` y otra en `adaptador.ts`** (el patrón de las herramientas anteriores): podrían divergir y una de ellas llegaría al modelo sin las advertencias.

## R6: sin identidad, sin entrada en la lista del control

**Decisión**: `calcular_capacidad_pago` no se agrega a `HERRAMIENTAS_CON_IDENTIDAD`. Una prueba del control de identidad verifica que no se bloquea sin identidad. El core tampoco la exige.

**Motivo**: FR-006 pide poder simular antes de identificarse. La Regla 1 protege el registro de la solicitud; simular no registra nada.

**Alternativas descartadas**:
- **Exigir identidad por prudencia**: contradice el criterio de aceptación y añade fricción a una consulta sin efectos.

## R7: cómo se redacta la descripción

**Decisión**: la descripción dice, en este orden: que solo simula; que no registra, reserva ni compromete nada; que no reemplaza a `preaprobar_credito`; cuándo se usa cada una; y que el resultado no es una decisión. No nombra el 30% ni el tope de monto.

**Motivo**: nombrar el umbral invita al modelo a concluir «sí califica» a partir de la proporción, que es la confusión que el issue quiere evitar (FR-009). `preaprobar_credito` se cita por nombre porque así lo pide el criterio; hasta el #14 no existe y el texto no manda al modelo a llamarla.

**Alternativas descartadas**:
- **Citar el 30% para explicar la diferencia**: el modelo lo usaría para decidir.
- **Omitir `preaprobar_credito` hasta el #14**: incumple el criterio de aceptación.

## R8: cambio del prompt

**Decisión**: la frase «no estimas cuotas» pasa a: «No calculas cuotas por tu cuenta: si te preguntan cuánto pagarían al mes, llama a calcular_capacidad_pago con el monto, el plazo y el ingreso, y di que es una simulación no vinculante». Se agregan dos instrucciones: usarla solo con los tres datos dichos por el solicitante (si falta alguno, se pide) y no afirmar nunca que la simulación equivale a una preaprobación.

**Motivo**: sin el cambio, el prompt contradice la herramienta y el modelo se negaría a simular. Las instrucciones nuevas son el refuerzo del texto de la herramienta.

**Alternativas descartadas**:
- **Dejar el prompt como está**: una instrucción en contra de la herramienta que el propio agente tiene.

## R9: pruebas

**Decisión**: unas 40 pruebas con `node --test`:
- **Política**: valor de referencia (4.000.000 a 24 meses → 206.723), plazo 1 (cuota ≈ monto · 1,018), plazo muy largo, monto 1, la mitad hacia arriba, no finito y fuera de rango seguro, proporción con bordes de .5 y por encima del 100%, y la igualdad `TASA_MENSUAL === 0.018`.
- **Contrato compartido**: la descripción contiene las tres frases y no contiene «30» ni «5.000.000»; la salida cumple su esquema y trae `vinculante: false`.
- **Core**: sin efectos (las consultas de solicitudes, identidad, extracciones y verificación antes y después son iguales), sin identidad, fuente `declarado` y `verificado`, una cifra distinta a la verificada es `declarado`, entradas inválidas con su campo, y falla simulada.
- **Servidor MCP**: la herramienta anunciada es de solo lectura; el rechazo de cada entrada inválida llega con `campo`; el log lleva `fuenteIngreso` y no lleva los montos de documentos.
- **Adaptador y control de identidad**: la herramienta se expone, funciona sin identidad, y una pregunta de cuota no deja ninguna señal de escalamiento.
- **Agente**: el prompt ya no contiene «estimas cuotas» y nombra la herramienta.

**Motivo**: la constitución pide los bordes exactos y el rechazo del lado del servidor; la ausencia de efectos es el riesgo central de la feature.
