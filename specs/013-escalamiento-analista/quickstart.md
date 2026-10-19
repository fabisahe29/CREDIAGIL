# Quickstart: validar el escalamiento con criterio y el handoff al analista

**Feature**: [spec.md](spec.md) · **Contratos**: [politica.md](contracts/politica.md), [core-mcp.md](contracts/core-mcp.md), [agente.md](contracts/agente.md) · **Datos**: [data-model.md](data-model.md)

## Requisitos previos

- Node ≥ 22.18 y `npm install` hecho.
- Para los Escenarios 2 a 7: `ANTHROPIC_API_KEY` definida en la sesión de la terminal. Nunca en un archivo versionado.
- Ana Pérez Ficticia (documento `0001234567`, expedición `2012-05-14`) es la solicitante; sus datos están en `src/mcp/datos-ejemplo.ts` y los documentos de los casos son ficticios.
- Los resúmenes del Escenario 2 en adelante se ven con `--demo`; en el modo normal no se imprimen (son para el analista).

## Escenario 1: pruebas sin red ni modelo (SC-001 a SC-005)

```text
npm test
npm run typecheck
npm run format:check
```

Esperado: todo en verde, sin `ANTHROPIC_API_KEY`. Cubre:
- **política**: cada fila de las tablas de [R1](research.md#r1-dos-niveles-de-clasificación-la-causa-cerrada-y-el-motivo) y [R2](research.md#r2-la-acción-recomendada-sale-de-un-catálogo-cerrado-de-la-política); los doce motivos con los cinco códigos; la detección de la petición de persona con sus negaciones ([politica.md](contracts/politica.md#casos-de-la-prueba)).
- **contrato compartido**: los esquemas de entrada y de `ResumenAnalista` con sus invariantes (pendientes coherentes, causa coherente, procedencia); la descripción de la herramienta con sus frases clave y sin umbrales.
- **core**: el resumen con y sin identidad, con y sin solicitud registrada; las causas adicionales; la idempotencia; `declarado` ignorado si hay solicitud; el rechazo de una causa incoherente; que escalar no cambia el estado de la solicitud.
- **servidor MCP**: la validación de entrada, el rechazo de campos de más y la auditoría sin nombres ni montos en el log de la herramienta.
- **agente**: la tabla de [agente.md](contracts/agente.md#pruebas-sin-el-modelo): la Regla 4 sin llamar al modelo, la precedencia, la entrega, la entrega pendiente y los dos casos que no escalan.
- **chat**: `formatearHandoff` y que el resumen solo se imprime en modo de demostración.

## Escenario 2: el solicitante pide una persona (US2 · SC-002)

```text
npm run chat -- --demo --caso casos/escalamiento-pide-persona
```

El caso envía un único mensaje: «Quiero hablar con una persona».

Esperado:
- en el modo de demostración **no aparece ninguna línea `herramienta`**: no se consultó identidad, ni verificación, ni documentos, ni registro;
- el agente responde que un analista revisará el caso, con la referencia, y no dice «te contactará»;
- aparece `[ESCALAMIENTO]` con la Regla 4 y `causaEscalamiento = peticion_de_persona`, `entrega = entregada` e `idEscalamiento`;
- el estado final es «ESCALADA A ANALISTA» y la conversación se cierra;
- el resumen impreso muestra el solicitante sin identificar, la acción `contactar_al_solicitante` y como pendientes `identidad`, `monto`, `plazo`, `ingreso_verificado` y `documentos`;
- en el log hay una línea `auditoria_escalamiento` con `resultado: escalada`.

## Escenario 3: pide una persona y da datos antes de identificarse (US1, US2 · aclaración Q1)

```text
npm run chat -- --demo --caso casos/escalamiento-pide-persona-con-datos
```

El caso envía: «Hola, quiero 4 millones a 24 meses, pero prefiero hablar con una persona».

Esperado:
- igual que el Escenario 2: ninguna herramienta, escalamiento inmediato;
- el resumen lleva solo lo que el solicitante dijo y deja **monto y plazo como pendientes**: la Regla 4 no extrae datos antes de escalar (R5);
- la identidad figura como pendiente y el resumen no inventa un solicitante.

## Escenario 4: moneda extranjera antes de identificar (US3 · caso de prueba 7)

```text
npm run chat -- --demo --caso casos/escalamiento-moneda-extranjera
```

El caso envía: «Quiero 4 millones a 24 meses y mi sueldo me lo pagan en dólares».

Esperado:
- el modelo llama a `solicitar_analista` con `caso_no_cubierto` y `moneda_extranjera`, y las citas de monto y plazo;
- el evento tiene `causaEscalamiento = caso_no_cubierto` y la acción es `revisar_tipo_de_documento_o_moneda`;
- el resumen trae el monto y el plazo **con su procedencia** (lo que dijo el solicitante) y la identidad pendiente.

El modelo real puede omitir las citas: en ese caso monto y plazo salen pendientes y el escalamiento sigue. Los dos resultados son válidos; las pruebas del Escenario 1 fijan los dos.

## Escenario 5: cuota por encima del porcentaje (US3 · caso de prueba 3)

```text
npm run chat -- --demo --caso casos/preaprobacion-cuota-alta
```

Esperado:
- la solicitud se registra, `preaprobar_credito` se bloquea y la conversación escala;
- el evento tiene `causaEscalamiento = cuota_sobre_porcentaje`;
- el resumen trae el solicitante verificado, la solicitud registrada, el ingreso declarado y verificado, la `Decisión` de la Regla 2 con la cuota y el ingreso, y la acción `revisar_con_simulacion_de_cuota`.

## Escenario 6: discrepancia de ingresos (US3 · caso de prueba 4)

```text
npm run chat -- --demo --caso casos/registro-discrepancia
```

Esperado:
- la solicitud se registra con la discrepancia y la conversación escala;
- el evento tiene `causaEscalamiento = discrepancia_de_ingreso`;
- el resumen muestra el ingreso declarado y el verificado, la diferencia en porcentaje y la acción `verificar_ingresos_con_soporte`;
- `Pendientes: ninguno`, porque hay solicitante, solicitud, monto, plazo, ingreso y documentos.

## Escenario 7: lo que no debe escalar (US4 · SC-003)

```text
npm run chat -- --demo --caso casos/extraccion-sin-salario
npm run chat -- --demo --caso casos/identidad-homonimos
```

Esperado:
- con el certificado sin salario, el agente pide un documento que lo traiga y aparece `[SOLICITUD DE DATO]`; **no** hay `[ESCALAMIENTO]` ni estado final;
- con los homónimos, el agente pide el número de documento y la conversación sigue hasta verificar; **no** hay `[ESCALAMIENTO]`.

## Lo que el chat no puede mostrar

- **Entrega pendiente** (R7): para ver `entrega = pendiente` hay que apagar el core o forzar su falla. Se prueba en el agente con un core falso.
- **Causas adicionales** (FR-008): depende del orden en que el modelo y los hooks dejen varias señales en un turno. Se prueba en el agente y en el core.
- **Repetición** (SC-005): tras escalar, el chat cierra la conversación, así que repetir el escalamiento solo se prueba en el core y en el agente.
- **Paráfrasis de la petición de persona**: una frase que la lista de la política no reconozca llega al modelo. No se puede garantizar «sin herramientas antes» en ese caso; es el riesgo aceptado de R5.

## Verificación de logs y auditoría

Con el chat en modo de demostración, el archivo de logs debe mostrar:
- una línea `auditoria_escalamiento` por escalamiento, con `correlationId`, regla, causa, motivo, número de causas adicionales, `idEscalamiento` y pendientes;
- el log `herramienta` de `escalar_a_analista` sin nombres, montos, documentos ni citas;
- una línea `entrega_escalamiento` por escalamiento, con `entrega` (`entregada` o `pendiente`) y el `idEscalamiento` si se entregó;
- en una entrega pendiente, además, una línea de error `error_entrega_escalamiento` con la causa y el `correlationId`;
- ninguna línea con fragmentos de los documentos ni nombres de documentos.
