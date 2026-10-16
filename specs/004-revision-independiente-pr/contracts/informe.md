# Contrato: informes de revisión, decisión y registro

**Requisitos**: FR-002, FR-004 a FR-012 · **Decisiones**: [research.md](../research.md), R5 a R7 · **Entidades**: [data-model.md](../data-model.md)

## Salida del revisor

El mensaje final de cada revisor termina con **un único** bloque de código `json`. El texto anterior al bloque es libre (resumen para personas) y no se procesa.

### Informe de código

```json
{
  "tipo": "codigo",
  "sha": "<40 hex>",
  "resumen": "Una o dos frases.",
  "hallazgos": [
    {
      "severidad": "alta",
      "archivo": ".claude/revision/lib/decision.ts",
      "linea": 42,
      "descripcion": "Qué está mal y por qué.",
      "sugerencia": "Cómo corregirlo.",
      "preexistente": false
    }
  ]
}
```

- `hallazgos: []` es válido y significa «sin hallazgos».
- `contexto: {archivo, linea}` es obligatorio cuando el hallazgo cita una línea fuera del diff.

### Informe de cumplimiento

```json
{
  "tipo": "cumplimiento",
  "sha": "<40 hex>",
  "resumen": "Una o dos frases.",
  "reglas": [
    { "regla": 1, "estado": "no_aplicable", "motivo": "El diff no toca el registro de solicitudes." },
    { "regla": 2, "estado": "cumplida",
      "evidencia": [{ "archivo": "src/politica/umbrales.ts", "linea": 3, "cita": "TOPE_PREAPROBACION = 5_000_000" }],
      "contrastado_con": ["Principio I, regla 2"] },
    { "regla": 3, "estado": "no_aplicable", "motivo": "…" },
    { "regla": 4, "estado": "no_aplicable", "motivo": "…" },
    { "regla": 5, "estado": "no_aplicable", "motivo": "…" }
  ],
  "restricciones": []
}
```

## Validación (`capturar.ts`)

Un informe es **inválido**, y la revisión cuenta como fallida, si cualquiera de estas condiciones se cumple:

| # | Condición | Requisito |
|---|-----------|-----------|
| V1 | No hay exactamente un bloque `json`, o no se puede parsear | R5 |
| V2 | `tipo` no coincide con el revisor, o `sha` no es el del paquete | R4 |
| V3 | Una severidad, un estado o un número de regla fuera de sus valores | FR-008a, FR-005 |
| V4 | Las reglas no son exactamente 1, 2, 3, 4 y 5, una vez cada una | FR-005 |
| V5 | Una regla `cumplida` o `incumplida` sin `evidencia`, o una `no_aplicable` sin `motivo` | FR-006 |
| V6 | Un hallazgo con `archivo` fuera del diff y sin `contexto` | FR-004 |
| V7 | Un hallazgo `preexistente` con severidad distinta de `baja` | FR-004 |
| V8 | Un texto contiene un dato con forma real (se reutiliza el detector del #5) | FR-012 |

Respuesta del hook `SubagentStop`:
- **Válido**: guarda `informe-<tipo>.json` y sale con 0.
- **Inválido y `stop_hook_active` falso**: sale con 2; stderr lista las condiciones incumplidas para que el revisor corrija.
- **Inválido y `stop_hook_active` verdadero**: guarda `fallo-<tipo>.json` con la causa y sale con 0.
- **Error interno**: guarda `fallo-<tipo>.json` con la causa y sale con 0. Nunca guarda un informe sin validar.

## Decisión (`revision.ts decidir <sha>`)

Salida por stdout, en JSON:

```json
{
  "sha": "<40 hex>",
  "permite": false,
  "motivos": ["Regla 2 incumplida: src/politica/umbrales.ts:3", "Hallazgo alto: src/agente/flujo.ts:88"],
  "conteos": { "critica": 0, "alta": 1, "media": 2, "baja": 0, "cumplidas": 1, "incumplidas": 1, "no_aplicables": 3 },
  "revisiones": { "codigo": "valida", "cumplimiento": "valida" },
  "comentarios": { "codigo": "<markdown>", "cumplimiento": "<markdown>" }
}
```

`permite` es `false` si y solo si: alguna regla está `incumplida`, o algún hallazgo o restricción es `alta` o `critica`, o alguna revisión es `fallida`.

## Comentario de registro

```markdown
<!-- crediagil:revision={tipo};commit={sha} -->
🔎 **Revisión de {código | cumplimiento}** · commit `{sha corto}` · {✅ no bloquea | ⛔ bloquea} · {fecha}

{resumen del revisor}

**{Hallazgos por severidad | Reglas de negocio}**
- {crítica: n · alta: n · media: n · baja: n | 1 ✅ · 2 ⛔ · 3 ➖ · 4 ➖ · 5 ➖}

**{Lo que bloquea | Hallazgos}**
- {severidad o regla} — `{archivo}:{línea}` — {descripción}

<details><summary>Informe completo</summary>

```json
{informe validado}
```

</details>
```

- Como en todos los comentarios del flujo, el texto va en español y no contiene datos de solicitantes, secretos ni datos con forma real.
- El marcador es único por `(tipo, sha)`: antes de publicar se buscan los comentarios existentes (Regla 4 del flujo).
