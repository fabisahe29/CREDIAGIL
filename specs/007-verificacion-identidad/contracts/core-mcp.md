# Contrato: herramientas de identidad del core

**Requisitos**: FR-001 a FR-004, FR-007 a FR-010, FR-012, FR-013, FR-015 a FR-017 · **Decisiones**: [research.md](../research.md), R1 a R4 y R9 · **Entidades**: [data-model.md](../data-model.md)

Extiende el servidor `crediagil-core` del [#7](../../005-esqueleto-agente-mcp/contracts/core-mcp.md). Se mantienen sin cambios el transporte, `CREDIAGIL_FALLA`, el contrato de errores y el patrón «esquema anunciado laxo + validación estricta en el manejador». `consultar_solicitud` no cambia.

Las tres herramientas reciben `correlationId` (UUID) obligatorio. Un campo extra, faltante o con el tipo equivocado responde `validacion` / `formato_invalido` con ese `campo`. Con la falla simulada activa, todas responden `transitorio` / `core_no_disponible` antes de validar o de tocar el estado, igual que `consultar_solicitud`.

## `buscar_solicitante`

**Descripción para el modelo**: «Busca solicitantes en el core de Crediágil por número de documento o por nombre completo (uno de los dos). Puede devolver cero, una o varias coincidencias; no elijas entre varias, pide el número de documento.»

**Entrada**: `{ "documento": "000…", "correlationId": "<uuid>" }` o `{ "nombre": "…", "correlationId": "<uuid>" }`.

| Caso | Respuesta | `isError` |
|------|-----------|-----------|
| Una o más coincidencias | `{ "ok": true, "datos": { "coincidencias": [ { "idSolicitante", "nombre", "documentoEnmascarado" }, … ] } }` | no |
| Sin coincidencias | `{ "ok": true, "datos": { "coincidencias": [] } }` | no |
| Ambos criterios o ninguno | `validacion`, `formato_invalido`, `campo: "criterio"` | sí |
| Documento que tras normalizar no tiene 6–10 dígitos | `validacion`, `formato_invalido`, `campo: "documento"` | sí |
| Nombre con < 3 letras o con caracteres que no son letras ni espacios | `validacion`, `formato_invalido`, `campo: "nombre"` | sí |

Las coincidencias van ordenadas por `idSolicitante`. Log: `{ "evento": "herramienta", "herramienta": "buscar_solicitante", "correlationId", "criterio": "documento" | "nombre", "coincidencias": n, "resultado" }`, sin el valor buscado.

## `verificar_identidad`

**Descripción para el modelo**: «Verifica la identidad de un solicitante encontrado con la fecha de expedición de su documento (AAAA-MM-DD). Si el dato no coincide, informa sin revelar el dato correcto. Tras 3 intentos fallidos la verificación queda bloqueada.»

**Entrada**: `{ "idSolicitante": "CLI-000…", "fechaExpedicion": "AAAA-MM-DD", "idIntento": "<uuid>", "correlationId": "<uuid>" }`. `idIntento` es un string de 1 a 64 caracteres; si falta o no cumple, la respuesta es `validacion`, `campo: "idIntento"`.

Orden de evaluación (R4):

| # | Caso | Respuesta | Cuenta intento |
|---|------|-----------|----------------|
| 1 | `idSolicitante` sin el formato `^CLI-000\d{7}$` | `validacion`, `formato_invalido`, `campo: "idSolicitante"` | no |
| 1 | `fechaExpedicion` sin el formato, inexistente en el calendario o futura | `validacion`, `formato_invalido`, `campo: "fechaExpedicion"` | no |
| 2 | Solicitante inexistente | `negocio`, `solicitante_inexistente` | no |
| 3 | Verificación bloqueada para `(correlationId, idSolicitante)` | `negocio`, `verificacion_bloqueada` | no |
| 4 | Fecha distinta y quedan intentos | `negocio`, `dato_no_coincide`; el mensaje dice cuántos intentos quedan | sí |
| 4 | Fecha distinta y es el 3.er fallo | `negocio`, `verificacion_bloqueada` | sí, y bloquea |
| 5 | Fecha correcta | `{ "ok": true, "datos": { "identidad": EstadoIdentidad } }` | no |

- Ningún mensaje de error incluye la fecha guardada ni pistas sobre ella (FR-010).
- Repetir una verificación correcta del mismo solicitante devuelve el mismo `EstadoIdentidad`, con la misma `verificadaEn`, y no escribe otra auditoría (FR-016).
- Un `idIntento` repetido tras un **fallo** devuelve el mismo fallo: no cuenta otro intento ni escribe otra auditoría (Principio VI; R4). Los éxitos no se guardan: repetidos, se evalúan contra el estado actual, que pudo cambiar.
- Un intento sobre otro solicitante (que existe) invalida la verificación anterior de la conversación: no se transfiere.
- Cada verificación escribe en stderr `{ "evento": "auditoria", "regla": "Regla 1", "correlationId", "idSolicitante", "resultado", "intentosFallidos", "ts" }`, **sin** fechas (R9). Esto incluye el caso 1, con `resultado: "formato_invalido"` y su `campo`. Solo una repetición exitosa o un `idIntento` repetido no la escriben.

## `consultar_identidad`

**Descripción**: «Devuelve el estado de identidad verificada de la conversación. Solo lectura.» Lo usan los controles del agente y Claude Code; **no** se expone al modelo del agente (R6).

**Entrada**: `{ "correlationId": "<uuid>" }`.

| Caso | Respuesta |
|------|-----------|
| Conversación con verificación | `{ "ok": true, "datos": { "identidad": { "correlationId", "verificada": true, "idSolicitante", "verificadaEn" } } }` |
| Conversación sin verificación o desconocida | `{ "ok": true, "datos": { "identidad": { "correlationId", "verificada": false, "idSolicitante": null, "verificadaEn": null } } }` |

## Cliente del core — `src/agente/cliente-core.ts`

`ClienteCore` suma tres métodos, con el mismo tiempo límite y la misma validación de respuesta contra el contrato (una respuesta fuera de contrato → `respuesta_fuera_de_contrato`):

```ts
buscarSolicitante(criterio: { documento: string } | { nombre: string }, correlationId: string): Promise<Respuesta<{ coincidencias: Coincidencia[] }>>;
verificarIdentidad(idSolicitante: string, fechaExpedicion: string, idIntento: string, correlationId: string): Promise<Respuesta<{ identidad: EstadoIdentidad }>>;
consultarIdentidad(correlationId: string): Promise<Respuesta<{ identidad: EstadoIdentidad }>>;
```
