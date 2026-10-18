# Contrato: agente, adaptador y chat

**Decisiones**: [research.md](../research.md), R2, R7, R8 y R9 · **Datos**: [data-model.md](../data-model.md)

## Herramientas nuevas del adaptador (`originacion`)

### `extraer_documento`

| | |
|---|---|
| Entrada | `{ adjunto: number }`, entero ≥ 1 |
| Descripción para el modelo | "Extrae los datos de un certificado laboral o de un extracto bancario que entregó el solicitante, por su número de adjunto. Devuelve cada dato con el fragmento del documento del que salió. Si falta un dato, no lo pidas tú: la herramienta ya lo pidió." |
| Exige identidad | Sí: está en `HERRAMIENTAS_CON_IDENTIDAD` |
| Salida | `exito({ resultado: ResultadoExtraccion })`, o el error del contrato |

Pasos del manejador, en orden (R7):

1. **Adjunto inexistente** → `validacion`, `adjunto_inexistente`, `campo: "adjunto"`. No escala.
2. **Adjunto no soportado** → `dejarSenal` con `caso_no_cubierto`, `documento_no_soportado` y la Regla 5. Responde `exito({ escalada: true })`.
3. **Ya extraído**: `consultarExtracciones` en el core. Si una tiene la misma huella, se reutiliza y se salta al paso 6.
4. **Intentos**: hasta `MAX_INTENTOS_EXTRACCION`. Si una salida no pasa `validarSalida`, el intento siguiente lleva sus errores.
5. **Decisión**: `evaluarDocumento`, y luego `registrarExtraccion` en el core con reintentos del #7.
6. **Efectos**:

| Resultado | Efecto |
|-----------|--------|
| `extraido` sin faltantes | Ninguno |
| `extraido` con faltantes | Un `solicitud_de_dato` por documento (ver abajo) |
| `no_cubierto` | `dejarSenal`: `caso_no_cubierto`, su causa, Regla 5, `herramienta: "extraer_documento"`, `adjunto` |
| `no_extraible` | `dejarSenal`: `documento_no_extraible`, `REGLA_NO_EXTRAIBLE`, `adjunto`, `ultimoError` |
| Ningún intento respondió | `dejarSenal`: `falla_transitoria_persistente`, `intentos: 3` |

Evento de faltantes:

```ts
{
  tipo: "solicitud_de_dato",
  descripcion: "Al certificado que enviaste (adjunto 2) le falta el salario. Envíame un documento que lo indique, por ejemplo un certificado laboral actualizado.",
  motivo: "dato_faltante_en_documento",
  dato: "salario",                        // varios: "salario, moneda"
  regla: "constitución, Principio V",
  valores: { adjunto: 2, documento: "certificado.md", faltantes: "salario" },
}
```

Pide siempre un documento, nunca que el solicitante escriba el dato (aclaración Q2).

### `consultar_extracciones`

| | |
|---|---|
| Entrada | `{}` |
| Exige identidad | No: sin verificación no hay extracciones registradas |
| Salida | `exito({ extracciones: ResultadoExtraccion[] })`, en orden de adjunto |
| Anotación | `readOnlyHint: true` |

## Motivo nuevo de escalamiento — `src/agente/agente.ts`

| Motivo | Regla | Aviso al solicitante |
|--------|-------|----------------------|
| `documento_no_extraible` | `REGLA_NO_EXTRAIBLE = "constitución, Principio V · documento no extraíble"` | "No pude leer con certeza los datos de tu documento. Tu caso pasa a un analista, que te contactará." |

El evento `escalamiento` lleva en `valores` el `adjunto` y, si existe, la causa.

## `conversar` — opción nueva

```ts
interface OpcionesConversar {
  // …
  /** Documentos de la conversación, numerados por el chat (R2). */
  documentos?: readonly DocumentoConversacion[];
  /** Subagente de extracción; inyectable en las pruebas. */
  ejecutarSubagente?: EjecutarSubagente;
}
```

## System prompt (R9)

Se quita: "No pidas ni uses documentos de soporte antes de verificar."

Se agrega:
- "Cuando un solicitante verificado entregue un certificado laboral o un extracto bancario, llama a extraer_documento con el número de adjunto del documento."
- "No leas datos de los documentos por tu cuenta: usa solo los que devuelve extraer_documento, con su procedencia."
- "Para recordar datos ya extraídos en turnos anteriores, usa consultar_extracciones."

## Chat — `src/chat/`

- **`documentos.ts`**: `componerMensaje(documento, adjunto)` agrega `adjunto="N"` al bloque `<documento …>` y al `<documento_no_soportado …/>`. Una función nueva, `componerPegado(texto, adjunto, motivo?)`, devuelve el texto neutralizado seguido de la marca `<adjunto_registrado numero="N" nombre="texto pegado"/>`. `adjunto_registrado` entra en `ETIQUETAS_DOCUMENTO`, así que nadie puede forjarla escribiéndola.
- **`sesion.ts`**: `Conversacion.documentos` y `registrarDocumento(conv, documento)`, que asigna el número siguiente.
- **`chat.ts`**:
  - `/adjuntar` registra el documento, también el no soportado, antes de enviar el turno;
  - `/pegar` registra el bloque como `texto pegado` y lo envía **como mensaje del solicitante**, terminado con la marca `<adjunto_registrado numero="N" nombre="texto pegado"/>` que compone el chat (`componerPegado`). Así un mensaje pegado conserva su valor de instrucción (Regla 4). Más de 256 KiB lo registra como no soportado (`soportado="no" motivo="tamano"`);
  - cada turno pasa `documentos` a `conversar`.
- **Presentación**: el aviso del adjunto muestra su número: "📎 adjunto 2 · certificado.md (812 bytes)".
