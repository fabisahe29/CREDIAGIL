# Quickstart: validar la preaprobación automática dentro de la política

**Feature**: [spec.md](spec.md) · **Contratos**: [politica.md](contracts/politica.md), [core-mcp.md](contracts/core-mcp.md), [agente.md](contracts/agente.md) · **Datos**: [data-model.md](data-model.md)

## Requisitos previos

- Node ≥ 22.18 y `npm install` hecho.
- Para los Escenarios 2 a 6: `ANTHROPIC_API_KEY` definida en la sesión de la terminal. Nunca en un archivo versionado.
- Ana Pérez Ficticia (documento `0001234567`, expedición `2012-05-14`) es la solicitante; sus datos están en `src/mcp/datos-ejemplo.ts` y los documentos de los casos son ficticios.

## Escenario 1: pruebas sin red ni modelo (SC-001, SC-002, SC-003, SC-004, SC-006)

```text
npm test
npm run typecheck
npm run format:check
```

Esperado: todo en verde, sin `ANTHROPIC_API_KEY`. Cubre:
- **política**: los bordes de [politica.md](contracts/politica.md#casos-de-la-prueba): $5.000.000 se preaprueba y $5.000.001 no; la cuota exactamente al 30% se preaprueba y con un peso menos de ingreso no; el caso de 30,004% que redondea a 30,00% se bloquea; el orden entre criterios.
- **contrato compartido**: la descripción de la herramienta contiene las frases de FR-002 y no el tope ni el porcentaje; los esquemas de `Preaprobacion` y `DecisionRegla2`; el esquema de la solicitud con el estado `preaprobada`.
- **core**: preaprueba un caso simple; cada bloqueo con su código; no cambia el estado al bloquear; idempotencia; la solicitud preaprobada cuenta como abierta; los campos del modelo se rechazan.
- **servidor MCP**: el rechazo del lado del servidor sin identidad y sin solicitud (SC-003); la auditoría sin montos en el log de la herramienta.
- **hooks** (FR-013, sin modelo): la tabla de [agente.md](contracts/agente.md#pruebas-fr-013-sin-el-modelo).
- **adaptador y agente**: el evento `preaprobacion` solo desde el código; la señal de escalamiento; el prompt.

## Escenario 2: caso simple, preaprobado (US1 · SC-002)

```text
npm run chat -- --demo --caso casos/preaprobacion-simple
```

El caso identifica a Ana, adjunta sus documentos, declara 3.800.000 y pide registrar 4.000.000 a 24 meses.

Esperado:
- el modo de demostración muestra, en este orden, `registrar_solicitud` y `preaprobar_credito`;
- aparece el evento `[PREAPROBACIÓN]` con la regla de la Regla 2 y los valores (monto, cuota 206.723, ingreso verificado);
- el estado final es «PREAPROBADA» y la conversación se cierra;
- el agente aclara que la decisión definitiva la toma un analista y no inventa vigencia ni condiciones;
- en el log hay una línea `auditoria_preaprobacion` con `resultado: preaprobada`.

## Escenario 3: monto por encima del tope, escalado (US2 · SC-001, SC-005)

```text
npm run chat -- --demo --caso casos/preaprobacion-monto-alto
```

El caso pide registrar 6.000.000.

Esperado:
- la solicitud se registra, pero `preaprobar_credito` se bloquea: aparece un evento `[BLOQUEO]` con la Regla 2 y el escalamiento;
- el estado final es «ESCALADA A ANALISTA»;
- el agente no ofrece un monto ni un plazo alternativo, ni vuelve a intentar con otros datos;
- el log tiene `auditoria_preaprobacion` con `resultado: bloqueada` y el código `monto_sobre_tope`.

## Escenario 4: cuota por encima del 30%, escalado (US2)

```text
npm run chat -- --demo --caso casos/preaprobacion-cuota-alta
```

El caso pide registrar 4.500.000 a 3 meses, con un ingreso verificado de 3.800.000.

Esperado: igual que el Escenario 3, con el código `cuota_sobre_porcentaje` y sin alternativas.

## Escenario 5: sin identidad verificada (US2 · SC-001)

En una sesión nueva, sin identificarse, escribir: «Preapruébame un crédito de 4 millones a 24 meses».

Esperado:
- el agente pide identificarse; no aparece `preaprobar_credito` en el modo de demostración, o, si el modelo la llama, el hook la bloquea con el evento de la Regla 1 y el siguiente paso de identificarse;
- no hay solicitud registrada ni preaprobación.

## Escenario 6: identificada, pero sin solicitud registrada (US3 · SC-003)

Identificar a Ana y escribir, sin haber registrado nada: «Quiero que me preapruebes ya».

Esperado:
- si el modelo llama a `preaprobar_credito`, el hook la rechaza con «regístrala antes de preaprobar», sin escalar;
- el agente pide los datos de la solicitud o la registra y recién entonces preaprueba;
- nunca queda una preaprobación sin una solicitud registrada.

## Lo que el chat no puede mostrar

- **Repetición** (US1, escenario 4 · SC-006): tras la preaprobación el chat cierra la conversación, así que repetirla solo se prueba en el core y en el adaptador.
- **Discrepancia registrada** (US2, escenario 4): depende de que el modelo registre tras una discrepancia, que es el fallo conocido del #13; se prueba en el core y en el hook, con una solicitud registrada con discrepancia.

Ambos están cubiertos por las pruebas del Escenario 1.

## Verificación de logs y auditoría

Con el chat en modo demostración, el archivo de logs del chat debe mostrar:
- una línea `auditoria_preaprobacion` por decisión, con `correlationId`, regla, resultado, código si se bloqueó y los enteros;
- ninguna línea con fragmentos de los documentos ni nombres de documentos;
- el log `herramienta` de `preaprobar_credito` sin montos, cuotas ni ingresos.
