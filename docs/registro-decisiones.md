# Registro de decisiones

Decisiones de diseño del proyecto, con su motivo y las alternativas descartadas. La más reciente va primero. Cada entrada enlaza al issue y a la investigación que la respalda.

---

## 2026-10-19 · Paquete de entrega

**Issue**: [#19 — Paquete de entrega](https://github.com/fabisahe29/CREDIAGIL/issues/19)

**Detalle**: [specs/017-paquete-de-entrega/research.md](../specs/017-paquete-de-entrega/research.md), decisiones R1 a R9

### Decisión 1: `DECISIONES.md` es el resumen de dos páginas y el detalle se mueve a este registro

`DECISIONES.md` pasa a tener como máximo 1000 palabras, con una sección por cada una de las 11 necesidades del enunciado. Este archivo es el registro detallado anterior, movido con `git mv` y sin cambios de contenido, salvo las rutas relativas de sus enlaces. Las decisiones de cada plan se anotan aquí.

**Motivo**: el criterio del issue pide dos páginas como máximo y el registro pesaba unos 77 KB. `git mv` conserva su historia, y las palabras hacen medible el límite.

**Alternativas descartadas**: dejar el registro completo en `DECISIONES.md` con un resumen al inicio, porque rompe el límite; borrar el detalle y confiar en los `research.md`, porque se pierde la vista cronológica.

### Decisión 2: comandos propios en TypeScript, sin dependencias, con el `.zip` escrito con `node:zlib`

`npm run entrega:armar` y `npm run entrega:verificar` viven en `src/entrega/`. El `.zip` se escribe y se lee con `node:zlib`.

**Motivo**: funciona igual en Windows y Linux, deja un informe con código de salida y no suma dependencias.

**Alternativas descartadas**: `Compress-Archive` o `zip`, que no filtran de forma fiable y cambian según el sistema; una librería de zip, que agrega una dependencia para pocas líneas de código; armarlo a mano, que es el error humano que se quiere evitar.

### Decisión 3: el `.zip` se arma desde `git ls-files` más `.git/`, con el árbol limpio

**Motivo**: lo versionado es lo que `.gitignore` deja pasar, así quedan fuera dependencias, `.env` y archivos locales sin repetir reglas. No se filtra lo versionado: un archivo prohibido versionado entra al `.zip` y la verificación lo reporta, en vez de ocultarse.

**Alternativas descartadas**: recorrer el disco con exclusiones propias, que duplica `.gitignore` y puede colar archivos locales; `git archive`, que no incluye `.git`.

### Decisión 4: la verificación revisa el `.zip` real, con detectores sobre nombres y contenido

Comprueba nombres prohibidos, `.git`, peso (50 MB), secretos, historial y artefactos de Spec Kit. Un hallazgo bloquea, y el informe da el tipo y la ubicación, nunca el valor.

**Motivo**: el criterio habla del `.zip` que se sube, no del árbol de trabajo. En la primera ejecución real, los detectores de variable y de URL marcaron 6 falsos positivos (valores como `valor-de-prueba` en pruebas del #5 y marcadores como `usuario:token@`). Esos dos detectores descartan lo que se reconoce como ficticio o como marcador de plantilla, igual que pide la constitución; los tokens y las claves privadas nunca se descartan.

**Alternativas descartadas**: una herramienta externa de escaneo de secretos, que es una dependencia fuera del enunciado; revisar solo el árbol, que no ve `.git/config`; reescribir las pruebas y el historial del #5 para esquivar el detector, porque el historial no se reescribe; una lista de archivos exentos, porque un secreto real en un archivo exento pasaría sin avisar.

### Decisión 5: el historial se revisa con `git log` y no se reescribe

Los detectores se aplican al texto de `git log --all -p`, y `origin/main` debe ser antepasado de `HEAD`. Sin `origin/main` el resultado es «no verificable» y el veredicto, «incompleto».

**Motivo**: dentro del `.zip` los objetos de `.git` van comprimidos. Si aparece un hallazgo se reporta y decide la persona que entrega.

**Alternativas descartadas**: descomprimir los objetos de git a mano; reescribir el historial para borrar un hallazgo, que el issue prohíbe.

### Decisión 6: los artefactos de Spec Kit se comprueban por carpeta, sin exigir numeración continua

Cada carpeta de `specs/` necesita spec, plan, tareas y la línea «Issue de origen»; la constitución debe existir.

**Motivo**: la carpeta 016 es de un ticket aún en revisión, así que el hueco es legítimo.

**Alternativas descartadas**: exigir contigüidad, que falla mientras haya un ticket en revisión; cruzar con los issues desde el código, porque en GitHub solo se actúa por el servidor MCP.

### Decisión 7: el README abre con «Inicio rápido» y los cinco minutos se miden en un clon limpio

**Motivo**: el criterio se refiere al README y el evaluador no debe leer secciones de detalle para empezar; el camino sin credenciales va primero.

**Alternativas descartadas**: un documento aparte de «cómo empezar»; medir el tiempo con un script, porque depende del equipo y de la red.

### Decisión 8: el estado de los tickets lo revisa la sesión por el servidor MCP, y el video se verifica a mano

Cada ticket que no esté en Done recibe un comentario con el marcador `crediagil:entrega=estado`. El marcador no es un hito.

**Motivo**: es la Regla 1 (solo el servidor MCP de GitHub) y la Regla 4 (idempotencia por marcador). Ninguna herramienta puede abrir de forma fiable un enlace de Drive sin sesión.

**Alternativas descartadas**: agregar un hito `entrega` al flujo compartido por un caso único; mover tickets a Done a la fuerza; comprobar Drive por código.

---

## 2026-10-19 · Casos de prueba obligatorios de extremo a extremo

**Issue**: [#17 — Casos de prueba obligatorios de extremo a extremo](https://github.com/fabisahe29/CREDIAGIL/issues/17)

**Detalle**: [specs/015-casos-prueba-extremo-a-extremo/research.md](../specs/015-casos-prueba-extremo-a-extremo/research.md), decisiones R1 a R13

### Decisión 1: dos modos de ejecución con los mismos casos, guionado por defecto

`npm run casos` corre con el modelo guionado; `--modelo-real` corre los mismos casos con el modelo real. Solo se sustituyen la consulta al modelo, el subagente de extracción y el clasificador de documentos; el core, los hooks, la política y el adaptador son los reales.

**Motivo**: la variabilidad del modelo solo afecta a qué herramientas llama y a cómo redacta. Guionar esa capa deja repetible todo lo que las reglas no negociables exigen probar, y permite correr en cada commit sin credenciales.

**Alternativas descartadas**: solo modelo real con temperatura baja, porque el SDK no garantiza determinismo; reintentar hasta que pase, porque oculta defectos reales; solo guionado, porque nunca probaría al modelo real.

### Decisión 2: el veredicto sale de decisiones, llamadas y estado del core, nunca del texto

El resultado observado se arma con el resultado de la conversación (decisión, causa, eventos), las llamadas a herramientas y las lecturas del core. El esquema del resultado esperado no tiene un campo para frases de la respuesta.

**Motivo**: una redacción distinta no debe romper un caso, y una decisión equivocada no debe pasar porque la respuesta suene bien. Leer el core prueba el efecto real.

**Alternativas descartadas**: buscar palabras clave en la respuesta; leer los logs JSON, que acopla la prueba a su formato.

### Decisión 3: un core nuevo por caso y «incompleto» distinto de «éxito»

Cada caso arranca y cierra su propio core. Un caso que no puede correr es «no ejecutable» y el comando sale con código 3, no con 0.

**Motivo**: un caso que no corrió no puede contar como pasado, y un estado compartido exigiría una herramienta de reinicio en el core.

**Alternativas descartadas**: un core compartido con reinicio de estado; salir con éxito cuando hay casos sin ejecutar.

---

## 2026-10-18 · Atención de mensajes con varias preocupaciones

**Issue**: [#16 — Atención de mensajes con varias preocupaciones](https://github.com/fabisahe29/CREDIAGIL/issues/16)

**Detalle**: [specs/014-atencion-mensajes-varios-asuntos/research.md](../specs/014-atencion-mensajes-varios-asuntos/research.md), decisiones R1 a R12

### Decisión 1: un asunto es una categoría cerrada de tres, con un estado cerrado de tres

Los asuntos son `solicitud`, `documentos` y `cuota`; el estado es `resuelto`, `pendiente` o `escalado`. Viven en la política, como las causas y las acciones del #15.

**Motivo**: la spec limita los asuntos a lo que el agente ya sabe atender y exige un estado por asunto. Un catálogo cerrado se prueba fila por fila y no admite texto libre del modelo.

**Alternativas descartadas**: asuntos como texto libre que redacta el modelo, porque no se puede verificar que ninguno se pierda; un cuarto asunto «petición de persona», porque esa petición es la causa que escala todo el caso y no algo que se resuelva.

### Decisión 2: el código detecta los asuntos esperados y los une a los que muestran las herramientas

`detectarAsuntos` reconoce por código, con listas cerradas y de forma conservadora, lo que plantea el mensaje. Un asunto esperado sin resultado sale `pendiente`; no desaparece.

**Motivo**: si solo contaran las herramientas que llamó el modelo, un asunto olvidado se perdería sin rastro. La detección también sirve en la Regla 4, donde no hay modelo.

**Alternativas descartadas**: una herramienta `declarar_asuntos`, porque depende de que el modelo la llame y no sirve en la Regla 4; clasificar el mensaje con una llamada previa al modelo, que no es determinista ni «sin investigar».

### Decisión 3: el estado de cada asunto y el bloque de la respuesta los compone el código

El adaptador registra qué pasó con cada llamada; una función pura deduce el estado de cada asunto. Con dos o más asuntos, la respuesta lleva al final un bloque «Estado de tus asuntos»; con uno solo no cambia.

**Motivo**: en una escalada el texto del modelo se descarta, y con él la cuota que ya se había calculado. El estado es una decisión sobre el caso y debe ser reproducible.

**Alternativas descartadas**: que el modelo escriba el estado de cada asunto, porque puede decir «resuelto» sin haberlo estado; reemplazar siempre el texto del modelo por el bloque, que cambia la respuesta de los mensajes de un solo asunto; una respuesta por asunto, que incumple la respuesta única.

### Decisión 4: tras escalar sigue permitida la simulación de cuota

Una señal vigente sigue negando toda herramienta, salvo `calcular_capacidad_pago` cuando la señal no es de la Regla 4 ni una falla técnica.

**Motivo**: la simulación es de solo lectura: no decide, no registra y no cambia la causa. Sin ella, un asunto escalado deja sin respuesta a la pregunta por la cuota, que la política sí cubre.

**Alternativas descartadas**: permitir todas las herramientas, que rompería la Regla 1 y el orden de evaluación; negar la cuota también tras la Regla 5; resolver la cuota antes de escalar con un orden fijo, que depende del modelo.

### Decisión 5: con la Regla 4, los demás asuntos quedan pendientes para el analista

La petición de persona sigue escalando sin modelo ni herramientas. Los demás asuntos detectados salen `pendiente` y viajan al analista en `asuntosPendientes`, un campo opcional y aditivo de `escalar_a_analista`.

**Motivo**: es la aclaración de la spec (Regla 4 prevalece, la pregunta por la cuota no se calcula) y evita que el analista ignore que el solicitante preguntó algo.

**Alternativas descartadas**: calcular la cuota antes de escalar, que contradice «sin investigar primero»; no dejar rastro de la pregunta; mezclar los asuntos en `pendientes`, que son datos que faltan del caso y no preguntas del solicitante.

---

## 2026-10-18 · Escalamiento con criterio y handoff al analista

**Issue**: [#15 — Escalamiento con criterio y handoff al analista](https://github.com/fabisahe29/CREDIAGIL/issues/15)

**Detalle**: [specs/013-escalamiento-analista/research.md](../specs/013-escalamiento-analista/research.md), decisiones R1 a R14

### Decisión 1: la causa es una de cinco y el motivo de la señal se conserva

El resumen lleva una causa cerrada (`peticion_de_persona`, `monto_sobre_umbral`, `cuota_sobre_porcentaje`, `discrepancia_de_ingreso`, `caso_no_cubierto`) que una función de la política deduce del motivo y del código de la Regla 2. El motivo de la señal, de los doce que ya existen, viaja junto a ella.

**Motivo**: la spec fija cinco causas, pero el código ya escala por siete razones más (identidad, documentos, fallas técnicas). Sin el motivo, una falla técnica quedaría llamada «caso no cubierto» sin explicación.

**Alternativas descartadas**: ampliar las causas, porque cambia una spec ya clarificada; reducir los motivos a cinco, porque oculta la razón al analista.

### Decisión 2: la acción recomendada sale de un catálogo cerrado de la política

Siete acciones: las cuatro de la aclaración Q2 y tres para identidad, documentos y fallas técnicas, que Q2 no nombra. La acción la deduce `accionRecomendada` de la política; el agente no la redacta.

**Motivo**: con una sola acción por causa, a una falla técnica le tocaría «revisar tipo de documento o moneda». Un catálogo fijo es reproducible y auditable.

**Alternativas descartadas**: una acción genérica para todas, que Q2 descartó; que el modelo la redacte, porque no es reproducible.

### Decisión 3: el core arma el resumen con lo que ya sabe

`escalar_a_analista` recibe solo la clasificación; el core toma el solicitante, la solicitud, los ingresos, las discrepancias y los datos extraídos de su propio estado y valida el resumen. Una excepción: el monto y el plazo que dijo el solicitante, con su cita, cuando todavía no hay solicitud registrada.

**Motivo**: el mismo principio de #13 y #14: lo que el core ya tiene no lo transcribe el modelo. Las reglas 4 y 5 escalan antes de identificar, así que sin la excepción esos resúmenes nunca traerían monto ni plazo.

**Alternativas descartadas**: que el adaptador componga todo el resumen, porque duplica lecturas justo cuando escalar no puede fallar; que el modelo lo redacte, porque puede inventar.

### Decisión 4: la Regla 4 se decide por código antes de llamar al modelo

`detectarPeticionPersona` evalúa el mensaje con listas cerradas y una negación inmediata. Si coincide, se escala sin llamar al modelo.

**Motivo**: «sin invocar otras herramientas antes» no puede depender de que el modelo respete el orden, y un hook solo puede negar herramientas, no saber qué pidió el solicitante.

**Alternativas descartadas**: reforzar el prompt, que es el comportamiento de hoy; una clasificación previa con el modelo, que no es determinista; un hook que obligue a llamar primero a `solicitar_analista`.

### Decisión 5: se acumulan todas las causas y la principal es la de mayor precedencia

`dejarSenal` guarda cada señal observada; la principal sigue siendo la de la regla anterior en el orden 4 → 5 → 1 → 3 → 2 y las demás van como causas adicionales.

**Motivo**: la señal perdedora hoy se descarta sin rastro, y el analista debe recibir todo lo extraído, validado y pendiente (Principio V).

**Alternativas descartadas**: leer las causas de los logs, que no son un contrato; reevaluar todas las reglas al cerrar el turno.

### Decisión 6: escalar no puede fallar, y la entrega es idempotente por conversación

La entrega al core usa reintentos acotados. Si no llega, la conversación escala igual con la entrega pendiente y un log de error. La clave de idempotencia se calcula con la conversación, y hay un solo escalamiento por conversación.

**Motivo**: escalar es el camino seguro y no puede depender de que el core esté arriba (Principios V y VI). Una clave por conversación evita dos casos para el mismo solicitante.

**Alternativas descartadas**: no escalar si falla la entrega; una clave que incluya el motivo, que permitiría dos entregas.

### Decisión 7: lo que falta se declara como pendiente, no se rechaza

El resumen lleva `pendientes`, una lista cerrada que calcula el core. Un campo ausente que no figura como pendiente es un error; uno declarado pendiente es válido.

**Motivo**: concilia rechazar un resumen que no valida con escalar igual cuando faltan datos, y el analista siempre sabe qué falta.

**Alternativas descartadas**: rechazar el resumen incompleto, que impediría escalar la Regla 4; no declarar los pendientes.

### Decisión 8: las reglas y los motivos pasan a la política

`src/politica/escalamiento.ts` es la única fuente de los motivos, las causas, las acciones y la regla de cada motivo, incluida `REGLA_4`. Los nombres exportados de `adaptador.ts` se mantienen.

**Motivo**: el core necesita la regla de cada motivo y no puede importar del agente.

**Alternativas descartadas**: duplicar las constantes en el core; que el agente envíe el texto de la regla.

### Riesgos residuales aceptados

- Una paráfrasis de la petición de persona que las listas no reconozcan llega al modelo, sin la garantía de «sin herramientas antes».
- La spec no tiene causas propias para identidad y fallas técnicas; se confirma o se enmienda FR-006.
- Si la entrega falla, no hay un proceso que la reintente: queda el log de error y la clave determinista.
- El resumen solo se ve en el proceso del chat, con `--demo`.

---

## 2026-10-18 · Preaprobación automática dentro de la política

**Issue**: [#14 — Preaprobación automática dentro de la política](https://github.com/fabisahe29/CREDIAGIL/issues/14)

**Detalle**: [specs/012-preaprobacion-automatica-politica/research.md](../specs/012-preaprobacion-automatica-politica/research.md), decisiones R1 a R11

### Decisión 1: el tope y el porcentaje van en `politica.ts` y se comparan con enteros

`TOPE_MONTO_PREAPROBACION = 5_000_000` y `PORCENTAJE_MAXIMO_CUOTA_INGRESO = 30`. La Regla 2 se evalúa con `cuota · 100 ≤ 30 · ingreso` en `BigInt`, no con la relación redondeada del #12.

**Motivo**: esa relación se redondea a dos decimales, así que 30,004% daría 30,00% y se preaprobaría un caso fuera de política. La comparación entera es exacta en el borde (Principio III).

**Alternativas descartadas**: comparar la relación redondeada con 30, por el error en el borde; las constantes en el módulo de la herramienta, porque parten la fuente única.

### Decisión 2: la regla es una función pura que usan el hook, el core y las pruebas

`evaluarRegla2` recibe lo que guarda la solicitud registrada y devuelve la decisión explicable. Evalúa en el orden de la constitución: verificación de ingreso (Regla 3), monto y cuota.

**Motivo**: con una sola función las tres capas no pueden discrepar, y cada decisión sale con regla, valores y motivo.

**Alternativas descartadas**: una función por criterio, que deja el orden al llamador; un booleano, porque la decisión debe ser explicable.

### Decisión 3: el modelo no aporta ningún dato

`preaprobar_credito` no tiene campos de entrada: el hook y el core toman todo de la solicitud registrada.

**Motivo**: el criterio prohíbe confiar en montos, cuotas o ingresos que pase el modelo; sin campos no hay nada que alterar.

**Alternativas descartadas**: recibir el identificador de la solicitud, que permitiría preaprobar otra; recibir el monto o la cuota «para comprobar», que invita a confiar en ellos.

### Decisión 4: un hook propio para la Regla 2, y el servidor la repite

`control-preaprobacion.ts` se ejecuta junto al hook de identidad, que sigue aplicando la Regla 1. El core vuelve a aplicar todo con la misma función.

**Motivo**: el criterio pide un hook que recalcule con la solicitud, y la defensa en profundidad pide la revalidación del servidor. Dos reglas distintas no deben mezclarse en un mismo archivo.

**Alternativas descartadas**: ampliar el hook de identidad; solo el hook, que incumple la defensa en profundidad.

### Decisión 5: un bloqueo por la Regla 2 escala con un motivo propio, sin alternativas

La señal `preaprobacion_fuera_de_politica`, de la Regla 2, la deja el código. El agente no ofrece un monto ni un plazo alternativo (aclaración Q2). Faltar la solicitud registrada no escala: pide registrar primero. Con la identidad sin verificar se mantiene el comportamiento del #9.

**Motivo**: el escalamiento lo decide el código y cada motivo lleva su regla y su aviso. Un paso olvidado no es un caso fuera de política.

**Alternativas descartadas**: que el modelo decida si escala; reusar `caso_no_cubierto`, que es de la Regla 5; escalar también la falta de solicitud.

### Decisión 6: la preaprobación es solo la constancia, y la solicitud preaprobada sigue abierta

La solicitud pasa de `en_estudio` a `preaprobada` con la decisión explicable, sin vigencia ni condiciones (aclaración Q1). Una solicitud preaprobada cuenta como abierta.

**Motivo**: la constancia debe quedar con la solicitud que leerá el #15, y un solicitante preaprobado no puede registrar otra.

**Alternativas descartadas**: guardar la preaprobación aparte, con dos registros por solicitud; inventar una vigencia o condiciones que el enunciado no define.

### Decisión 7: la descripción y el prompt no dan el tope ni el porcentaje

La descripción dice que compromete a la fintech y cuándo se usa frente a la simulación, sin los umbrales.

**Motivo**: con los umbrales a la vista el modelo concluiría «sí califica» sin pedirla, o intentaría ajustar los datos para entrar en la política.

**Alternativas descartadas**: citar el tope para explicar un bloqueo, que invita a negociar.

### Riesgos residuales aceptados

- El bloqueo por discrepancia registrada solo se ejerce con pruebas del core y del hook, no con el chat, por el fallo conocido del #13.
- Tras una preaprobación el chat cierra la conversación (comportamiento del #8), así que la repetición solo se prueba en el core y en el adaptador.
- Si el modelo no llama a `preaprobar_credito` tras registrar, el caso queda registrado y sin preaprobar: es seguro, pero lento.

---

## 2026-10-18 · Registro de la solicitud con procedencia

**Issue**: [#13 — Registro de la solicitud con procedencia](https://github.com/fabisahe29/CREDIAGIL/issues/13)

**Detalle**: [specs/011-registro-solicitud-procedencia/research.md](../specs/011-registro-solicitud-procedencia/research.md), decisiones R1 a R11

### Decisión 1: el core toma lo que ya sabe y el modelo solo aporta lo que oyó

`registrar_solicitud` recibe `idSolicitante`, `monto`, `plazoMeses` y la procedencia de cada uno. El solicitante, el ingreso declarado, el ingreso verificado, las discrepancias, las inconsistencias y los datos extraídos los lee el core de su propio estado. No existe un campo de entrada para ellos.

**Motivo**: el ingreso verificado y las discrepancias no pueden salir del modelo (Regla 3). Si nada de lo que el core sabe viaja de vuelta por el modelo, «dato sin procedencia» solo puede ocurrir en lo que dijo el solicitante.

**Alternativas descartadas**: que el modelo envíe todo y el core compare, que añade superficie de error y de manipulación sin ganancia; rechazar el registro sin ingreso verificado, que contradice registrar siempre con identidad verificada.

### Decisión 2: la procedencia es una afirmación o un documento, y se comprueba en dos sitios

Lo que dijo el solicitante lleva `{ tipo: "afirmacion", fragmento }`; lo que salió de un documento, `{ tipo: "documento", adjunto, nombre, fragmento }`. El adaptador comprueba que la cita esté literal en un mensaje del solicitante o en el documento; el core, que el documento esté entre los extraídos.

**Motivo**: es lo máximo que cada lado puede garantizar sin que el core guarde la conversación ni el contenido de los documentos (Principio VI).

**Alternativas descartadas**: comprobar que el monto aparezca en la cita, porque la gente dice «cuatro millones» y se rechazarían registros legítimos; guardar la conversación en el core, que viola no guardar contenido; aceptar cualquier cita, porque una procedencia inventada es peor que ninguna.

### Decisión 3: la Regla 1 en dos capas de código

`registrar_solicitud` entra en `HERRAMIENTAS_CON_IDENTIDAD` y el core vuelve a aplicar `evaluarRegla1` con la identidad del solicitante que se registra. El hook decide con el estado que guarda el core, nunca con lo que afirme el modelo.

**Motivo**: una sola capa deja una puerta; el servidor también se usa directamente desde Claude Code (Principio IV).

**Alternativas descartadas**: solo el hook, que incumple la defensa en profundidad de la constitución; sin `idSolicitante` en la entrada, que impide detectar el intento de registrar a otra persona.

### Decisión 4: el registro sigue permitido tras una señal de escalamiento de la Regla 3

El hook y el adaptador dejan de denegar `registrar_solicitud` si la señal vigente es `discrepancia_de_ingreso` o `inconsistencia_documental`. Con la Regla 4, la Regla 5 o una falla técnica, todo sigue denegado.

**Motivo**: la discrepancia solo existe tras `verificar_ingreso`, que ya escaló. Sin la excepción, el criterio «la discrepancia queda guardada» sería inalcanzable y el analista recibiría un caso sin la solicitud.

**Alternativas descartadas**: dejar el registro al #15, que incumple el criterio del #13; registrar por código al cerrar el turno, que tendría que inventar la procedencia; quitar el bloqueo por escalamiento para todas las herramientas, que rompe las reglas 4 y 5.

### Decisión 5: la clave de idempotencia la calcula el código desde solicitante, monto y plazo

`huella([idSolicitante, monto, plazoMeses])`. Una misma clave devuelve la solicitud registrada; otra clave con una solicitud abierta se rechaza con `solicitud_abierta`.

**Motivo**: el adaptador se crea de nuevo en cada turno, así que una clave aleatoria por turno daría otra cada vez y repetir el registro chocaría con la solicitud abierta. Derivada del contenido, la repetición es idéntica entre turnos.

**Alternativas descartadas**: clave aleatoria por turno, por lo dicho; clave enviada por el modelo, porque un error suyo duplicaría solicitudes; devolver la existente ante otra clave, que oculta un monto o plazo distinto al analista.

### Decisión 6: «solicitud abierta» cuenta solo las registradas por esta herramienta

Las solicitudes de ejemplo del #7, como la de Ana Pérez Ficticia, no bloquean un registro nuevo.

**Motivo**: son datos de prueba de la consulta; si contaran, ninguna demo de Ana podría registrar.

**Alternativas descartadas**: contarlas, por lo dicho; retirarlas, porque las pruebas del #7 las usan.

### Decisión 7: el porcentaje de diferencia es informativo y sale de una función de política

`calcularDiferenciaPorcentaje` usa `BigInt` y dos decimales. La decisión de la Regla 3 sigue en `evaluarDiscrepancia` con la comparación exacta; `VERSION_POLITICA` no cambia.

**Motivo**: el registro debe guardar el porcentaje, y el redondeo a dos decimales no puede mover el borde del 10%.

**Alternativas descartadas**: calcularlo en flotante en el core, por el error en el borde que prohíbe el Principio III; subir la versión de la política, que marcaría un cambio que no ocurrió.

### Riesgos residuales aceptados

- La cita de una afirmación no prueba que el valor esté en ella; el analista ve ambos juntos.
- **Fallo conocido (escenario 5 del quickstart):** tras una discrepancia de ingreso, el modelo no llama a `registrar_solicitud`, aunque el solicitante lo pidió en el mismo mensaje. La señal de escalamiento cierra la conversación dentro de `verificar_ingreso`, y el modelo termina el turno. Se probaron tres ajustes (la indicación en el resultado, el prompt y el prompt reforzado) sin resultado en el chat real. Queda pendiente la decisión de diseño: aplazar la señal al cierre del turno (que cumpliría FR-015) o mover el registro al #15 (que cambiaría FR-015). El escalamiento con entrega completa, que no depende del modelo, sigue siendo del #15.
- Si el solicitante verificado cambia en la conversación, la verificación de ingreso de la otra persona se ignora y la solicitud queda sin ingreso verificado.

---

## 2026-10-18 · Simulación de cuota y capacidad de pago

**Issue**: [#12 — Simulación de cuota y capacidad de pago](https://github.com/fabisahe29/CREDIAGIL/issues/12)

**Detalle**: [specs/010-simulacion-cuota-capacidad-pago/research.md](../specs/010-simulacion-cuota-capacidad-pago/research.md), decisiones R1 a R9

### Decisión 1: la tasa se guarda en puntos base enteros, en `politica.ts`

`TASA_MENSUAL_PUNTOS_BASE = 180` y `TASA_MENSUAL = 180 / 10_000`, que da exactamente `0.018`.

**Motivo**: la constitución pide una única fuente. El entero se muestra como 1,8% sin el ruido de flotante que daría `0.018 × 100`.

**Alternativas descartadas**: guardar `0.018` y derivar el porcentaje al mostrarlo, porque obliga a redondear para escribir 1,8; poner la tasa en el módulo del cálculo, porque parte la fuente única en dos archivos.

### Decisión 2: la cuota se redondea al peso más cercano y la proporción se calcula con enteros

La cuota es `P · i / (1 − (1 + i)^−n)` con un único redondeo, `redondearAlPesoMasCercano`, con la mitad hacia arriba. La proporción cuota/ingreso usa `BigInt`.

**Motivo**: el redondeo al más cercano reproduce el valor de referencia del issue, $206.723 (el exacto es 206.723,34). La proporción exacta deja lista la comparación con el 30% del #14 sin decidir con flotantes (Principio III).

**Alternativas descartadas**: redondear hacia arriba, que daría 206.724 y rompería la referencia; una librería decimal, porque agrega una dependencia para un solo cálculo; la proporción en flotante, por el error en los bordes.

### Decisión 3: el core decide si el ingreso es `declarado` o `verificado`

La herramienta recibe solo `ingresoMensual`. El core marca `verificado` únicamente si la verificación guardada de la conversación está en estado `verificado` y su monto es igual al recibido; en cualquier otro caso es `declarado`.

**Motivo**: un ingreso que dice el solicitante nunca puede presentarse como verificado (Regla 3). Quien clasifica es código, no el modelo.

**Alternativas descartadas**: un parámetro `fuente` que envía el modelo, porque pone la clasificación en el modelo; usar siempre el verificado si existe, porque impide simular un escenario hipotético que el issue permite.

### Decisión 4: la simulación pasa por el core, con una sola descripción compartida

La herramienta vive en el servidor del core y el adaptador la expone. Su esquema y la descripción que lee el modelo están una sola vez en `src/compartido/capacidad-pago.ts`. No entra en la lista de herramientas que exigen identidad.

**Motivo**: el agente actúa solo por herramientas MCP (Principio IV), y el #14 recalculará la cuota con la misma función. La descripción es lo único con lo que el modelo distingue simular de preaprobar, así que no puede estar escrita en dos sitios.

**Alternativas descartadas**: calcular en el adaptador, que deja dos caminos de cálculo; dos descripciones, que podrían divergir; exigir identidad por prudencia, que contradice el criterio de aceptación.

### Decisión 5: la descripción no menciona el 30% ni el tope de monto

Dice que solo simula, que no reemplaza a `preaprobar_credito` y cuándo corresponde cada una, sin dar los umbrales de la Regla 2.

**Motivo**: darle el 30% al modelo lo invita a concluir «sí califica» desde la proporción, que es la confusión que el issue quiere evitar.

**Alternativas descartadas**: citar el 30% para explicar la diferencia, y omitir `preaprobar_credito` hasta el #14, que incumple el criterio.

### Riesgos residuales aceptados

- `preaprobar_credito` se cita antes de existir (llega con el #14); si cambia de nombre, se actualiza la descripción.
- El cambio del prompt, de «no estimas cuotas» a «usa la herramienta», podría llevar al modelo a simular por su cuenta; el quickstart lo comprueba.

---

## 2026-10-18 · Ingreso verificado y validación de consistencia

**Issue**: [#11 — Ingreso verificado y validación de consistencia](https://github.com/fabisahe29/CREDIAGIL/issues/11)

**Detalle**: [specs/009-ingreso-verificado-consistencia/research.md](../specs/009-ingreso-verificado-consistencia/research.md), decisiones R1 a R10

### Decisión 1: el ingreso verificado es el menor entre el salario y el promedio de nómina

Con certificado y extractos, el ingreso es el menor entre el salario del certificado y el promedio mensual de abonos de nómina. El promedio divide entre el número de extractos (los que no traen nómina cuentan con 0) y redondea hacia abajo. Si falta un origen, se usa el otro.

**Motivo**: cada elección va hacia el lado que no infla el ingreso, que es el de menor costo cuando se equivoca (Principio V). Es una función pura de datos con procedencia, sin el ingreso declarado.

**Alternativas descartadas**: usar solo el salario del certificado, o solo el promedio de abonos (un solo documento pesaría por todos); exigir que coincidan (escalaría casos legítimos por diferencias pequeñas); promediar solo los meses con nómina (un mes con nómina entre tres extractos pasaría con el ingreso completo).

### Decisión 2: la discrepancia se compara con enteros y sobre el ingreso verificado

Hay discrepancia cuando `|declarado − verificado| × 100 > 10 × verificado`. Con el verificado en 0 no hay división: no hay ingreso verificado.

**Motivo**: la constitución mide el 10% sobre el verificado, y el borde exacto no puede depender de un flotante (Principio III). El 10% vive solo en `src/politica/politica.ts`.

**Alternativas descartadas**: `Math.abs(d - v) / v > 0.1`, porque 0,1 no es exacto y el borde podría caer en cualquiera de los lados; una librería decimal, porque los enteros bastan.

### Decisión 3: las comprobaciones de consistencia usan reglas deterministas, no similitud

Los nombres se comparan como conjuntos de palabras sin tildes, mayúsculas ni orden. Empleador y pagador coinciden si son iguales o el pagador es un prefijo de al menos dos palabras del empleador, sin sufijos societarios. El pagador se saca de la descripción del abono de nómina: no se agrega un campo al esquema del #10.

**Motivo**: es explicable y reproducible en el borde, y una palabra de más o de menos no se supone igual (Principio V).

**Alternativas descartadas**: igualdad exacta de cadenas (escalaría «S.A.S.» o «del Valle» por forma); distancia de edición (puede juntar a dos personas distintas y no es explicable); un campo «pagador» en el esquema del #10 (reabre su contrato y pide un dato más al modelo).

### Decisión 4: detienen las dos comprobaciones mínimas y las que afectan el ingreso

Detienen la solicitud, y la envían a un analista, el titular frente al solicitante, el empleador frente al pagador, los periodos superpuestos y los periodos de más de 31 días. Los huecos entre meses solo se reportan.

**Motivo**: las dos primeras las pide el issue y la aclaración fija que detienen; las otras dos cambian el promedio, y la regla era «salvo que afecte identidad o ingreso».

**Alternativas descartadas**: que toda inconsistencia detenga (los huecos no cambian el ingreso); que solo el titular detenga (un pagador distinto del empleador invalida la nómina).

### Decisión 5: la reextracción dice la regla que falló, nunca el valor esperado

Una inconsistencia corregible se reextrae una vez por documento y regla, con hasta 3 intentos. El subagente recibe la regla y el valor que él extrajo, no el nombre del solicitante ni el empleador del otro documento. El core solo acepta el reemplazo si recalcula que la inconsistencia vigente existe.

**Motivo**: un extractor que conoce la respuesta esperada tiende a copiarla en lugar de leer el documento. Limitar la ronda y exigir la inconsistencia vigente evita reextraer hasta que el resultado convenga (Principios IV y VI).

**Alternativas descartadas**: decirle el valor esperado; validar antes de registrar con un modo de prueba (el agente necesitaría el nombre del solicitante y el resultado dependería del orden de llegada); dejar reemplazar libremente un registro; reintentar sin tope.

### Decisión 6: el core calcula y el agente nunca le pasa un ingreso verificado

`verificar_ingreso` del core calcula con los registros que ya guardó. Además, el adaptador verifica por código tras cada extracción para que una inconsistencia que detiene escale aunque el modelo no llame a la herramienta.

**Motivo**: la defensa en profundidad (Principio IV): el core no confía en un valor que no calculó, y la consistencia no depende de que el modelo se acuerde de preguntar.

**Alternativas descartadas**: que el agente calcule y el core registre; verificar solo cuando el modelo llame a la herramienta; mezclar la verificación dentro de `registrar_extraccion`.

### Decisión 7: dos motivos de escalamiento de la Regla 3 y el orden completo de reglas

`discrepancia_de_ingreso` e `inconsistencia_documental` son motivos propios, y la prevalencia usa el orden de la constitución `[4, 5, 1, 3, 2]`.

**Motivo**: el analista necesita el motivo exacto y el orden de evaluación es obligatorio (Principio I). El #14 y el #15 reutilizan el mismo mecanismo.

**Alternativas descartadas**: reutilizar `caso_no_cubierto` (una discrepancia no es un caso fuera de política); un único motivo «ingreso».

---

## 2026-10-17 · Extracción estructurada de documentos con subagente

**Issue**: [#10 — Extracción estructurada de documentos con subagente](https://github.com/fabisahe29/CREDIAGIL/issues/10)

**Detalle**: [specs/008-extraccion-documentos/research.md](../specs/008-extraccion-documentos/research.md), decisiones R1 a R11

### Decisión 1: el subagente es un `query()` aparte que lanza el código

El manejador de `extraer_documento` lanza una consulta propia por intento, sin herramientas y con salida estructurada. Recibe solo el documento, lo que se espera de él y, al reintentar, el error del intento anterior. Hace hasta 3 intentos.

**Motivo**: el contexto explícito queda garantizado por construcción, y el código valida el resultado antes de que el modelo principal lo use (Principio III).

**Alternativas descartadas**: subagentes del SDK con la herramienta `Task` (el modelo redactaría el contexto y vería el resultado sin validar); que el modelo principal extraiga los datos; llamar directo a la API de Messages (otra dependencia).

### Decisión 2: los documentos se numeran y la herramienta recibe solo el número

El chat numera cada `/adjuntar` y cada `/pegar` de la conversación y pasa los documentos a `conversar`. El código toma el texto exacto. Un bloque pegado se llama «texto pegado» y sigue llegando como mensaje del solicitante, con una marca final `<adjunto_registrado …/>` que compone el chat; así un mensaje pegado que pide hablar con una persona conserva su valor (Regla 4).

**Motivo**: la procedencia se comprueba contra el documento real, y el número lo hace único aunque se repita el nombre.

**Alternativas descartadas**: que el modelo pase el contenido como argumento (podría alterarlo); dejar `/pegar` sin registrar (no se podrían extraer documentos pegados, que la constitución admite); enviar `/pegar` como bloque `<documento>` (el prompt lo trataría como dato y la Regla 4 dejaría de valer en un mensaje pegado; se descartó al implementar).

### Decisión 3: el código comprueba fragmento, monto y moneda

Cada dato trae la cita literal de la que salió. Un módulo compartido comprueba que la cita está en el documento y que los dígitos del monto están en la cita. La moneda la deduce la política a partir de la cita.

**Motivo**: impide datos inventados, en especial el salario, que decide las reglas 2 y 3.

**Alternativa descartada**: confiar en la salida estructurada del SDK, que solo garantiza la forma.

### Decisión 4: la Regla 5 y los límites de documentos van en la política

`evaluarDocumento` decide extraído, no cubierto (moneda extranjera o tipo no soportado) o no extraíble. Los tipos soportados, la moneda y el límite de intentos viven en `src/politica/politica.ts`.

**Motivo**: una sola fuente para el agente y el core.

**Alternativa descartada**: que el subagente responda "caso no cubierto" (la Regla 5 la decidiría el modelo).

### Decisión 5: el resultado se registra en el core, que revalida

`registrar_extraccion` exige identidad verificada, revalida contra el contenido y es idempotente por la huella del contenido. No guarda el contenido. `consultar_extracciones` lo lee en turnos posteriores.

**Motivo**: lo que devuelve una herramienta no sobrevive entre turnos, y el #11 y el #13 necesitan que el core sepa qué datos salieron de documentos (Principio IV).

**Alternativas descartadas**: guardarlo en el estado del chat (el core no podría defender la Regla 3); ejecutar el subagente dentro del core (el core simula el sistema del banco, no razona).

### Decisión 6: un dato faltante se pide siempre como documento

El código emite un `solicitud_de_dato` por documento con los campos que faltan y pide un documento que los traiga. Tres intentos inválidos o valores en conflicto escalan con el motivo nuevo `documento_no_extraible`.

**Motivo**: el ingreso verificado no puede salir de lo declarado (Regla 3; aclaración Q2), y los eventos los decide el código.

**Alternativa descartada**: dejar que el modelo pida los faltantes (no sería determinista y podría aceptar un salario escrito).

### Decisión 7: la Regla 5 va antes que la Regla 1 y no depende de lo que cite el modelo

Las revisiones de `0aa8c2a` bloquearon el PR por tres razones: «pesos» suelto se tomaba como COP, la moneda solo se miraba en el fragmento que citaba el modelo, y sin identidad se bloqueaba por la Regla 1 antes de evaluar la Regla 5. Ahora:
- COP solo se reconoce con expresiones inequívocas, y los pesos de otros países son moneda extranjera.
- La moneda extranjera se busca en todo el documento, en el agente y en el core.
- Al cerrar cada turno, el código revisa formato y moneda de los documentos sin modelo.
- Al intentar extraer sin identidad, un clasificador que solo devuelve el tipo decide la Regla 5 antes de bloquear por la Regla 1.
- Cada valor se contrasta con su cita: textos, fechas y el sentido de los movimientos, y «hoy» es el día en Bogotá.
- Tras la segunda revisión (`5d28165`): al cerrar el turno se clasifica el tipo de cada documento nuevo, con reintentos y escalamiento si el clasificador no responde; las señales siguen el orden 4 → 5 → 1; los símbolos de moneda pegados a la cifra se reconocen, y un monto no puede salir de una fecha.

**Motivo**: la Regla 5 es determinista y su orden es obligatorio (Principios I y III).

**Alternativas descartadas**: clasificar cada documento con el modelo al llegar, antes de la Regla 4 (un mensaje pegado que pide una persona escalaría por la Regla 5); dejar la detección al prompt.

---

## 2026-10-17 · Identificación y verificación del solicitante

**Issue**: [#9 — Identificación y verificación del solicitante](https://github.com/fabisahe29/CREDIAGIL/issues/9)

**Detalle**: [specs/007-verificacion-identidad/research.md](../specs/007-verificacion-identidad/research.md), decisiones R1 a R9

### Decisión 1: el estado de identidad vive en el core, por conversación

El core guarda en memoria si la identidad de cada conversación (`correlationId`) está verificada, y cuenta los intentos fallidos por solicitante. Solo `verificar_identidad` lo cambia, y `consultar_identidad` lo lee.

**Motivo**: la Regla 1 no puede depender de lo que afirme el modelo, y el #13 necesita que el mismo core rechace un registro sin identidad (Principio IV).

**Alternativas descartadas**: guardarlo en el estado del adaptador (el core no podría aplicar la regla del lado del servidor); un estado global del core (mezclaría conversaciones).

### Decisión 2: tres herramientas separadas y errores del contrato del #7

`buscar_solicitante` (documento o nombre, exactamente uno), `verificar_identidad` (fecha de expedición) y `consultar_identidad` (solo lectura). Un dato que no coincide es un error `negocio`; uno mal formado, un error `validacion`. El tercer fallo responde `verificacion_bloqueada`. Cada intento lleva una clave `idIntento`, que genera el adaptador: si se repite, el core devuelve la misma respuesta sin contar otro fallo.

**Motivo**: cada contrato queda pequeño, y la distinción entre dato que no coincide y dato mal formado sale de la categoría del error, no del texto. La clave evita que un reintento tras un tiempo agotado cuente dos fallos (Principio VI).

**Alternativas descartadas**: una sola herramienta `identificar` (mezcla la búsqueda sin efectos con el intento que cuenta); responder el fallo como éxito con `verificada: false` (la spec pide un error de negocio).

### Decisión 3: se crea el módulo de política con la Regla 1

`src/politica/` nace con `VERSION_POLITICA`, `MAX_INTENTOS_VERIFICACION = 3` y `evaluarRegla1`, que devuelve una decisión estructurada. La usan el core y el control del agente.

**Motivo**: una sola fuente para la regla y su límite (regla de la zona MCP y Principio III).

**Alternativas descartadas**: una constante en el core (el control la duplicaría); esperar al #12 para crear la política.

### Decisión 4: control `PreToolUse` con una lista de herramientas que exigen identidad

Un hook del Agent SDK consulta `consultar_identidad` en el core antes de las herramientas de la lista y las bloquea con un evento `bloqueo_por_regla` si no hay identidad verificada o si el core no responde. Si el core no responde, el control reintenta como el #7 y, al agotar los reintentos, además escala. La lista arranca vacía; el #10 y el #13 agregan sus herramientas.

**Motivo**: el issue pide que los hooks consulten una fuente confiable, y así cada ticket aplica la Regla 1 agregando solo un nombre.

**Alternativa descartada**: comprobar la identidad dentro de cada manejador del adaptador (cada ticket repetiría la comprobación).

### Decisión 5: desambiguación y escalamiento decididos por el adaptador

Ante homónimos, el código emite `solicitud_de_dato` pidiendo el número de documento. Si la ambigüedad sigue en un turno posterior, escala con el motivo `identidad_ambigua`; una verificación bloqueada escala con `identidad_no_verificable`. El escalamiento por ambigüedad se decide al cerrar el turno, no en la llamada: así no depende del orden en que el modelo llama a las herramientas. Dentro de un turno cuenta una sola búsqueda ambigua. Una búsqueda con una sola coincidencia desambigua la conversación: las búsquedas ambiguas posteriores ya no cuentan ni vuelven a pedir el documento, porque el modelo repite la búsqueda en cada turno.

**Motivo**: los eventos y los escalamientos los decide el código, nunca el modelo (Decisión 2 del #8; Principio III).

**Alternativa descartada**: instruir al modelo para que escale (no es determinista).

### Decisión 6: las reglas 4 y 5 escalan por código con `solicitar_analista`

El modelo clasifica el caso con un motivo tipado (`pide_persona` o `caso_no_cubierto`, con su causa) al llamar a `solicitar_analista`, una herramienta del adaptador sin datos del solicitante. El código escala: deja la señal con la regla, emite el evento y registra la auditoría. A partir de ahí, el control `PreToolUse` niega cualquier otra herramienta, incluidas las de identificación. El system prompt pide usarla antes de identificar (orden 4 → 5 → 1).

**Motivo**: las revisiones de cumplimiento de `d37d3a7` y `dea0951` bloquearon el PR. Con solo el prompt, el modelo decía «tu caso pasa a un analista» sin que nada escalara, mientras que la Regla 1 sí se aplicaba por código. El Principio III permite que el modelo comprenda y extraiga datos estructurados; la decisión y el efecto quedan en el código. Es un adelanto acotado del #15 y el #16, que lo ampliarán (resumen para el analista, detección más robusta).

**Alternativas descartadas**: solo la instrucción del prompt (no escala de verdad); un clasificador previo con una llamada extra al modelo en cada turno (más costo y complejidad de lo que pide este ticket); quitar las herramientas de identificación hasta el #15 (el ticket no entregaría su valor).

### Decisión 7: la verificación no se transfiere a otro solicitante

Un intento de verificación sobre otro solicitante invalida la verificación anterior de la conversación. `evaluarRegla1` puede recibir el solicitante de la acción y exigir que sea el verificado. Para que una respuesta repetida no contradiga el estado, el core guarda por `idIntento` solo los fallos; un éxito repetido se evalúa contra el estado actual.

**Motivo**: es el caso borde de la spec, y evita que el #13 herede un control que permita registrar a nombre de quien no se verificó.

**Alternativa descartada**: guardar varias identidades verificadas por conversación (no lo pide la spec y complica la Regla 1).

---

## 2026-10-17 · Interfaz de chat

**Issue**: [#8 — Interfaz de chat](https://github.com/fabisahe29/CREDIAGIL/issues/8)

**Detalle**: [specs/006-interfaz-chat/research.md](../specs/006-interfaz-chat/research.md), decisiones R1 a R9

### Decisión 1: chat de terminal sin dependencias nuevas

La interfaz es un bucle de `node:readline` con etiquetas de texto fijas (`Tú`, `Agente`, `[ESCALAMIENTO]`…) y color opcional con `styleText`. Se inicia con `npm run chat`.

**Motivo**: la aclaración Q3 de la spec y el principio de simplicidad: el diseño visual no se califica y las etiquetas se leen igual sin color, en el video y en las pruebas.

**Alternativas descartadas**: página local en el navegador (servidor web y UI que el enunciado no exige); Ink o blessed (dependencias nuevas).

### Decisión 2: catálogo único de eventos de negocio, emitidos solo por código

`src/compartido/eventos.ts` define con Zod `preaprobacion`, `solicitud_de_dato`, `escalamiento` y `bloqueo_por_regla`. Los emite el adaptador con `emitirEvento`, `conversar` los devuelve y la interfaz los valida otra vez antes de mostrarlos. El estado visible de la solicitud sale solo de esos eventos.

**Motivo**: los tickets #9 a #16 solo emiten el evento y la interfaz lo muestra sin cambios. Que los emita el código, y no el modelo, mantiene el estado determinista (Principio III).

**Alternativas descartadas**: que el modelo marque los eventos en su texto; una herramienta `emitir_evento` para el modelo (podría declarar una preaprobación que la política no decidió); confiar solo en el tipo de TypeScript sin revalidar.

### Decisión 3: historial explícito en lugar de `resume` del SDK

Cada turno sigue siendo un `query()` independiente, con `persistSession: false`. `conversar` recibe el historial de la conversación y lo antepone al mensaje nuevo.

**Motivo**: conserva el modelo del #7 (clasificación del `result`, reintento y escalamiento por turno) y no deja documentos en disco fuera del repositorio.

**Alternativas descartadas**: `resume` con el `session_id` (persiste la transcripción en `~/.claude/projects/` y un reintento hereda mensajes parciales); un único `query()` con entrada en streaming (un error del modelo terminaría toda la conversación).

### Decisión 4: documentos con límites y no soportados entregados como metadatos

Solo se lee un `.txt` o `.md` de 256 KiB como máximo, en UTF-8 válido y sin bytes nulos; viaja en un bloque `<documento>`. Cualquier otro archivo llega al agente solo con su nombre, tipo y motivo, para que el agente escale por la regla 5. Los logs registran solo los metadatos.

**Motivo**: la constitución fija la entrada en texto y prohíbe documentos completos en los logs. La interfaz no decide nada sobre la solicitud.

**Alternativa descartada**: rechazar el archivo en la interfaz sin avisar al agente (la interfaz estaría decidiendo y el caso no se escalaría).

### Decisión 5: casos de prueba JSON en `casos/` y texto largo con `/pegar`

Un caso es `casos/<nombre>/caso.json` con pasos `mensaje` o `adjuntar`, y se valida por completo antes de enviar el primer paso. El texto de varias líneas se envía con `/pegar` … `/fin`.

**Motivo**: JSON se valida sin dependencias nuevas. Un marcador explícito para el texto largo es determinista en cualquier terminal.

**Alternativas descartadas**: YAML (dependencia nueva) o Markdown con secciones (analizador propio); detectar el pegado por tiempo entre líneas o con *bracketed paste* (no es uniforme entre terminales).

---

## 2026-10-17 · Esqueleto del agente y del servidor MCP de originación

**Issue**: [#7 — Esqueleto del agente y del servidor MCP de originación](https://github.com/fabisahe29/CREDIAGIL/issues/7)

**Detalle**: [specs/005-esqueleto-agente-mcp/research.md](../specs/005-esqueleto-agente-mcp/research.md), decisiones R1 a R4 y R7

### Decisión 1: el core como servidor MCP stdio y el agente en otro proceso

`src/mcp/` es el servidor MCP del core simulado (`crediagil-core`), construido con el SDK oficial de MCP y registrado en `.mcp.json`. `src/agente/` es el agente, con el Claude Agent SDK, que habla con el core como cliente MCP por stdio.

**Motivo**: es lo que fija la constitución (Principio IV) y separa de verdad el razonamiento de la ejecución. El core se prueba sin el modelo y se usa también desde Claude Code.

**Alternativas descartadas**: el core dentro del proceso del agente (no serviría para Claude Code); el core como funciones llamadas directamente (no es MCP).

### Decisión 2: reintentos deterministas en un adaptador MCP en el mismo proceso del agente

El agente no recibe el servidor del core directamente, sino un servidor MCP en su propio proceso (`createSdkMcpServer`, clave `originacion`). Cada manejador llama al core, reintenta 2 veces ante un error transitorio (500 ms y 1000 ms ±20%) y, si se agotan los intentos, deja la señal de escalamiento y devuelve `transitorio_agotado`, que no es reintentable.

**Motivo**: el Agent SDK ejecuta el ciclo de herramientas sin devolver el control al código, y ningún hook reintenta una herramienta. El manejador es el único punto determinista: el reintento no depende de que el modelo decida volver a intentar (Principios III y VI).

**Alternativas descartadas**: dejar el reintento al modelo (no es determinista); reintentar en un hook `PostToolUse` (no está soportado); reintentar dentro del core (ocultaría la falla que se quiere probar).

**Consecuencias**: `transitorio_agotado` es la única excepción a «transitorio implica reintentable», documentada en el modelo de datos.

### Decisión 3: contrato de errores compartido y validación estricta en el manejador

`src/compartido/errores.ts` define con Zod las 4 categorías (`transitorio`, `validacion`, `negocio` y `permisos`), `reintentable`, `codigo`, `mensaje` y `campo`. El contrato viaja en `structuredContent`; una consulta vacía es un éxito.

El esquema de entrada que anuncia el servidor es descriptivo pero permisivo. La validación estricta, que incluye campos extra y un `correlationId` que no sea UUID, la hace el manejador. Así una entrada inválida devuelve `validacion` con su campo (FR-008), y no el error genérico del SDK.

**Motivo**: un solo contrato que el agente interpreta por categoría, nunca por el texto del mensaje (FR-009).

**Alternativas descartadas**: errores como texto libre; solo `isError: true`; un esquema de entrada estricto en el SDK, que responde con su propio formato de error.

### Decisión 4: toda conversación sin respuesta válida escala

El agente interpreta el `result` del SDK. Solo `success` con `stop_reason` `end_turn` es una respuesta; todo lo demás escala, con un aviso fijo compuesto en código y una señal de auditoría (motivo, regla, resultado, `correlationId` y `ts`). Los motivos posibles son `falla_transitoria_persistente`, `respuesta_incompleta`, `limite_de_turnos` y `falla_del_agente`. Ante un error de ejecución, la conversación se reintenta una vez tras 1 s ±20% antes de escalar.

**Motivo**: el Principio VI dice «si se agotan, la solicitud se escala; nunca se decide sin respuesta». Que el código componga los avisos garantiza que no aparezca un resultado inventado. La documentación del Agent SDK no confirma que reintente los errores de la API, por eso el reintento es explícito.

**Alternativas descartadas**: responder «intenta más tarde» sin escalar; dejar que el modelo redacte el aviso; varios reintentos del modelo (multiplican el costo en tokens).

### Decisión 5: pruebas sin red ni modelo

`query()` se inyecta en `conversar`. Las pruebas pasan secuencias de mensajes del SDK y reciben el adaptador real para simular llamadas a herramientas. El servidor, el cliente y el adaptador se prueban contra el proceso stdio real, con la falla configurada por entorno.

**Motivo**: la regla de tests prohíbe depender de red o del modelo real, y el Agent SDK no ofrece un transporte falso.

**Alternativas descartadas**: Vitest con mocks de módulos; probar solo con el modelo real (cuesta tokens y no es reproducible).

### Versiones y diferencias con la documentación

- Instalado: `@anthropic-ai/claude-agent-sdk` 0.3.302, que trae `@modelcontextprotocol/sdk` 1.32.1 (línea 1.x) y **Zod 4.6.7**. Hay una sola versión de cada una (`npm ls`).
- `strictMcpConfig` no existe en las opciones de esta versión del Agent SDK. No hace falta: con `settingSources: []` no se carga el `.mcp.json` del proyecto, y el agente solo ve el servidor que le pasa el código.
- `tool()` del Agent SDK sí admite devolver `structuredContent`; no hizo falta la variante con JSON en texto.

### Riesgos residuales aceptados

- **El agente con el modelo real** solo se valida a mano (quickstart, Escenarios 3 y 4): consume tokens y no se puede reproducir en las pruebas automáticas (SC-001).
- **La auditoría del escalamiento** es el log JSON por stderr; el almacén durable llega con el handoff del #15.
- **`respuesta_fuera_de_contrato` usa la categoría `negocio`**, la menos mala de las no reintentables entre las 4 fijas del contrato.

---

## 2026-10-16 · Revisión independiente y de cumplimiento antes del pull request

**Issue**: [#6 — Revisión independiente y de cumplimiento antes del pull request](https://github.com/fabisahe29/CREDIAGIL/issues/6)

**Detalle**: [specs/004-revision-independiente-pr/research.md](../specs/004-revision-independiente-pr/research.md), decisiones R1 a R7 y R9; tiempo y reintentos en R8

### Decisión 1: dos revisores como subagentes propios

`.claude/agents/revisor-codigo.md` revisa el diff y entrega hallazgos con severidad. `.claude/agents/revisor-cumplimiento.md` audita el diff contra las 5 reglas de negocio de la constitución y entrega el estado de cada una, con evidencia o motivo.

**Motivo**: son dos roles con criterios y formatos distintos. Separados, cada uno tiene su propio contexto aislado y un prompt más corto. Cumplen el mínimo de 2 subagentes.

**Alternativas descartadas**:

- **Un solo revisor que hace las dos revisiones**: mezcla criterios y no cumple el mínimo.
- **Subagente `general-purpose` con instrucciones en la skill**: no permite fijar herramientas por rol.

**Consecuencias**: los revisores no ven la conversación de la sesión autora (lo garantiza la plataforma) y reciben todo en un paquete de revisión (Decisión 4).

### Decisión 2: solo lectura en tres capas

1. **Subagente**: `tools: Read, Grep, Glob` y `disallowedTools` con las herramientas de escritura, shell, `Agent` y `mcp__*`.
2. **Skill**: `disallowed-tools` con la misma lista y `allowed-tools: Read, Grep, Glob`.
3. **Guardián**: el control `revisores` niega cualquier otra herramienta cuando `agent_type` es un revisor.

**Motivo**: un revisor con shell podría escribir aunque no tenga Edit ni Write. La tercera capa es determinista y tiene pruebas.

**Alternativas descartadas**:

- **Bash con especificadores** (`Bash(git diff:*)`): no está documentado para `tools`.
- **Solo `allowed-tools`**: solo preaprueba herramientas; no restringe.

### Decisión 3: dos skills `context: fork` que solo dispara el flujo

`revisar-codigo` y `revisar-cumplimiento` usan `context: fork`, `agent:` (su revisor), `background: false`, `argument-hint`, `allowed-tools`, `disallowed-tools` y `user-invocable: false`. `/ticket-abrir-pr` las invoca con la herramienta Skill antes de crear el PR.

**Motivo**: cumplen el mínimo de 2 skills con los tres campos que pide el enunciado. Con `background: false`, el resultado vuelve en el mismo turno. Ocultas del menú, no son comandos del desarrollador (aclaración Q3).

**Alternativas descartadas**:

- **Skills invocables por el desarrollador**: contradicen la aclaración Q3.
- **Skills sin `context: fork`**: correrían en la sesión autora, sin aislamiento.

**Consecuencias**: la documentación no confirma que una skill reciba el resultado de otra con `context: fork`. Se valida primero (quickstart, Escenario 0); el respaldo es lanzar los subagentes con la herramienta Agent.

### Decisión 4: paquete de revisión determinista

`revision.ts preparar` escribe en `.git/crediagil/revisiones/<sha>/` el `paquete.json` (rama, issue, `sha` de `origin/<rama>`, base, archivos cambiados, spec y constitución) y el `diff.patch`.

**Motivo**: el alcance queda fijado por un `sha` (aclaración Q2) y el revisor no necesita shell. `.git/` no se versiona, así que el paquete nunca entra en un commit.

**Alternativas descartadas**:

- **El diff en el mensaje de la tarea**: ocupa el prompt y lo copiaría la sesión a mano.
- **Carpeta temporal del sistema**: fuera del proyecto y con rutas distintas por plataforma.

### Decisión 5: el informe lo captura un hook `SubagentStop`

Cada revisor termina con un bloque JSON. `.claude/revision/capturar.ts` lo extrae de `last_assistant_message` y lo valida (V1 a V8: las 5 reglas exactamente una vez, evidencia obligatoria, alcance del diff y sin datos con forma real). Si es inválido, el revisor lo corrige una vez; si vuelve a fallar, queda un `fallo-<tipo>.json`.

**Motivo**: la decisión de abrir el PR depende del informe. Que la sesión principal lo copie a mano sería un paso no determinista y alterable (Principio III).

**Alternativas descartadas**:

- **La sesión principal escribe el informe con Write**: paso manual y alterable.
- **El revisor escribe su archivo**: necesitaría Write.
- **Validar con Zod**: obligaría a `npm install` antes de poder abrir un PR.

### Decisión 6: la decisión por gravedad es código

`revision.ts decidir` bloquea si hay una regla `incumplida`, un hallazgo o restricción `alta` o `critica`, o una revisión fallida (aclaración Q1). Escribe `decision.json`.

**Motivo**: el modelo clasifica, pero la regla que decide se aplica en código con pruebas: la misma entrada da siempre la misma decisión.

**Alternativa descartada**: que `/ticket-abrir-pr` decida leyendo los informes, que es el modelo aplicando la regla a criterio.

### Decisión 7: registro en el issue, reutilizable y enlazado desde el PR

Cada revisión deja un comentario con marcador `<!-- crediagil:revision=<tipo>;commit=<sha> -->` y el informe embebido (aclaración Q4; Regla 7 de `.claude/flujo-github.md`). Al reintentar sobre el mismo commit, `revision.ts reutilizar` reconstruye la decisión desde esos comentarios sin lanzar los revisores. El cuerpo del PR resume ambas revisiones y enlaza los registros.

**Motivo**: es el mismo mecanismo idempotente del #3, y el registro queda autosuficiente para auditar y reutilizar desde cualquier clon.

**Alternativas descartadas**:

- **Comentarios en el PR**: el PR no existe si la decisión bloquea.
- **Archivo versionado de revisiones**: ensucia el diff del ticket y pasa a ser parte de lo revisado.

### Decisión 8: la puerta del PR en dos capas

1. **Flujo**: `/ticket-abrir-pr` ejecuta preparar → revisores → decidir antes de crear el PR.
2. **Guardián**: el control `puerta-pr` niega `mcp__github__create_pull_request` sin un `decision.json` favorable para el head de `origin/<head>`, y niega escribir a mano bajo `.git/crediagil/`. También niega publicar en el issue un registro de revisión distinto del que generó `revision.ts` (guardado como `registro-<tipo>.md`) y editar uno ya publicado.

**Corregido tras la primera revisión real** (commit `4b14c57`): el propio revisor de código encontró que `puerta-pr` se podía esquivar con rutas como `src/../.git/crediagil/…` (alta) y que `reutilizar` aceptaba registros del issue escritos a mano (media). `normalizarRuta` ahora resuelve `.` y `..`, la comparación ignora mayúsculas, y los registros deben coincidir con los generados.

**Motivo**: «no se abre un PR sin revisión» no puede depender solo de que el modelo siga la skill (Principio IV, defensa en profundidad). El guardián lee un archivo local: sin red en el camino del bloqueo.

**Alternativas descartadas**:

- **Solo el flujo**: el modelo podría crear el PR saltándose los pasos.
- **El guardián consulta el issue en GitHub**: red y credenciales en el camino del bloqueo.
- **Protección de rama en GitHub**: fuera de alcance.

### Riesgos residuales aceptados

- **Redirecciones de shell sobre `.git/crediagil/`**: `puerta-pr` niega Write, Edit y MultiEdit, pero una redirección en un comando de shell no se puede analizar con certeza, como los comandos ofuscados del #5.
- **Calidad de la clasificación**: la severidad y el estado de cada regla los decide el modelo. La validación impide informes incompletos, pero no un juicio equivocado. La revisión humana del PR sigue disponible.
- **Matcher cerrado del guardián**: el control `revisores` solo ve las herramientas que lista el matcher de `PreToolUse`. Una herramienta nueva fuera de la lista no pasaría por el guardián. Se acepta porque las capas 1 y 2 (subagente y skill) no se la dan al revisor, y un matcher `.*` haría correr el guardián en cada herramienta, lo que el #5 descartó.
- **Tiempo y reintentos** (R8): no hay tiempo límite de reloj para subagentes; lo sustituye `maxTurns: 40`, que se mide con el paquete real del ticket antes del primer PR. Hay un único reintento por revisión, sin backoff, porque las fallas que cubre no son transitorias.

---

## 2026-10-15 · Guardarraíles del repositorio con hooks

**Issue**: [#5 — Guardarraíles del repositorio con hooks](https://github.com/fabisahe29/CREDIAGIL/issues/5)

**Detalle**: [specs/003-guardarrailes-hooks/research.md](../specs/003-guardarrailes-hooks/research.md), decisiones R1, R2, R3, R4, R5, R7, R8 y R10; riesgos en R9

### Decisión 1: hooks de Claude Code en la configuración compartida

Los controles son dos hooks `command` declarados en `.claude/settings.json`:

- el guardián (`PreToolUse`), que bloquea antes de ejecutar;
- el formateador (`PostToolUse`), que actúa después de cada edición.

**Motivo**: se ejecutan de forma determinista en cada acción del modelo, sin depender de que alguien los recuerde, y llegan a todos al clonar.

**Alternativas descartadas**:

- **Solo reglas en `CLAUDE.md` o `.claude/rules/`**: el modelo puede ignorarlas.
- **Hooks de Git (`pre-commit`)**: actúan cuando el dato ya se escribió y no cubren la lectura de secretos.

### Decisión 2: un solo guardián que agrega todos los motivos

`.claude/hooks/guardian.ts` ejecuta los tres controles (`secretos`, `datos-reales` y `spec-primero`) y devuelve un único *deny* con todos los motivos.

**Motivo**: el modelo recibe en un solo mensaje todo lo que tiene que corregir. Además, Node arranca una sola vez por acción.

**Alternativas descartadas**:

- **Un hook por control**: los hooks corren en paralelo, así que el modelo recibiría mensajes fragmentados, y Node arrancaría N veces por acción.
- **Matcher `.*`**: ejecutaría el guardián también en herramientas sin riesgo.

### Decisión 3: datos con forma real y convención ficticia "prefijo `000`"

**Qué se detecta**:

- **Tarjetas**: por dígito de control Luhn, en cualquier contexto.
- **Cédulas, NIT y cuentas**: solo cuando hay una palabra clave en la misma línea.
- **Convención ficticia**: todo identificador ficticio empieza por `000`. Su fuente única es `.claude/hooks/lib/convencion-ficticia.ts`, y [docs/datos-ficticios.md](datos-ficticios.md) es su versión para personas; una prueba mantiene ambos sincronizados.

**Dónde se revisa**: el contenido escrito, el texto completo de los comandos y los textos de las herramientas MCP.

**Motivo**:

- Luhn distingue una tarjeta de un monto.
- Para los demás tipos, la palabra clave es la única señal simple que los separa de un monto.
- Ningún identificador real empieza por `000`.

**Alternativas descartadas**:

- **Detección por longitud**: bloquea montos.
- **Marcador textual** (`FICTICIO-…`): rompe los campos numéricos.
- **Lista blanca de valores**: hay que mantenerla en cada ticket.
- **Revisar solo los comandos que escriben**: no se puede decidir con certeza qué comando escribe.

**Consecuencias**: un monto de 10 o más dígitos en la misma línea que la palabra "cuenta" se bloquea, y hay que reformular la línea. La propia implementación lo encontró en tres líneas de la documentación del ticket, que se reescribieron.

### Decisión 4: secretos en dos capas

1. **El guardián** bloquea:
   - las herramientas de archivos sobre `.env` y `.env.*`;
   - los comandos que nombran esos archivos o los alcanzan con un comodín;
   - los comandos recursivos que los alcanzan sin excluirlos.
2. **`permissions.deny`** en `.claude/settings.json` bloquea `Read` y `Edit` de esos archivos, con una negación para `.env.example`.

**Motivo**: el guardián cubre la shell, que las reglas de permisos no cubren. Las reglas `deny` siguen activas aunque alguien apague los hooks.

**Alternativas descartadas**:

- **Solo `permissions.deny`**: no cubre Bash ni PowerShell.
- **Reglas `Bash(cat .env)`**: la documentación advierte que no son un límite de seguridad.
- **Sandbox**: va más allá de lo que pide el ticket.
- **Confiar en `.gitignore`**: Read y Glob no lo respetan.

### Decisión 5: fallar cerrado

El guardián convierte cualquier error en un *deny* con su causa. Además, el hook declara `onFailure: "block"` y `timeout: 10`.

**Motivo**: por defecto, un hook que falla deja pasar la acción. `onFailure` cubre lo que el `try/catch` no alcanza: que falte Node, un error de sintaxis o un tiempo agotado.

**Alternativa descartada**: el comportamiento por defecto (*fail-open*).

**Consecuencias**: requiere Claude Code v2.1.295 o posterior.

### Decisión 6: spec primero, por rama e `Issue de origen`

El número del ticket sale de la rama `<N>-slug`. Escribir bajo `src/` exige una spec cuya línea `**Issue de origen**` apunte al #N.

- Los tests bajo `src/` también cuentan como código de producción (aclaración Q1).
- Se revisan también las escrituras por shell hacia `src/`.

**Motivo**: reutiliza la convención de ramas de `/ticket-tomar` y la línea obligatoria de las specs, sin estado adicional.

**Alternativas descartadas**:

- **La feature activa de `.specify/feature.json`**: no ata la edición al ticket de la rama.
- **"Cualquier spec"**: casi nunca bloquea.

### Decisión 7: TypeScript ejecutado por Node, sin compilar ni dependencias en el bloqueo

Los hooks están en TypeScript `strict` y se ejecutan con `node` directamente (Node 22.18 o superior). Las pruebas usan `node --test`. La entrada se valida con guardas de tipo propias en lugar de Zod.

**Motivo**: es el stack de la constitución, y los bloqueos funcionan al clonar, sin `npm install`.

**Alternativas descartadas**:

- **Scripts Bash o PowerShell**: no son portables.
- **`tsx` o Zod**: suman dependencias al camino del bloqueo.
- **Vitest**: no hace falta para probar funciones puras.

### Decisión 8: Prettier en `PostToolUse`, solo para código

El formateador aplica Prettier a los archivos `.ts`, `.tsx`, `.js`, `.mjs`, `.cjs` y `.json` editados. Si falla, conserva la edición y avisa al modelo.

**Motivo**: es el formateador estándar del stack, y Markdown queda fuera para no reescribir specs.

**Alternativas descartadas**:

- **Biome**: menos extendido.
- **Formatear en un hook de commit**: no cumple "después de cada edición".
- **Incluir Markdown**: reescribiría las specs.

**Consecuencias**: el formateador necesita `npm install`; los bloqueos no.

### Riesgos residuales aceptados

- **`disableAllHooks`** en la configuración local o de usuario apaga los hooks. Las reglas `deny` siguen protegiendo `.env`, y bloquearlo de verdad requiere configuración gestionada.
- **Comandos ofuscados** (nombres armados en tiempo de ejecución, `eval`): el análisis estático no los detecta.
- **Ediciones fuera de Claude Code**: fuera del alcance de este ticket.
- **Falso positivo: texto que nombra `.env`**. El control de secretos trata como ruta cualquier palabra de un comando que coincide con un archivo protegido, también dentro de un heredoc o del mensaje de un commit. Por ejemplo, `git commit -F - <<'EOF' … archivos .env … EOF` se bloquea. Se acepta porque bloquea de más y nunca de menos. Mientras tanto, se reformula el texto (por ejemplo, "archivos de entorno"). Detectado en la validación manual T032.
- **Falso positivo: búsqueda recursiva en una carpeta que no existe**. `alcance()` descarta las rutas inexistentes y, si no queda ninguna, toma la raíz como alcance. Por eso `grep -r cuota src/` se bloquea mientras `src/` no exista, aunque nunca leería un `.env`. Con una carpeta existente pasa (`grep -r cuota specs/`). Se acepta porque bloquea de más y desaparece cuando se cree `src/` (issue #7). Detectado en la validación manual T032.

---

## 2026-10-15 · Memoria y convenciones del equipo: dónde vive cada cosa

**Issue**: [#4 — Memoria y convenciones del equipo](https://github.com/fabisahe29/CREDIAGIL/issues/4)

**Detalle**: [specs/002-memoria-convenciones-equipo/research.md](../specs/002-memoria-convenciones-equipo/research.md), decisiones R1, R2, R3, R4, R7 y R8

### Decisión 1: memoria del proyecto en `./CLAUDE.md`

Las convenciones del equipo están en `CLAUDE.md`, en la raíz, en menos de 60 líneas.

**Motivo**: Claude Code lo carga al iniciar sin configuración, y quien abre el repositorio lo ve sin buscarlo.

**Alternativa descartada**: `.claude/CLAUDE.md`. Funciona igual, pero queda escondido entre la configuración de herramientas.

**Consecuencias**: lo específico de una zona no va aquí, va a su regla por ruta, para que la memoria siga siendo corta.

### Decisión 2: `@import` de la constitución

`CLAUDE.md` importa la constitución con `@.specify/memory/constitution.md`. Es el uso justificado de importación que pide el ticket.

**Motivo**: las reglas no negociables deben estar siempre en contexto, y con la importación se mantiene una sola fuente de verdad, sin duplicar contenido. La ruta está dentro del repositorio, así que no aparece el diálogo de aprobación de importaciones externas.

**Alternativas descartadas**:

- **Copiar un resumen de los principios**: se desincroniza en cada enmienda de la constitución.
- **Poner solo un enlace en texto**: Claude no lo carga salvo que alguien lo pida.
- **Un `CLAUDE.md` por subdirectorio**: también se carga bajo demanda, igual que las reglas por ruta, y tener dos mecanismos para lo mismo hace difícil saber qué se carga y cuándo.

**Consecuencias**: la constitución, de unas 150 líneas, se carga en cada sesión. Es un costo aceptado, porque es el contenido de mayor riesgo si se omite.

### Decisión 3: cuatro reglas por ruta en `.claude/rules/`

Hay una regla para cada zona:

- `tests.md`: `**/*.test.ts`
- `politica.md`: `src/politica/**`
- `servidor-mcp.md`: `src/mcp/**`
- `specs.md`: `specs/**`

Cada una tiene solo la clave `paths` en el frontmatter. Solo cuenta como test un archivo con sufijo `.test`; los `.spec` y los fixtures no, según la aclaración Q3 de la spec.

**Motivo**: cada zona carga su contexto solo cuando se trabaja en ella, y al definir el alcance por patrón la regla cubre también las carpetas que todavía no existen.

**Alternativas descartadas**:

- **Reglas sin `paths`**: se cargarían siempre.
- **Una sola regla para todo**: mezclaría zonas.
- **Incluir `.spec` y `fixtures/` en la regla de tests**: sumaría una segunda convención de nombre. Los fixtures ya quedan protegidos por la constitución importada (Principio II).

**Consecuencias**: `src/politica/` y `src/mcp/` se fijan antes de existir. El issue #7 debe usar esas rutas o ajustar los `paths`. Además, un YAML inválido haría que la regla se cargue siempre, así que la validación comprueba que ninguna regla se cargue al iniciar.

### Decisión 4: memoria personal en `CLAUDE.local.md`

Las preferencias personales del proyecto van en `CLAUDE.local.md`, que está en `.gitignore`. Las preferencias que valen para todos los proyectos van en `~/.claude/CLAUDE.md`.

**Motivo**: es el mecanismo documentado para memoria personal por proyecto. Claude Code no lo ignora de forma automática, por eso se declara en `.gitignore`.

**Alternativas descartadas**:

- **Importar `@~/.claude/…` desde el `CLAUDE.md` compartido**: mostraría a todo el equipo un diálogo de aprobación por un archivo que solo existe en una máquina.
- **Una sección "personal" dentro de `CLAUDE.md`**: se versionaría para todos.

### Decisión 5: configuración compartida y configuración personal separadas

- `.claude/settings.json` está versionado y habilita el MCP `github` del proyecto (`enabledMcpjsonServers`), que necesitan los comandos `/ticket-*`.
- `.claude/settings.local.json` es personal y está en `.gitignore`.

**Motivo**: la configuración local tiene prioridad y las listas se combinan, así que lo personal se suma sin modificar lo compartido. Claude Code solo ignora el archivo local de forma automática cuando él mismo lo crea, y lo hace en el *exclude* global, no en `.gitignore`; por eso se declara aquí de forma explícita.

**Alternativas descartadas**:

- **No versionar ninguna configuración**: cada persona tendría que aprobar el MCP por su cuenta.
- **Permisos amplios en la configuración compartida**: impondría a todos lo que es preferencia de cada uno.

---

## 2026-10-15 · Sincronización del backlog: comandos propios por MCP y hooks de Spec Kit

**Issue**: [#3 — Sincronización autónoma del backlog con GitHub](https://github.com/fabisahe29/CREDIAGIL/issues/3)

**Detalle**: [specs/001-sincronizacion-backlog-github/research.md](../specs/001-sincronizacion-backlog-github/research.md), R1 y R2

### Decisión 1: mecanismo de sincronización

El ciclo de vida del ticket lo gestionan cuatro **comandos propios de Claude Code**, versionados en `.claude/skills/`:

- `/ticket-tomar`
- `/ticket-avance`
- `/ticket-abrir-pr`
- `/ticket-cerrar`

Los comandos actúan sobre GitHub **solo** con el servidor MCP oficial de GitHub, configurado en `.mcp.json` con el token en la variable de entorno `GIT_HUB`. Cada transición del ticket (Todo → In Progress → In review → Done) ocurre en un solo paso, junto con su efecto en GitHub (rama, PR o fusión) y su comentario de avance.

**Motivo**:

- Cumple dos mínimos del enunciado a la vez: usar el servidor MCP de GitHub y tener comandos propios compartidos por control de versiones.
- No exige secretos en el repositorio ni en GitHub.
- Sigue el Principio IV de la constitución: actuar sobre sistemas externos solo mediante herramientas MCP.
- La fusión la hace el mismo comando que mueve el ticket a Done, así que ese paso no depende de que alguien se acuerde de hacerlo.

**Alternativas descartadas**:

- **GitHub Actions + workflows integrados del Project** ("Item closed → Done"). El `GITHUB_TOKEN` de Actions no tiene acceso a Projects de usuario, así que habría que guardar un token personal como secreto del repositorio. Además, los workflows del Project se configuran en la web y no quedan versionados.
- **Script propio** (Node/TypeScript con Octokit o `gh`). Duplica lo que ya ofrece el MCP, agrega dependencias y una segunda vía de autenticación, y no cumple el mínimo de usar el servidor MCP de GitHub. Contradice el principio de simplicidad (YAGNI) de la constitución.

**Consecuencias**:

- No hay pruebas automatizadas del flujo, porque no hay código. La validación es manual con [quickstart.md](../specs/001-sincronizacion-backlog-github/quickstart.md).
- Si un PR se fusiona desde la web, el ticket no pasa a Done hasta que se ejecuta `/ticket-cerrar`. El comando detecta que la fusión ya ocurrió y completa lo que falta.

### Decisión 2: comentarios de especificación y plan

Los comentarios de los hitos "especificación terminada" y "plan terminado" los publican **hooks de Spec Kit**. Son hooks obligatorios, `after_specify` y `after_plan`, definidos en `.specify/extensions.yml`, y ambos invocan `/ticket-avance`.

**Motivo**: los hitos se publican sin intervención manual y sin modificar los comandos de Spec Kit, que se regeneran al actualizar Spec Kit.

**Alternativas descartadas**:

- **Invocar `/ticket-avance` a mano**: el hito depende de la memoria de quien trabaja, que es justo lo que el issue quiere evitar.
- **Editar los comandos `speckit-specify` y `speckit-plan`**: los cambios se pierden en cada actualización de Spec Kit.

**Consecuencias**: el hook también corre al especificar algo sin issue de origen. En ese caso `/ticket-avance` lo informa y termina sin error.
