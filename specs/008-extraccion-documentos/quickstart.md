# Quickstart: validar la extracción de documentos

**Feature**: [spec.md](spec.md) · **Contratos**: [subagente.md](contracts/subagente.md), [agente.md](contracts/agente.md), [core-mcp.md](contracts/core-mcp.md) · **Datos**: [data-model.md](data-model.md#documentos-de-ejemplo-fr-019)

## Requisitos previos

- Node ≥ 22.18 y `npm install` hecho.
- Para los Escenarios 2 a 6: `ANTHROPIC_API_KEY` definida en la sesión de la terminal. Nunca en un archivo versionado.
- La fecha de expedición de Ana Pérez Ficticia está en `src/mcp/datos-ejemplo.ts`. Los casos `extraccion-*` ya la incluyen.

## Escenario 1: pruebas sin red ni modelo (FR-020 · SC-001 a SC-005, SC-008)

```text
npm test
npm run typecheck
npm run format:check
```

Esperado: todo en verde, sin `ANTHROPIC_API_KEY`. Cubre:
- **política**: `evaluarDocumento` con cada tipo y moneda, conflictos y faltantes; `deducirMoneda` con COP, pesos, USD, dólares y un fragmento sin moneda; `MAX_INTENTOS_EXTRACCION` en el borde (el 3.er intento es el último).
- **validación compartida**: fragmento presente, ausente y con otros espacios; monto que coincide, que no coincide y con centavos `,00` y `,50`; fecha futura; varios errores acumulados.
- **subagente**: el prompt contiene solo el documento y los errores previos; las `Options` no tienen herramientas ni servidores; tiempo agotado.
- **adaptador**: el subagente falso devuelve inválido y luego válido, y el segundo intento recibe el error; tres inválidos escalan con `documento_no_extraible`; un nulo no reintenta y emite `solicitud_de_dato`; USD y `otro` escalan con la Regla 5; un adjunto no soportado escala sin llamar al subagente; el mismo contenido no llama dos veces al subagente.
- **control de identidad**: `extraer_documento` sin identidad se bloquea con `bloqueo_por_regla`.
- **core y servidor MCP**: `registrar_extraccion` sin identidad, idempotente por huella, rechazo de un resultado con un fragmento ajeno; `consultar_extracciones`; los logs y la auditoría no contienen el contenido ni los fragmentos.
- **chat**: numeración de `/adjuntar` y `/pegar`, el atributo `adjunto` en el bloque, y `/nueva` reinicia la numeración.
- **datos**: los cinco documentos existen, cumplen la convención de datos ficticios y el subagente falso los extrae con los valores esperados.

## Escenario 2: certificado completo (US1, US3 · SC-001, SC-002, SC-006)

```text
npm run chat -- --demo --caso casos/extraccion-certificado
```

Esperado:
- se identifica y verifica a Ana Pérez Ficticia;
- el modo de demostración muestra `extraer_documento` y `registrar_extraccion`;
- la respuesta da empleador, cargo, fecha de ingreso 2022-02-01, salario 3800000 y COP, cada uno con su fragmento del adjunto;
- no aparece ningún evento ni escalamiento.

## Escenario 3: certificado sin salario (US2 · SC-003)

```text
npm run chat -- --demo --caso casos/extraccion-sin-salario
```

Esperado:
- un evento `solicitud_de_dato` sobre el salario que pide un documento nuevo;
- un solo intento del subagente.

Después, escribe "Gano 3.800.000 al mes". Esperado: el agente no lo toma como ingreso verificado y vuelve a pedir el documento.

## Escenario 4: tres extractos (US1, US6 · SC-001)

```text
npm run chat -- --demo --caso casos/extraccion-extractos
```

Esperado:
- tres adjuntos numerados del 1 al 3, cada uno extraído con titular, periodo, moneda y movimientos;
- en un turno siguiente, "¿qué datos tienes de mis extractos?" hace que el agente use `consultar_extracciones`.

## Escenario 5: sin identidad y fuera de política (US1, US5 · SC-004, SC-005)

1. En una conversación nueva, `/adjuntar casos/extraccion-certificado/certificado-completo.md` sin identificarte. Esperado: el agente pide la identificación; si intenta extraer, se ve un `bloqueo_por_regla` con la Regla 1.
2. Identifícate y verifica. Luego pega con `/pegar` un certificado ficticio con "salario de USD 1.200". Esperado: escalamiento con la Regla 5 y la causa `moneda_extranjera`, sin un certificado.
3. En otra conversación verificada, pega un "desprendible de nómina" ficticio. Esperado: escalamiento con `documento_no_soportado`.

## Escenario 6: el core desde Claude Code (FR-010, FR-018)

Con el servidor `crediagil-core` habilitado y un `correlationId` ya verificado como en el Escenario 2 del #9:

1. `registrar_extraccion` con un resultado `extraido` cuyo fragmento no está en el `contenido` → `extraccion_invalida`.
2. El mismo registro con el fragmento correcto → éxito.
3. Repetir el paso 2 con otro `adjunto` → el mismo registro, con los dos adjuntos.
4. `consultar_extracciones` → una sola extracción.
5. Con un `correlationId` nuevo, sin verificar, `registrar_extraccion` → `identidad_no_verificada`.

## Revisión antes del PR

- `/ticket-abrir-pr` corre las revisiones del #6. Se espera la Regla 1 ✅ por el control y el core, la Regla 5 ✅ por `evaluarDocumento`, y las reglas 2, 3 y 4 no aplicables.
- Comprueba que ningún umbral de monto, cuota o ingreso aparezca como literal.
