# Contrato: herramienta del agente, control de identidad y prompt

**Feature**: [../spec.md](../spec.md) · **Research**: R3, R4, R5, R6, R10 · **Zona**: [`src/agente/`](../../../src/agente/)

## Herramienta del adaptador

En [adaptador.ts](../../../src/agente/adaptador.ts), servidor SDK `originacion`. Su clave completa para el modelo es `mcp__originacion__registrar_solicitud`.

- **Descripción**: `DESCRIPCION_REGISTRAR_SOLICITUD`, la misma del core.
- **Sin** `readOnlyHint`: tiene efectos.
- **Esquema de entrada**:

| Campo | Esquema | Descripción para el modelo |
|-------|---------|----------------------------|
| `idSolicitante` | `z.string()` | Identificador del solicitante verificado que devolvió `buscar_solicitante` (`CLI-…`). |
| `monto` | `z.number()` | Monto que dijo el solicitante, en pesos colombianos. No lo inventes. |
| `plazoMeses` | `z.number()` | Plazo en meses que dijo el solicitante. |
| `origen.monto` | `Cita` | De dónde salió el monto. |
| `origen.plazoMeses` | `Cita` | De dónde salió el plazo. |
| `origen.ingresoDeclarado` | `Cita` opcional | De dónde salió el ingreso declarado; solo si ya lo enviaste a `verificar_ingreso`. |

Una `Cita` es `{ fragmento: z.string(), adjunto: z.number().optional() }`:
- sin `adjunto`: el `fragmento` es una frase **literal** del solicitante;
- con `adjunto`: el `fragmento` es del texto de ese documento, por número, como en `extraer_documento`.

El modelo **no** envía la clave de idempotencia, el nombre del documento, ni el ingreso verificado, las discrepancias o los datos extraídos (R2, R6). Como en el #12, el esquema del adaptador no exige enteros ni positivos: un valor inválido llega al core y vuelve con su error tipado.

### Manejador

```text
registrarSolicitud({ idSolicitante, monto, plazoMeses, origen })
  1. arma la procedencia de cada dato:
       - sin adjunto: afirmacion, si el fragmento está en un mensaje del solicitante
       - con adjunto: documento (adjunto y nombre del adjunto), si existe y el fragmento está en su contenido
     un fallo es el error procedencia_invalida con su campo (no llama al core)
  2. claveIdempotencia = huella(JSON.stringify([idSolicitante, monto, plazoMeses]))
  3. llamarConReintentos("registrar_solicitud", core.registrarSolicitud(...))
  4. aResultadoMcp(respuesta reducida a { idSolicitud, estado, repetida })
```

- Una afirmación se compara con los mensajes del solicitante de la conversación: los turnos `solicitante` del historial y el mensaje nuevo, sin tildes ni mayúsculas y con los espacios colapsados (`contieneFragmento`). Esos mensajes llegan al adaptador por la opción `mensajesSolicitante`, que arma `agente.ts`.
- Si la respuesta es un error, pasa tal cual al modelo (no se reduce).
- Usa los reintentos acotados y el tiempo límite de las demás herramientas. Si se agotan, deja la señal `falla_transitoria_persistente` (Principio VI).
- **No** emite eventos de negocio ni deja señal por su cuenta.
- El modo de demostración del chat la muestra con `alUsarHerramienta`.
- El adaptador **no** expone una herramienta de lectura del registro (R8).

### Excepción de `llamarConReintentos` tras la Regla 3 (R5)

Hoy `llamarConReintentos` devuelve `transitorio_agotado` de inmediato si `estado.escalamiento !== null`. Se agrega una excepción:

```ts
/** Señales de la Regla 3: la solicitud todavía se registra para que el analista la reciba (R5). */
export const MOTIVOS_QUE_ADMITEN_REGISTRO: readonly SenalEscalamiento["motivo"][] = [
  "discrepancia_de_ingreso",
  "inconsistencia_documental",
];
```

`llamarConReintentos` no corta cuando la herramienta es `registrar_solicitud` y el motivo vigente está en esa lista. Cualquier otra herramienta, o cualquier otra señal, sigue cortando.

## Control de identidad

[control-identidad.ts](../../../src/agente/control-identidad.ts) cambia en dos puntos:

1. `HERRAMIENTAS_CON_IDENTIDAD` pasa de `["extraer_documento", "verificar_ingreso"]` a `["extraer_documento", "verificar_ingreso", "registrar_solicitud"]`. Se actualiza el comentario que anunciaba el #13.
2. Antes de denegar por «conversación escalada», el hook deja pasar la herramienta `registrar_solicitud` si el motivo vigente está en `MOTIVOS_QUE_ADMITEN_REGISTRO`. Después sigue el flujo normal: consulta la identidad al core y bloquea si no está verificada o es de otro solicitante.

```text
PreToolUse(registrar_solicitud)
  si hay señal de escalamiento y su motivo NO admite registro → deny «ya pasó a un analista»
  idSolicitante = tool_input.idSolicitante (si es texto)
  consulta identidad al core (con reintentos)
     core no responde      → bloquear + señal falla_transitoria_persistente (FR-009)
     no verificada         → bloquear: bloqueo_por_regla, Regla 1 (FR-006, FR-010)
     de otro solicitante   → bloquear: la verificación no se transfiere (FR-008)
     verificada y coincide → permitir
```

- El hook **decide solo con lo que guarda el core**. `tool_input.idSolicitante` solo sirve para comparar con la persona verificada; que el modelo afirme que la identidad ya está verificada no cambia nada (FR-007).
- El motivo que recibe el modelo es accionable: «Regla 1: la identidad del solicitante no está verificada.» El evento `bloqueo_por_regla` ya trae el siguiente paso para el solicitante (FR-010).
- La Regla 5 antes de la 1 (`antesDeRegla1`) solo aplica a `extraer_documento`; no cambia.

### Pruebas (FR-013, sin el modelo)

En `control-identidad.test.ts`, con un core falso y una entrada de hook para `mcp__originacion__registrar_solicitud`:

| Caso | Esperado |
|------|----------|
| Identidad sin verificar | `deny`, evento `bloqueo_por_regla` con la Regla 1, el core falso no recibió ningún registro |
| Identidad verificada de otra persona | `deny`; el motivo dice que es de otro solicitante |
| Identidad verificada y coincide | `{}` (pasa) |
| El modelo afirma en su entrada que está verificada (campo extra) | La decisión sale del core: con la identidad sin verificar, `deny` |
| El core no responde tras los reintentos | `deny` y señal `falla_transitoria_persistente` |
| Señal `discrepancia_de_ingreso` o `inconsistencia_documental`, identidad verificada | `{}` (pasa) |
| Señal `pide_persona`, `caso_no_cubierto` o `falla_transitoria_persistente` | `deny` por escalada |
| Señal de la Regla 3 e identidad sin verificar | `deny` por identidad |
| `solicitar_analista` con señal de la Regla 3 | `deny` por escalada (la excepción es solo del registro) |

## Prompt (`agente.ts`)

Se agregan estas instrucciones tras las de `calcular_capacidad_pago`; no cambia ninguna existente:

- «Cuando el solicitante verificado confirme que quiere registrar su solicitud con un monto y un plazo que dijo, llama a registrar_solicitud con su idSolicitante, el monto, el plazo y, en origen, una cita literal de lo que dijo el solicitante para cada dato. Si falta el monto o el plazo, pídelo.»
- «No registres con datos que no dijo el solicitante ni con citas que no sean suyas. El ingreso verificado, las discrepancias y los datos extraídos los toma el sistema: no los envíes.»
- «Si verificar_ingreso devuelve escalada por discrepancia o inconsistencia y el solicitante ya dijo monto y plazo, llama a registrar_solicitud antes de responder, para que el analista reciba la solicitud registrada. Registrar no preaprueba ni decide.»
- «Si registrar_solicitud rechaza un dato por su origen, corrígelo con una cita literal del solicitante y vuélvelo a intentar una vez; no inventes la cita. Esta es la única excepción a no reintentar un error.»
- «Si registrar_solicitud dice que ya hay una solicitud abierta, infórmalo; no la cambies ni registres otra.»

`agente.test.ts` verifica que el prompt nombra `registrar_solicitud`, que dice que el sistema toma el ingreso verificado, y que conserva «no apruebas ni rechazas».

`agente.ts` también pasa a `crearAdaptador` la opción `mensajesSolicitante`: los textos de los turnos `solicitante` del historial más el mensaje nuevo.

## Lo que no cambia

- Los eventos de negocio y su catálogo.
- El orden de prevalencia de reglas (4 → 5 → 1 → 3 → 2) y los motivos de escalamiento.
- Las herramientas del #7 al #12, salvo el efecto de la excepción de R5 sobre `registrar_solicitud`.
- El comportamiento del hook para `solicitar_analista`, `extraer_documento`, `verificar_ingreso` y `calcular_capacidad_pago`.
