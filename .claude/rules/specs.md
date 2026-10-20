---
paths:
  - "specs/**"
---

# Especificaciones: reglas

- Cada `spec.md` lleva en su cabecera la línea `**Issue de origen**: [fabisahe29/CREDIAGIL#<N> — <título>](<url>)`. Sin ella, los comandos `/ticket-*` y los hooks no pueden vincular la spec con su ticket.
- Las specs, planes y tareas van en español.
- Cada criterio de aceptación del issue se traza en la spec con al menos un requisito o escenario. Lo que el issue declara fuera de alcance no se especifica.
- Las preguntas que el issue reserva para `/speckit.clarify` no se responden por supuesto en la spec: se dejan marcadas para aclarar.
- Las decisiones del plan que tienen una alternativa descartada se registran también en `docs/registro-decisiones.md`. `DECISIONES.md` es el resumen de dos páginas por necesidad del ecosistema y solo cambia si cambia el mecanismo de una necesidad.
- Los documentos de una feature no contienen datos de solicitantes reales ni secretos.
