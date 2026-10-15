---
paths:
  - "**/*.test.ts"
---

# Tests: reglas

- Un test vive junto al archivo que prueba y se llama `<archivo>.test.ts`. No se usa el sufijo `.spec`.
- Cada caso describe el comportamiento en español, por ejemplo `it("escala al analista si el monto supera el tope", …)`.
- Solo datos ficticios reconocibles como tales: dominios `.example`, nombres, NIT y empleadores inventados. Nunca datos reales copiados de ningún lado. Ver [constitución](../../.specify/memory/constitution.md), Principio II.
- Los números de documento, NIT, cuenta y tarjeta de los casos siguen la [convención de datos ficticios](../../docs/datos-ficticios.md). Si un test necesita un dato con forma real (por ejemplo, para probar un bloqueo), lo genera en tiempo de ejecución; nunca lo escribe literal.
- Los tests de la política cubren cada umbral **en el borde exacto** y en el valor inmediatamente por encima y por debajo: monto igual al tope, cuota igual al porcentaje máximo del ingreso y diferencia igual a la tolerancia.
- Los montos de los casos se escriben como enteros en pesos, igual que en el código. Nunca con flotantes.
- Ningún test depende de red, del modelo real ni de servicios externos: el core de originación y las respuestas del modelo se simulan.
- Un test que falla no se desactiva ni se marca como omitido para poder integrar. Se corrige el código o se discute el caso.
