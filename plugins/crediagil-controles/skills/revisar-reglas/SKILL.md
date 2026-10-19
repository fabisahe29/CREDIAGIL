---
name: revisar-reglas
description: "Revisa un cambio contra las reglas que el equipo declara en .claude/reglas-equipo.md. Úsala antes de abrir un pull request o cuando quieras comprobar que un cambio respeta las reglas del equipo."
argument-hint: "[rango de git, por ejemplo main...HEAD; sin argumento revisa los cambios sin confirmar]"
context: fork
agent: crediagil-controles:revisor-reglas
allowed-tools: Read, Grep, Glob, Bash(git diff *)
---

# Revisión de reglas del equipo

Audita el siguiente cambio con tus instrucciones de revisor de reglas. Esta tarea es autocontenida: no hay conversación previa que debas conocer.

1. Lee las reglas del equipo en `.claude/reglas-equipo.md`. Si el archivo no existe o no tiene reglas, termina con el informe `sin_configuracion`.
2. Contrasta el cambio con cada regla.
3. Termina con un único bloque `json` de tipo `reglas`, con cada regla exactamente una vez.

## Cambio a revisar

!`git diff $ARGUMENTS`

Si el cambio está vacío, dilo en el resumen y termina con `reglas` vacío: no hay nada que auditar.

---

## Guía para quien invoca la skill

**Declarar las reglas.** Crea `.claude/reglas-equipo.md` en la raíz de tu repositorio. Cada regla es un encabezado de segundo nivel y, debajo, el criterio que exiges:

```markdown
# Reglas del equipo

## Los montos se manejan en enteros
Ningún monto se calcula ni se compara con flotantes. Se usa un entero en la moneda local.
```

**Elegir qué revisar.** El argumento es un rango de git:

- `/revisar-reglas main...HEAD`: todo lo que la rama agrega respecto de `main`.
- `/revisar-reglas HEAD~1`: el último commit.
- Sin argumento: los cambios que aún no confirmas.

**Leer el informe.** Cada regla queda como `cumplida`, `incumplida` o `no_aplicable`. Una regla `cumplida` cita archivo y línea. Una regla que el revisor no entiende se informa como `no_aplicable` con el motivo: reescríbela con un criterio que se pueda comprobar.

**Qué no hace.** El revisor solo lee: no corrige ni modifica archivos, y no aplica reglas que tu equipo no haya escrito. Si falta `.claude/reglas-equipo.md`, informa `sin_configuracion` y no audita.

**Datos de ejemplo.** Usa siempre datos ficticios en las reglas y en los ejemplos: nada con forma de documento, cuenta o tarjeta real.
