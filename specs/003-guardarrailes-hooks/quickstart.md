# Quickstart: validar los guardarraíles

**Feature**: [spec.md](spec.md) · **Contratos**: [contracts/hooks.md](contracts/hooks.md) y [contracts/convencion-datos-ficticios.md](contracts/convencion-datos-ficticios.md)

## Prerrequisitos

| Paso | Resultado esperado |
|------|--------------------|
| `node --version` | v22.18 o superior (en este equipo, v24.21.0) |
| Versión de Claude Code (`claude --version` o "Acerca de" en la extensión) | v2.1.295 o superior, necesaria para `onFailure: "block"` (R5) |
| `npm install` | Instala Prettier y TypeScript (solo hacen falta para formatear y para el chequeo de tipos) |
| Abrir una **sesión nueva** de Claude Code en la rama del ticket y revisar `/hooks` | Aparecen el guardián (PreToolUse) y el formateador (PostToolUse). Los hooks se leen al iniciar la sesión |

## Escenario 0: pruebas automatizadas (US5 · FR-017, FR-018 · SC-001)

| Paso | Resultado esperado |
|------|--------------------|
| `npm test` | Todas en verde. Cada control tiene casos que se bloquean y casos que pasan, con al menos 10 montos del dominio y un identificador ficticio de cada tipo |
| `npm run typecheck` | Sin errores (`strict`) |
| Ejecutar el guardián sobre los propios archivos de prueba, como si se escribieran con Write | Ningún bloqueo: no contienen datos con forma real literales (FR-018) |

## Escenario 1: datos con forma real (US1 · FR-001 a FR-004 · SC-001, SC-003)

Pedir a Claude, en una sesión nueva, cada una de estas acciones. Los valores bloqueables se le describen ("una tarjeta Visa válida inventada por ti"), no se pegan en el chat.

| Acción | Resultado esperado |
|--------|--------------------|
| Escribir en `notas.md` una tarjeta de 16 dígitos que pase Luhn | Bloqueo `datos-reales`, dato enmascarado `••••NNNN`, corrección con la convención |
| Escribir `cédula 52.xxx.xxx` (8 dígitos sin prefijo `000`) en `docs/prueba.md` | Bloqueo `datos-reales` |
| Escribir `CC 0001234567` | Permitido |
| Escribir `const TOPE = 5_000_000;` y `monto: $5.000.000 COP` | Permitido |
| `git commit -m "… tarjeta <16 dígitos Luhn>"` | Bloqueo: el texto del comando contiene el dato (FR-002) |

## Escenario 2: secretos (US2 · FR-005 a FR-007 · SC-002)

Preparación: crear a mano, fuera de Claude Code, un `.env` con `GIT_HUB=valor-de-prueba`.

| Vía (al menos 6, SC-002) | Resultado esperado |
|--------------------------|--------------------|
| Read de `.env` | Bloqueado |
| Edit de `.env` | Bloqueado |
| Bash `cat .env` | Bloqueado (FR-006) |
| Bash `cp .env /tmp/x` | Bloqueado |
| PowerShell `Get-Content .env` | Bloqueado |
| Bash `grep -r GIT_HUB .` | Bloqueado, con la sugerencia `--exclude` (FR-006a) |
| Bash `grep -r GIT_HUB . --exclude='.env*'` | Permitido |
| Bash `grep -r cuota src/` | Permitido: el alcance no contiene secretos |
| Read y Edit de `.env.example` | Permitidos (FR-007). Si la negación `!` de `deny` no funciona, aplicar la alternativa del contrato |

Al terminar, borrar el `.env` de prueba.

## Escenario 3: spec primero (US3 · FR-008 a FR-010 · SC-005)

| Rama y estado | Acción | Resultado esperado |
|---------------|--------|--------------------|
| `5-guardarrailes…`, con `specs/003-…/spec.md` apuntando al #5 | Write de `src/ejemplo.ts` | Permitido |
| Rama temporal `99-prueba`, sin spec del #99 | Write de `src/ejemplo.ts` | Bloqueo `spec-primero` que nombra el #99 |
| Rama `99-prueba` | Write de `src/ejemplo.test.ts` | Bloqueado (Q1: los tests bajo `src/` también) |
| Rama `99-prueba` | Write de `docs/x.md` | Permitido |
| Rama `99-prueba` | Bash `echo x > src/a.ts` | Bloqueado |
| `main` | Write de `src/ejemplo.ts` | Bloqueo que sugiere `/ticket-tomar` |
| `99-prueba` | Write de `src/x.ts` con una tarjeta Luhn | **Un** mensaje con los dos motivos (FR-014) |

Al terminar, borrar `src/ejemplo.ts`, la rama `99-prueba` y los archivos de prueba.

## Escenario 4: formato (US4 · FR-011, FR-012 · SC-004)

| Acción | Resultado esperado |
|--------|--------------------|
| Pedir a Claude que escriba un `.ts` mal indentado, en una rama con spec | Al terminar, el archivo queda formateado |
| Pedir una edición que deja un error de sintaxis | Edición conservada y aviso "Formato omitido…" |
| Editar un `.md` | Sin cambios de formato ni aviso |
| `npm run format:check` | 0 diferencias |

## Escenario 5: fallar cerrado (FR-015)

| Acción | Resultado esperado |
|--------|--------------------|
| Ejecutar el guardián con un JSON sin `tool_name` (`echo '{}' \| node .claude/hooks/guardian.ts`) | Respuesta *deny* con `error-interno` y su causa |

## Escenario 6: decisiones (US5 · FR-019 · SC-007)

`DECISIONES.md` tiene la entrada del #5 con R1, R2, R3, R4, R5, R7, R8 y R10, cada una con su alternativa descartada, y menciona los riesgos de R9.
