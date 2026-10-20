# Modelo de datos: Paquete de entrega

Estructuras en memoria del módulo `src/entrega/`. No hay almacenamiento: el único artefacto es el `.zip` de `dist/`.

## EntradaZip

Un archivo dentro del `.zip`.

| Campo | Tipo | Notas |
|-------|------|-------|
| `ruta` | texto | Con `/`, relativa a la raíz del repositorio (por ejemplo `.git/config`) |
| `tamano` | entero | Bytes sin comprimir |
| `contenido` | bytes | Solo se carga para los archivos de texto que se escanean |

## Hallazgo

Un incumplimiento encontrado por la verificación.

| Campo | Tipo | Notas |
|-------|------|-------|
| `tipo` | `nombre-prohibido` · `falta-git` · `peso` · `secreto` · `spec-incompleta` · `historial` | Cerrado |
| `ubicacion` | texto | Ruta dentro del `.zip` o carpeta de `specs/`; para el historial, el commit |
| `detalle` | texto | Qué regla incumple. **Nunca** incluye el valor del secreto, solo su tipo |

## InformeEntrega

Resultado de `entrega:verificar`.

| Campo | Tipo | Notas |
|-------|------|-------|
| `zip` | texto | Ruta del archivo revisado |
| `tamanoBytes` | entero | Debe ser ≤ 50 MB |
| `comprobaciones` | lista de `{ nombre, estado }` | `estado`: `ok` · `hallazgos` · `no verificable` |
| `hallazgos` | lista de `Hallazgo` | Vacía si todo está bien |
| `veredicto` | `listo` · `bloqueado` · `incompleto` | `incompleto` si alguna comprobación fue «no verificable» y no hay hallazgos |

## Reglas

- Un hallazgo de cualquier tipo deja el veredicto en `bloqueado`.
- «No verificable» nunca cuenta como éxito: deja el veredicto en `incompleto`.
- El informe no imprime el contenido de ningún archivo.
- Los detectores de contenido son los mismos para el `.zip` y para el historial.
