# Contrato: comandos de entrega

**Feature**: [../spec.md](../spec.md) · Requisitos: FR-008, FR-010 a FR-013

## `npm run entrega:armar`

Arma `dist/crediagil-entrega.zip` con los archivos versionados y todo `.git/`.

| Opción | Efecto |
|--------|--------|
| `--salida <ruta>` | Cambia la ruta del `.zip` (por defecto `dist/crediagil-entrega.zip`) |

Se niega a armar (código 1) si hay cambios sin commit. No sobrescribe el historial: solo lee `git`.

## `npm run entrega:verificar`

Revisa el `.zip` y el repositorio, e imprime un informe con una línea por comprobación.

| Opción | Efecto |
|--------|--------|
| `--zip <ruta>` | Revisa otro `.zip` (por defecto `dist/crediagil-entrega.zip`) |
| `--json` | Imprime además el informe como JSON |

### Comprobaciones

| Nombre | Qué verifica | Requisito |
|--------|--------------|-----------|
| `nombres` | Ninguna entrada llamada `.env` o `.env.*` (salvo `.env.example`), ni bajo `node_modules/`, `dist/`, `logs/`, ni `CLAUDE.local.md` ni `.claude/settings.local.json` | FR-011 |
| `git` | El `.zip` contiene `.git/` con `HEAD` | FR-010 |
| `peso` | El `.zip` pesa 50 MB o menos | FR-011 |
| `secretos` | Ningún archivo de texto del `.zip` tiene un detector de secreto | FR-011, FR-012 |
| `historial` | `git log --all -p` sin detectores y `origin/main` es antepasado de `HEAD` | FR-011, FR-013 |
| `specs` | Cada carpeta de `specs/` tiene `spec.md`, `plan.md`, `tasks.md` e `Issue de origen`; existe la constitución | FR-007, FR-008 |

### Detectores de secreto

Token de GitHub (`ghp_…`, `github_pat_…`), clave de la API de Claude (`sk-ant-…`), `Authorization: Bearer` con valor literal, `GIT_HUB=` o `ANTHROPIC_API_KEY=` con valor no vacío, bloque de clave privada y credenciales dentro de una URL. La plantilla `.env.example` (variables sin valor) no dispara ninguno.

### Código de salida

| Código | Significado |
|--------|-------------|
| 0 | `listo`: todas las comprobaciones en `ok` |
| 1 | `bloqueado`: al menos un hallazgo |
| 2 | Opciones inválidas, o el `.zip` no existe o no se puede leer |
| 3 | `incompleto`: sin hallazgos, pero alguna comprobación no verificable (por ejemplo, sin `origin/main`); no es éxito |

### Salida

```text
nombres     ok
git         ok
peso        ok          (23,4 MB de 50 MB)
secretos    hallazgos   1
historial   ok
specs       ok
Veredicto: bloqueado
  secreto · .git/config · credenciales dentro de una URL
```

La salida nunca muestra el valor encontrado.
