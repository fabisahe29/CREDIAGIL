# Contrato: módulo de política del escalamiento

**Feature**: [../spec.md](../spec.md) · **Research**: R1, R2, R5, R9, R14 · **Zona**: [`src/politica/`](../../../src/politica/) (regla [politica.md](../../../.claude/rules/politica.md))

Un módulo nuevo, [src/politica/escalamiento.ts](../../../src/politica/escalamiento.ts), con funciones puras: ninguna llama al modelo ni lee el core. Las usan el core, el agente y las pruebas, así que no pueden discrepar. Los umbrales ($5.000.000, 30%, 10%) y la tasa **no** se repiten aquí: siguen solo en `politica.ts`.

## Exportaciones

| Nombre | Tipo | Descripción |
|--------|------|-------------|
| `CAUSAS_ESCALAMIENTO` | tupla | Las cinco causas de la spec. |
| `MOTIVOS_ESCALAMIENTO` | tupla | Los doce motivos de la señal. |
| `ACCIONES_RECOMENDADAS` | tupla | Las siete acciones. |
| `PENDIENTES` | tupla | Lo que puede faltar en un resumen. |
| `REGLA_4` | texto | «Regla 4 · el solicitante pide hablar con una persona». |
| `REGLA_PIDE_PERSONA` | texto | Alias de `REGLA_4`; conserva el nombre que ya importan el adaptador y sus pruebas. |
| `reglaDeEscalamiento(motivo)` | función | El texto de la regla de cada motivo. |
| `causaDeEscalamiento({ motivo, codigo? })` | función | La causa; ver la tabla de [R1](../research.md#r1-dos-niveles-de-clasificación-la-causa-cerrada-y-el-motivo). |
| `accionRecomendada({ motivo, codigo? })` | función | La acción; ver la tabla de [R2](../research.md#r2-la-acción-recomendada-sale-de-un-catálogo-cerrado-de-la-política). |
| `detectarPeticionPersona(texto)` | función | Si el mensaje pide explícitamente una persona. |

Una combinación imposible (un `codigo` con otro motivo que `preaprobacion_fuera_de_politica`, o ese motivo sin `codigo`) lanza un error de programación: nunca se adivina una causa.

## `detectarPeticionPersona`

**Normalización**: minúsculas, sin tildes (NFD sin marcas), signos de puntuación como espacios y espacios colapsados.

**Coincide** si hay, en el texto normalizado, un verbo **ligado a la persona**:
1. un **verbo de contacto** (`hablar`, `conversar`, `comunicar`, `contactar`, `pasar`, `transferir`, `atender` y sus formas de pedir, como `pásame` o `pasen`) con el **sustantivo de persona** a cuatro palabras o menos después; o
2. un **verbo de deseo** (`quiero`, `quisiera`, `necesito`, `prefiero`, `deseo`, `solicito`, `exijo`, `pido`) con el sustantivo de persona **justo después** («necesito un asesor»). Un verbo de deseo solo no basta: «quiero un crédito» no pide una persona; y
3. **ninguna negación** (`no`, `ni`, `sin`, `nunca`, `tampoco`, `jamás`) en las tres palabras anteriores al verbo **dentro de la misma oración**: una coma, un punto u otro signo de pausa corta la negación («No, quiero hablar con una persona» sí coincide).

Los sustantivos de persona son una lista cerrada (`una persona`, `un humano`, `un asesor`, `una asesora`, `un analista`, `un ejecutivo`, `un representante`, `alguien real`, `alguien de carne y hueso`, `un agente humano`). **«Una persona natural»** y **«jurídica»** no cuentan: son una clase de solicitante, no alguien con quien hablar («soy una persona natural» no pide nada).

Las listas son parte de la Regla 4 y viven en el módulo, no en el prompt. Una petición que no cumple las tres condiciones no se detecta por código: decide el modelo, que sigue con `solicitar_analista` (R5).

### Casos de la prueba

En `escalamiento.test.ts`, además de los de las tablas de [R1](../research.md#r1-dos-niveles-de-clasificación-la-causa-cerrada-y-el-motivo) y [R2](../research.md#r2-la-acción-recomendada-sale-de-un-catálogo-cerrado-de-la-política) fila por fila:

| Texto | Esperado |
|-------|----------|
| «Quiero hablar con una persona» | `true` |
| «Necesito un asesor humano, por favor» | `true` |
| «Pásame con un analista» | `true` |
| «Prefiero hablar con alguien real» | `true` |
| «No, quiero hablar con una persona» (la coma corta la negación) | `true` |
| «¿Puedo hablar con una persona o solo con el bot?» | `true` |
| «QUIERO HABLAR CON UNA PERSONA.» (mayúsculas y punto) | `true` |
| «Quiero 4 millones a 24 meses, pero prefiero hablar con una persona» (con datos) | `true` |
| «No quiero hablar con una persona, sigue tú» | `false` |
| «Sin hablar con un asesor, ¿cuánto pagaría al mes?» | `false` |
| «Mi asesor del banco me dijo que pidiera un crédito» (sin verbo de petición) | `false` |
| «¿Qué hace un analista de crédito?» (sin verbo de petición) | `false` |
| «Quiero un crédito de 4 millones» | `false` |
| «Quiero un crédito de 3 millones, soy una persona natural» | `false` |
| «Quiero saber si una persona con deudas puede pedir un crédito» | `false` |
| «Necesito una persona natural como codeudor» | `false` |
| «» y un texto de solo espacios | `false` |

## Las combinaciones

Una prueba recorre **todos** los motivos (los doce) y los cinco códigos de `CODIGOS_BLOQUEO`:
- cada combinación válida devuelve una causa de `CAUSAS_ESCALAMIENTO` y una acción de `ACCIONES_RECOMENDADAS`;
- cada combinación inválida lanza;
- no hay un motivo sin regla (`reglaDeEscalamiento` devuelve un texto no vacío para los doce).

Así, añadir un motivo nuevo sin causa ni acción rompe la prueba y no un escalamiento en producción.

## Versión

`VERSION_POLITICA` sube de `2026-10-18.3` a `2026-10-18.4`: la política suma `escalamiento.ts`, aunque no cambie ningún umbral.
