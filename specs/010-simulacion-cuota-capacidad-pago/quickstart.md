# Quickstart: validar la simulación de cuota y capacidad de pago

**Feature**: [spec.md](spec.md) · **Contratos**: [politica.md](contracts/politica.md), [core-mcp.md](contracts/core-mcp.md), [agente.md](contracts/agente.md) · **Datos**: [data-model.md](data-model.md)

## Requisitos previos

- Node ≥ 22.18 y `npm install` hecho.
- Para los Escenarios 2 a 6: `ANTHROPIC_API_KEY` definida en la sesión de la terminal. Nunca en un archivo versionado.
- Ana Pérez Ficticia (documento `0001234567`, expedición `2012-05-14`) es la solicitante cuando un escenario necesita identidad; sus datos están en `src/mcp/datos-ejemplo.ts`.

## Escenario 1: pruebas sin red ni modelo (SC-001, SC-003, SC-004, SC-006)

```text
npm test
npm run typecheck
npm run format:check
```

Esperado: todo en verde, sin `ANTHROPIC_API_KEY`. Cubre:
- **política**: 4.000.000 a 24 meses da 206.723; plazo 1 da `monto · 1,018`; los bordes de .5 del redondeo; la proporción con enteros; `TASA_MENSUAL === 0.018`; y la tasa no aparece como literal fuera de `politica.ts`.
- **contrato compartido**: la descripción contiene las frases de FR-007 y no el 30% ni el tope; el resultado trae `vinculante: false` y su aviso.
- **core**: sin identidad funciona; el core queda igual tras simular; `declarado` y `verificado`; una cifra distinta a la verificada es `declarado`; cada entrada inválida con su código y su campo.
- **servidor MCP**: herramienta de solo lectura; el rechazo del lado del servidor; el log no lleva montos.
- **adaptador y control**: la herramienta se expone, no se bloquea sin identidad y una pregunta de cuota no escala.
- **agente**: el prompt nombra la herramienta y ya no dice «estimas cuotas».

## Escenario 2: valor de referencia (US1 · SC-001)

```text
npm run chat -- --demo
```

Escribir: «Si pido 4 millones a 24 meses y gano 3.800.000 al mes, ¿cuánto pagaría?»

Esperado:
- el modo de demostración muestra una llamada a `calcular_capacidad_pago` y ninguna otra;
- el agente informa una cuota de $206.723 y una proporción cercana al 5,44%;
- lo presenta como simulación no vinculante, con el ingreso declarado no verificado;
- no se pide identidad ni se menciona una preaprobación.

## Escenario 3: sin identidad y sin efectos (US2 · SC-002, SC-003)

En la misma sesión, sin haberse identificado, repetir la pregunta con otro monto y otro plazo.

Esperado:
- responde igual de rápido y no aparece ningún evento `bloqueo_por_regla`;
- `consultar_solicitud` de cualquier solicitud conocida no cambia;
- no hay escalamiento.

## Escenario 4: entradas inválidas (US4 · SC-004)

Pedir una simulación con cada dato inválido y comprobar la reacción del agente:

| Mensaje | Esperado |
|---------|----------|
| «Quiero un crédito de 0 pesos a 12 meses ganando 3 millones» | error de `monto`; el agente pide un monto válido, sin cuota |
| «Un millón a 0 meses, gano 3 millones» | error de `plazoMeses`, sin cuota |
| «Quiero 2 millones a 12 meses» (sin decir ingreso) | el agente pide el ingreso antes de simular o la herramienta devuelve `ingreso_invalido`; en ambos casos sin cuota |
| «Gano -500.000 y quiero 1 millón a 6 meses» | error de `ingresoMensual`, sin cuota |

En ningún caso el agente reintenta con los mismos datos (el error es no reintentable).

## Escenario 5: simular no es preaprobar (US3 · SC-005)

Escribir: «Si pido 3 millones a 12 meses con ingreso de 5 millones, ¿me aprueban?»

Esperado:
- el agente puede simular la cuota, pero no dice «sí me aprueban» ni «quedas preaprobado»;
- aclara que una simulación no es una preaprobación y que esa decisión depende de la solicitud con identidad e ingreso verificados.

Repetir con una cuota claramente baja respecto del ingreso: el agente sigue sin afirmar la aprobación.

## Escenario 6: ingreso verificado (US1, US2 · FR-014)

```text
npm run chat -- --demo --caso casos/ingreso-consistente
```

Con Ana ya verificada y su ingreso verificado en 3.800.000, pedir: «¿Cuánto pagaría por 4 millones a 24 meses?»

Esperado:
- el agente usa el ingreso verificado y el resultado trae `fuenteIngreso: verificado`;
- el aviso dice «ingreso verificado» y que no es una preaprobación;
- si luego dice «mejor con un ingreso de 6 millones», el resultado vuelve a `declarado`.

## Criterios de listo

- Los seis escenarios se comportan como se indica.
- Ningún log de `npm run chat` contiene un monto de ingreso o de crédito de la simulación.
- El valor de $206.723 no cambia entre ejecuciones.
