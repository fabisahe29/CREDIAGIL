# Research: Extracción estructurada de documentos con subagente

**Feature**: [spec.md](spec.md) · **Plan**: [plan.md](plan.md) · **Fecha**: 2026-10-17

Hechos verificados en el repositorio y en los tipos instalados (`@anthropic-ai/claude-agent-sdk` 0.3.302, `@modelcontextprotocol/sdk` 1.32.1, `zod` 4.6.7, Node v24.21.0), seguidos de las decisiones R1–R11.

## Hechos de partida

- Cada turno del agente es un `query()` independiente. El historial viaja en el prompt y solo guarda el texto del solicitante y la respuesta final del agente ([src/agente/agente.ts](../../src/agente/agente.ts)). **Lo que devuelve una herramienta no llega al turno siguiente**: si un resultado debe sobrevivir, hay que guardarlo fuera del modelo.
- El chat envía un adjunto como `<documento nombre="…">…</documento>` dentro del mensaje ([src/chat/documentos.ts](../../src/chat/documentos.ts)). Un archivo de otro formato, demasiado grande o mal codificado llega como `<documento_no_soportado …/>`. Los adjuntos no tienen número.
- `/pegar … /fin` envía hoy un mensaje de varias líneas, no un documento. Según la US4 del #8, es la vía para **pegar** un certificado o un extracto.
- El chat guarda entre turnos lo que el agente necesita (`busquedasAmbiguas`, `desambiguada`) y lo pasa a `conversar` ([src/chat/sesion.ts](../../src/chat/sesion.ts)).
- El adaptador `originacion` ([src/agente/adaptador.ts](../../src/agente/adaptador.ts)) es el único punto determinista del ciclo de herramientas. Ya tiene `dejarSenal`, `emitirEvento` y la causa `documento_no_soportado` en `CAUSAS_NO_CUBIERTO`.
- El control de identidad ([src/agente/control-identidad.ts](../../src/agente/control-identidad.ts)) bloquea las herramientas de `HERRAMIENTAS_CON_IDENTIDAD`, hoy vacía. El #9 dejó explícito que el #10 agrega aquí su herramienta.
- El core es un servidor MCP aparte, en memoria, que vive toda la ejecución del chat y guarda el estado por `correlationId` ([src/mcp/core-simulado.ts](../../src/mcp/core-simulado.ts)).
- `Options.outputFormat: { type: "json_schema", schema }` hace que `query()` termine con `structured_output` en el mensaje `result`. Si el modelo no logra cumplir el esquema, el `result` llega con `subtype: "error_max_structured_output_retries"`.
- `Options.agents` (subagentes del SDK) los invoca el modelo principal con la herramienta `Task`: el modelo redacta el prompt del subagente y recibe su respuesta como texto.
- `zod` 4 trae `z.toJSONSchema()`, de modo que el esquema de la salida del subagente y el de su validación salen de la misma definición.

## R1. El subagente es una consulta propia lanzada por el código

**Decisión**: el manejador de la herramienta `extraer_documento` lanza un `query()` aparte por cada intento. Ese `query()` tiene:
- un system prompt de extracción fijo;
- un prompt con solo el documento y lo que se espera de él (tipos, campos, reglas de nulos y de fragmentos) y, en un reintento, el error del intento anterior;
- `tools: []`, sin servidores MCP, `settingSources: []`, `persistSession: false` y `maxTurns: 2`;
- `outputFormat` con el JSON Schema de la salida del subagente (R3), en draft-07 y sin `$schema`: el CLI del SDK rechaza el draft 2020-12 que Zod genera por defecto (hallazgo de la validación con el modelo real, tasks.md, T053);
- un tiempo límite de 25 s por intento.

**Motivo**:
- Cumple FR-011 por construcción: el código arma el contexto, así que el subagente no puede recibir la conversación ni otros documentos.
- El resultado vuelve al código, que lo valida antes de que el modelo principal lo vea (Principio III).
- No necesita dependencias nuevas.

**Alternativas descartadas**:
- `Options.agents` con la herramienta `Task`: el modelo principal escribiría el prompt del subagente, podría pasarle la conversación o un documento alterado, y el resultado le llegaría como texto sin validar.
- Que el modelo principal extraiga los datos: mezcla la conversación con la extracción y no hay dónde validar antes de usar.
- Llamar directo a la API de Messages: agrega una dependencia y un segundo camino de autenticación.

## R2. Los documentos se numeran y el modelo solo pasa el número

**Decisión**:
- El chat numera cada documento de la conversación en orden de llegada, desde 1: cada `/adjuntar` y cada bloque `/pegar`. Un adjunto no soportado también recibe número.
- El bloque de un archivo lleva el número: `<documento adjunto="2" nombre="certificado.md">`.
- Un bloque `/pegar` **sigue siendo un mensaje del solicitante** y termina con una marca que compone el chat: `<adjunto_registrado numero="3" nombre="texto pegado"/>` (FR-009). Si pasa de 256 KiB, la marca dice `soportado="no" motivo="tamano"`. La etiqueta se neutraliza en lo que escribe el solicitante, así que no se puede forjar.
- El chat guarda los documentos de la conversación y los pasa a `conversar` en cada turno, como ya hace con `busquedasAmbiguas`.
- `extraer_documento` recibe solo `{ adjunto: number }`. El código toma el texto exacto del documento.

**Motivo**:
- La procedencia se comprueba contra el texto real. Si el modelo transcribiera el documento como argumento, podría alterarlo y la comprobación no valdría nada.
- El número hace único al documento aunque se repita el nombre (aclaración Q3).
- El texto pegado no va dentro de `<documento>` porque el prompt trata ese bloque como dato, nunca como instrucción. Un mensaje pegado que pide hablar con una persona dejaría de valer, y la Regla 4 no se cumpliría. Se ajustó al implementar: el plan inicial enviaba el bloque pegado como documento.

**Alternativas descartadas**:
- El modelo pasa el contenido como argumento: ver arriba.
- `/pegar` sin registrar: la constitución admite documentos pegados, y no se podrían extraer.
- `/pegar` como bloque `<documento>`: rompe la Regla 4 para los mensajes pegados.

## R3. Salida del subagente: valor normalizado más fragmento literal

**Decisión**: el subagente devuelve un objeto con `tipo` (`certificado_laboral`, `extracto_bancario` u `otro`), los campos de su tipo y `conflictos`. Cada campo es `null` o `{ valor, fragmento }`:
- `valor` ya normalizado: montos como enteros de pesos, fechas en AAAA-MM-DD y textos tal cual.
- `fragmento`: la cita literal del documento de la que sale el valor.
- `moneda` lleva el fragmento donde el documento menciona la moneda; el subagente no elige el código.
- `conflictos`: nombres de campos para los que el documento da dos valores distintos.

Ver [contracts/subagente.md](contracts/subagente.md).

**Motivo**: el modelo hace lo que le toca, comprender y extraer, y deja en cada campo la evidencia que el código necesita para comprobarlo (R4).

**Alternativa descartada**: que el subagente devuelva el texto crudo y el código lo normalice. Interpretar "1 de febrero de 2022" o "$3.800.000,00" en código para todos los formatos posibles es frágil, y la comprobación del fragmento ya acota el error.

## R4. El código valida esquema, procedencia y montos

**Decisión**: un módulo compartido, `src/compartido/extraccion.ts`, valida la salida del subagente en este orden:

1. **Esquema** (Zod): tipos, enteros no negativos, fechas de calendario válidas y no futuras.
2. **Procedencia** (FR-008): cada `fragmento` aparece en el documento, comparando con los espacios en blanco colapsados.
3. **Valores en su cita** (ampliado tras la revisión de `0aa8c2a`):
   - montos: los dígitos del `valor` aparecen en su fragmento, una vez quitados los separadores de miles y unos centavos `,00`; unos centavos distintos de cero no pasan;
   - textos (empleador, cargo, titular, descripción): aparecen en su cita, sin distinguir mayúsculas, tildes ni espacios;
   - fechas: aparecen en su cita, en AAAA-MM-DD, con números o con el mes en letras, y no son posteriores a hoy **en Bogotá**;
   - sentido del movimiento: si la cita dice «abono» o «cargo», manda la última de las dos; si no, un `+` o una palabra propia del sentido.
4. **Moneda**: se deduce del fragmento con la tabla de la política (R5), no de lo que diga el subagente. Además, al construir y al revalidar el resultado, se busca una moneda extranjera en **todo** el documento: así la Regla 5 no depende del fragmento que cite el modelo.

Cada falla produce un error `{ campo, motivo }`. El agente lo usa para reintentar y el core lo usa para rechazar.

**Motivo**:
- El salario es el dato que decide la Regla 2 y la Regla 3. Comprobar que el número está en el fragmento, y el fragmento en el documento, impide un salario inventado (SC-002).
- Está en `src/compartido/` porque lo usan el agente y el core (R6).

**Alternativa descartada**: confiar en el `outputFormat` del SDK. Solo garantiza la forma, no que el dato salga del documento.

## R5. Las decisiones de la Regla 5 y los límites van en la política

**Decisión**: `src/politica/politica.ts` suma:
- `TIPOS_DOCUMENTO_SOPORTADOS = ["certificado_laboral", "extracto_bancario"]` (aclaración Q1);
- `MONEDA_SOPORTADA = "COP"` y la tabla de expresiones de moneda. COP solo con expresiones inequívocas: `COP`, "pesos colombianos" o "pesos m/cte"; «pesos» o `$` sueltos no bastan, porque también los usan otros países (revisión de `0aa8c2a`). Para moneda extranjera: `USD`, `US$`, "dólares", "dollars", `EUR`, "euros" y los pesos de otros países (mexicanos, chilenos, argentinos, uruguayos y otros);
- `MAX_INTENTOS_EXTRACCION = 3`.

Un módulo nuevo, `src/politica/documentos.ts`, expone `evaluarDocumento(salidaValidada)`. Devuelve una decisión estructurada (regla, valores, motivo y versión):
- `tipo: "otro"` → caso no cubierto, `documento_no_soportado`;
- moneda extranjera → caso no cubierto, `moneda_extranjera`;
- `conflictos` no vacío → no extraíble;
- en otro caso → extraído, con la lista de campos faltantes.

**Motivo**: la regla de la zona de política exige una sola fuente para los límites y las reglas. Así el adaptador y el core deciden igual.

**Alternativa descartada**: que el subagente responda "caso no cubierto". La Regla 5 la decidiría el modelo.

## R6. El resultado se guarda en el core

**Decisión**: dos herramientas nuevas en el core ([contracts/core-mcp.md](contracts/core-mcp.md)):
- `registrar_extraccion`, con efectos. Recibe el `correlationId`, el adjunto, el nombre, el contenido del documento y el resultado. El core:
  1. rechaza el registro si la identidad no está verificada (Regla 1 del lado del servidor);
  2. valida otra vez el resultado con el módulo de R4 contra el contenido recibido;
  3. guarda el resultado y la huella SHA-256 del contenido, no el contenido.

  Es idempotente por `(correlationId, huella)`.
- `consultar_extracciones`, de solo lectura. Devuelve los resultados de la conversación.

**Motivo**:
- FR-010: el resultado debe sobrevivir entre turnos, y lo que devuelve una herramienta no sobrevive.
- Principio IV: el #11 y el #13 necesitan que el core sepa qué datos salieron de documentos, para rechazar un ingreso que no salió de ellos.
- FR-018: la huella deja reconocer el mismo documento entregado otra vez.

**Alternativas descartadas**:
- Guardarlo en el estado del chat: el core no podría defender la Regla 3 en el #11 y el #13.
- Ejecutar el subagente dentro del core: el core simula el sistema del banco, y el razonamiento con el modelo es del agente.

## R7. Efectos del manejador, decididos por código

**Decisión**: `extraer_documento` hace, en orden:

1. Si el adjunto no existe, es un error de validación. Si el chat lo marcó como no soportado, escala con la Regla 5 y la causa `documento_no_soportado` (FR-016).
2. Consulta las extracciones del core. Si hay una con la misma huella, la reutiliza sin llamar al subagente (FR-018).
3. Llama al subagente hasta `MAX_INTENTOS_EXTRACCION` veces. Cada intento fallido pasa su error al siguiente (FR-012). Un campo nulo no es un error (FR-006).
4. Aplica `evaluarDocumento` y registra el resultado en el core.
5. Según el resultado:
   - **extraído con faltantes**: un solo evento `solicitud_de_dato` por documento, con los campos faltantes. Siempre pide un documento que los traiga (aclaración Q2 para el salario; así ningún dato escrito se mezcla con los extraídos);
   - **caso no cubierto**: deja la señal `caso_no_cubierto` con la Regla 5 y su causa;
   - **no extraíble**: deja la señal con el motivo nuevo `documento_no_extraible`, regla "constitución, Principio V · documento no extraíble", y el último error;
   - **sin respuesta del subagente en todos los intentos**: `falla_transitoria_persistente`, como el #7.
6. Devuelve al modelo el resultado validado con su procedencia, o el aviso del escalamiento.

**Motivo**: los eventos y los escalamientos los decide el código, nunca el modelo (Decisión 5 del #9; Principio III).

**Alternativa descartada**: devolver el resultado y dejar que el modelo pida los faltantes. No sería determinista, y el modelo podría aceptar un salario escrito.

## R8. Identidad: control del agente y del core

**Decisión**: `HERRAMIENTAS_CON_IDENTIDAD = ["extraer_documento"]`. El core también rechaza `registrar_extraccion` sin identidad verificada, con un error `negocio`, código `identidad_no_verificada`.

**Motivo**: cumple FR-004 y el FR-011a del #9 por código y en dos capas (Principio IV). Es el primer uso real del control del #9, que hasta ahora solo se ejercía en pruebas.

**Alternativa descartada**: comprobar la identidad dentro del manejador: duplicaría el control.

**Regla 5 antes que la Regla 1** (agregado tras la revisión de cumplimiento de `0aa8c2a`, FR-015a). La revisión mostró que, sin identidad, el control bloqueaba por la Regla 1 antes de evaluar la moneda o el tipo, contra el orden 4 → 5 → 1. Ahora:
- **Al cerrar cada turno**, `cerrarTurnoDocumentos` aplica `evaluarRegla5Previa`, sin modelo, a todos los documentos: un archivo no soportado o una moneda extranjera en cualquier parte escalan. Va después del turno del modelo, que resuelve la Regla 4, y antes del cierre por identidad. La primera señal prevalece.
- **Al intentar extraer sin identidad**, el control llama a `evaluarRegla5AntesDeIdentidad` antes de bloquear: la revisión sin modelo y después un clasificador que solo devuelve el tipo, sin datos personales. Si el caso no está cubierto, escala por la Regla 5; si lo está, bloquea por la Regla 1.
- **Alternativas descartadas**: clasificar con el modelo cada documento al llegar, antes de la Regla 4 (un texto pegado que pide una persona escalaría por la Regla 5); dejar la Regla 5 solo al prompt (no es determinista).

## R9. System prompt

**Decisión**: se agregan tres instrucciones:
- cuando un solicitante verificado entregue un certificado o un extracto, llamar a `extraer_documento` con su número de adjunto;
- no leer datos de los documentos por cuenta propia: usar solo los que devuelve la herramienta, con su procedencia;
- en un turno posterior, consultar los datos ya extraídos con `consultar_extracciones`.

Se quita "No pidas ni uses documentos de soporte antes de verificar": ahora lo garantiza el control.

**Motivo**: el prompt guía y el código garantiza (R8 del #9).

**Alternativa descartada**: extraer automáticamente cada documento al llegar. Ejecutaría el subagente sin identidad y ante textos pegados que no son documentos de soporte.

## R10. Observabilidad y tiempos

**Decisión**:
- **Log `extraccion`**, uno por documento: `correlationId`, adjunto, nombre, los 12 primeros caracteres de la huella, tipo, resultado, intentos, campos nulos y errores por campo. No lleva el contenido ni los fragmentos (FR-017).
- **Log `intento_extraccion`**, uno por intento: número, resultado y duración.
- **Auditoría en el core**: cada `registrar_extraccion` deja regla, resultado, huella y marca de tiempo. Los valores y fragmentos quedan en el almacén del core, no en los logs.
- **Tiempos**: 25 s por intento del subagente. El peor caso son 75 s dentro del límite de 120 s de la conversación. Si la conversación se aborta, también se aborta el subagente.

**Motivo**: Principio VI. Los logs no llevan el contenido de los documentos.

**Alternativa descartada**: subir el límite de la conversación. Se revisa solo si el quickstart lo muestra necesario.

## R11. Documentos y casos de prueba

**Decisión**: tres casos nuevos en `casos/`. Los tres empiezan con los pasos de identificación de `identidad-unico` (Ana Pérez Ficticia):
- `extraccion-certificado/`: `certificado-completo.md`, con salario de $3.800.000 COP;
- `extraccion-sin-salario/`: `certificado-sin-salario.md`;
- `extraccion-extractos/`: `extracto-2026-07.md`, `extracto-2026-08.md` y `extracto-2026-09.md`. Son del mismo titular y la misma cuenta `000…`, en COP, con el abono de nómina igual al salario del certificado.

Los documentos en dólares y de tipo no soportado viven dentro de las pruebas (supuesto de la spec; #17).

**Motivo**: FR-019 y SC-007. Los mismos archivos sirven a las pruebas y a la demo con `/caso`.

**Alternativa descartada**: reutilizar el certificado de `demo-consulta`. Ese caso no verifica la identidad, y mezclarlo cambiaría su propósito.
