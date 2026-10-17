# Data Model: Interfaz de chat

**Feature**: [spec.md](spec.md) · **Research**: [research.md](research.md)

Todo vive en memoria mientras la interfaz está abierta; nada se persiste salvo los logs (R6). Los esquemas se definen con Zod.

## EventoNegocio — `src/compartido/eventos.ts`

Unión discriminada por `tipo`. Campos comunes a los cuatro tipos:

| Campo | Tipo | Regla |
|-------|------|-------|
| `tipo` | `"preaprobacion" \| "solicitud_de_dato" \| "escalamiento" \| "bloqueo_por_regla"` | obligatorio |
| `descripcion` | string no vacío | qué pasó, en lenguaje claro para el solicitante |
| `motivo` | string no vacío | por qué pasó |
| `correlationId` | UUID | el de la conversación |
| `ts` | fecha ISO 8601 | momento de emisión |
| `regla` | string no vacío, opcional | regla aplicada (p. ej. «Regla 2 · cuota ≤ 30% del ingreso verificado») |
| `valores` | `Record<string, string \| entero>`, opcional | valores usados; los montos en pesos enteros |

Campos y obligaciones propias de cada tipo:

| `tipo` | Obligatorio además | Efecto en el estado |
|--------|--------------------|---------------------|
| `preaprobacion` | `regla`, `valores` (≥ 1 entrada) | → `preaprobada` |
| `solicitud_de_dato` | `dato` (string no vacío: qué se pide) | ninguno |
| `escalamiento` | — (`regla` y `valores` opcionales) | → `escalada` |
| `bloqueo_por_regla` | `regla`, `valores` (≥ 1 entrada), `siguientePaso` (string no vacío) | ninguno |

- El esquema es **estricto**: campos desconocidos o un `tipo` fuera del catálogo hacen que el evento no valide.
- `valores` admite solo strings y enteros: los porcentajes llegan ya formateados por el emisor (p. ej. `"31,2 %"`), los montos como enteros en pesos.

### Correspondencia con la señal de escalamiento del #7

`SenalEscalamiento` → `EventoNegocio` con `tipo: "escalamiento"`, `motivo` = `senal.motivo`, `regla` = `senal.regla`, `descripcion` = el aviso que ya compone `conversar`, y `valores` = `{ herramienta, intentos }` cuando existen. `ultimoError` **no** pasa al evento (es un detalle técnico; queda en los logs).

## EventoMostrado — vista de la interfaz

| Variante | Origen |
|----------|--------|
| `{ reconocido: true, evento: EventoNegocio }` | el evento valida contra el catálogo |
| `{ reconocido: false, crudo: unknown, problema: string }` | no valida (FR-011); no cambia el estado |

## Conversacion — `src/chat/sesion.ts`

| Campo | Tipo | Regla |
|-------|------|-------|
| `correlationId` | UUID | nuevo en cada conversación (FR-002) |
| `historial` | `TurnoHistorial[]` | se envía al agente en cada turno (R1) |
| `estado` | `EstadoSolicitud` | inicia en `en_curso` |
| `ocupada` | boolean | `true` mientras el agente prepara una respuesta (FR-003) |

`TurnoHistorial` = `{ autor: "solicitante" \| "agente", texto: string }`. Un documento adjunto entra al historial como el bloque `<documento …>` que se envió (R7).

## EstadoSolicitud y transiciones

```text
             preaprobacion                escalamiento
en_curso ───────────────────▶ preaprobada   en_curso ───────────────▶ escalada
   │                                (final)                            (final)
   └── solicitud_de_dato, bloqueo_por_regla, no reconocido → en_curso
```

- `preaprobada` y `escalada` son **finales** (FR-007a): con uno de ellos, `aplicarEventos` ignora los cambios de estado siguientes (los eventos sí se muestran) y la conversación queda **cerrada**.
- En una conversación cerrada, un mensaje no se envía al agente; solo se aceptan `/nueva`, `/salir` y `/ayuda`.
- Si un mismo turno trae varios eventos, se aplican en orden; el primero que lleva a un estado final lo fija.

## Entrada — `src/chat/comandos.ts`

Resultado de interpretar una línea:

| Variante | Cuándo |
|----------|--------|
| `{ tipo: "mensaje", texto }` | la línea no empieza por `/` y tiene algo más que espacios |
| `{ tipo: "vacia" }` | solo espacios (se ignora) |
| `{ tipo: "comando", nombre, argumento? }` | `/ayuda`, `/adjuntar <ruta>`, `/pegar`, `/caso <ruta>`, `/nueva`, `/salir` |
| `{ tipo: "comando_desconocido", texto }` | empieza por `/` y no es un comando válido o le falta el argumento |

Detalle en [contracts/chat-cli.md](contracts/chat-cli.md).

## Documento — `src/chat/documentos.ts`

| Variante | Condición | Qué se envía al agente |
|----------|-----------|------------------------|
| `soportado` `{ nombre, contenido, bytes }` | `.txt`/`.md`, ≤ 256 KiB, UTF-8 válido, sin bytes nulos, no vacío | bloque `<documento nombre="…">` con el contenido |
| `no_soportado` `{ nombre, tipo, motivo }` | otra extensión, demasiado grande o no legible como texto | bloque `<documento_no_soportado …/>`, sin contenido |
| `vacio` `{ nombre }` | 0 bytes o solo espacios | nada; se avisa al solicitante |
| `inexistente` `{ ruta }` | la ruta no existe o no es un archivo | nada; se avisa al solicitante |

`motivo` ∈ `formato`, `tamano`, `codificacion`. `nombre` es el nombre base del archivo, sin la ruta; las comillas y `<`/`>` se reemplazan para no romper el bloque.

## CasoPrueba — `src/chat/casos.ts`

```json
{
  "nombre": "demo-consulta",
  "descripcion": "Consulta de una solicitud ficticia y adjunto de un certificado",
  "pasos": [
    { "mensaje": "Hola, quiero saber cómo va mi solicitud SOL-0001000001" },
    { "adjuntar": "certificado-laboral.md" }
  ]
}
```

| Campo | Regla |
|-------|-------|
| `nombre`, `descripcion` | string no vacío |
| `pasos` | 1 o más; cada uno tiene exactamente `mensaje` (string no vacío) o `adjuntar` (ruta relativa a la carpeta del caso, sin salir de ella) |

Validación completa **antes** del primer envío: esquema, rutas dentro de la carpeta y existencia de cada adjunto (FR-019). Si la conversación llega a un estado final, los pasos restantes no se envían y se informa cuántos quedaron.

## InfoHerramienta — observador del modo de demostración

`{ herramienta: string, intento: number, resultado: "ok" | string (código de error), categoria?: Categoria }`, que emite el adaptador en cada intento de llamada al core (R5). No lleva argumentos ni datos devueltos.

## Cambios en tipos existentes

| Tipo | Cambio |
|------|--------|
| `EstadoConversacion` (adaptador) | + `eventos: EventoNegocio[]` |
| `OpcionesConversar` | + `historial?: TurnoHistorial[]`, + `alUsarHerramienta?: (info) => void` |
| `ResultadoConversacion` | + `eventos: EventoNegocio[]` (incluye el de escalamiento cuando `tipo` es `"escalada"`) |
| `OpcionesClienteCore` | + `stderr?` (destino del stderr del servidor; por defecto `"inherit"`, como hoy) |
