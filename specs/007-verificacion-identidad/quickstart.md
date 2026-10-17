# Quickstart: validar la identificación y verificación del solicitante

**Feature**: [spec.md](spec.md) · **Contratos**: [core-mcp.md](contracts/core-mcp.md), [agente.md](contracts/agente.md) · **Datos**: [data-model.md](data-model.md#datos-de-ejemplo-fr-017)

## Requisitos previos

- Node ≥ 22.18 y `npm install` hecho.
- Para los Escenarios 3 a 5: `ANTHROPIC_API_KEY` definida en la sesión de la terminal. Nunca en un archivo versionado.
- Las fechas de expedición de los solicitantes de ejemplo están en `src/mcp/datos-ejemplo.ts`.

## Escenario 1: pruebas sin red ni modelo (FR-018 · SC-003, SC-004, SC-006)

```text
npm test
npm run typecheck
npm run format:check
```

Esperado: todo en verde, sin `ANTHROPIC_API_KEY`. Cubre:
- **política**:
  - `MAX_INTENTOS_VERIFICACION` en el borde exacto: el 2.º fallo no bloquea y el 3.º sí;
  - `evaluarRegla1` con identidad verificada y sin verificar.
- **core**:
  - búsqueda por documento (con puntos, espacios y guiones) y por nombre (mayúsculas y tildes);
  - homónimos, sin coincidencias y criterio mal formado o doble;
  - verificación con el orden completo de R4: formato, fecha futura e inexistente, solicitante inexistente, dato que no coincide con el contador, bloqueo y bloqueo con el dato correcto, éxito, idempotencia y otro solicitante;
  - estado por `correlationId` y conversación nueva sin verificar.
- **servidor MCP**: las tres herramientas por un cliente MCP real en memoria, campos extra, falla simulada, y que los logs y la auditoría no contienen fechas.
- **adaptador**: el evento `solicitud_de_dato` con homónimos, el escalamiento en la segunda búsqueda ambigua y en `verificacion_bloqueada`, y los reintentos.
- **control de identidad**: herramienta fuera de la lista, verificada, no verificada y falla del core; el evento `bloqueo_por_regla`; el hook queda registrado en las `Options`.
- **datos**: los cuatro casos de FR-017 existen y cumplen la convención de datos ficticios.

## Escenario 2: el core desde Claude Code (US1, US3, US4 · FR-001 a FR-013)

Con el servidor `crediagil-core` habilitado en Claude Code, un mismo `correlationId` UUID en todas las llamadas y un `idIntento` distinto en cada `verificar_identidad`:

1. `buscar_solicitante` con `{ "nombre": "elena martinez inventada" }` → dos coincidencias con el documento enmascarado.
2. `buscar_solicitante` con `{ "documento": "000.123.4567" }` → una coincidencia, Ana Pérez Ficticia.
3. `buscar_solicitante` con `{ "nombre": "Nadie Registrado Ficticio" }` → `coincidencias: []`, sin error.
4. `consultar_identidad` → `verificada: false`.
5. `verificar_identidad` con una fecha mal formada (`2020-13-40`) → `validacion`, `campo: "fechaExpedicion"`.
6. `verificar_identidad` con una fecha válida pero distinta → `dato_no_coincide`, quedan 2.
7. `verificar_identidad` con la fecha correcta → `verificada: true`; `consultar_identidad` lo confirma.
8. Con otro `correlationId`, `consultar_identidad` → `verificada: false`.
9. Con un tercer `correlationId`, tres fechas distintas → la tercera responde `verificacion_bloqueada`; una cuarta con la fecha correcta también.

## Escenario 3: solicitante único en el chat (caso de prueba 1 · US1, US3)

1. `npm run chat`.
2. `Hola, quiero pedir un crédito`. Esperado: el agente pide el número de documento o el nombre completo.
3. Dar el documento de Ana Pérez Ficticia. Esperado: el agente pide la fecha de expedición.
4. Dar la fecha correcta. Esperado: confirma la identidad sin mostrar la fecha.
5. Con `--demo`: aparecen las líneas `buscar_solicitante · ok` y `verificar_identidad · ok`.

## Escenario 4: homónimos (US2 · FR-005, FR-006 · SC-002)

1. `/nueva`, luego `Quiero un crédito, soy Elena Martínez Inventada`.
   Esperado: `[SOLICITUD DE DATO]` pidiendo el número de documento, y el agente no verifica a ninguna de las dos.
2. Dar el documento de uno de los homónimos. Esperado: una coincidencia y la pregunta por la fecha de expedición.
3. `/nueva` y repetir el paso 1 dos veces (dar de nuevo solo el nombre).
   Esperado: en la segunda búsqueda ambigua, `[ESCALAMIENTO]` con la regla «Regla 1 · coincidencias sin desambiguar», y la conversación se cierra.

## Escenario 5: identidad no verificable (caso de prueba 5 · US3 · FR-009, FR-010)

1. `/nueva`, identificarse con el documento de Ana Pérez Ficticia.
2. Dar tres fechas de expedición incorrectas. Esperado: tras la 1.ª y la 2.ª, el agente dice que no coincide sin revelar la correcta. Tras la 3.ª, `[ESCALAMIENTO]` con «Regla 1 · 3 intentos fallidos de verificación» y la conversación cerrada.
3. En `logs/chat-<fecha>.jsonl`: tres registros `auditoria` con la `regla` y el `resultado`, y **ninguna** fecha de expedición (SC-004).

## Escenario 6: preguntas generales sin identificar (FR-011)

1. `/nueva`, `¿Qué documentos necesito para pedir un crédito?`. Esperado: el agente responde sin pedir identificación ni llamar a `buscar_solicitante` (verificable con `--demo`).

## Escenario 7: reglas 4 y 5 antes de identificar (FR-011b)

Con `npm run chat -- --demo`:

1. `Hola, quiero hablar con una persona`. Esperado: una sola línea `herramienta solicitar_analista · intento 1 · ok`, ninguna `buscar_solicitante`, y `[ESCALAMIENTO]` con «Regla 4 · el solicitante pide hablar con una persona». La conversación se cierra.
2. `/nueva`, `Quiero un crédito; mis ingresos son en dólares`. Esperado: `solicitar_analista` y `[ESCALAMIENTO]` con «Regla 5 · caso no cubierto por la política» y `causa = moneda_extranjera`, sin buscar ni pedir el documento.
