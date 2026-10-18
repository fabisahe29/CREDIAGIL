# Data Model: Extracción estructurada de documentos con subagente

**Feature**: [spec.md](spec.md) · **Decisiones**: [research.md](research.md)

Todos los montos son enteros de pesos. Todas las fechas van en formato AAAA-MM-DD. Todos los datos de ejemplo son ficticios ([docs/datos-ficticios.md](../../docs/datos-ficticios.md)).

## DocumentoConversacion — `src/chat/sesion.ts`, `src/agente/agente.ts`

Un documento entregado en la conversación (R2). Lo guarda el chat y viaja a `conversar` en cada turno.

| Campo | Tipo | Regla |
|-------|------|-------|
| `adjunto` | entero ≥ 1 | Orden de llegada en la conversación. Único. Lo asigna el chat |
| `nombre` | string | Nombre de archivo seguro, o `texto pegado` para un bloque `/pegar` (que sigue llegando como mensaje del solicitante, con la marca `<adjunto_registrado …/>`) |
| `soportado` | boolean | `false` si el chat lo marcó como no soportado (#8) |
| `contenido` | string | Solo si `soportado`. Nunca va a los logs |

`Conversacion` (chat) suma `documentos: readonly DocumentoConversacion[]`. `/nueva` lo vacía, y la numeración vuelve a empezar en 1.

## Procedencia

| Campo | Tipo | Regla |
|-------|------|-------|
| `adjunto` | entero ≥ 1 | El del documento |
| `nombre` | string | El del documento |
| `fragmento` | string, 1 a 300 caracteres | Aparece en el documento, con los espacios colapsados (R4) |

Se muestra al analista como «adjunto 2 · certificado.md: "…fragmento…"».

## Campo extraído

`Campo<T> = { valor: T; procedencia: Procedencia } | null`. Un campo nulo no tiene procedencia (US3, escenario 4).

## CertificadoLaboral

| Campo | Tipo de `valor` | Validación |
|-------|-----------------|------------|
| `empleador` | string no vacío | Procedencia |
| `cargo` | string no vacío | Procedencia |
| `fechaIngreso` | fecha | Fecha de calendario válida, no futura. Procedencia |
| `salario` | entero > 0 | Dígitos presentes en el fragmento (R4). Procedencia |
| `moneda` | `"COP"` | Deducida del fragmento con la tabla de la política (R5) |

## ExtractoBancario

| Campo | Tipo de `valor` | Validación |
|-------|-----------------|------------|
| `titular` | string no vacío | Procedencia |
| `periodo` | `{ desde: fecha; hasta: fecha }` | `desde ≤ hasta`, ninguna futura. Procedencia |
| `moneda` | `"COP"` | Igual que en el certificado |
| `movimientos` | `Movimiento[]`, puede estar vacía | No es campo nulable: una lista vacía es un extracto sin movimientos |

### Movimiento

| Campo | Tipo | Validación |
|-------|------|------------|
| `fecha` | fecha | Dentro del periodo, si el periodo no es nulo |
| `descripcion` | string no vacío | — |
| `valor` | entero > 0 | Dígitos presentes en el fragmento |
| `sentido` | `"abono"` \| `"cargo"` | — |
| `procedencia` | Procedencia | El fragmento es la línea del movimiento |

## SalidaSubagente — lo que devuelve el subagente

La forma exacta está en [contracts/subagente.md](contracts/subagente.md). Difiere del resultado validado en tres puntos:
- cada campo trae `fragmento` sin `adjunto` ni `nombre`, que agrega el código;
- `moneda` es solo `{ fragmento }`, porque el código deduce la moneda;
- incluye `tipo: "otro"` y `conflictos: string[]`.

## ErrorExtraccion

`{ campo: string; motivo: string; detalle?: string }`. `campo` es una ruta, por ejemplo `salario` o `movimientos.3.valor`. `detalle` explica un error de esquema. Motivos posibles:

| Motivo | Cuándo |
|--------|--------|
| `esquema` | La salida no cumple el esquema; el detalle lo da Zod |
| `fragmento_no_encontrado` | El fragmento no aparece en el documento |
| `valor_no_coincide_con_fragmento` | Los dígitos del monto no están en su fragmento |
| `centavos_no_soportados` | Un monto con centavos distintos de cero |
| `moneda_no_reconocida` | El fragmento de la moneda no coincide con ninguna expresión de la tabla |
| `fecha_futura` | Una fecha posterior a hoy |
| `huella_no_coincide` | Solo al revalidar: la huella del resultado no es la del contenido |
| `decision_no_coincide` | Solo al revalidar: los faltantes o la causa no son los que da la política |

## ResultadoExtraccion — `src/compartido/extraccion.ts`

Unión discriminada por `estado`. Todas las variantes llevan `adjunto`, `nombre`, `huella` (SHA-256 del contenido) e `intentos` (1 a 3).

| `estado` | Campos propios | Efecto en el agente (R7) |
|----------|----------------|--------------------------|
| `extraido` | `documento: CertificadoLaboral \| ExtractoBancario` con su `tipo`, y `faltantes: string[]` | Si hay faltantes, un evento `solicitud_de_dato` |
| `no_cubierto` | `causa: "moneda_extranjera" \| "documento_no_soportado"`, `tipoDetectado` y `fragmentoMoneda` (la evidencia con la que el core revalida la causa) | Escala con la Regla 5 |
| `no_extraible` | `ultimoError: ErrorExtraccion[]` y `conflictos: string[]`; al menos uno no vacío | Escala con el motivo `documento_no_extraible` |

Un `extraido` no tiene `conflictos` ni errores: cada campo pasó la validación o es nulo.

`faltantes` son los campos nulos. En el certificado puede ser cualquiera de sus cinco campos; en el extracto, `titular`, `periodo` o `moneda`. **La moneda solo falta si el documento trae montos** (salario o movimientos): un certificado sin salario no la necesita, y pedirle al solicitante «el salario y la moneda» no tendría sentido. Ajustado al implementar.

## DecisionDocumento — `src/politica/documentos.ts`

Igual que `DecisionRegla1` del #9: `{ regla, resultado, valores, motivo, versionPolitica }`, más `causa` y `faltantes`.
- Entrada: `{ tipo, fragmentoMoneda, conflictos, faltantes, tieneMontos }`.
- `regla`: `"Regla 5 · caso no cubierto por la política"` para un caso no cubierto o un documento completo, y `"constitución, Principio V"` para uno no extraíble o con faltantes.
- `valores`: el tipo, la causa o los faltantes, y la moneda deducida.

## Almacén de extracciones del core — `src/mcp/core-simulado.ts`

- `extracciones: Map<correlationId, Map<huella, RegistroExtraccion>>`.
- `RegistroExtraccion = ResultadoExtraccion & { adjuntos: number[]; registradoEn: ISO-8601 }`.
- No guarda el contenido del documento: solo la huella y el resultado.
- La misma huella en la misma conversación devuelve el registro existente (FR-018). Si llega con otro número de adjunto, el registro guarda también ese número en `adjuntos: number[]`.
- Vive en memoria mientras corre el chat, como el estado de identidad del #9.

## Cambios en el estado del agente — `src/agente/adaptador.ts`

- `SenalEscalamiento.motivo` suma `documento_no_extraible`. La señal admite además `adjunto?: number`.
- `OpcionesAdaptador` suma `documentos` y `ejecutarSubagente`, una función inyectable para las pruebas.
- `HERRAMIENTAS_CON_IDENTIDAD` pasa a `["extraer_documento"]`.

## Errores nuevos del contrato

| Herramienta | Categoría | Código | Cuándo |
|-------------|-----------|--------|--------|
| `extraer_documento` | `validacion` | `adjunto_inexistente` | El número no corresponde a ningún documento de la conversación |
| `registrar_extraccion` | `negocio` | `identidad_no_verificada` | La conversación no tiene identidad verificada |
| `registrar_extraccion` | `validacion` | `extraccion_invalida` | El resultado no pasa la validación del core; `campo` indica el primero |

## Documentos de ejemplo (FR-019)

| Caso | Archivo | Contenido clave |
|------|---------|-----------------|
| `extraccion-certificado` | `certificado-completo.md` | Industrias Imaginarias del Valle S.A.S., analista de operaciones, ingreso 2022-02-01, $3.800.000 COP |
| `extraccion-sin-salario` | `certificado-sin-salario.md` | El mismo empleador y cargo, sin ninguna cifra de salario |
| `extraccion-extractos` | `extracto-2026-07.md`, `extracto-2026-08.md`, `extracto-2026-09.md` | Titular Ana Pérez Ficticia, cuenta `000…`, COP, un abono "Nómina Industrias Imaginarias" de $3.800.000 por mes y algunos cargos |
