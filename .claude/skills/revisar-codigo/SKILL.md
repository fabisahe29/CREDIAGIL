---
name: revisar-codigo
description: "Ejecuta la revisión de código independiente del commit indicado y devuelve el informe. La invoca /ticket-abrir-pr antes de abrir el PR."
argument-hint: "<sha del commit revisado>"
context: fork
agent: revisor-codigo
background: false
user-invocable: false
allowed-tools: Read, Grep, Glob
disallowed-tools: Write, Edit, MultiEdit, NotebookEdit, Bash, PowerShell, Agent, mcp__*
---

# Revisión de código del commit `$ARGUMENTS`

Revisa el paquete de revisión `.git/crediagil/revisiones/$ARGUMENTS/` según tus instrucciones de revisor de código. Esta tarea es autocontenida: no hay conversación previa que debas conocer.

1. Lee `.git/crediagil/revisiones/$ARGUMENTS/paquete.json` y `.git/crediagil/revisiones/$ARGUMENTS/diff.patch` completo.
2. Lee la spec del ticket (campo `spec` del paquete) y, si el diff toca reglas de negocio, la constitución (campo `constitucion`).
3. Revisa el diff. El resto del repositorio solo como contexto, leyendo únicamente lo que necesites contrastar.
4. Termina con un único bloque `json` de tipo `"codigo"` y `"sha": "$ARGUMENTS"`.

Si el paquete no existe, termina con un bloque `json` de tipo `"codigo"` con `"sha": "$ARGUMENTS"`, `"hallazgos": []` y un `resumen` que diga que no encontraste el paquete. La captura lo marcará como revisión fallida.
