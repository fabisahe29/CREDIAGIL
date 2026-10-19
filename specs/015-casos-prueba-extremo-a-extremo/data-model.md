# Modelo de datos: Casos de prueba obligatorios de extremo a extremo

Todo se valida con esquemas Zod estrictos: un campo desconocido o un valor fuera de rango invalida el caso, que se informa como no ejecutable (FR-018). Los tipos se infieren de los esquemas.

## Caso obligatorio (`caso.json`, ampliado)

Extiende el `CasoPrueba` del chat ([src/chat/casos.ts](../../src/chat/casos.ts)). Los campos `nombre`, `descripcion` y `pasos` no cambian.

| Campo | Tipo | Obligatorio | Regla |
|-------|------|-------------|-------|
| `nombre` | texto | sí | no vacío |
| `descripcion` | texto | sí | no vacío |
| `pasos` | lista de `{ mensaje }` o `{ adjuntar }` | sí | al menos uno; cada adjunto existe dentro de la carpeta del caso |
| `numero` | entero 1 a 7 | solo en `casos/obligatorios/` | único entre los casos obligatorios |
| `esperado` | Resultado esperado | solo en `casos/obligatorios/` | ver abajo |
| `variantes` | lista de Variante | no | solo el caso 7; ver abajo |

El chat acepta y descarta `numero`, `esperado` y `variantes`. Si faltan en un caso de `casos/obligatorios/`, el ejecutor lo informa como no ejecutable.

## Resultado esperado

| Campo | Tipo | Significado |
|-------|------|-------------|
| `decision` | `preaprobada` · `escalada` · `solicitud_de_dato` · `bloqueada` | Desenlace final de la conversación del caso |
| `causa` | causa de escalamiento del catálogo de `src/politica/escalamiento.ts` | Solo con `escalada`; una de `peticion_de_persona`, `monto_sobre_umbral`, `cuota_sobre_porcentaje`, `discrepancia_de_ingreso`, `caso_no_cubierto` |
| `motivo` | motivo del catálogo de `MOTIVOS_ESCALAMIENTO` | Opcional con `escalada`; el caso 6 lo usa (`caso_no_cubierto`) y el 7b (`falla_transitoria_persistente`) |
| `codigoBloqueo` | código de `CODIGOS_BLOQUEO` | Opcional; solo si el escalamiento nace del bloqueo de la Regla 2 (por ejemplo, `monto_sobre_tope` en el caso 4) |
| `llamadasRequeridas` | lista de herramientas observables | Deben aparecer con éxito al menos una vez |
| `llamadasProhibidas` | lista de herramientas observables | No deben aparecer con éxito ninguna vez |
| `eventosRequeridos` | lista de tipos de evento del catálogo | Deben aparecer entre los eventos de la conversación |
| `bloqueoRequerido` | `siempre` · `solo_guionado` · ausente | Si se exige un evento `bloqueo_por_regla`. `solo_guionado`: solo en modo guionado; con el modelo real, si no intentó la acción, la decisión `en_curso` se acepta como `bloqueada` mientras no haya efecto (R9) |
| `estadoCore` | Estado esperado del core | ver abajo |

Reglas de validación:

- `decision: "escalada"` exige `causa`; las demás decisiones la prohíben.
- Una herramienta no puede estar a la vez en `llamadasRequeridas` y en `llamadasProhibidas`.
- Los nombres de herramienta, eventos y causas deben existir en sus catálogos; un nombre desconocido invalida el caso.
- Las herramientas observables son las que reporta `alUsarHerramienta`, es decir, las llamadas al core: `buscar_solicitante`, `verificar_identidad`, `registrar_extraccion` (la herramienta `extraer_documento` del modelo termina en esa llamada), `verificar_ingreso`, `calcular_capacidad_pago`, `registrar_solicitud`, `preaprobar_credito`, `consultar_solicitud` y `consultar_extracciones`. Una llamada que un hook bloquea no se observa: se ve como evento `bloqueo_por_regla`. `solicitar_analista` y la entrega del escalamiento no son llamadas observables: se verifican por la decisión, la causa y `estadoCore`.
- Ningún campo es texto libre de la respuesta del agente: no hay un campo para comparar frases (FR-004).

## Estado esperado del core

Se lee con los métodos de lectura del cliente MCP tras el último turno (R1).

| Campo | Tipo | Significado |
|-------|------|-------------|
| `solicitudRegistrada` | booleano | Si existe una solicitud registrada |
| `preaprobada` | booleano | Si la solicitud registrada quedó preaprobada |
| `ingresoVerificado` | entero de pesos o `null` | El ingreso que salió de los documentos; `null` si no se pudo verificar |
| `campos` | lista de `{ documento, campo, valor }` | Datos extraídos clave; `valor: null` para un dato faltante, como el salario del caso 2 |
| `escalamientoRegistrado` | booleano | Si el core guardó un resumen para el analista |
| `entrega` | `entregada` · `pendiente` · ausente | Solo en escalamientos; `pendiente` cuando el core no respondió |

## Variante (solo el caso 7)

| Campo | Tipo | Significado |
|-------|------|-------------|
| `nombre` | `una-vez` · `siempre` | Modo de falla del core; se pasa al core como `CREDIAGIL_FALLA` |
| `esperado` | Resultado esperado | El de esa variante |
| `reintentos` | `{ herramienta, resultados }` | El resultado de cada intento de esa herramienta, en orden (`core_no_disponible` o `ok`); su longitud es el número de intentos y no supera `INTENTOS_MAXIMOS` |

Con variantes, el `esperado` del nivel del caso no se usa: cada variante lleva el suyo.

## Guion del modelo (`guion.json`, solo modo guionado)

| Campo | Tipo | Significado |
|-------|------|-------------|
| `pasos` | lista, un elemento por paso de `caso.json` | Lo que hace el modelo en ese paso |
| `pasos[].llamadas` | lista de `{ herramienta, entrada }` | Llamadas que el modelo haría, en orden; la entrada es la que validan las herramientas reales |
| `pasos[].respuesta` | texto | La respuesta del modelo; no se verifica (FR-004) |
| `clasificacion` | `{ [nombre de adjunto]: tipo de documento }` | Lo que devolvería el clasificador previo |
| `extracciones` | `{ [nombre de adjunto]: salida del subagente }` | Lo que devolvería el subagente de extracción; cada una debe pasar el esquema real de extracción |

Reglas de validación: un elemento de `pasos` por cada paso del caso (si no, el caso es no ejecutable); cada `herramienta` es una de las herramientas del adaptador; cada adjunto del caso tiene `clasificacion` y, si es soportado, `extracciones`.

## Resultado observado

Se construye durante la ejecución; no se persiste.

| Campo | Tipo | Origen |
|-------|------|--------|
| `modo` | `guionado` · `modelo_real` | La opción del comando |
| `decision` | igual que en el esperado, más `en_curso` | Por precedencia: `escalada` si algún turno terminó escalado; si no, `preaprobada` si el core guarda la solicitud preaprobada; si no, `bloqueada` si hubo un evento `bloqueo_por_regla`; si no, `solicitud_de_dato` si hubo un evento `solicitud_de_dato`; si no, `en_curso` (nunca coincide con un esperado) |
| `causa`, `motivo`, `codigoBloqueo` | como arriba | De `escalamiento` en el resultado |
| `llamadas` | lista de `{ herramienta, intento, resultado }` | De `alUsarHerramienta` |
| `eventos` | lista de tipos de evento | De `ResultadoConversacion.eventos`, de todos los turnos |
| `estadoCore` | como arriba | De las lecturas del core |
| `causaNoEjecutable` | texto o ausente | Si el caso no pudo correr |
| `error` | `{ nombre, mensaje }` o ausente | Si una excepción interrumpió el caso |

## Veredicto de caso

| Campo | Tipo | Significado |
|-------|------|-------------|
| `numero`, `nombre`, `variante` | | Identifican el caso |
| `resultado` | `paso` · `fallo` · `no_ejecutable` | |
| `diferencias` | lista de `{ campo, esperado, observado }` | Vacía si pasó; con un elemento por cada criterio incumplido |
| `causa` | texto | Solo con `no_ejecutable` o `fallo` por excepción |

Transiciones: ninguna. El veredicto lo calcula una función pura `evaluar(esperado, observado)`; no tiene estado.

## Informe de ejecución

| Campo | Tipo | Significado |
|-------|------|-------------|
| `modo` | `guionado` · `modelo_real` | |
| `casos` | lista de veredictos, en orden de número | Siete casos; el 7 con una línea por variante |
| `global` | `exito` · `fallo` · `incompleto` | `exito` solo si los siete pasan; `fallo` si alguno falla; `incompleto` si ninguno falla pero alguno no es ejecutable |
| `codigoSalida` | 0, 1 o 3 | Ver [contracts/comando-casos.md](contracts/comando-casos.md) |

## Documento de prueba

Archivo `.txt` o `.md` dentro de la carpeta del caso, con datos ficticios. Debe llevar la línea «Documento ficticio»; correos `.example`; NIT, CC y cuentas que empiecen por `000` (R7). Los hay a propósito incompletos (caso 2), inconsistentes (caso 3) y en moneda extranjera (caso 6).
