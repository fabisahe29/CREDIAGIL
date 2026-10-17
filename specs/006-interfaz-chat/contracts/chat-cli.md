# Contrato: interfaz de chat en la terminal

**Feature**: [../spec.md](../spec.md) · Requisitos: FR-001 a FR-004, FR-007a, FR-009, FR-012 a FR-020

## Arranque

```text
npm run chat                         # = node src/chat/principal.ts
npm run chat -- --demo               # modo de demostración: líneas de herramientas (FR-009)
npm run chat -- --caso casos/demo-consulta
```

| Opción | Efecto |
|--------|--------|
| `--demo` | Muestra una línea por cada intento de llamada a una herramienta del core |
| `--caso <ruta>` | Carga ese caso de prueba en cuanto la interfaz está lista (igual que `/caso`) |
| otra cosa | Mensaje de uso y salida con código 2, sin arrancar |

**Precondición**: `ANTHROPIC_API_KEY` definida. Si falta, la interfaz escribe en stderr:

```text
Falta ANTHROPIC_API_KEY en el entorno de la sesión. Defínela antes de iniciar (ver .env.example).
```

y sale con código 1, sin arrancar el core ni mostrar ningún valor (FR-017).

**Al iniciar** muestra, en este orden: el nombre de la interfaz, la ruta del archivo de logs, el `correlationId` de la conversación y la línea «Escribe /ayuda para ver los comandos.». Arranca el servidor del core **una vez** y lo reutiliza en todas las conversaciones de la ejecución; lo cierra al salir.

## Comandos

Una línea que empieza por `/` es un comando de la interfaz y **nunca** se envía al agente.

| Comando | Efecto | En conversación cerrada |
|---------|--------|-------------------------|
| `/ayuda` | Lista los comandos | permitido |
| `/adjuntar <ruta>` | Lee el archivo (R7) y, si es soportado o no soportado, lo envía como turno | rechazado |
| `/pegar` | Abre un bloque de varias líneas; se cierra con una línea que sea exactamente `/fin` y se envía como un solo mensaje | rechazado |
| `/caso <ruta>` | Valida y reproduce un caso de prueba (ver abajo) | rechazado |
| `/nueva` | Termina la conversación actual y empieza otra, sin historial y con `correlationId` nuevo | permitido |
| `/salir` | Cierra el core y termina con código 0 (también Ctrl+C) | permitido |

- Comando desconocido o sin su argumento: `Comando no reconocido: <texto>` seguido de la ayuda. No se envía nada.
- Dentro de `/pegar`, las líneas que empiezan por `/` (salvo `/fin`) son texto del mensaje. Un bloque vacío no se envía.
- En una conversación cerrada, un mensaje o un comando rechazado muestra: `La solicitud está <estado>. Escribe /nueva para empezar otra conversación o /salir para terminar.`

## Turno

1. Se muestra la entrada del solicitante con la etiqueta `Tú` (o `Tú · adjunto <nombre>` para un documento).
2. Se muestra `Agente · trabajando…`. Mientras tanto, cualquier línea escrita se descarta y se avisa una vez por turno: `Espera la respuesta del agente; tu mensaje no se envió.` (FR-003).
3. Con `--demo`, cada intento de herramienta aparece en vivo como línea subordinada (ver formato).
4. Al terminar `conversar`: la respuesta con la etiqueta `Agente`, luego los eventos en orden y, si el estado cambió, la línea de estado.

## Formato de salida

Las etiquetas son texto fijo; el color (con `styleText`) es solo un refuerzo y se omite si la terminal no lo admite o `NO_COLOR` está definida.

```text
Tú: Hola, quiero saber cómo va mi solicitud SOL-0001000001
Agente · trabajando…
   · herramienta consultar_solicitud · intento 1 · ok                      ← solo con --demo
Agente: Tu solicitud SOL-0001000001 está en estudio…

┃ [SOLICITUD DE DATO] Necesitamos tu certificado laboral
┃ Dato: certificado laboral
┃ Motivo: el ingreso debe salir de un documento de soporte

┃ [BLOQUEO POR REGLA] No podemos preaprobar automáticamente tu solicitud
┃ Regla: Regla 2 · cuota ≤ 30% del ingreso verificado
┃ Valores: cuota = 1.250.000 · ingreso verificado = 3.800.000 · porcentaje = 32,9 %
┃ Motivo: la cuota supera el 30% del ingreso verificado
┃ Qué sigue: un analista revisará tu caso

┃ [ESCALAMIENTO] Tu caso pasa a un analista
┃ Motivo: falla_transitoria_persistente
┃ Regla: constitución, Principio VI · reintentos agotados
┃ Valores: herramienta = consultar_solicitud · intentos = 3

══ Estado de la solicitud: ESCALADA A ANALISTA (conversación cerrada) ══
```

- Etiquetas de evento: `[PREAPROBACIÓN]`, `[SOLICITUD DE DATO]`, `[ESCALAMIENTO]`, `[BLOQUEO POR REGLA]`, `[EVENTO NO RECONOCIDO]`. La primera línea es la `descripcion`; luego, solo los campos presentes, siempre en el orden `Dato`, `Regla`, `Valores`, `Motivo`, `Qué sigue`.
- `Valores`: `clave = valor`, separados por ` · `, en el orden en que llegan. Los enteros se escriben con separador de miles `.` (es-CO); los strings, tal cual.
- `[EVENTO NO RECONOCIDO]` muestra el `tipo` recibido (o `sin tipo`) y el problema de validación, nunca el evento completo.
- Estados: `EN CURSO`, `PREAPROBADA`, `ESCALADA A ANALISTA`. La línea de estado aparece al cambiar y en cada rechazo por conversación cerrada.
- Línea de herramienta: `   · herramienta <nombre> · intento <n> · <ok | código (categoría)>`.

## Documentos (`/adjuntar` y pasos `adjuntar`)

| Resultado de la lectura | Se muestra | Se envía al agente |
|-------------------------|------------|--------------------|
| soportado | `Tú · adjunto <nombre> (<n> bytes)` | `Adjunto el documento <nombre>.` + bloque `<documento nombre="<nombre>">…</documento>` |
| no soportado | `Tú · adjunto <nombre> (no soportado: <motivo>)` | `Adjunto el documento <nombre>.` + `<documento_no_soportado nombre="…" tipo="…" motivo="…"/>` |
| vacío | `El archivo <nombre> está vacío; no se envió.` | nada |
| inexistente | `No encontré el archivo <ruta>; no se envió.` | nada |

Las rutas relativas se resuelven desde el directorio donde se inició el comando (o desde la carpeta del caso, en un caso de prueba).

## Casos de prueba (`/caso <ruta>` y `--caso <ruta>`)

`<ruta>` es la carpeta del caso (que contiene `caso.json`) o el propio `caso.json`. Formato en [data-model.md](../data-model.md#casoprueba--srcchatcasosts).

1. Se valida todo antes de enviar nada. Si falla: `No pude cargar el caso: <problema>.` y no se envía ningún paso (FR-019).
2. Se muestra `▶ Caso <nombre>: <descripcion> (<n> pasos)`.
3. Cada paso se muestra con `▶ paso i/n` y se ejecuta como si se hubiera escrito: espera la respuesta del agente antes del siguiente.
4. Si la conversación queda cerrada antes del final: `▶ Caso detenido: la solicitud está <estado>; <k> pasos sin enviar.`
5. Al terminar: `▶ Caso terminado.`

Mientras corre un caso, lo que se escriba se descarta como en un turno normal.

## Códigos de salida

| Código | Cuándo |
|--------|--------|
| 0 | `/salir`, Ctrl+C o fin de la entrada estándar |
| 1 | Falta configuración o error inesperado al arrancar (registrado en los logs) |
| 2 | Opción de línea de comandos inválida |
