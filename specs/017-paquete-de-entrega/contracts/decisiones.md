# Contrato: `DECISIONES.md`

**Feature**: [../spec.md](../spec.md) · Requisitos: FR-004 a FR-006a

## Límite

Máximo **1000 palabras** (unas dos páginas). Una prueba en `src/entrega/` lo cuenta sobre el archivo.

## Estructura

```markdown
# Decisiones del ecosistema

{una o dos frases: qué es este documento y dónde está el detalle (docs/registro-decisiones.md)}

## 1. {necesidad, en una línea}
**Mecanismo**: {qué se eligió}
**Por qué**: {motivo en una o dos frases}
**Descartado**: {alternativa y por qué no}
**Detalle**: [{artefacto}]({ruta})

## 2. …
…
## 11. …
```

## Reglas

- Hay exactamente 11 secciones, con la numeración del enunciado (1 a 11), cada una con las cuatro etiquetas.
- Cada enlace de **Detalle** apunta a un archivo que existe (spec, plan, research o el registro detallado).
- Sin datos reales ni secretos; entra en la prueba `sin-datos-reales`.
- Las decisiones nuevas del plan se anotan en `docs/registro-decisiones.md`, no aquí. Este documento solo cambia si cambia el mecanismo de una necesidad.

## Necesidades

La lista y su redacción están en [spec.md](../spec.md#las-11-necesidades). La tabla de mínimos del enunciado (reglas con `paths`, subagentes, skills, hooks, comando propio, servidores MCP y plugin) se reparte entre las necesidades 1 a 11 según el mecanismo que las resuelve.
