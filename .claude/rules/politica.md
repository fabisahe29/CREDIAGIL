---
paths:
  - "src/politica/**"
---

# Módulo de política: reglas

- Los umbrales y la tasa se definen **solo** en este módulo, en una única fuente de configuración versionada. Ningún otro archivo los repite como literal.
- Las reglas de negocio y su orden de evaluación se implementan tal como los fija la [constitución](../../.specify/memory/constitution.md), Principio I. No se relajan, no se parametrizan para relajarlas y no se reinterpretan.
- Tipos de los montos: `number` entero de pesos o un tipo decimal exacto. Cada comparación contra un umbral usa ese tipo. Si hay que redondear, la función de redondeo se nombra y se prueba (Principio III).
- La cuota se calcula en código determinista, nunca la estima el modelo (Principio III).
- Cada decisión devuelve un resultado estructurado: regla aplicada, valores usados y motivo.
- Una entrada que no pasa su esquema tipado se trata como dato faltante y escala; no se completa ni se adivina.
- Todo cambio en este módulo incluye o actualiza su `*.test.ts` con los casos de borde.
