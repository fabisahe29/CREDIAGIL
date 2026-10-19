# Research: Casos de prueba obligatorios de extremo a extremo

Cada decisión sigue el formato Decisión · Motivo · Alternativas descartadas. No quedan marcadores `NEEDS CLARIFICATION`.

## R1. Qué se observa para dar el veredicto

**Decisión**: el resultado observado se arma con tres fuentes del propio sistema, nunca con el texto de la respuesta:

1. El `ResultadoConversacion` de cada turno: `tipo`, `escalamiento` (motivo y causa), `eventos` (incluidos `bloqueo_por_regla`, `preaprobacion` y `escalamiento`), `entrega` y `handoff`.
2. Las llamadas a herramientas, con `alUsarHerramienta` (que ya reporta cada intento de llamada al core con su resultado o código de error) y los eventos de bloqueo, porque un bloqueo de hook ocurre antes de la herramienta y no pasa por ese observador.
3. El estado final en el core, leído por los métodos de lectura del cliente MCP (`consultarSolicitudRegistrada`, `consultarEscalamiento`, `consultarExtracciones`, `consultarVerificacionIngreso`).

**Motivo**: son decisiones y efectos, no redacción (FR-003, FR-004). La fuente 3 prueba el efecto real sobre el core, que es lo que importa si el modelo se equivoca.

**Alternativas descartadas**: comparar el texto de la respuesta o buscar palabras clave, porque el modelo redacta distinto y un caso pasaría por una palabra aunque la decisión fuera otra; leer los logs JSON, porque acopla la prueba a su formato y a la salida estándar.

## R2. Control de la variabilidad del modelo (FR-019, clarificado el 2026-10-19)

**Decisión**: dos modos con los mismos casos y el mismo informe. El **modo guionado** es el predeterminado; el **modo con modelo real** se activa con `--modelo-real` y exige `ANTHROPIC_API_KEY`. El informe imprime el modo en su primera línea.

**Motivo**: la variabilidad del modelo afecta solo a qué herramientas decide llamar y a cómo redacta. Guionar esa capa deja repetible todo lo demás (hooks, política, core, reintentos, escalamiento), que es lo que las reglas no negociables exigen probar. Y la prueba con modelo real queda disponible para el evaluador y para el video sin bloquear el desarrollo.

**Alternativas descartadas**: solo modelo real con temperatura baja, porque el SDK de agentes no garantiza determinismo y habría ruido; reintentar hasta que pase, porque oculta fallos reales (un caso que pasa una de tres veces es un defecto); solo guionado, porque nunca probaría que el modelo real llama bien a las herramientas.

## R3. Dónde se guiona y cómo se conservan los hooks reales

**Decisión**: se inyectan los tres puntos que `conversar` ya expone: `ejecutarConsulta` (un `QueryFn` guionado), `ejecutarSubagente` y `clasificarDocumento`. El `QueryFn` guionado, para cada llamada del guion, hace lo mismo que el SDK: ejecuta los hooks `PreToolUse` de `options.hooks` cuyo `matcher` coincide con el nombre de la herramienta; si alguno la deniega, no llama a la herramienta y devuelve el motivo; si no, llama a `contexto.herramientas[nombre].manejar(...)`. Al terminar emite el mensaje `result` con `stop_reason: "end_turn"` y el texto del guion.

**Motivo**: así los bloqueos por identidad y por la Regla 2, y el escalamiento por código, son los reales; lo único falso es la decisión de qué herramienta llamar. Las pruebas actuales de `agente.test.ts` ya usan este patrón (`contexto.herramientas.X.manejar` y los hooks por separado); aquí se junta en un solo ejecutor reutilizable.

**Alternativas descartadas**: sustituir el core por un doble en memoria, porque dejaría de probar el rechazo del lado del servidor (Principio IV); llamar a las funciones de política directamente desde el ejecutor, porque no probaría los hooks ni el adaptador; grabar y reproducir respuestas del modelo real, porque exige mantener grabaciones y se desactualizan con cada cambio de prompt.

## R4. El guion y su riesgo

**Decisión**: cada caso lleva un `guion.json` que, por cada paso del `caso.json`, lista las llamadas a herramientas que el modelo haría (nombre y argumentos), la salida que daría el subagente por cada documento (con la estructura que ya valida el esquema de extracción) y el texto de la respuesta. El guion no contiene decisiones de crédito. Una prueba verifica que el guion tiene un paso por cada paso del caso y que cada salida de extracción pasa el esquema real.

**Motivo**: el guion es un dato del caso, no código. Que viva junto al caso evita que el modo guionado y el chat deriven.

**Riesgo registrado**: el guion puede decir que el modelo llamaría una herramienta que el modelo real no llamaría. Se mitiga con el modo `--modelo-real`, que corre los mismos casos y los mismos criterios, y con el criterio de que el guion se ajusta a lo que el prompt del sistema le pide al modelo.

**Alternativas descartadas**: un guion en TypeScript junto al ejecutor, porque separa el guion del caso y el chat no puede reutilizarlo; derivar las extracciones del documento con un analizador de texto, porque sería una segunda implementación de la extracción.

## R5. Forma del resultado esperado

**Decisión**: el `caso.json` gana un bloque opcional `esperado` con: `decision` (`preaprobada`, `escalada`, `solicitud_de_dato` o `bloqueada`), `causa` cuando escala, `llamadasRequeridas`, `llamadasProhibidas`, `eventosRequeridos`, `estadoCore` (por ejemplo, solicitud registrada sí o no, ingreso verificado, salario nulo) y `reintentos` para el caso 7. El chat ignora este bloque; el ejecutor lo exige. El esquema sigue siendo estricto: un campo desconocido invalida el caso.

**Motivo**: un único archivo por caso, validado antes del primer envío como ya hace el chat (FR-019 del #8), y las expectativas en términos de decisión y llamadas (FR-003).

**Alternativas descartadas**: un `esperado.json` separado, porque dos archivos pueden desincronizarse; poner las expectativas en el código de prueba, porque el evaluador no las vería junto al caso.

## R6. Cobertura de la lógica determinista sin modelo (US4)

**Decisión**: una auditoría al comienzo de la implementación compara, por cada pieza (bloqueo por hook, cálculo, consistencia, contrato de errores) y por cada borde (monto $5.000.000 y $5.000.001; cuota 30% y por encima; diferencia de 10% y por encima), las pruebas que ya existen en `src/politica/*.test.ts`, `src/agente/control-*.test.ts`, `src/compartido/errores.test.ts` y `src/mcp/*.test.ts`. Lo que falte se agrega. No se reescribe lo que ya está cubierto.

**Motivo**: el repositorio ya tiene pruebas de estas piezas desde tickets anteriores; duplicarlas sería ruido. El criterio de aceptación es que cada borde tenga una prueba a cada lado, y eso se verifica con la auditoría.

**Alternativas descartadas**: volver a escribir las pruebas desde cero, porque duplica y puede divergir; confiar en que ya están, porque SC-005 pide demostrarlo.

## R7. Datos con forma real (US6)

**Decisión**: una prueba, `src/e2e/datos-ficticios.test.ts`, recorre todos los archivos de `casos/` y reutiliza el detector del guardián del repositorio (`datosReales`, [docs/datos-ficticios.md](../../docs/datos-ficticios.md)): señala una cédula, un NIT, una cuenta o una tarjeta con forma real, es decir, que no empiece por `000`. Además falla ante un correo cuyo dominio no termine en `.example` y ante un documento de `casos/obligatorios/` sin la línea «Documento ficticio». La prueba tiene su propio caso negativo: valores con forma real, armados en la propia prueba, deben ser señalados.

**Motivo**: la verificación automática antes de integrar (HU6, escenario 2) solo es creíble si se prueba que detecta el problema.

**Alternativas descartadas**: revisión manual, porque no escala ni queda en la integración continua; una lista negra de nombres reales, porque nombrarlos en el repositorio ya sería un dato real.

## R8. Numeración de los casos

**Decisión**: la numeración canónica es la del issue #17. Los tickets anteriores usaron otra del enunciado; las correspondencias quedan en esta tabla y en el README.

| #17 | Caso | Casos de tickets anteriores que se reutilizan como base |
|-----|------|-----------------------------------------------------|
| 1 | Mensaje de ejemplo con documentos consistentes: se registra y se preaprueba | `preaprobacion-simple` |
| 2 | Certificado laboral sin salario | `extraccion-sin-salario` |
| 3 | Ingreso declarado con diferencia de más del 10% | `ingreso-inflado`, `registro-discrepancia` |
| 4 | Solicitud de $8.000.000 | `preaprobacion-monto-alto` (6 millones; el nuevo sube el monto a 8 millones) |
| 5 | Intento de preaprobar sin identidad verificada | nuevo (`identidad-no-verificable` es otro escenario: tres fechas incorrectas) |
| 6 | Ingresos en moneda extranjera | `ingreso-moneda-extranjera`, `escalamiento-moneda-extranjera` (en #15 se llamó «caso 7») |
| 7 | Falla transitoria del servidor del core | nuevo (el chat ya soporta `CREDIAGIL_FALLA`) |

**Motivo**: las carpetas existentes son autosuficientes y las prueban sus tickets; las nuevas se crean copiando los documentos para que cada caso obligatorio sea autosuficiente.

**Alternativas descartadas**: renombrar las carpetas existentes, porque rompe referencias en specs y tests de tickets anteriores; apuntar a las carpetas existentes desde los nuevos casos, porque `cargarCaso` exige que los adjuntos estén dentro de la carpeta del caso.

## R9. El caso 5 y el bloqueo antes del efecto

**Decisión**: el caso 5 hace que el solicitante pida preaprobar sin haberse identificado. En modo guionado, el guion llama a `preaprobar_credito`, que el hook de identidad deniega; el resultado esperado es: ninguna llamada exitosa a `registrar_solicitud` ni a `preaprobar_credito`, un evento `bloqueo_por_regla` con la Regla 1, y el core sin solicitud registrada ni preaprobación. En modo con modelo real, el modelo puede no intentar la herramienta; entonces el criterio es el mismo sin el bloqueo: ninguna llamada exitosa y ninguna solicitud en el core, y la decisión observada `en_curso` se acepta como `bloqueada`. El esperado lo expresa con `bloqueoRequerido: "solo_guionado"`. La primera ejecución con el modelo real (2026-10-19) lo confirmó: el modelo pidió la identidad sin intentar preaprobar, y sin este ajuste el caso 5 fallaba aunque no hubo ningún efecto.

**Motivo**: lo que no se negocia es que no haya efecto; que el bloqueo ocurra depende de que el modelo lo intente. El modo guionado fuerza el intento para probar el hook; el real prueba que no hay efecto.

**Alternativas descartadas**: exigir el bloqueo también con el modelo real, porque un modelo que no intenta el atajo haría fallar un caso correcto; no exigirlo nunca, porque el modo guionado dejaría de probar el hook.

## R10. El caso 7 y sus dos variantes

**Decisión**: el caso 7 se ejecuta como dos variantes dentro del mismo caso: `una-vez` (la primera llamada falla y el reintento funciona) y `siempre` (se agotan los reintentos). El ejecutor arranca el core con `CREDIAGIL_FALLA` en cada variante; el chat usa la misma variable. El caso pasa si ambas variantes cumplen su esperado. El informe muestra una línea por variante.

**Esperado de `una-vez`**: la primera llamada a `buscar_solicitante` falla con un error transitorio y la segunda funciona (dos intentos); el caso sigue sin escalar.

**Esperado de `siempre`**: tres intentos fallidos (el máximo definido en `reintentos.ts`), escalamiento con motivo `falla_transitoria_persistente`, entrega del resumen `pendiente` (porque el core sigue caído) y ninguna decisión afirmada.

**Motivo**: la spec exige la respuesta honesta en ambos desenlaces (FR-011). El tope de reintentos no se redefine: se lee de `reintentos.ts`.

**Alternativas descartadas**: probar solo una variante, porque dejaría sin verificar uno de los dos desenlaces que pide la spec; un caso 7 por variante, porque rompería la numeración a siete.

## R11. Estado limpio por caso y casos que no se pueden ejecutar

**Decisión**: cada caso (cada variante en el 7) arranca su propio proceso del core con `crearClienteCore` y lo cierra al terminar, en un `finally`. Un caso es «no ejecutable» si falta un documento o el guion, si el `caso.json` es inválido, o si se pidió el modo real sin credenciales; el informe indica la causa y no cuenta el caso como pasado ni como fallido. Una excepción durante un caso es «falló», con su causa, y los demás casos siguen.

**Motivo**: FR-017 y FR-018. Un core por caso es más simple que limpiar el estado de uno compartido.

**Alternativas descartadas**: un core compartido con un reinicio de estado, porque exigiría una herramienta de reinicio en el core que no debe existir (Principio IV); correr los casos en paralelo, porque el ahorro de tiempo no justifica el ruido en los logs.

## R12. Informe y código de salida

**Decisión**: el informe imprime, por caso: número, nombre, esperado resumido, observado resumido (decisión y llamadas) y veredicto, y al final el global. Códigos de salida: `0` si los siete pasan; `1` si alguno falla; `3` si ninguno falla pero alguno no es ejecutable (resultado incompleto, no éxito); `2` si las opciones son inválidas. Con `--json` imprime además el informe como JSON, sin contenido de documentos.

**Motivo**: SC-001, SC-003 y FR-014; separar «incompleto» de «éxito» evita un verde falso.

**Alternativas descartadas**: salir con `0` cuando hay casos no ejecutables, porque un caso que no corrió no puede contar como pasado (FR-018).

## R13. Reproducción en el chat (US5)

**Decisión**: el chat ya reproduce un caso con `/caso <ruta>` y `--caso <ruta>`. Solo se amplía el esquema de `caso.json` para aceptar `esperado` y `falla`, que el chat ignora, y se agrega en el README la instrucción de cada caso (una línea con el comando; en el caso 7, con `CREDIAGIL_FALLA`). Al terminar un caso, el chat ya muestra la decisión y el motivo con los eventos.

**Motivo**: reutiliza lo ya integrado (#8) y garantiza los «mismos documentos y pasos» porque es el mismo `caso.json` que lee el ejecutor.

**Alternativas descartadas**: un comando aparte para el video, porque podría derivar del que prueba el ejecutor.
