# Quickstart: Atención de mensajes con varias preocupaciones

**Feature**: [spec.md](spec.md) · **Plan**: [plan.md](plan.md)

Cómo comprobar que el agente atiende todos los asuntos de un mensaje y responde una sola vez. Todos los datos son ficticios.

## Prerrequisitos

- Node.js ≥ 22.18 y `npm install` hecho.
- Las pruebas automáticas no necesitan clave ni red.
- Los escenarios con el modelo real usan `ANTHROPIC_API_KEY` por variable de entorno (ver [.env.example](../../.env.example)); nunca va en un archivo.

## 1. Pruebas automáticas

```text
npm test
npm run typecheck
npm run format:check
```

Esperado: todo en verde, incluidas las pruebas de los casos de las reglas de negocio del #9 al #15 sin cambios (SC-005).

## 2. Casos de demostración

Los casos están en `casos/` y se ejecutan en el chat. El resumen del analista se ve con `--demo`:

```text
npm run chat -- --demo
/caso <nombre>
```

Los tres casos nuevos se crean con la implementación:

| Caso | Pasos |
|------|-------|
| `mensaje-varios-asuntos` | Adjunta el certificado laboral y los tres extractos (documentos ficticios de `casos/extraccion-certificado/` y `casos/extraccion-extractos/`) y envía el mensaje del enunciado: «Hola, quiero pedir un crédito de $4.000.000 a 24 meses. Te pego mi certificado laboral y mis extractos de los últimos tres meses. Gano más o menos $3.500.000 al mes. ¿En cuánto me quedaría la cuota?» |
| `mensaje-varios-asuntos-con-persona` | Envía: «Quiero hablar con una persona. Además, ¿cuánto pagaría de cuota por 4 millones a 24 meses?» |
| `mensaje-varios-asuntos-escalado` | Envía un solo mensaje: «Quiero pedir un crédito de 4 millones a 24 meses. Mi sueldo me lo pagan en dólares, pero igual dime en cuánto me quedaría la cuota si cuento con 5 millones de pesos al mes.» |

El texto de `mensaje-varios-asuntos` es el literal del enunciado, sin parafrasear ([R9](research.md#r9-el-mensaje-de-ejemplo-y-los-casos-de-prueba)).

## 3. Escenarios

### Escenario 1: tres asuntos, una respuesta (US1, US2, US4)

`/caso mensaje-varios-asuntos`

Esperado:

- El solicitante recibe una sola respuesta.
- La respuesta trae el bloque «Estado de tus asuntos» con las tres líneas.
- **Cuota**: `resuelto`, con la cuota simulada y el aviso de simulación con el ingreso declarado. Para $4.000.000 a 24 meses al 1,8% mensual la cuota es de unos $206.723, el 5,91% de $3.500.000; el valor exacto lo da `calcularCuota`, no se escribe a mano en la prueba.
- **Solicitud** y **Documentos**: `pendiente`, porque falta verificar la identidad.
- La cuota es la que calcula el core: la respuesta no la inventa.
- El ingreso de $3.500.000 es una declaración: el aviso dice que no está verificado y no se preaprueba nada.
- En el chat, cada `adjuntar` del caso es un turno propio: los documentos se revisan antes del mensaje y la respuesta final muestra **Solicitud** y **Cuota**. Los tres asuntos en una misma respuesta, con **Documentos**, los comprueban las pruebas del agente con los adjuntos del turno (`agente.test.ts`).

### Escenario 2: petición de persona y cuota (FR-006)

`/caso mensaje-varios-asuntos-con-persona`

Esperado:

- El caso se escala de inmediato, sin llamar al modelo ni a ninguna herramienta.
- La respuesta dice que un analista revisará el caso y lista la **Cuota** como `pendiente`, «lo revisará el analista».
- En `--demo`, el resumen del analista trae `asuntosPendientes: cuota`.
- No hay ninguna cuota calculada.

### Escenario 3: un asunto escalado no bloquea a otro (US3, FR-004)

`/caso mensaje-varios-asuntos-escalado`

Esperado:

- **Solicitud**: `pendiente`; la causa del escalamiento es la moneda extranjera (Regla 5).
- **Cuota**: `resuelto`, con la simulación hecha después de la señal de escalamiento.
- El resumen del analista trae la causa de caso no cubierto, el monto y el plazo, y `asuntosPendientes: solicitud`.
- La respuesta sigue siendo una sola.

### Escenario 4: un asunto pendiente por un dato (US3)

Escribe un mensaje con dos asuntos y sin ingreso: «Quiero saber la cuota de 4 millones a 24 meses y también quiero iniciar mi solicitud».

Esperado: **Cuota** `pendiente` porque falta el ingreso, y **Solicitud** con su estado. El agente pide el ingreso, no lo inventa.

### Escenario 5: un solo asunto no cambia (FR-009)

`/caso demo-consulta` y `/caso escalamiento-pide-persona-con-datos`

Esperado: las mismas respuestas del #8 y del #15, sin el bloque de estado.

### Escenario 6: las reglas no se relajan (FR-007, SC-005)

Ejecuta los casos de identidad, ingreso, preaprobación y escalamiento del #9 al #15 (`casos/`).

Esperado: los mismos resultados que antes. Ningún caso que escalaba deja de escalar y ninguna preaprobación aparece donde no corresponde.

### Escenario 7: el límite de turnos alcanza ([R10](research.md#r10-el-límite-de-turnos-no-cambia))

Con un solicitante ya identificado, envía documentos y la pregunta por la cuota en un mismo mensaje.

Esperado: la conversación termina sin `limite_de_turnos`. Si escala por ese motivo, se reabre la decisión de subir `MAX_TURNOS` con ese caso como evidencia.

## 4. Revisión de los logs

Cada mensaje con varios asuntos deja un log `asuntos_atendidos` con el `correlationId` y el estado de cada asunto. No debe contener cuotas, citas ni el texto del mensaje.

## Criterios de salida

- Los siete escenarios dan lo esperado.
- `npm test` y `npm run typecheck` en verde.
- Los casos del #9 al #15 sin cambios de resultado.
