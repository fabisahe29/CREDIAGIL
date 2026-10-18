# Data Model: Registro de la solicitud con procedencia

**Feature**: [spec.md](spec.md) · **Plan**: [plan.md](plan.md) · **Research**: [research.md](research.md)

Esta feature guarda, en memoria y en el core, una solicitud por conversación. Los tipos viven en [src/compartido/solicitud.ts](../../src/compartido/solicitud.ts) y reutilizan los de `extraccion.ts` e `ingreso.ts`.

## Parámetros de política

No se agrega ningún umbral ni constante. `VERSION_POLITICA` no cambia. La única adición es una función en [src/politica/ingreso.ts](../../src/politica/ingreso.ts):

| Función | Entrada | Salida |
|---------|---------|--------|
| `calcularDiferenciaPorcentaje(declarado, verificado)` | enteros de pesos, `verificado > 0` | `|declarado − verificado| / verificado · 100` con dos decimales, `BigInt`, mitad hacia arriba |

El umbral del 10% y su comparación siguen en `evaluarDiscrepancia` sin cambios.

## Procedencia

El origen de un dato. Dos clases, distinguidas por `tipo`.

| Clase | Campos | Quién la puede producir | Qué se comprueba |
|-------|--------|-------------------------|------------------|
| `afirmacion` | `fragmento` (1 a 300 caracteres) | El modelo, para lo que dijo el solicitante | Adaptador: el fragmento está, literal, en un mensaje del solicitante. Core: solo la forma |
| `documento` | `adjunto` (≥ 1), `nombre` (1 a 255), `fragmento` (1 a 300) | El modelo (para lo que dijo el solicitante y escribió en un documento) o el core (en los datos extraídos) | Adaptador: el documento existe y el fragmento está en su contenido. Core: el adjunto y el nombre están entre las extracciones de la conversación |

- Una procedencia con campos de más se rechaza (`strictObject`).
- La procedencia de un dato extraído es la `Procedencia` del #10, con `tipo: "documento"` agregado al copiarla al registro.

## DatoRegistrado

Un valor de la solicitud junto con su procedencia. **Un dato sin procedencia no existe**: no hay forma de construir uno.

| Campo | Tipo |
|-------|------|
| `valor` | entero de pesos, o entero de meses para el plazo |
| `procedencia` | `Procedencia` |

## EntradaRegistroSolicitud

Lo que recibe `registrar_solicitud`. El servidor la recibe como `unknown` y la valida.

| Campo | Tipo | Regla | Código de error |
|-------|------|-------|-----------------|
| `correlationId` | UUID | formato UUID | `formato_invalido` |
| `idSolicitante` | `CLI-` y 10 dígitos | formato; debe ser el verificado | `formato_invalido`, `identidad_no_verificada` |
| `monto` | entero de pesos | entero seguro `> 0` | `monto_invalido` |
| `plazoMeses` | entero | entero seguro `> 0` | `plazo_invalido` |
| `claveIdempotencia` | texto de 1 a 64 | la calcula el adaptador, nunca el modelo | `formato_invalido` |
| `procedencia.monto` | `Procedencia` | obligatoria | `procedencia_faltante`, `procedencia_invalida` |
| `procedencia.plazoMeses` | `Procedencia` | obligatoria | ídem |
| `procedencia.ingresoDeclarado` | `Procedencia` | obligatoria si el core tiene un ingreso declarado; si no lo tiene, es un error | `procedencia_faltante`, `ingreso_declarado_no_verificado` |

- Los campos de más se rechazan (`.strict()`).
- Se informa el primer problema en este orden: `correlationId`, `idSolicitante`, `monto`, `plazoMeses`, `claveIdempotencia`, `procedencia.monto`, `procedencia.plazoMeses`, `procedencia.ingresoDeclarado`.
- **No existen** campos para el ingreso verificado, las discrepancias, los datos extraídos, el solicitante ni el ingreso declarado (R2).

## SolicitudRegistrada

Lo que guarda el core y devuelve `consultar_solicitud_registrada`.

| Campo | Tipo | Origen |
|-------|------|--------|
| `idSolicitud` | `SOL-000` y 7 dígitos | Contador del core, desde `SOL-0002000001` |
| `correlationId` | UUID | La conversación |
| `claveIdempotencia` | texto | La entrada |
| `estado` | `"en_estudio"` | Constante al registrar |
| `registradaEn` | fecha ISO 8601 | Reloj del core |
| `solicitante` | `{ idSolicitante, nombre, documentoEnmascarado }` | El solicitante verificado, en el core |
| `monto` | `DatoRegistrado` | Entrada |
| `plazoMeses` | `DatoRegistrado` | Entrada |
| `ingresoDeclarado` | `DatoRegistrado` o `null` | Valor: `declarados` del core. Procedencia: entrada |
| `verificacionIngreso` | `VerificacionRegistrada` o `null` | `verificaciones` del core |
| `datosExtraidos` | lista de `RegistroExtraccion` con estado `extraido` | `extracciones` del core, ordenadas por adjunto |
| `versionPolitica` | texto | `VERSION_POLITICA` |

### VerificacionRegistrada

La copia de la última verificación de ingreso del mismo solicitante; `null` en la solicitud si no hay, o si es de otro.

| Campo | Tipo | Notas |
|-------|------|-------|
| `estado` | `EstadoVerificacion` | `verificado`, `discrepancia`, `inconsistencia`, `sin_ingreso`, `falta_declarado` |
| `ingresoVerificado` | `IngresoVerificado` o `null` | Con su `origen` y los `usos` (documento y fragmento de cada cifra) |
| `discrepancia` | `Discrepancia` más `diferenciaPorcentaje`, o `null` | Los dos valores y el porcentaje; nunca se corrige ni se oculta |
| `inconsistencias` | lista de `Inconsistencia` | Con los valores y su procedencia |
| `sinContrastar` | lista de textos | Lo pendiente de contrastar |
| `calculadaEn` | fecha ISO 8601 | De la verificación |

Invariantes (las comprueba el esquema):
- Un `estado` con ingreso (`verificado`, `discrepancia`, `falta_declarado`) trae `ingresoVerificado`; los demás no.
- Una `discrepancia` trae `diferenciaPorcentaje` ≥ 0 con dos decimales.
- `datosExtraidos` solo contiene registros `extraido`.
- Ningún dato de la solicitud existe sin `procedencia`.

## Estado del core

Se agrega al core simulado, junto a `identidades`, `extracciones`, `declarados` y `verificaciones`:

| Estructura | Clave | Contenido |
|------------|-------|-----------|
| `registradas` | `idSolicitud` | `SolicitudRegistrada` |
| `registradaPorConversacion` | `correlationId` | `idSolicitud` de la solicitud de esa conversación |
| contador | — | Siguiente número de `idSolicitud` |

Además, cada solicitud registrada se agrega a `almacen` con la forma de `Solicitud` del #7 (`estado: "en_estudio"`), para que `consultar_solicitud` la encuentre.

### Transiciones

```text
(sin solicitud) ── registrar_solicitud válida ──▶ en_estudio
en_estudio ── misma clave ──▶ en_estudio (devuelve la misma, repetida: true)
en_estudio ── otra clave, mismo solicitante ──▶ rechazo solicitud_abierta
```

No hay más estados en este ticket: la preaprobación, el escalamiento y el cierre son del #14 y el #15.

## Respuestas de la herramienta

### Del core: `registrar_solicitud`

`datos.solicitud`: la `SolicitudRegistrada` completa, y `datos.repetida`: `boolean`.

### Del adaptador al modelo

Lo mínimo para responder, nunca la procedencia ni los datos extraídos:

| Campo | Tipo |
|-------|------|
| `idSolicitud` | texto |
| `estado` | `"en_estudio"` |
| `repetida` | `boolean` |

## Errores

| Situación | `categoria` | `reintentable` | `codigo` | `campo` |
|-----------|-------------|----------------|----------|---------|
| Identidad no verificada, o de otro solicitante | negocio | no | `identidad_no_verificada` | — |
| Solicitud abierta del solicitante, otra clave | negocio | no | `solicitud_abierta` | — |
| Alguna extracción no está `extraido` | negocio | no | `documentos_no_aptos` | — |
| Dato sin procedencia | validacion | no | `procedencia_faltante` | `procedencia.<dato>` |
| Procedencia mal formada o no comprobable | validacion | no | `procedencia_invalida` | `procedencia.<dato>` |
| Documento citado fuera de las extracciones | validacion | no | `procedencia_documento_desconocida` | `procedencia.<dato>` |
| Ingreso declarado que el core no tiene | validacion | no | `ingreso_declarado_no_verificado` | `procedencia.ingresoDeclarado` |
| `monto` / `plazoMeses` inválidos | validacion | no | `monto_invalido` / `plazo_invalido` | `monto` / `plazoMeses` |
| Entrada mal formada o campo extra | validacion | no | `formato_invalido` | el campo |
| Falla transitoria simulada | transitorio | sí | `core_no_disponible` | — |

Un rechazo nunca deja una solicitud guardada, parcial ni completa.

## Auditoría

`auditoria_solicitud`, solo en el servidor:

| Campo | Valor |
|-------|-------|
| `resultado` | `registrada` o `rechazada` |
| `regla` | `Regla 1 · identidad verificada antes de registrar` |
| `codigo`, `campo` | solo en `rechazada` |
| `idSolicitud`, `idSolicitante` | si existen |
| `monto`, `plazoMeses`, `ingresoDeclarado`, `ingresoVerificado` | enteros, o `null` |
| `estadoVerificacion` | el estado, o `null` |
| `documentos` | número de documentos usados |
| `versionPolitica` | `VERSION_POLITICA` |

Nunca fragmentos, nombres de documentos ni contenido.
