# Contrato: herramientas `registrar_solicitud` y `consultar_solicitud_registrada` del core

**Feature**: [../spec.md](../spec.md) · **Research**: R1, R2, R3, R4, R6, R7, R8, R9, R11 · **Zona**: [`src/mcp/`](../../../src/mcp/) (regla [servidor-mcp.md](../../../.claude/rules/servidor-mcp.md))

Dos herramientas en el servidor `crediagil-core`, con el mismo contrato de respuesta que las demás (`{ ok, datos } | { ok: false, error }`). Los tipos están en [data-model.md](../data-model.md).

## `registrar_solicitud`

Herramienta con efectos: **sin** `readOnlyHint`.

### Anuncio

- **Título**: «Registrar solicitud».
- **Descripción**: `DESCRIPCION_REGISTRAR_SOLICITUD` de [src/compartido/solicitud.ts](../../../src/compartido/solicitud.ts), la misma que usa el adaptador.
- **Esquema anunciado**: `z.looseObject` con los campos como opcionales, para que su falta llegue a `validarEntrada` y devuelva el contrato `validacion` con su campo.
- **Salida anunciada**: `solicitud` (`esquemaSolicitudRegistrada`) y `repetida`.

### Texto de la descripción

Debe decir, en este orden (la prueba fija las frases clave):

1. Registra la solicitud de un solicitante con identidad verificada, con el origen de cada dato.
2. Exige la identidad verificada **de ese solicitante**; sin ella rechaza.
3. El ingreso verificado, las discrepancias y los datos extraídos los toma el core; no se envían.
4. Es idempotente: repetirla con los mismos datos devuelve la ya registrada.
5. Un dato sin origen, o con uno que no se puede comprobar, se rechaza y no se guarda nada.
6. Registrar no aprueba ni rechaza: no decide el crédito.

No debe contener el 30%, el tope de monto ni el 10%.

### Entrada

| Campo | Anunciado como | Validación del servidor |
|-------|----------------|-------------------------|
| `idSolicitante` | Obligatorio. Identificador del solicitante verificado: `CLI-` y 10 dígitos. | formato; debe ser el verificado |
| `monto` | Obligatorio. Monto en pesos colombianos, entero positivo. | entero seguro `> 0` |
| `plazoMeses` | Obligatorio. Plazo en meses, entero positivo. | entero seguro `> 0` |
| `claveIdempotencia` | Obligatorio. Clave de la solicitud (1 a 64 caracteres); repetirla no crea otra. | texto de 1 a 64 |
| `procedencia` | Obligatorio. Origen de cada dato: `monto`, `plazoMeses` e `ingresoDeclarado` si lo hay. | ver abajo |
| `correlationId` | Obligatorio. UUID de la conversación. | UUID |

`procedencia` es un objeto con `monto`, `plazoMeses` y, si corresponde, `ingresoDeclarado`, cada uno una `Procedencia` (`afirmacion` o `documento`). `ENTRADAS.registrar_solicitud` es `.strict()`: un campo extra, como `ingresoVerificado`, `discrepancias` o `datosExtraidos`, es un error de formato (R2).

### Comportamiento del core

`Core.registrarSolicitud(entrada)` en [core-simulado.ts](../../../src/mcp/core-simulado.ts), en este orden; la primera comprobación que falla decide y **no escribe nada**:

1. **Falla simulada** activa: error transitorio `core_no_disponible`.
2. **Forma**: `correlationId`, `idSolicitante`, `monto`, `plazoMeses` y `claveIdempotencia`, cada uno con su código. Una forma inválida no se audita como regla.
3. **Regla 1** con `evaluarRegla1(identidad, idSolicitante)`, donde `identidad` es la de la conversación en el core. Si no se permite: `identidad_no_verificada`, con auditoría `rechazada`. Si el solicitante verificado no existe en el core: el mismo error.
4. **Repetición**: si la conversación ya tiene una solicitud con esa `claveIdempotencia`, devuelve esa solicitud con `repetida: true`, **sin** otra auditoría ni otro efecto.
5. **Solicitud abierta**: si el solicitante tiene otra solicitud `en_estudio` registrada por esta herramienta, `solicitud_abierta` con el identificador de la existente, con auditoría `rechazada`. Registrar otra vez en la misma conversación con otra clave (otro monto o plazo) cae aquí.
6. **Documentos aptos**: si alguna extracción de la conversación no está `extraido`, `documentos_no_aptos` con los números de adjunto. Sin extracciones, sigue.
7. **Procedencia** de `monto`, `plazoMeses` e `ingresoDeclarado`, en ese orden, con el primer problema:
   - falta (`undefined` o `null`) → `procedencia_faltante`;
   - no pasa la forma, o el largo no es de 1 a 300 → `procedencia_invalida`;
   - `tipo: "documento"` con un adjunto o nombre que no están entre las extracciones → `procedencia_documento_desconocida`;
   - el core no tiene un ingreso declarado pero llega su procedencia → `ingreso_declarado_no_verificado`;
   - el core tiene un ingreso declarado y falta su procedencia → `procedencia_faltante`.
8. **Guardar**: arma la `SolicitudRegistrada` con lo que ya sabe el core (R2), asigna el identificador, la guarda en `registradas`, `registradaPorConversacion` y `almacen`, y devuelve la solicitud con `repetida: false`.

Si alguna comprobación de 5 a 7 falla, queda el mismo estado que antes (US3, escenario 3).

### Garantías

- **Sin identidad, nada**: ninguna ruta guarda con la identidad sin verificar o de otra persona (SC-001).
- **Todo con origen**: ningún dato de la solicitud guardada carece de `procedencia` (SC-002); el esquema de salida lo exige.
- **Idempotente**: repetir con la misma clave deja una sola solicitud (SC-005).
- **Sin datos del modelo donde no deben ir**: ni el ingreso verificado ni la discrepancia ni los datos extraídos tienen campo de entrada.
- **Determinista**: mismos datos y mismo estado del core dan la misma solicitud, salvo la marca de tiempo.

### Errores

Los de la tabla de [data-model.md](../data-model.md#errores). Los mensajes dicen el motivo y qué hacer:

- `identidad_no_verificada`: «No se registra una solicitud sin la identidad del solicitante verificada.»
- `solicitud_abierta`: «Este solicitante ya tiene la solicitud SOL-… abierta; un analista decide si se cambia.»
- `procedencia_faltante`: «Falta el origen de monto: cita lo que dijo el solicitante o el documento del que salió.»

### Auditoría y log

- `auditoria_solicitud` como en [data-model.md](../data-model.md#auditoría): una por registro nuevo y una por rechazo de los pasos 3, 5 y 7; ninguna por una repetición ni por un error de forma.
- Log `herramienta` con `herramienta`, `correlationId`, `resultado` e `idSolicitud` si fue correcta. No lleva montos, fragmentos ni nombres.

## `consultar_solicitud_registrada`

Solo lectura: `readOnlyHint: true`.

| Campo | Validación |
|-------|------------|
| `correlationId` | UUID |

- **Salida**: `solicitud`, la `SolicitudRegistrada` de la conversación, o `null` si no registró ninguna. Una copia: modificarla no cambia el core.
- Lee por `correlationId` y no por identificador: una conversación no ve la solicitud de otra.
- **Errores**: `formato_invalido` con `correlationId`; `core_no_disponible` con la falla simulada.
- Log `herramienta` con `correlationId`, resultado y si había una solicitud.

## `consultar_solicitud` (sin cambios de contrato)

Una solicitud registrada se encuentra por su identificador, con la forma de `Solicitud` del #7: `estado: "en_estudio"`, el solicitante con nombre, documento y correo, `monto`, `plazoMeses` y `creadaEn`. No lleva procedencia: esa es de `consultar_solicitud_registrada`.

## Cliente (`ClienteCore`)

```ts
registrarSolicitud(
  entrada: EntradaRegistroSolicitud,        // sin correlationId
  correlationId: string,
): Promise<Respuesta<{ solicitud: SolicitudRegistrada; repetida: boolean }>>;

consultarSolicitudRegistrada(
  correlationId: string,
): Promise<Respuesta<{ solicitud: SolicitudRegistrada | null }>>;
```

La respuesta se valida con `esquemaSolicitudRegistrada`; una respuesta fuera de contrato es `respuesta_fuera_de_contrato`, no se adivina.
