---
name: revisar-cumplimiento
description: "Ejecuta la revisión de cumplimiento de las reglas de negocio sobre el commit indicado y devuelve el informe. La invoca /ticket-abrir-pr antes de abrir el PR."
argument-hint: "<sha del commit revisado>"
context: fork
agent: revisor-cumplimiento
background: false
user-invocable: false
allowed-tools: Read, Grep, Glob
disallowed-tools: Write, Edit, MultiEdit, NotebookEdit, Bash, PowerShell, Agent, mcp__*
---

# Revisión de cumplimiento del commit `$ARGUMENTS`

Audita el paquete de revisión `.git/crediagil/revisiones/$ARGUMENTS/` según tus instrucciones de auditor de cumplimiento. Esta tarea es autocontenida: no hay conversación previa que debas conocer.

1. Lee `.git/crediagil/revisiones/$ARGUMENTS/paquete.json` y `.git/crediagil/revisiones/$ARGUMENTS/diff.patch` completo.
2. Lee la constitución (campo `constitucion` del paquete), Principios I, III y IV, y la spec del ticket (campo `spec`).
3. Decide el estado de cada una de las 5 reglas con evidencia o motivo, y las restricciones que sostienen las reglas.
4. Termina con un único bloque `json` de tipo `"cumplimiento"` y `"sha": "$ARGUMENTS"`, con las 5 reglas exactamente una vez.

Si el paquete no existe, termina con un bloque `json` de tipo `"cumplimiento"` con `"sha": "$ARGUMENTS"` y las 5 reglas como `no_aplicable` con el motivo «no se encontró el paquete». La captura lo marcará como revisión fallida.
