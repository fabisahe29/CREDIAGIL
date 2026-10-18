# Contrato: herramienta `preaprobar_credito` del core

**Feature**: [../spec.md](../spec.md) · **Research**: R3, R4, R6, R7, R8, R10 · **Zona**: [`src/mcp/`](../../../src/mcp/) (regla [servidor-mcp.md](../../../.claude/rules/servidor-mcp.md))

Una herramienta con efectos en el servidor `crediagil-core`, con el mismo contrato de respuesta que las demás (`{ ok, datos } | { ok: false, error }`). Los tipos están en [data-model.md](../data-model.md).

## Anuncio

- **Nombre**: `preaprobar_credito`.
- **Título**: «Preaprobar crédito».
- **Anotación**: sin `readOnlyHint`: tiene efectos y compromete a la fintech.
- **Descripción**: `DESCRIPCION_PREAPROBAR_CREDITO` de [src/compartido/preaprobacion.ts](../../../src/compartido/preaprobacion.ts), la misma que usa el adaptador.
- **Esquema anunciado**: `z.looseObject` con solo `correlationId`, opcional en el anuncio para que su falta llegue a `validarEntrada` y devuelva el contrato `validacion` con su campo.
- **Salida anunciada**: `solicitud` (`esquemaSolicitudRegistrada`) y `repetida`.

### Texto de la descripción (FR-002)

Debe decir, en este orden (la prueba fija las frases clave):

1. Preaprueba automáticamente la solicitud registrada de la conversación, si cumple la política.
2. **Compromete a la fintech**: úsala solo con una solicitud registrada y con el ingreso verificado.
3. No uses esta herramienta para explorar ni para responder cuánto pagaría el solicitante: eso es `calcular_capacidad_pago`.
4. No recibe montos, cuotas ni ingresos: los toma el sistema de la solicitud registrada.
5. Si no cumple la política, se rechaza y el caso va a un analista; no se ofrecen alternativas.

No debe contener el 5.000.000 ni el 30%, ni la palabra «umbral» con su valor (R8).

## Entrada

| Campo | Anunciado como | Validación del servidor |
|-------|----------------|-------------------------|
| `correlationId` | Obligatorio. UUID de la conversación. | UUID |

`ENTRADAS.preaprobar_credito` es `.strict()`: un campo extra, como `monto`, `cuota`, `ingresoMensual` o `idSolicitud`, es un error de formato (R3).

## Comportamiento del core

`Core.preaprobarSolicitud(entrada: unknown)` en [core-simulado.ts](../../../src/mcp/core-simulado.ts), en este orden; la primera comprobación que falla decide y **no escribe nada**:

1. **Falla simulada** activa: error transitorio `core_no_disponible`.
2. **Forma**: solo `correlationId`. Un campo extra o un UUID inválido es `formato_invalido` con el campo; no se audita.
3. **Regla 1**: la identidad de la conversación en el core debe estar verificada y ser la dueña de la solicitud. Si no: `identidad_no_verificada`, con auditoría `bloqueada`.
4. **Solicitud registrada**: la última `SolicitudRegistrada` de la conversación. Si no hay: `solicitud_no_registrada`, sin auditoría de la Regla 2 (no se evaluó).
5. **Repetición**: si la solicitud ya está `preaprobada`, devuelve la misma con `repetida: true`, sin otra auditoría ni otro efecto.
6. **Regla 2**: `evaluarRegla2` de [src/politica/preaprobacion.ts](../../../src/politica/preaprobacion.ts) con el monto, el plazo y la verificación de la solicitud. Si no se permite: error de negocio con el código de la decisión y auditoría `bloqueada`.
7. **Guardar**: la solicitud pasa a `preaprobada` con su `preaprobacion` (`preaprobadaEn` y la decisión), se actualiza el resumen del almacén, y se devuelve con `repetida: false` y auditoría `preaprobada`.

### Garantías

- **Nada del modelo**: la decisión sale solo de la solicitud registrada y del estado del core (SC-001, SC-003).
- **Misma función que el hook**: el core y el hook llaman a `evaluarRegla2`, así que no pueden discrepar (R4).
- **Sin efectos parciales**: un bloqueo deja la solicitud en `en_estudio` y sin `preaprobacion`.
- **Idempotente**: repetir deja una sola preaprobación (SC-006).
- **Determinista**: mismos datos, misma decisión, salvo la marca de tiempo.

### Errores

Los de la tabla de [data-model.md](../data-model.md#errores-del-core). Los mensajes dicen el motivo y qué hacer:

- `identidad_no_verificada`: «No se preaprueba sin la identidad del solicitante verificada.»
- `solicitud_no_registrada`: «No hay una solicitud registrada en esta conversación: regístrala antes de preaprobar.»
- `monto_sobre_tope`, `cuota_sobre_porcentaje`, `discrepancia_registrada`, `ingreso_no_verificado` y `cuota_no_calculable`: el motivo de la decisión, sin el tope ni el porcentaje en el texto que lee el modelo.

### Auditoría y log

- `auditoria_preaprobacion` como en [data-model.md](../data-model.md#auditoría): una por decisión de los pasos 3 y 6 y una por preaprobación nueva; ninguna por una repetición, por la falta de solicitud ni por un error de forma.
- Log `herramienta` con `herramienta`, `correlationId`, `resultado` e `idSolicitud` si fue correcta. No lleva montos, cuotas ni ingresos.

## Cambios al contrato del #13

- `consultar_solicitud_registrada` y `registrar_solicitud` devuelven `estado` de la solicitud como `en_estudio` o `preaprobada`, y el campo `preaprobacion` (`null` al registrar).
- `consultar_solicitud` (resumen del #7) también devuelve `preaprobada` en su `estado`.
- «Solicitud abierta» cuenta `en_estudio` y `preaprobada`.

## Cliente (`ClienteCore`)

```ts
preaprobarSolicitud(
  correlationId: string,
): Promise<Respuesta<{ solicitud: SolicitudRegistrada; repetida: boolean }>>;
```

La respuesta se valida con `esquemaResultadoRegistro` ya existente; una respuesta fuera de contrato es `respuesta_fuera_de_contrato`, no se adivina.
