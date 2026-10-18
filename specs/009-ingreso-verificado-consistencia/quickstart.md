# Quickstart: validar el ingreso verificado y la consistencia

**Feature**: [spec.md](spec.md) · **Contratos**: [politica.md](contracts/politica.md), [core-mcp.md](contracts/core-mcp.md), [agente.md](contracts/agente.md) · **Datos**: [data-model.md](data-model.md#documentos-de-prueba-y-casos)

## Requisitos previos

- Node ≥ 22.18 y `npm install` hecho.
- Para los Escenarios 2 a 7: `ANTHROPIC_API_KEY` definida en la sesión de la terminal. Nunca en un archivo versionado.
- Ana Pérez Ficticia (documento `0001234567`, expedición `2012-05-14`) es la solicitante de todos los casos `ingreso-*`; sus datos están en `src/mcp/datos-ejemplo.ts`.

## Escenario 1: pruebas sin red ni modelo (FR-018 · SC-001 a SC-005, SC-008)

```text
npm test
npm run typecheck
npm run format:check
```

Esperado: todo en verde, sin `ANTHROPIC_API_KEY`. Cubre:
- **política de ingreso**: el ingreso verificado es el menor de salario y promedio de nómina; un extracto sin nómina cuenta en el divisor; el promedio baja al entero; variar solo el ingreso declarado no cambia el verificado.
- **borde del 10%** con verificado 3.800.000: 4.180.000 y 3.420.000 no escalan; 4.180.001 y 3.419.999 sí escalan.
- **consistencia**: nombres con otro orden y con tildes; apellido de menos; empleador con y sin «del Valle S.A.S.»; periodos de 31 y 32 días; extractos que se tocan; huecos entre meses; titular nulo.
- **core**: `verificar_ingreso` sin identidad se rechaza; es idempotente y audita una vez; no acepta un ingreso verificado de entrada; rechaza un declarado negativo o con decimales. `registrar_extraccion` con `reextraccion` reemplaza una sola vez y solo ante una inconsistencia corregible vigente.
- **servidor MCP**: esquemas de las dos herramientas nuevas; los logs y la auditoría no llevan contenido, fragmentos ni valores de documentos.
- **adaptador**: cada estado produce su efecto (evento o señal); una inconsistencia que detiene escala sin llamar a `verificar_ingreso`; el subagente falso reextrae con la regla y sin el valor esperado, y la inconsistencia desaparece o persiste; la Regla 5 prevalece sobre la Regla 3; la Regla 4 sobre ambas.
- **control de identidad**: `verificar_ingreso` sin identidad se bloquea con `bloqueo_por_regla`.
- **datos**: los documentos de los casos `ingreso-*` existen, cumplen la convención de datos ficticios y los copiados del #10 coinciden con los originales.

## Escenario 2: caso consistente (US1 · SC-001, SC-007)

```text
npm run chat -- --demo --caso casos/ingreso-consistente
```

Esperado:
- se verifica a Ana y se extraen los cuatro documentos;
- el modo de demostración muestra `verificar_ingreso` y no aparece ningún escalamiento;
- el ingreso verificado es 3.800.000, de los dos orígenes (`ambos`), con declarado 3.800.000.

## Escenario 3: ingreso declarado inflado (US2 · SC-002, SC-007, caso de prueba 3)

```text
npm run chat -- --demo --caso casos/ingreso-inflado
```

Esperado: declara 4.300.000 (13,2% sobre el verificado) → escalamiento con `discrepancia_de_ingreso`, Regla 3, con `ingresoDeclarado`, `ingresoVerificado` y `umbralPorcentaje` en el evento. Ninguna herramienta corre después.

## Escenario 4: titular distinto (US3 · SC-003)

```text
npm run chat -- --demo --caso casos/ingreso-titular-distinto
```

Esperado: el extracto de otra persona produce la inconsistencia `titular_vs_solicitante`. Primero hay una reextracción (visible en el modo de demostración); como el titular real es otro, persiste y escala con `inconsistencia_documental`. La respuesta no revela el nombre con el que se contrastó.

## Escenario 5: empleador distinto del pagador (US3 · SC-003)

```text
npm run chat -- --demo --caso casos/ingreso-empleador-distinto
```

Esperado: `empleador_vs_pagador` persiste tras la reextracción de los documentos involucrados y escala con `inconsistencia_documental`.

## Escenario 6: moneda extranjera (US4 · SC-004, caso de prueba 6)

```text
npm run chat -- --demo --caso casos/ingreso-moneda-extranjera
```

Esperado: escalamiento por la Regla 5 (`caso_no_cubierto`, causa `moneda_extranjera`) desde el #10. No se calcula ningún ingreso verificado y `verificar_ingreso` no llega a ejecutarse.

## Escenario 7: sin ingreso declarado (US1 · FR-007)

En el chat interactivo, con la solicitante verificada y el certificado extraído, pedir «verifica mi ingreso» sin decir cuánto gana.

```text
npm run chat -- --demo
```

Esperado: evento `solicitud_de_dato` que pide el ingreso mensual declarado; no hay escalamiento ni preaprobación. Al decir «gano 3.800.000 al mes» responde con el ingreso verificado.

## Escenario 8: reextracción que corrige (US5 · SC-003)

Se cubre con el subagente falso en las pruebas del Escenario 1: el primer intento lee mal el titular, el segundo lo lee bien, y el resultado queda sin inconsistencia con su procedencia verificada. Con el modelo real, el titular de los documentos de prueba se lee bien al primer intento, así que no hay reextracción que mostrar; el Escenario 4 muestra la que persiste.

## Escenario 9: datos ficticios y guardián (FR-019)

Tras crear los documentos de los casos, comprobar que el guardián del repositorio los acepta (`npm test` ejecuta la comprobación de convención) y que no hay datos con forma real.
