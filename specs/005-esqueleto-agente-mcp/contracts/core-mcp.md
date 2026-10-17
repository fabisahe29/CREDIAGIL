# Contrato: servidor MCP del core de originación

**Requisitos**: FR-005 a FR-010, FR-014 a FR-016, FR-018 · **Decisiones**: [research.md](../research.md), R1, R3, R6, R9 y R10 · **Entidades**: [data-model.md](../data-model.md)

## Servidor

| | |
|---|---|
| Nombre | `crediagil-core` |
| Transporte | stdio (`node src/mcp/principal.ts`) |
| stdout | Reservado al protocolo MCP. Los logs van a stderr (R6) |
| Configuración | `CREDIAGIL_FALLA` (vacío, `una-vez` o `siempre`); valor desconocido → el proceso sale con código 1 y un mensaje |
| Credenciales | Ninguna |

## Herramienta `consultar_solicitud`

**Descripción para el modelo**: «Consulta el estado de una solicitud de crédito del core de Crediágil por su identificador. Devuelve `solicitud: null` si no existe.»

**Entrada** (Zod, estricta: campos extra → `validacion`):

```json
{ "idSolicitud": "SOL-000…", "correlationId": "<uuid>" }
```

| Campo | Regla |
|-------|-------|
| `idSolicitud` | `^SOL-000\d{7}$` |
| `correlationId` | UUID |

**Salida** (`structuredContent`):

| Caso | Respuesta | `isError` |
|------|-----------|-----------|
| Encontrada, `en_estudio` | `{ "ok": true, "datos": { "solicitud": { …Solicitud } } }` | no |
| Formato válido, no existe | `{ "ok": true, "datos": { "solicitud": null } }` | no |
| Formato inválido o campo faltante | `{ "ok": false, "error": { "categoria": "validacion", "reintentable": false, "codigo": "formato_invalido", "campo": "idSolicitud", "mensaje": "…" } }` | sí |
| Solicitud `anulada` | `… "categoria": "negocio", "codigo": "solicitud_anulada" …` | sí |
| Solicitud `reservada` | `… "categoria": "permisos", "codigo": "solicitud_reservada" …` | sí |
| Falla simulada activa | `… "categoria": "transitorio", "reintentable": true, "codigo": "core_no_disponible" …` | sí |

Cada llamada registra en stderr `{ "evento": "herramienta", "herramienta": "consultar_solicitud", "correlationId", "resultado": "ok" | <codigo> }`, sin los datos del solicitante.

## Registro en Claude Code

`.mcp.json` (se agrega junto a `github`):

```json
"crediagil-core": {
  "type": "stdio",
  "command": "node",
  "args": ["${CLAUDE_PROJECT_DIR:-.}/src/mcp/principal.ts"]
}
```

`.claude/settings.json`: `"enabledMcpjsonServers": ["github", "crediagil-core"]`. Sin `env` ni credenciales (SC-007).
