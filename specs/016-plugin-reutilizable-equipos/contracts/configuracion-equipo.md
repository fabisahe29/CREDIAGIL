# Contrato: configuración del equipo y mensajes del hook

**Feature**: [../spec.md](../spec.md) · Requisitos: FR-007, FR-008, FR-010, FR-011, FR-013

La configuración vive en el repositorio del equipo, no en el plugin. Por eso una actualización del plugin no la toca (FR-013). Los ejemplos son ficticios.

## `.claude/reglas-equipo.md` (la lee el revisor)

Un encabezado de segundo nivel por regla. El texto debajo del encabezado dice qué se exige y puede incluir umbrales.

```markdown
# Reglas del equipo

## Los montos se manejan en enteros
Ningún monto se calcula ni se compara con flotantes. Se usa un entero en la moneda local.

## Un solo módulo define los límites
Los límites de cada proceso viven en un único archivo con pruebas en el borde exacto.
```

- Cada encabezado `##` es una regla; su texto es el criterio.
- Sin reglas o sin el archivo, el revisor informa `sin_configuracion` (FR-008).
- El revisor audita solo estas reglas. No añade las de otro equipo ni las de este proyecto.

## `.claude/controles-equipo.json` (lo lee el hook; opcional)

```json
{ "prefijoFicticio": "000" }
```

| Campo | Tipo | Regla |
|-------|------|-------|
| `prefijoFicticio` | cadena de 3 a 6 dígitos | Los números cuyo inicio, sin separadores, sea este prefijo se tratan como ficticios. Por defecto `"000"`. |

- El mínimo de 3 dígitos evita que un prefijo corto coincida con numeración real y deje pasar datos reales (Principio II).
- Un campo desconocido o un valor que no cumple la regla es un error de configuración: el hook bloquea con un mensaje legible (FR-011). No lo ignora.
- La configuración se lee solo cuando la acción trae texto que revisar. Una configuración inválida no bloquea acciones sin texto, como un `Read`.
- Un archivo ausente no es un error: se usa el valor por defecto.
- **El agente no escribe este archivo.** El control `configuracion-protegida` bloquea toda escritura de las herramientas de edición y todo comando de shell que lo nombre. Lo edita una persona fuera de la sesión.

## Mensajes de bloqueo del hook

Cada bloqueo reúne `control`, `detectado`, `regla` y `correccion`. En los controles genéricos:

- `detectado` nombra el tipo de dato y el origen, con el valor siempre enmascarado.
- `regla` explica la regla en una frase, sin rutas ni referencias a documentos de este repositorio (R4).
- `correccion` dice qué hacer. Para un dato con forma real: «Usa un número ficticio que empiece por `<prefijo>`».
- Si se aplicó el prefijo por defecto, el motivo lo indica: «convención por defecto (no hay `.claude/controles-equipo.json`)» (FR-008).

Ejemplo de error de configuración:

```text
Bloqueado: controles-equipo.json no es válido.
Detectado: "prefijoFicticio" debe tener entre 3 y 6 dígitos; se encontró "abc".
Corrección: que una persona lo corrija o lo borre (para usar el valor por defecto) fuera de la sesión: el agente no puede editar .claude/controles-equipo.json.
```

## Cómo se evalúa

- Entrada ilegible o fallo interno: el hook responde `deny` con tipo y causa del error. Nunca deja pasar la acción en silencio (FR-011).
- Dato ficticio reconocible (inicia con el prefijo): no se bloquea (FR-010).
- Dato con forma real: se bloquea antes de guardarlo (FR-010).
