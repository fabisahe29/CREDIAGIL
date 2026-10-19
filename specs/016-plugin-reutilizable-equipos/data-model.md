# Modelo de datos: Plugin reutilizable para otros equipos

**Feature**: [spec.md](spec.md) · **Plan**: [plan.md](plan.md)

No hay base de datos. Son los archivos y las estructuras que intercambian el generador, las pruebas, la verificación y el equipo destino. Todos los ejemplos son ficticios.

## Pieza

Un archivo genérico que viaja en el plugin. Se define una sola vez en `scripts/plugin/piezas.ts`.

| Campo | Tipo | Regla |
|-------|------|-------|
| `fuente` | ruta relativa a la raíz de este repositorio | Debe existir. Vive en `.claude/`. |
| `destino` | ruta relativa a `plugins/crediagil-controles/` | Única entre piezas. |
| `clase` | `hook` · `control` · `subagente` · `skill` | Cubre FR-001: al menos una de `hook`, `subagente` y `skill`. |

**Reglas**
- El contenido de `destino` es idéntico al de `fuente` (R3, FR-021).
- Ninguna `fuente` puede estar en la lista de exclusiones de FR-020: `spec-primero`, `puerta-pr`, `formatear`, `.claude/revision/`, comandos `/ticket-*`, skills `speckit-*`, `src/`.
- Ni `fuente` ni `destino` contienen términos de [portabilidad](research.md#r12-portabilidad-términos-prohibidos) (FR-005, FR-022).

## Paquete

El plugin publicado.

| Campo | Origen | Regla |
|-------|--------|-------|
| `name` | `plugin.json` | `crediagil-controles`; igual al nombre del catálogo (R1). |
| `version` | `plugin.json` | SemVer. Se sube a mano al cambiar una pieza (R13). |
| `description` | `plugin.json` | Sin referencias propias. |
| piezas | generador | Lista completa de las `Pieza`. |
| manifiestos | a mano | `plugin.json`, `hooks/hooks.json`, `README.md`. |

## Catálogo

`.claude-plugin/marketplace.json`.

| Campo | Regla |
|-------|-------|
| `name` | Nombre del catálogo, el que usa el equipo al instalar. |
| `owner` | Nombre del equipo, no una cuenta personal. |
| `plugins[]` | Una entrada por plugin: `name`, `source` (ruta relativa al plugin) y `description`. Sin `version` (R13). |

Forma exacta en [contracts/catalogo-y-manifiesto.md](contracts/catalogo-y-manifiesto.md).

## Configuración del equipo

Vive en el repositorio del equipo, nunca en el plugin (R6).

| Archivo | Obligatorio | Contenido | Si falta | Si es inválido |
|---------|-------------|-----------|----------|----------------|
| `.claude/reglas-equipo.md` | Para usar el revisor | Reglas a auditar, una por encabezado | El revisor lo informa y no audita (FR-008) | El revisor informa qué regla no se entiende |
| `.claude/controles-equipo.json` | No | `prefijoFicticio` | El hook usa `"000"` y lo dice en el bloqueo | El hook bloquea con error legible (FR-011) |

Formato en [contracts/configuracion-equipo.md](contracts/configuracion-equipo.md).

## Resultado de verificación

Lo produce `verificar-instalacion.ts` por cada ejecución.

| Campo | Tipo | Regla |
|-------|------|-------|
| `pieza` | `hook` · `subagente` · `skill` | Una entrada por clase. |
| `estado` | `aprobada` · `reprobada` · `no_verificable` | `no_verificable` cuando no se puede ejecutar la comprobación (por ejemplo, sin CLI). Nunca cuenta como aprobada. |
| `causa` | texto | Obligatoria si `estado` no es `aprobada`. |
| `comprobaciones` | lista de `{ nombre, resultado }` | Una por comprobación de R11. |

Las ejecuciones repetidas producen el mismo resultado desde cero (SC-007).

## Relaciones y transiciones

- Un **Catálogo** lista uno o más **Paquetes**. Un **Paquete** se compone de **Piezas** más sus manifiestos.
- La **Configuración del equipo** la leen las piezas `hook` y `subagente`; no pertenece al **Paquete**.
- Un **Resultado de verificación** se produce por **Pieza**, nunca por **Paquete** completo.
- Estados de una pieza en el repositorio de prueba: *sin instalar* → *instalada* → *aprobada* o *reprobada*. Si no se puede comprobar, queda en *instalada* con estado `no_verificable`.
