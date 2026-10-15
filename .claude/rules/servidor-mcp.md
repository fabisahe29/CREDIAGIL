---
paths:
  - "src/mcp/**"
---

# Servidor MCP de originación: reglas

- Cada herramienta declara un esquema de entrada y otro de salida tipados, y valida la entrada antes de actuar.
- El servidor vuelve a aplicar del lado del servidor las reglas críticas, aunque el agente ya las haya aplicado: por ejemplo, rechaza registrar sin identidad verificada o preaprobar fuera de política. Ver [constitución](../../.specify/memory/constitution.md), Principio IV.
- Para decidir, las reglas se toman del módulo `src/politica/`; aquí no se duplican.
- Las herramientas con efectos (registrar, preaprobar, escalar) exigen una clave de idempotencia por solicitud. Una repetición devuelve el mismo resultado sin duplicar el efecto.
- Los errores son explícitos, tipados y legibles por el agente, con causa. Nunca se silencian (Principio VI).
- Cada llamada registra un log estructurado con el `correlationId` de la solicitud. Los logs no incluyen el contenido completo de los documentos.
