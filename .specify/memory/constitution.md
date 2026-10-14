

# Constitución de Crediágil — Agente de Originación de Crédito

## Core Principles

### I. Reglas de negocio inmutables (NO NEGOCIABLE)

Las reglas de originación de Crediágil son parte del enunciado y no se negocian, ni se
parametrizan para relajarlas, ni el modelo las reinterpreta:

1. Ninguna solicitud se registra sin identidad del solicitante verificada.
2. Una solicitud con monto ≤ $5.000.000 COP cuya cuota mensual sea ≤ 30% del ingreso
   mensual verificado PUEDE preaprobarse automáticamente. Cualquier otro caso MUST ir a
   un analista de crédito.
3. El ingreso verificado MUST salir de los documentos de soporte, nunca de lo que el
   solicitante declara. Si |ingreso declarado − ingreso verificado| / ingreso verificado
   > 10%, la solicitud MUST ir a un analista.
4. Si el solicitante pide explícitamente hablar con una persona, MUST escalarse de
   inmediato, sin investigar ni extraer datos antes.
5. Si la política no cubre el caso (p. ej. ingresos en moneda extranjera o un tipo de
   documento no soportado), el agente MUST escalar en lugar de improvisar.

La tasa de interés es fija: 1,8% mensual (ficticia). Los umbrales ($5.000.000, 30%, 10%) y la
tasa MUST vivir en un único módulo de política, versionado y cubierto por pruebas.

Orden de evaluación obligatorio: regla 4 → regla 5 → regla 1 → regla 3 → regla 2.

**Razón**: son el criterio de evaluación del producto. Un solo caso que viole una regla
invalida la solución, sin importar la calidad del resto.

### II. Datos exclusivamente ficticios (NO NEGOCIABLE)

- Todo dato de solicitantes, empleadores, cuentas, documentos e ingresos MUST ser ficticio.
- Ningún dato real puede aparecer en código, fixtures, documentos de prueba, logs,
  configuración, prompts, issues ni commits.
- Los documentos de prueba (certificados laborales, extractos, etc.) los crea el equipo e
  incluyen a propósito casos con datos faltantes, inconsistentes y fuera de política.
- Los identificadores ficticios SHOULD ser reconocibles como tales (p. ej. dominios
  `.example`, nombres y NIT inventados) para que nadie los confunda con datos reales.

**Razón**: es una restricción explícita del enunciado y protege a terceros y al evaluado.

### III. Decisiones y cálculos deterministas

- El modelo (LLM) se encarga de comprender la conversación y extraer datos estructurados.
  El cálculo de la cuota, la validación de consistencia y la decisión de política MUST
  ejecutarse en código determinista, nunca "a criterio" del modelo.
- La cuota MUST calcularse con amortización de cuota fija (sistema francés):
  `cuota = P · i / (1 − (1 + i)^−n)`, con `i = 0,018`.
- Los montos MUST manejarse en pesos enteros o con aritmética decimal exacta; está
  prohibido decidir umbrales con comparaciones sobre flotantes sin redondeo definido.
- Toda extracción MUST validarse contra un esquema tipado (p. ej. Zod). Un dato que no
  pasa el esquema se trata como faltante, no se adivina.
- Cada decisión MUST producir un resultado explicable: regla aplicada, valores usados y
  motivo, en un formato estructurado.

**Razón**: las reglas son numéricas y auditables; dejar la aritmética o el umbral al modelo
introduce errores no reproducibles.

### IV. Acciones solo a través de herramientas MCP

- El agente MUST actuar sobre los sistemas de Crediágil únicamente mediante herramientas del
  servidor MCP propio que simula el core de originación (verificar identidad, registrar
  solicitud, preaprobar, escalar a analista, etc.).
- El servidor MCP MUST aplicar de nuevo las reglas críticas del lado del servidor (defensa en
  profundidad): p. ej. rechazar el registro si la identidad no está verificada, o rechazar
  una preaprobación que no cumple la regla 2, aunque el agente la haya pedido.
- Cada herramienta MUST tener un contrato de entrada/salida tipado y documentado, y
  errores explícitos y legibles por el agente.

**Razón**: separar el razonamiento del agente de la ejecución sobre el core garantiza que
una mala decisión del modelo no se convierta en un efecto no permitido.

### V. Escalar ante la duda

- Ante datos faltantes, documentos ilegibles o contradictorios, identidad no verificable,
  moneda extranjera, tipo de documento no soportado o cualquier caso no previsto, el agente
  MUST escalar a un analista con un resumen estructurado del caso y el motivo.
- El agente MUST NOT inventar datos, suponer ingresos ni completar campos faltantes.
- Escalar MUST NOT perder información: el analista recibe lo extraído, lo validado y lo
  pendiente.

**Razón**: el costo de una preaprobación incorrecta es mucho mayor que el de una revisión
humana adicional.

### VI. Observabilidad y resiliencia

- Logs estructurados (JSON) con un `correlationId` por solicitud, que acompaña cada turno del
  agente, cada llamada a herramienta MCP y cada decisión de política.
- Cada decisión (preaprobación, escalamiento, rechazo de registro) MUST dejar un registro de
  auditoría con regla aplicada, entradas relevantes, resultado y marca de tiempo.
- Los logs MUST NOT contener el contenido completo de los documentos; se registran
  metadatos y campos extraídos necesarios para auditar (que en todo caso son ficticios).
- Las herramientas MCP con efectos (registrar, preaprobar, escalar) MUST ser idempotentes
  mediante una clave de idempotencia por solicitud.
- Las llamadas al modelo y al servidor MCP MUST tener tiempo límite y reintentos acotados
  con backoff. Si se agotan, la solicitud se escala; nunca se decide sin respuesta.
- Los errores MUST propagarse con tipo y causa, nunca silenciarse.

**Razón**: un flujo de crédito debe poder reconstruirse paso a paso para explicar por qué
se tomó cada decisión y recuperarse de fallas sin duplicar efectos.

## Restricciones técnicas y de dominio

- **Lenguaje**: TypeScript en Node.js LTS, con `strict` activado. No se usa `any` sin
  justificación documentada.
- **Agente**: Claude Agent SDK. El servidor de herramientas se construye con el SDK oficial
  de MCP para TypeScript.
- **Entrada**: los documentos llegan como texto, pegados en el chat o como archivos `.txt`
  o `.md`. Imágenes, PDF escaneados u otros formatos se consideran no soportados y se
  escalan (regla 5).
- **Moneda**: pesos colombianos (COP) ficticios. Cualquier otra moneda se escala.
- **Secretos**: claves de API solo por variables de entorno; nunca en el repositorio. Se
  versiona un `.env.example` sin valores reales.
- **Simplicidad**: el core de originación es una simulación; se evita infraestructura que el
  enunciado no exige (YAGNI). Toda complejidad adicional MUST justificarse en el plan.

## Flujo de trabajo y puertas de calidad

- **Repositorio**: repositorio propio en GitHub con acceso para los evaluadores. El backlog
  vive en un GitHub Project vinculado; cada historia o tarea es un issue trazable.
- **Trabajo individual**: la prueba es individual y el escenario asignado no se cambia.
- **Spec Kit**: cada funcionalidad pasa por especificación → plan → tareas → implementación.
  El plan MUST incluir una verificación explícita contra esta constitución.
- **Pruebas obligatorias**:
  - Pruebas unitarias del módulo de política y del cálculo de cuota, incluidos los bordes
    exactos ($5.000.000, 30%, 10%).
  - Pruebas de las herramientas MCP, incluido el rechazo del lado del servidor.
  - Escenarios de punta a punta con documentos ficticios: caso preaprobable, monto alto,
    cuota alta, ingreso inconsistente, identidad no verificada, petición de humano, moneda
    extranjera, documento no soportado y datos faltantes.
- **Commits y PR**: mensajes convencionales (`feat:`, `fix:`, `docs:`…). Ningún cambio se
  integra con pruebas en rojo.

## Governance

- Esta constitución prevalece sobre cualquier otra práctica, plantilla o preferencia del
  proyecto. Las reglas de negocio del Principio I solo cambian si cambia el enunciado.
- **Enmiendas**: se proponen como PR que modifica `.specify/memory/constitution.md`, con el
  motivo y el impacto en especificaciones y planes existentes.
- **Versionado** (SemVer):
  - MAJOR: se elimina o redefine un principio de forma incompatible.
  - MINOR: se agrega un principio o sección, o se amplía de forma material una guía.
  - PATCH: aclaraciones, redacción o erratas sin cambio de significado.
- **Cumplimiento**: cada plan (`/speckit-plan`) y cada revisión de PR MUST verificar los seis
  principios. Las desviaciones MUST quedar justificadas por escrito en el plan, y nunca
  aplican a los Principios I y II.

**Version**: 1.0.0 | **Ratified**: 2026-10-14 | **Last Amended**: 2026-10-14
