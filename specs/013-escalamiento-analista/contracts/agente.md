# Contrato: agente, entrega al analista, avisos y prompt

**Feature**: [../spec.md](../spec.md) · **Research**: R4, R5, R6, R7, R10, R12 · **Zona**: [`src/agente/`](../../../src/agente/)

## Orden de un turno

```text
conversar(mensaje)
  1. detectarPeticionPersona(mensaje)                  ← NUEVO: antes de todo
        sí → señal pide_persona; no se llama al modelo ni se clasifica ningún documento
  2. conectar el core (si no arranca: señal falla_transitoria_persistente, salvo que ya haya señal)
  3. query() con el adaptador y los hooks              (solo si no hubo señal en el paso 1)
  4. Regla 5 de los documentos al cerrar el turno
  5. cerrarTurnoIdentidad
  6. si hay señal: entregarHandoff → escalar(...)      ← NUEVO: entrega al core
```

Con el paso 1, el solicitante que pide una persona no genera ninguna llamada al modelo ni al core antes de escalar (US2, SC-002). El paso 2 sigue ocurriendo después para entregar el resumen; si el core no arranca, la causa sigue siendo la petición de persona y la entrega queda pendiente (R7).

## Herramienta `solicitar_analista` (cambios)

En [adaptador.ts](../../../src/agente/adaptador.ts). El nombre y los dos motivos no cambian; la herramienta gana tres campos opcionales (R4).

| Campo | Tipo | Notas |
|-------|------|-------|
| `motivo` | `pide_persona` o `caso_no_cubierto` | Sin cambios. |
| `causa` | `moneda_extranjera`, `documento_no_soportado` u `otro` | Sin cambios. |
| `monto` | número, opcional | Solo lo que dijo el solicitante. |
| `plazoMeses` | número, opcional | Solo lo que dijo el solicitante. |
| `origen` | `{ monto?, plazoMeses? }`, cada uno una cita | La cita literal de lo que dijo el solicitante o, con `adjunto`, del documento. |

### Manejador

```text
solicitarAnalista({ motivo, causa?, monto?, plazoMeses?, origen? })
  → por cada dato con valor y cita: armarProcedencia (la del #13)
       cita comprobada   → se guarda en estado.declarado
       cita que no pasa  → el dato queda pendiente; no falla ni se reintenta
  → deja la señal (REGLA_4 o REGLA_NO_CUBIERTO)
  → devuelve { escalada: true }
```

- **Nunca falla por un dato**: un monto sin cita, o con una que no está en lo que dijo el solicitante, no impide escalar. Queda como pendiente en el resumen.
- **No llama al core**: la entrega ocurre al cerrar el turno (R7), no durante el turno del modelo.
- La descripción se amplía con una frase: el monto y el plazo se envían solo si el solicitante los dijo, con su cita.

## `dejarSenal` (cambios)

- Agrega **cada** señal a `estado.senales`, también la que no prevalece, sin repetir `motivo` y `codigo` (R6).
- La señal principal sigue siendo `estado.escalamiento`: la primera, salvo que una de una regla anterior la reemplace con `prevalece`.
- `ORDEN_REGLA` y los textos de regla se importan de la política (R14).

## `entregarHandoff`

Una función de [agente.ts](../../../src/agente/agente.ts) que **nunca lanza**.

```text
entregarHandoff(core, estado, dormir, azar)
  entrada = {
    claveIdempotencia: huella([correlationId, "escalamiento"]),
    causa, motivo, codigo?                  ← de la señal principal, con causaDeEscalamiento
    causasAdicionales                       ← las demás de estado.senales
    declarado?                              ← de estado.declarado
  }
  → conReintentos(core.escalarAAnalista(entrada, correlationId))   (reintentos acotados, con espera creciente)
       ok               → { entrega: "entregada", handoff: resumen }
       error o agotado  → { entrega: "pendiente", handoff: null } + log de error con la causa
```

- Usa el cliente directo del core, no el adaptador: el adaptador niega toda llamada con una señal vigente.
- Un error del core que no es transitorio (`formato_invalido`, `causa_incoherente`, `resumen_invalido`) tampoco se reintenta; se registra como error y la entrega queda pendiente.
- La conversación **siempre** se escala, con o sin entrega (R7).

## Aviso al solicitante (cambios)

Los textos de `AVISOS` dicen que un analista revisará el caso y no prometen un resultado ni un contacto (FR-009). Cada motivo conserva su explicación:

| Motivo | Texto |
|--------|-------|
| `pide_persona` | «Un analista de crédito revisará tu caso.» |
| `caso_no_cubierto` | «Tu caso necesita la revisión de un analista de crédito.» |
| `preaprobacion_fuera_de_politica` | «Tu solicitud no cumple las condiciones para una preaprobación automática. Un analista de crédito revisará tu caso.» |
| `discrepancia_de_ingreso` | «Los ingresos de tus documentos no coinciden con lo que declaraste. Un analista de crédito revisará tu caso.» |
| los demás | la explicación actual, con «Un analista de crédito revisará tu caso.» al final |

La respuesta sigue terminando con «Referencia: &lt;8 caracteres del correlationId&gt;». El texto exacto de cada fila queda fijado por una prueba, que además comprueba que ninguno contiene las palabras «te contactará», «aprobada», «rechazada» ni una cifra.

## Evento `escalamiento` (cambios)

Sin tipo nuevo. `escalar()` suma a `valores` (R10):

| Clave | Valor |
|-------|-------|
| `causaEscalamiento` | `causaDeEscalamiento` de la señal principal |
| `entrega` | `entregada` o `pendiente` |
| `idEscalamiento` | solo si se entregó |

Las claves actuales (`herramienta`, `intentos`, `coincidencias`, `causa` de un caso no cubierto del #9, `adjunto`, los ingresos, `reglas`) no cambian. La clave nueva se llama `causaEscalamiento` justamente para no chocar con la `causa` del #9 (`moneda_extranjera`, `documento_no_soportado`, `otro`), que ya leen las pruebas del adaptador y del chat.

## Resultado de la conversación (cambios)

`ResultadoConversacion` suma `handoff: ResumenAnalista | null` y `entrega: "entregada" | "pendiente" | null`. El chat y el modo de demostración no necesitan leerlos para fijar el estado: el evento ya lo hace.

## Prompt (cambios)

Dos líneas nuevas en `SYSTEM_PROMPT`, con las demás reglas de escalamiento:

1. «No escales por un dato que puedes pedir al solicitante ni por varias coincidencias que puedes desambiguar: pídelo y sigue.» (R12)
2. «Cuando solicites un analista, no digas qué decidirá ni cuándo responderá: solo que un analista revisará su caso.»

Las reglas actuales de la Regla 4 y la Regla 5 no cambian. El prompt no menciona umbrales.

## Chat

El evento `escalamiento` ya cierra la conversación y el chat ya muestra `[ESCALAMIENTO]` y «ESCALADA A ANALISTA». Con `valores` se ve la causa y si la entrega quedó pendiente (FR-010).

Un cambio pequeño, solo en modo de demostración (`--demo`): después de los eventos de un turno escalado, [chat.ts](../../../src/chat/chat.ts) imprime el resumen para el analista con `formatearHandoff`, una función nueva de [presentacion.ts](../../../src/chat/presentacion.ts). Así se puede comprobar SC-004 sin otra herramienta, porque el core del chat vive en su propio proceso y el resumen no se puede consultar desde fuera.

```text
══ Resumen para el analista · ESC-0001000001 ══
Causa: monto_sobre_umbral · Regla: Regla 2 · preaprobación dentro de la política
Acción recomendada: revisar_con_simulacion_de_cuota
Solicitante: Ana Pérez Ficticia · documento ******4567
Solicitud: SOL-0001000010 (en_estudio) · monto 6.000.000 · plazo 24 meses
Ingreso: declarado 3.800.000 · verificado 3.800.000
Discrepancias: ninguna
Datos extraídos: 4 documentos
Decisión: monto_sobre_tope · monto = 6.000.000 · …
Pendientes: ninguno
```

- **Normal, no demostración**: no se imprime. El resumen es para el analista, no para el solicitante.
- Es una vista de **texto fijo**, como las etiquetas del chat: sin color se lee igual. No imprime el contenido de los documentos ni fragmentos de procedencia.
- Una entrega pendiente imprime «Entrega al analista: pendiente» en lugar del resumen.

## Pruebas (sin el modelo)

En `agente.test.ts` y `adaptador.test.ts`, con un core falso y una consulta inyectada:

| Caso | Esperado |
|------|----------|
| Mensaje «Quiero hablar con una persona» | Resultado `escalada` con causa `peticion_de_persona`; la consulta al modelo **no se invoca** y el core falso no recibe otra llamada que `escalar_a_analista` |
| La misma petición con el core caído | Escalada con causa `peticion_de_persona` y `entrega: "pendiente"` |
| Petición de persona y documento en moneda extranjera en el mismo turno | Causa principal `peticion_de_persona`; la Regla 5 no se evalúa (R5) |
| El modelo llama a `solicitar_analista` con `caso_no_cubierto` y el hook ya vio una señal de la Regla 2 | La principal es la de la regla anterior en el orden; la otra va en `causasAdicionales` |
| Señales de la Regla 4 y la 5 en el mismo turno | Principal: la 4; adicional: la 5 |
| `solicitar_analista` con monto y cita válida | `estado.declarado` guarda el dato con procedencia |
| `solicitar_analista` con monto y cita que no está en lo que dijo el solicitante | Escala igual; el dato queda pendiente |
| Entrega con el core que responde | `entrega: "entregada"`; el evento lleva `idEscalamiento` |
| Entrega con reintentos agotados | `entrega: "pendiente"`; hay un log de error; escala igual |
| Error de forma del core en la entrega | `entrega: "pendiente"`; sin reintentos |
| Un dato faltante que se puede pedir | No escala: hay `solicitud_de_dato` y el resultado es `respuesta` |
| Una búsqueda con varias coincidencias, primera vez | No escala: pide el número de documento |
| Los avisos | Fijados por una prueba y sin las palabras prohibidas |
| El hook de identidad con señal vigente | Sigue negando toda herramienta; la entrega no pasa por él |
