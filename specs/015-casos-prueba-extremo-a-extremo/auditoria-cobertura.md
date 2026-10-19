# Auditoría de cobertura de la lógica determinista

**Feature**: [spec.md](spec.md), HU4 · FR-012 · SC-004 · SC-005 · **Fecha**: 2026-10-19

Se revisaron las pruebas que ya existían de tickets anteriores contra lo que pide la HU4: cada pieza determinista y cada borde tienen pruebas que no llaman al modelo. Resultado: **no falta ninguna prueba**; por eso T033 no agrega pruebas nuevas. Lo que sí se agrega es la comprobación de que corren sin credenciales ([src/e2e/sin-credenciales.test.ts](../../src/e2e/sin-credenciales.test.ts)).

## 1. Las cuatro piezas

| Pieza | Pruebas existentes | Estado |
|-------|--------------------|--------|
| Bloqueo por hook | [control-identidad.test.ts](../../src/agente/control-identidad.test.ts): «sin identidad verificada bloquea y emite el bloqueo de la Regla 1», «con los reintentos agotados bloquea, emite el bloqueo y escala», «una respuesta fuera de contrato bloquea sin reintentar ni escalar». [control-preaprobacion.test.ts](../../src/agente/control-preaprobacion.test.ts): «bloquea un monto de 5.000.001 con la señal de la Regla 2 y el código monto_sobre_tope», «un bloqueo emite bloqueo_por_regla con la Regla 2, y no emite preaprobacion» | Cubierta |
| Cálculo de la cuota | [cuota.test.ts](../../src/politica/cuota.test.ts): «valor de referencia del issue: 4.000.000 a 24 meses da 206.723», «redondea al peso entero más cercano», «el 30% exacto se calcula sin error de flotante», «la tasa es el 1,8% mensual y es exactamente el número 0,018» | Cubierta |
| Consistencia entre documentos | [consistencia.test.ts](../../src/politica/consistencia.test.ts): titular, pagador, periodos no mensuales y superpuestos. [ingreso.test.ts](../../src/politica/ingreso.test.ts): «la prioridad completa: no_cubierto > inconsistencia > sin_ingreso > falta_declarado > discrepancia > verificado» | Cubierta |
| Contrato de errores | [errores.test.ts](../../src/compartido/errores.test.ts): «solo un error transitorio es reintentable», «transitorioAgotado es transitorio pero ya no reintentable», «un fallo va en structuredContent con isError» | Cubierta |
| Rechazo del lado del servidor (Principio IV) | [core-simulado.test.ts](../../src/mcp/core-simulado.test.ts): «sin identidad verificada rechaza el registro con un error de negocio (Regla 1)», «sin identidad verificada se bloquea con identidad_no_verificada y la auditoría lo registra» | Cubierta |

## 2. Los bordes exactos

| Borde | Lado | Prueba existente | Estado |
|-------|------|------------------|--------|
| Monto de $5.000.000 | en el borde | [preaprobacion.test.ts](../../src/politica/preaprobacion.test.ts): «5.000.000 exactos se preaprueban» · [core-simulado.test.ts](../../src/mcp/core-simulado.test.ts): «el monto límite de 5.000.000 se preaprueba» · [control-preaprobacion.test.ts](../../src/agente/control-preaprobacion.test.ts): «deja pasar el monto límite de 5.000.000…» | Cubierto |
| | por debajo | «4.999.999 se preaprueba» | Cubierto |
| | por encima | «5.000.001 se bloquea con monto_sobre_tope» (política, core y hook) | Cubierto |
| Cuota del 30% del ingreso | en el borde | «con la cuota exactamente al 30% del ingreso se preaprueba» (política) · «deja pasar la cuota exactamente al 30% del ingreso verificado» (hook) | Cubierto |
| | por encima | «con un peso menos de ingreso (la cuota pasa del 30%) se bloquea con cuota_sobre_porcentaje» (política) · «bloquea la cuota un peso de ingreso por encima del 30%…» (hook) | Cubierto |
| | por debajo | «con un peso más de ingreso se preaprueba» | Cubierto |
| | redondeo | «una relación de 30,004% que la relación del #12 redondea a 30,00% se bloquea» | Cubierto |
| Diferencia de ingreso del 10% | en el borde | [ingreso.test.ts](../../src/politica/ingreso.test.ts): «exactamente el 10% por encima o por debajo no es discrepancia», «con exactamente el 10%: verificado» · core: «un declarado que supera el 10% guarda discrepancia; uno en el borde vuelve a verificado» | Cubierto |
| | por encima | «un peso más allá del 10% sí es discrepancia, en ambos sentidos», «con un peso más del 10%: discrepancia» | Cubierto |
| | por debajo | «un peso dentro del 10% no es discrepancia» | Cubierto |

## 3. La parte de cada caso que depende solo de código

| Caso | Lo que decide el código | Prueba que no llama al modelo |
|------|--------------------------|-------------------------------|
| 1 · ejemplo consistente | ingreso verificado y preaprobación con monto y cuota dentro de la política | [ingreso.test.ts](../../src/politica/ingreso.test.ts), [preaprobacion.test.ts](../../src/politica/preaprobacion.test.ts) y el caso 1 en [obligatorios.test.ts](../../src/e2e/obligatorios.test.ts) |
| 2 · certificado sin salario | el salario nulo se conserva y se pide el dato; no se completa | [extraccion.test.ts](../../src/compartido/extraccion.test.ts), [ingreso.test.ts](../../src/politica/ingreso.test.ts) («un salario nulo se ignora…») y el caso 2 |
| 3 · discrepancia de ingreso | la diferencia de más del 10% escala | «con una diferencia que supera el 10%: discrepancia…» y el caso 3 |
| 4 · $8.000.000 | el monto sobre el tope bloquea la preaprobación y escala | «5.000.001 se bloquea con monto_sobre_tope» (política, core y hook) y el caso 4 |
| 5 · preaprobar sin identidad | el hook y el core rechazan antes de producir efecto | [control-identidad.test.ts](../../src/agente/control-identidad.test.ts), core, y el caso 5 |
| 6 · moneda extranjera | la moneda extranjera se detecta por código y escala | [documentos.test.ts](../../src/politica/documentos.test.ts) («si menciona COP y una moneda extranjera, prevalece la extranjera») y el caso 6 |
| 7 · falla transitoria | tres intentos con esperas de 500 y 1000 ms y escalamiento al agotarlos | [reintentos.test.ts](../../src/agente/reintentos.test.ts) («un transitorio persistente: exactamente 3 intentos…») y el caso 7 |

Lo que **solo** se verifica con el modelo real, y por eso queda para `npm run casos -- --modelo-real` y la revisión manual del PR: que el modelo llame a las herramientas correctas, en el orden correcto, a partir de la conversación.

## 4. Escenarios que lista la constitución

La constitución pide escenarios de extremo a extremo para: caso preaprobable, monto alto, cuota alta, ingreso inconsistente, identidad no verificada, petición de humano, moneda extranjera, documento no soportado y datos faltantes.

| Escenario de la constitución | Caso o prueba que lo cubre |
|------------------------------|----------------------------|
| Preaprobable | caso 1 |
| Monto alto | caso 4 |
| Ingreso inconsistente | caso 3 (discrepancia de ingreso); documentos inconsistentes en `casos/ingreso-empleador-distinto` y `casos/ingreso-titular-distinto` (#11) |
| Identidad no verificada | caso 5; `casos/identidad-no-verificable` (#9) |
| Moneda extranjera | caso 6 |
| Datos faltantes | caso 2 |
| Cuota alta | `casos/preaprobacion-cuota-alta` (#14); no está entre los siete del #17 |
| Petición de humano | `casos/escalamiento-pide-persona` (#15); no está entre los siete del #17 |
| Documento no soportado | prueba del adaptador y del chat (#10); no está entre los siete del #17 |

Los tres últimos se cubren con casos y pruebas de tickets anteriores, que `npm test` ejecuta; este ticket no los repite entre los siete obligatorios.
