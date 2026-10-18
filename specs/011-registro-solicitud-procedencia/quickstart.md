# Quickstart: validar el registro de la solicitud con procedencia

**Feature**: [spec.md](spec.md) · **Contratos**: [politica.md](contracts/politica.md), [core-mcp.md](contracts/core-mcp.md), [agente.md](contracts/agente.md) · **Datos**: [data-model.md](data-model.md)

## Requisitos previos

- Node ≥ 22.18 y `npm install` hecho.
- Para los Escenarios 2 a 7: `ANTHROPIC_API_KEY` definida en la sesión de la terminal. Nunca en un archivo versionado.
- Ana Pérez Ficticia (documento `0001234567`, expedición `2012-05-14`) es la solicitante; sus datos y los de los casos son ficticios y están en `src/mcp/datos-ejemplo.ts` y `casos/`.

## Escenario 1: pruebas sin red ni modelo (SC-001, SC-003, SC-004, SC-005)

```text
npm test
npm run typecheck
npm run format:check
```

Esperado: todo en verde, sin `ANTHROPIC_API_KEY`. Cubre:
- **política**: la diferencia porcentual con el borde del 10% y el redondeo; `evaluarDiscrepancia` sin cambios.
- **contrato compartido**: la procedencia de dos clases, el rechazo de campos extra, la descripción con sus frases clave y sin 30%, tope ni 10%, y `contieneFragmento`.
- **core**: cada paso del orden de comprobación; no guarda nada si falla; idempotencia; solicitud abierta; documentos no aptos; el ingreso verificado y la discrepancia salen del core; la verificación de otra persona se ignora.
- **servidor MCP**: el rechazo del lado del servidor sin identidad y de otra persona (SC-001); un campo `ingresoVerificado` en la entrada es un error de formato; los logs y la auditoría no llevan fragmentos.
- **control de identidad** (FR-013, sin modelo): la tabla de [agente.md](contracts/agente.md#pruebas-fr-013-sin-el-modelo), incluida la excepción de la Regla 3.
- **adaptador**: la clave de idempotencia es la misma entre turnos; las citas se comprueban contra la conversación y los documentos; el registro tras una señal de la Regla 3 funciona y tras la Regla 4 o 5 no.
- **agente**: el prompt nombra `registrar_solicitud` y conserva «no apruebas ni rechazas».

## Escenario 2: registro completo con procedencia (US1 · SC-002)

```text
npm run chat -- --demo
/caso casos/registro-solicitud
```

El caso verifica la identidad de Ana, adjunta el certificado y los tres extractos, declara 3.800.000 y termina pidiendo registrar 4.000.000 a 24 meses.

Esperado:
- el modo de demostración muestra, en este orden, la identificación, la extracción de cada documento, `verificar_ingreso` y `registrar_solicitud`;
- el agente informa el identificador de la solicitud (`SOL-0002000001`) y que quedó en estudio; no dice que está preaprobada;
- la solicitud, vista con `consultar_solicitud_registrada`, trae el monto y el plazo con la cita del solicitante, el ingreso declarado con su cita, el ingreso verificado con el documento y fragmento de cada cifra y los datos extraídos con su procedencia;
- no hay escalamiento.

## Escenario 3: sin identidad verificada (US2 · SC-001, SC-006)

En una sesión nueva, sin identificarse, escribir: «Quiero registrar mi solicitud de 4 millones a 24 meses».

Esperado:
- aparece un evento de bloqueo por la Regla 1 con el siguiente paso («Indícame tu número de documento…») en el mismo turno;
- no se llama a `registrar_solicitud` en el core: el hook la bloquea antes;
- `consultar_solicitud_registrada` de esa conversación devuelve `null`;
- el agente pide la identificación, sin inventar ni suponer que ya está verificada.

## Escenario 4: la verificación no se transfiere (US2, escenario 3)

Identificar a Ana y, en la misma conversación, pedir registrar la solicitud «de Elena Martínez Inventada».

Esperado: el hook bloquea (identidad de otro solicitante) o, si el modelo no pasa por él, el core rechaza con `identidad_no_verificada`; no queda ninguna solicitud. Esta comprobación está también en las pruebas del Escenario 1.

## Escenario 5: discrepancia de ingreso, registro y escalamiento (US1, escenario 3 · FR-015)

```text
/caso casos/registro-discrepancia
```

El caso usa los mismos documentos y, en un solo mensaje, declara 4.300.000 (por encima del 10% del verificado) y pide registrar 4 millones a 24 meses: la discrepancia detiene la conversación, así que el registro debe ocurrir en ese mismo turno.

Esperado:
- `verificar_ingreso` deja la señal de la Regla 3 y el modelo llama a `registrar_solicitud` en el mismo turno;
- la solicitud queda registrada con la discrepancia: declarado 4.300.000, verificado 3.800.000 y diferencia del 13,16%; no se oculta ni se corrige;
- al cerrar el turno la conversación pasa a un analista, con el mensaje de escalamiento por discrepancia;
- si el modelo no llama a `registrar_solicitud`, se anota como riesgo y se ajusta el prompt (plan, «Riesgos y pendientes»).

## Escenario 6: dato sin procedencia (US3 · SC-003)

Con una conversación verificada, pedir registrar con una cita que el solicitante no dijo: «Registra 9 millones a 12 meses» sin que el solicitante lo haya dicho.

Esperado:
- el adaptador rechaza con `procedencia_invalida` y el campo `procedencia.monto`; el modelo explica el motivo y pide el dato al solicitante;
- no queda ninguna solicitud, ni parcial (`consultar_solicitud_registrada` devuelve `null`);
- al corregirse con una cita literal del solicitante, el registro funciona al segundo intento.

Un documento que no está entre los extraídos se rechaza en el core con `procedencia_documento_desconocida`; está cubierto por las pruebas del Escenario 1.

## Escenario 7: repetición y solicitud abierta (US1, escenario 4 · SC-005)

Tras el Escenario 2, en la misma conversación:
1. Repetir «registra mi solicitud de 4 millones a 24 meses». Esperado: el agente devuelve el mismo identificador y no hay una segunda solicitud (`repetida: true`).
2. Pedir ahora «registra una de 3 millones a 12 meses». Esperado: el core rechaza con `solicitud_abierta` y el agente informa que ya hay una abierta; no registra otra.

## Verificación de logs y auditoría

Con el chat en modo demostración, el archivo de logs del chat debe mostrar:
- una línea `auditoria_solicitud` por registro nuevo y por rechazo por regla, con `correlationId`, regla, resultado y los valores enteros;
- ninguna línea con fragmentos de los documentos, nombres de documentos ni texto de la conversación;
- una sola auditoría en la repetición del Escenario 7.1 (la de la primera vez).
