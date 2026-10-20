# Quickstart: validar el plugin de punta a punta

**Feature**: [spec.md](spec.md) · **Plan**: [plan.md](plan.md)

Guía para comprobar que el plugin funciona. Los comandos de la CLI se confirmaron en el punto c de [R9](research.md#r9-puntos-por-verificar-antes-de-construir).

## Requisitos

- Node.js ≥ 22.18 y la CLI de Claude Code, en el equipo de quien verifica.
- Este repositorio con las dependencias instaladas (`npm install`).
- Un repositorio de prueba distinto de este. Lo crea el script de verificación; para la prueba manual, una carpeta vacía con `git init`.

## 1. Pruebas del repositorio (sin instalar nada)

```text
npm run plugin:generar
npm test
npm run typecheck
```

Esperado:
- El generador copia las piezas y termina sin error.
- La prueba de sincronía pasa: ninguna copia difiere de su fuente (FR-021).
- La prueba de portabilidad pasa: cero coincidencias de términos prohibidos (FR-005, SC-003).
- Todas las pruebas existentes siguen en verde (SC-006).

## 2. La deriva se detecta (historia 6)

1. Edita una línea de `.claude/hooks/lib/datos-reales.ts`. No regeneres.
2. Ejecuta `npm test`.
3. Esperado: falla la prueba de sincronía y nombra `hooks/lib/datos-reales.ts`.
4. Revierte el cambio.

Para la referencia propia (FR-022): añade el texto `specs/` en un comentario de una pieza, ejecuta `npm run plugin:generar` y espera que se detenga señalando la pieza y el término. Revierte.

## 3. Verificación automática en un repositorio de prueba (historia 4)

```text
npm run plugin:verificar
```

Esperado: un resultado por pieza (`hook`, `subagente`, `skill`) con `aprobada`, `reprobada` o `no_verificable` y su causa, según [contracts/verificacion.md](contracts/verificacion.md). Repetirlo da el mismo resultado (SC-007).

## 4. Instalación manual en otro repositorio (historias 1 y 2)

En el repositorio de prueba:

1. Registra el catálogo de este repositorio y instala `crediagil-controles` desde la CLI. Los comandos exactos están en `docs/plugin-controles.md`.
2. Comprueba que el subagente, la skill y el hook aparecen disponibles, sin haber copiado archivos.
3. **Hook**: pide a Claude que escriba un archivo de texto con una línea «cédula» seguida de un número de 10 dígitos que no empiece por `000`. Esperado: queda bloqueado y el valor sale enmascarado. Repite con un número que empiece por `000`: no se bloquea.
4. **Sin configuración**: pide una revisión con la skill sin tener `.claude/reglas-equipo.md`. Esperado: informa `sin_configuracion` y no audita (FR-008).
5. **Con configuración**: crea `.claude/reglas-equipo.md` con una regla de [contracts/configuracion-equipo.md](contracts/configuracion-equipo.md), haz un cambio que la incumpla y pide la revisión. Esperado: la regla aparece como `incumplida` con archivo y línea, y el revisor no modifica ningún archivo.
6. **Desinstala** el plugin. Esperado: las piezas dejan de estar disponibles y no queda ningún archivo del plugin dentro del repositorio de prueba (FR-004).

## 5. Actualización sin perder la configuración (FR-013)

1. Con el plugin instalado y `.claude/reglas-equipo.md` creado, sube la versión en `plugin.json` y regenera.
2. Actualiza el plugin desde la CLI.
3. Esperado: la versión nueva queda instalada y `.claude/reglas-equipo.md` sigue intacto.

## 6. Lectura por una persona ajena (SC-005)

Pide a alguien que no conozca el proyecto que haga los pasos 4 a 6 usando solo `docs/plugin-controles.md`. Anota si lo logró sin ayuda y en cuánto tiempo (meta de SC-001: menos de 10 minutos para instalar).

## Resultado esperado

Con los seis pasos en verde, quedan cubiertos FR-001 a FR-022 y SC-001 a SC-007. Lo que dependa de un punto sin confirmar de R9 se anota como «no verificable» con su causa, no como aprobado.
