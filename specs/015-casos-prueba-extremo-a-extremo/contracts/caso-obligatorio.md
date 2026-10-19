# Contrato: caso obligatorio

Formato de una carpeta de `casos/obligatorios/<número>-<nombre>/`. Los campos y reglas están en [data-model.md](../data-model.md); aquí va el formato y un ejemplo.

## Archivos de la carpeta

| Archivo | Obligatorio | Lo lee |
|---------|-------------|--------|
| `caso.json` | sí | el chat (`/caso`) y el ejecutor |
| `guion.json` | sí, para el modo guionado | solo el ejecutor |
| documentos `.txt` o `.md` | los que nombre `adjuntar` | el chat y el ejecutor |

## `caso.json` (ejemplo: caso 4)

```json
{
  "numero": 4,
  "nombre": "monto-8-millones",
  "descripcion": "Solicitud de 8.000.000: supera el tope; se registra, no se preaprueba y pasa a un analista",
  "pasos": [
    { "mensaje": "Hola, quiero pedir un crédito" },
    { "mensaje": "Mi número de documento es 0001234567" },
    { "mensaje": "La fecha de expedición de mi documento es 2012-05-14" },
    { "adjuntar": "certificado-completo.md" },
    { "mensaje": "Gano 3.800.000 al mes. ¿Puedes verificar mi ingreso?" },
    { "mensaje": "Quiero registrar mi solicitud de 8 millones a 36 meses y que me la preapruebes" }
  ],
  "esperado": {
    "decision": "escalada",
    "causa": "monto_sobre_umbral",
    "codigoBloqueo": "monto_sobre_tope",
    "llamadasRequeridas": ["verificar_identidad", "registrar_extraccion", "verificar_ingreso", "registrar_solicitud"],
    "llamadasProhibidas": ["preaprobar_credito"],
    "eventosRequeridos": ["escalamiento"],
    "estadoCore": {
      "solicitudRegistrada": true,
      "preaprobada": false,
      "ingresoVerificado": 3800000,
      "escalamientoRegistrado": true,
      "entrega": "entregada"
    }
  }
}
```

Reglas del formato:

- `esperado` se expresa solo en decisión, causa, llamadas, eventos y estado del core. No existe un campo para texto de la respuesta.
- El caso 7 sustituye `esperado` por `variantes` (`una-vez` y `siempre`), cada una con su `esperado` y sus `reintentos`.
- El esquema es estricto: un campo desconocido, un nombre de herramienta o de evento fuera de catálogo, o una herramienta a la vez requerida y prohibida invalidan el caso.

## `guion.json` (ejemplo parcial: caso 4)

```json
{
  "clasificacion": { "certificado-completo.md": "certificado_laboral" },
  "extracciones": { "certificado-completo.md": { "…": "salida con la estructura que valida el esquema de extracción" } },
  "pasos": [
    { "llamadas": [], "respuesta": "Hola, ¿cuál es tu número de documento?" },
    { "llamadas": [{ "herramienta": "buscar_solicitante", "entrada": { "documento": "0001234567" } }], "respuesta": "…" },
    { "llamadas": [{ "herramienta": "verificar_identidad", "entrada": { "idSolicitante": "CLI-0001000001", "fechaExpedicion": "2012-05-14" } }], "respuesta": "…" },
    { "llamadas": [{ "herramienta": "extraer_documento", "entrada": { "adjunto": 1 } }], "respuesta": "…" },
    { "llamadas": [{ "herramienta": "verificar_ingreso", "entrada": { "ingresoDeclarado": 3800000 } }], "respuesta": "…" },
    { "llamadas": [
        { "herramienta": "registrar_solicitud", "entrada": { "…": "monto, plazo y citas literales del solicitante" } },
        { "herramienta": "preaprobar_credito", "entrada": {} }
      ], "respuesta": "…" }
  ]
}
```

Reglas del guion:

- Un elemento de `pasos` por cada paso del `caso.json`, en el mismo orden.
- Las `entrada` son las que validan las herramientas reales; las citas de `registrar_solicitud` deben estar literales en lo que dice el solicitante en `caso.json` (el adaptador lo comprueba, #13).
- El guion no contiene ninguna decisión de crédito: si llama a `preaprobar_credito` en el caso 4, el hook de la Regla 2 lo bloquea y el código escala.
- Los textos de `respuesta` no se verifican.

## Garantías

- Ningún documento ni guion contiene datos con forma real (R7 de [research.md](../research.md)).
- Cambiar el nombre de una herramienta o de un evento del catálogo hace fallar la carga del caso, no la ejecución a media marcha.
