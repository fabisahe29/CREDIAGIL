# Contrato: comentario de estado real de un ticket

**Feature**: [../spec.md](../spec.md) · Requisito: FR-014 · Decisión: [research.md](../research.md#r8-el-estado-de-los-tickets-lo-revisa-la-sesión-por-el-servidor-mcp-con-un-comentario-de-estado-real)

Lo publica la sesión, por el servidor MCP de GitHub, en cada ticket del Project que no esté en Done al cierre de la entrega.

## Reglas

- La primera línea es exactamente `<!-- crediagil:entrega=estado -->`.
- Como máximo hay uno por issue. Antes de publicar se leen todos los comentarios (`get_comments`, `perPage: 100`) y, si el marcador existe, no se publica.
- Va en español y solo habla del trabajo: sin datos de solicitantes ni secretos.
- No cambia el estado del ticket en el Project: solo lo explica.

## Plantilla

```markdown
<!-- crediagil:entrega=estado -->
📌 **Estado real al cierre de la entrega**

Estado en el Project: **{In Progress | In review | Todo}**

**Qué falta**
- {elemento pendiente}

**Por qué quedó así**: {motivo en una línea, con enlace al PR o al issue de seguimiento si existe}
```
