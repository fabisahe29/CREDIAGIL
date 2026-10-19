# Contrato: herramientas `escalar_a_analista` y `consultar_escalamiento` del core

**Feature**: [../spec.md](../spec.md) · **Research**: R3, R4, R6, R8, R9, R11, R13 · **Zona**: [`src/mcp/`](../../../src/mcp/) (regla [servidor-mcp.md](../../../.claude/rules/servidor-mcp.md))

Dos herramientas en el servidor `crediagil-core`, con el mismo contrato de respuesta que las demás (`{ ok, datos } | { ok: false, error }`). Los tipos están en [data-model.md](../data-model.md).

## `escalar_a_analista`

- **Título**: «Escalar a analista».
- **Anotación**: sin `readOnlyHint`: tiene efectos.
- **Descripción**: `DESCRIPCION_ESCALAR_A_ANALISTA` de [src/compartido/escalamiento.ts](../../../src/compartido/escalamiento.ts), escrita una sola vez.
- **Esquema anunciado**: `z.looseObject` con los campos de entrada opcionales en el anuncio, para que su falta llegue a `validarEntrada` y devuelva el contrato `validacion` con su campo.
- **Salida anunciada**: `escalamiento` (`esquemaResumenAnalista`) y `repetida`.

### Texto de la descripción

Debe decir, en este orden (la prueba fija las frases clave):

1. Entrega un caso a un analista de crédito, con un resumen completo que arma el sistema.
2. Se puede usar sin identidad verificada y sin solicitud registrada: en ese caso el resumen marca lo que falta como pendiente.
3. Solo recibe la causa clasificada: el solicitante, la solicitud, los ingresos, los documentos y las discrepancias los toma el sistema de su propio estado.
4. Es idempotente: repetirla devuelve el mismo resumen.
5. Escalar no decide el crédito: no aprueba ni rechaza.

No debe contener el 5.000.000, el 30% ni el 10%.

### Entrada

| Campo | Anunciado como | Validación del servidor |
|-------|----------------|-------------------------|
| `correlationId` | Obligatorio. UUID de la conversación. | UUID |
| `claveIdempotencia` | Obligatorio. Clave del escalamiento (1 a 64 caracteres). | Texto de 1 a 64 |
| `causa` | Obligatorio. Una de las cinco causas. | `CAUSAS_ESCALAMIENTO` |
| `motivo` | Obligatorio. Uno de los doce motivos. | `MOTIVOS_ESCALAMIENTO` |
| `codigo` | Opcional. Solo con `preaprobacion_fuera_de_politica`. | `CODIGOS_BLOQUEO`; obligatorio con ese motivo, prohibido con los demás |
| `causasAdicionales` | Opcional. Las demás causas del caso. | Hasta 8 `{ causa, motivo, codigo? }`, cada una coherente |
| `declarado` | Opcional. Monto y plazo que dijo el solicitante, con su procedencia. | `{ monto?, plazoMeses? }`, cada uno `{ valor, procedencia }` |

`ENTRADAS.escalar_a_analista` es `.strict()`: un campo extra, como `solicitante`, `ingresoVerificado` o `accionRecomendada`, es un error de formato (R3).

### Comportamiento del core

`Core.escalarAAnalista(entrada: unknown)` en [core-simulado.ts](../../../src/mcp/core-simulado.ts), en este orden; la primera comprobación que falla decide y **no escribe nada**:

1. **Falla simulada** activa: error transitorio `core_no_disponible`.
2. **Forma**: campos, UUID, clave y enumeraciones. Un campo extra o inválido es `formato_invalido` con el campo. No se audita.
3. **Coherencia**: `causa` debe ser `causaDeEscalamiento(motivo, codigo)`, y lo mismo cada causa adicional; `codigo` solo con `preaprobacion_fuera_de_politica`. Si no, `causa_incoherente` o `formato_invalido`.
4. **Declarado**: su forma y la procedencia de cada dato se validan siempre, con `validarProcedenciaDato` del #13 (el valor debe ser un entero positivo). Con solicitud registrada, `declarado` se ignora: manda lo que guardó el core (R4). Esta validación es parte del paso 2, así que un `declarado` mal formado se rechaza aunque haya solicitud.
5. **Repetición**: si la conversación ya tiene un escalamiento, devuelve el mismo con `repetida: true`, sin otra auditoría ni efecto, aunque la clave o la causa sean otras (R8).
6. **Armar el resumen** con el estado del core:
   - solicitante: la identidad de la conversación; si está verificada, el nombre y el documento enmascarado del solicitante; si no, `identificado: false`;
   - solicitud: la última registrada de la conversación, con el monto, el plazo y el ingreso declarado y su procedencia;
   - verificación de ingreso: la de la solicitud o, si no hay, la última del core, con el armado que ya usa `registrarSolicitud`;
   - discrepancias: del ingreso (si el estado es `discrepancia`) y las documentales que detienen;
   - datos extraídos: los registros de todas las extracciones de la conversación;
   - decisión: `evaluarRegla2` con la solicitud registrada, solo con las causas de monto, cuota o discrepancia de ingreso; si no, `null`;
   - pendientes: lo que falta, con las reglas de [R9](../research.md#r9-lo-ausente-se-declara-como-pendiente-no-se-rechaza).
7. **Validar** con `esquemaResumenAnalista`. Si no pasa, `resumen_invalido`, sin guardar nada.
8. **Guardar** en el almacén del core y devolver `{ escalamiento, repetida: false }` con auditoría `escalada`.

### Garantías

- **Nada del modelo en los datos**: el solicitante, los ingresos, los documentos y las discrepancias salen del estado del core, no de la entrada (R3).
- **No se rechaza una causa por sustancia**: el servidor no comprueba que el monto supere un umbral para aceptar `monto_sobre_umbral`. Escalar es el camino seguro y el servidor nunca lo bloquea por no poder justificarlo (Principio V). La decisión explicable la agrega cuando puede calcularla.
- **Sin identidad ni solicitud**: no exige ninguna de las dos (aclaraciones Q1 y Q3).
- **Idempotente**: repetir deja un solo escalamiento por conversación (SC-005, FR-011).
- **Sin efectos parciales**: un error no guarda nada.
- **No cambia la solicitud registrada**: sigue `en_estudio` (R13).
- **Determinista**: mismos datos, mismo resumen, salvo el identificador, la marca de tiempo y los datos del reloj.

### Errores

Los de la tabla de [data-model.md](../data-model.md#errores-del-core). Los mensajes dicen el motivo y qué hacer, sin repetir datos del solicitante.

### Auditoría y log

- `auditoria_escalamiento`: una por escalamiento nuevo. Lleva `resultado: escalada`, la `regla`, la `causa`, el `motivo`, el `codigo` si lo hay, el número de causas adicionales, el `idEscalamiento`, el `idSolicitud` y el `idSolicitante` si los hay, los `pendientes` y la `versionPolitica`. Ninguna por una repetición ni por un error de forma.
- Log `herramienta` con `herramienta`, `correlationId`, `resultado` e `idEscalamiento` si fue correcta. No lleva nombres, montos, documentos ni citas.

## `consultar_escalamiento`

- **Título**: «Consultar escalamiento».
- **Anotación**: `readOnlyHint: true`.
- **Descripción**: «Devuelve el escalamiento de la conversación, con el resumen completo para el analista, o null si no se escaló. Solo lectura.»
- **Entrada**: solo `correlationId`.
- **Salida**: `{ escalamiento: ResumenAnalista | null }`.
- **Log**: `herramienta` con `escalamiento` como booleano.

## Cliente (`ClienteCore`)

```ts
escalarAAnalista(
  entrada: Omit<EntradaEscalamiento, "correlationId">,
  correlationId: string,
): Promise<Respuesta<{ escalamiento: ResumenAnalista; repetida: boolean }>>;

consultarEscalamiento(
  correlationId: string,
): Promise<Respuesta<{ escalamiento: ResumenAnalista | null }>>;
```

La respuesta se valida con `esquemaResultadoEscalamiento`; una respuesta fuera de contrato es `respuesta_fuera_de_contrato`, no se adivina.
