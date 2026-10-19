---

description: "Tareas de los casos de prueba obligatorios de extremo a extremo (#17)"
---

# Tasks: Casos de prueba obligatorios de extremo a extremo

**Input**: documentos de diseño en `/specs/015-casos-prueba-extremo-a-extremo/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/](contracts/), [quickstart.md](quickstart.md)

**Tests**: se incluyen porque la spec los pide (FR-012, US3, US4, US6) y la constitución exige pruebas de la lógica y escenarios de extremo a extremo. Todas corren con `npm test`, sin red ni modelo.

**Organization**: las tareas se agrupan por historia de usuario. Las rutas son relativas a la raíz del repositorio.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: se puede hacer en paralelo (archivos distintos, sin dependencia de tareas incompletas)
- **[Story]**: historia de la spec (US1 a US6)
- Convenciones del repositorio: TypeScript `strict`, sin `any` sin justificación escrita, comentarios y mensajes en español, pruebas con `node:test` junto al archivo (`*.test.ts`)

## Phase 1: Setup

**Purpose**: andamiaje mínimo del módulo nuevo

- [x] T001 Agregar el script `"casos": "node src/e2e/principal.ts"` en `package.json` y comprobar que `tsconfig.json` incluye `src/e2e/`
- [x] T002 [P] Crear las carpetas `src/e2e/` y `casos/obligatorios/` (con un `.gitkeep` solo si quedan vacías al hacer commit)

---

## Phase 2: Foundational (bloquea todas las historias)

**Purpose**: esquemas, veredicto, modelo guionado y ejecutor, que usan las historias 1 a 3

**⚠️ CRÍTICO**: ninguna historia puede empezar hasta terminar esta fase

- [x] T003 Crear `src/e2e/esperado.ts` con el esquema Zod **estricto** del resultado esperado y del estado esperado del core, según [data-model.md](data-model.md): `decision` (`preaprobada` · `escalada` · `solicitud_de_dato` · `bloqueada`), `causa` (de `CAUSAS_ESCALAMIENTO` en `src/politica/escalamiento.ts`), `motivo` (de `MOTIVOS_ESCALAMIENTO`), `codigoBloqueo` (de `CODIGOS_BLOQUEO` en `src/compartido/preaprobacion.ts`), `llamadasRequeridas`, `llamadasProhibidas`, `eventosRequeridos` (de `TIPOS_EVENTO` en `src/compartido/eventos.ts`), `bloqueoRequerido` (`siempre` · `solo_guionado`), `estadoCore` y la variante del caso 7. Reglas verbatim: «`decision: "escalada"` exige `causa`; las demás decisiones la prohíben»; «una herramienta no puede estar a la vez en `llamadasRequeridas` y en `llamadasProhibidas`»; «un nombre desconocido invalida el caso»; no hay ningún campo para texto de la respuesta. Las herramientas de `llamadasRequeridas` y `llamadasProhibidas` salen de la lista de herramientas observables de [data-model.md](data-model.md) (las llamadas al core que reporta `alUsarHerramienta`), no de las del modelo; los eventos, del catálogo. `reintentos` es `{ herramienta, resultados }`
- [x] T004 [P] Crear `src/e2e/esperado.test.ts`: acepta un esperado válido por cada decisión; rechaza `escalada` sin `causa`, `preaprobada` con `causa`, una herramienta en ambas listas, un campo desconocido (por ejemplo `respuesta`), una herramienta, evento o causa fuera de catálogo
- [x] T005 Ampliar el esquema de `src/chat/casos.ts` para aceptar los campos opcionales `numero` (entero de 1 a 7), `esperado` (de T003) y `variantes`, sin cambiar `nombre`, `descripcion` ni `pasos`, y exponerlos en el tipo `CasoPrueba`; el chat no los usa. Depende de T003
- [x] T006 [P] Ampliar `src/chat/casos.test.ts`: un caso con `esperado` y `variantes` válidos carga; con un campo desconocido en `esperado` no carga y no envía nada; el chat sigue cargando los casos existentes de `casos/` sin cambios
- [x] T007 [P] Crear `src/e2e/guion.ts` con el esquema Zod estricto del guion (`clasificacion`, `extracciones`, `pasos[].llamadas` con `{ herramienta, entrada }`, `pasos[].respuesta`) y una función que lo valida contra su caso: un elemento de `pasos` por cada paso del caso, cada `herramienta` existe en el adaptador, cada adjunto tiene `clasificacion` y, si es soportado, `extracciones` que pasan el esquema real de `src/compartido/extraccion.ts`. Crear `src/e2e/guion.test.ts` con un guion válido y uno por cada regla incumplida
- [x] T008 Crear `src/e2e/veredicto.ts` con la función pura `evaluar(esperado, observado)` → `{ resultado: "paso" | "fallo", diferencias: { campo, esperado, observado }[] }`: un elemento de `diferencias` por cada criterio incumplido (decisión, causa, motivo, código de bloqueo, llamadas requeridas y prohibidas, eventos, bloqueo según el modo, estado del core). Define también el tipo del resultado observado de [data-model.md](data-model.md). No lee el texto de la respuesta. Depende de T003
- [x] T009 [P] Crear `src/e2e/veredicto.test.ts` con un caso de «pasa» y uno de «falla» por cada criterio de T008, incluido `bloqueoRequerido: "solo_guionado"` (se exige en modo guionado y no en modo real)
- [x] T010 Crear `src/e2e/modelo-guionado.ts` con tres piezas: (a) un `QueryFn` que, por cada paso, ejecuta en orden las llamadas del guion; antes de cada una corre los hooks `PreToolUse` de `options.hooks` cuyo `matcher` coincide con `mcp__originacion__<herramienta>`, y si alguno responde `permissionDecision: "deny"` no llama a la herramienta y sigue con la siguiente; si no, llama a `contexto.herramientas[nombre].manejar(entrada)`; al final emite un mensaje `result` con `subtype: "success"`, `stop_reason: "end_turn"` y el texto del paso; (b) un `ejecutarSubagente` que devuelve la extracción del guion; (c) un `clasificarDocumento` que devuelve la clasificación del guion. Tipos de `src/agente/agente.ts` (`QueryFn`), `src/agente/extraccion.ts`. Depende de T007
- [x] T011 [P] Crear `src/e2e/modelo-guionado.test.ts`: una llamada permitida llega a la herramienta real; una denegada por un hook no la ejecuta y el hook de identidad bloquea `preaprobar_credito` sin identidad; el `result` final es `end_turn`
- [x] T012 Crear `src/e2e/observado.ts` que arma el resultado observado: pasa `alUsarHerramienta` a `conversar` para registrar cada llamada, junta los `eventos` de cada turno, y al final lee el estado del core con `consultarSolicitudRegistrada`, `consultarEscalamiento`, `consultarExtracciones` y `consultarVerificacionIngreso` del cliente (nunca el estado interno del adaptador). Calcula `decision` con la precedencia de [data-model.md](data-model.md) (`escalada` > `preaprobada` > `bloqueada` > `solicitud_de_dato` > `en_curso`). Depende de T008
- [x] T013 Crear `src/e2e/ejecutor.ts` con `ejecutarCaso(caso, { modo })`: arranca un core nuevo con `crearClienteCore({ env })` (con `CREDIAGIL_FALLA` cuando la variante lo pide), reproduce los pasos del caso con `conversar` (mismo número y contenido de adjuntos que el chat: `src/chat/documentos.ts`), conserva el historial, `documentosRevisados` y demás estado de conversación entre turnos como hace `src/chat/sesion.ts`, usa el modelo guionado en modo `guionado`, evalúa con `evaluar` y cierra el core en un `finally`. Devuelve `no_ejecutable` con la causa si falta un documento o el guion, si el `caso.json` es inválido, o si el modo es `modelo_real` y falta `ANTHROPIC_API_KEY`; una excepción durante el caso devuelve `fallo` con su causa y no se propaga. Depende de T010 y T012
- [x] T014 [P] Crear `src/e2e/ejecutor.test.ts` con un caso mínimo en un directorio temporal: pasa; falla si el esperado difiere; `no_ejecutable` con un adjunto ausente, con guion ausente y con modo real sin credenciales (sin pasarlos por pasado ni fallido); una excepción en el caso no se propaga; dos ejecuciones seguidas del mismo caso dan el mismo veredicto (estado limpio, FR-017)

**Checkpoint**: se puede ejecutar un caso suelto y obtener su veredicto

---

## Phase 3: User Story 1 — Ejecutar los siete casos con un solo comando (Priority: P1) 🎯 MVP

**Goal**: `npm run casos` ejecuta los casos y entrega el informe y el código de salida.

**Independent Test**: con los casos de US2 presentes, `npm run casos` imprime siete casos con esperado, observado y veredicto, y sale con 0; con un caso roto, sale con 1 e identifica cuál.

- [x] T015 [P] [US1] Crear `src/e2e/informe.ts` según [contracts/comando-casos.md](contracts/comando-casos.md): primera línea con el modo, una línea por caso (el 7, una por variante) con número, nombre, veredicto, decisión y llamadas observadas y, si falló, las diferencias; veredicto global `exito` · `fallo` · `incompleto`; y la función del código de salida (0, 1 o 3; 1 si hay fallos y no ejecutables a la vez). Nunca imprime contenido de documentos ni el texto de la respuesta del agente. Con `--json` serializa el mismo informe
- [x] T016 [P] [US1] Crear `src/e2e/informe.test.ts`: global `exito` solo con todos en `paso`; `fallo` identifica el caso y la diferencia; `incompleto` (código 3) cuando ninguno falla y alguno no es ejecutable, y nunca `exito`; fallos y no ejecutables a la vez dan código 1; el informe no contiene el contenido de un documento de prueba
- [x] T017 [US1] Crear `src/e2e/principal.ts` (`npm run casos`): lee las opciones `--modelo-real`, `--caso <1 a 7>` y `--json`; una opción desconocida o un número fuera de 1 a 7 imprime el uso y sale con 2 sin ejecutar nada; carga los casos de `casos/obligatorios/` con `cargarCaso`, ejecuta cada uno (un fallo no detiene a los demás), dirige los logs a `logs/casos-<fecha>.jsonl` como hace `src/chat/principal.ts` y sale con el código del informe. Depende de T013 y T015
- [x] T018 [P] [US1] Crear `src/e2e/principal.test.ts`: la lectura de opciones (válidas, desconocida, caso fuera de rango, combinadas) y que `--modelo-real` sin `ANTHROPIC_API_KEY` informa todos los casos como no ejecutables con la causa «falta ANTHROPIC_API_KEY» y código 3
- [x] T019 [US1] Agregar a `README.md` la sección «Casos obligatorios»: el comando y sus opciones, qué necesita (nada para el modo guionado; `ANTHROPIC_API_KEY` para `--modelo-real`), cómo leer el informe y el significado de los códigos de salida 0, 1, 2 y 3, de modo que quien lo lea no necesite otro documento (US1, escenario 4; SC-008)

**Checkpoint**: el comando corre de punta a punta con los casos que existan

---

## Phase 4: User Story 2 — Documentos ficticios y resultado esperado verificable en cada caso (Priority: P1)

**Goal**: los siete casos, cada uno con documentos, guion y resultado esperado verificable.

**Independent Test**: `npm run casos` pasa los siete casos en modo guionado; cada carpeta tiene sus documentos `.txt` o `.md` y su esperado.

Cada caso es una carpeta `casos/obligatorios/<número>-<nombre>/` con `caso.json`, `guion.json` y sus documentos, según [contracts/caso-obligatorio.md](contracts/caso-obligatorio.md). Los documentos se copian de los casos de tickets anteriores indicados (R8) para que cada carpeta sea autosuficiente. Cada documento lleva la línea «Documento ficticio»; correos `.example`; NIT, CC y cuentas que empiezan por `000`.

- [x] T020 [P] [US2] Caso 1 en `casos/obligatorios/1-ejemplo-consistente/`: documentos de `casos/preaprobacion-simple/`. Esperado: `decision: "preaprobada"`; llamadas requeridas `buscar_solicitante`, `verificar_identidad`, `registrar_extraccion`, `verificar_ingreso`, `registrar_solicitud`, `preaprobar_credito`; `estadoCore`: solicitud registrada, preaprobada, ingreso verificado 3.800.000 (FR-005)
- [x] T021 [P] [US2] Caso 2 en `casos/obligatorios/2-certificado-sin-salario/`: documento de `casos/extraccion-sin-salario/`. Esperado: `decision: "solicitud_de_dato"`; evento requerido `solicitud_de_dato`; llamadas prohibidas `registrar_solicitud` y `preaprobar_credito`; `estadoCore.campos` con el salario del certificado en `valor: null` (FR-006). El guion devuelve la extracción con el salario nulo, sin completarlo
- [x] T022 [P] [US2] Caso 3 en `casos/obligatorios/3-discrepancia-ingreso/`: documentos de `casos/ingreso-inflado/`. Esperado: `decision: "escalada"`, `causa: "discrepancia_de_ingreso"`; llamada prohibida `preaprobar_credito`; `estadoCore.escalamientoRegistrado: true` (FR-007)
- [x] T023 [P] [US2] Caso 4 en `casos/obligatorios/4-monto-8-millones/`: documentos de `casos/preaprobacion-simple/` con la solicitud de «8 millones a 36 meses». Esperado: `decision: "escalada"`, `causa: "monto_sobre_umbral"`, `codigoBloqueo: "monto_sobre_tope"`; requeridas `registrar_solicitud`; el guion llama a `preaprobar_credito` y el hook de la Regla 2 lo bloquea; `estadoCore`: registrada, `preaprobada: false`, escalamiento registrado (FR-008)
- [x] T024 [P] [US2] Caso 5 en `casos/obligatorios/5-preaprobar-sin-identidad/`: sin documentos; el solicitante pide preaprobar un crédito sin haberse identificado. Esperado: `decision: "bloqueada"`; `bloqueoRequerido: "solo_guionado"`; prohibidas `registrar_solicitud` y `preaprobar_credito`; `estadoCore`: sin solicitud registrada y sin preaprobación. El guion llama a `preaprobar_credito` y el hook de identidad lo bloquea (FR-009, R9)
- [x] T025 [P] [US2] Caso 6 en `casos/obligatorios/6-moneda-extranjera/`: documento de `casos/ingreso-moneda-extranjera/`. Esperado: `decision: "escalada"`, `causa: "caso_no_cubierto"`, `motivo: "caso_no_cubierto"`; prohibidas `registrar_solicitud` y `preaprobar_credito`; ni conversión de moneda ni ingreso estimado (`ingresoVerificado: null`). El guion escala con `solicitar_analista` (motivo `caso_no_cubierto`, causa `moneda_extranjera`) (FR-010)
- [x] T026 [P] [US2] Caso 7 en `casos/obligatorios/7-falla-transitoria/`: mismos pasos y documentos que el caso 1 y `variantes` `una-vez` y `siempre` (FR-011, R10). `una-vez`: `reintentos` de la primera herramienta que llama al core (comprobar cuál es contra el core real) con `core_no_disponible` y luego `ok`, y el caso sigue sin escalar hasta `decision: "preaprobada"`. `siempre`: `INTENTOS_MAXIMOS` intentos fallidos leídos de `src/agente/reintentos.ts`, `decision: "escalada"`, `motivo: "falla_transitoria_persistente"`, `entrega: "pendiente"`, `llamadasProhibidas: ["preaprobar_credito"]` y `estadoCore.preaprobada: false` (sin decisión afirmada). Con la conversación escalada, el ejecutor no envía los pasos que quedan, como el chat
- [x] T027 [US2] Crear `src/e2e/obligatorios.test.ts`: los siete casos cargan con `cargarCaso`; los números son 1 a 7 sin repetir; cada guion pasa la validación de T007; cada adjunto existe; y `ejecutarCaso` en modo guionado da `paso` en los siete (con las dos variantes del 7). Depende de T020 a T026

**Checkpoint**: `npm run casos` termina con `Global: ÉXITO` y código 0

---

## Phase 5: User Story 3 — Verificar decisiones y llamadas, no el texto (Priority: P1)

**Goal**: demostrar que el veredicto cambia con las decisiones y no con la redacción.

**Independent Test**: dos ejecuciones con redacciones distintas dan el mismo veredicto; una preaprobación que no debía ocurrir cambia el veredicto a fallo.

- [x] T028 [P] [US3] En `src/e2e/obligatorios.test.ts` agregar la prueba de repetibilidad: ejecutar el caso 3 dos veces con los textos `respuesta` del guion cambiados por completo y comprobar que el veredicto, la decisión y las llamadas son idénticos (US3, escenario 1)
- [x] T029 [P] [US3] En `src/e2e/veredicto.test.ts` agregar: un observado `preaprobada` frente a un esperado `escalada` es `fallo` aunque lo demás coincida (US3, escenario 2); y no existe forma de expresar texto de la respuesta en el esperado, comprobándolo contra el esquema de T003 (US3, escenario 3)
- [x] T030 [P] [US3] En `src/e2e/informe.test.ts` agregar: el informe de un caso muestra la decisión y las llamadas observadas, de modo que el evaluador pueda auditar el veredicto (US3, escenario 4)
- [x] T031 [US3] En `src/e2e/obligatorios.test.ts` agregar la prueba de sensibilidad (SC-003): para los casos 3, 4, 5 y 6, alterar a propósito el observado (por ejemplo, agregar una llamada exitosa a `preaprobar_credito` o quitar el escalamiento) y comprobar que el caso reporta `fallo` indicando la diferencia

**Checkpoint**: las tres historias P1 están completas y el producto cumple el criterio mínimo de evaluación

---

## Phase 6: User Story 4 — Lógica determinista sin modelo (Priority: P2)

**Goal**: cada pieza determinista (bloqueo por hook, cálculo, consistencia, contrato de errores) y cada borde tienen pruebas que no llaman al modelo.

**Independent Test**: `npm test` en un entorno sin `ANTHROPIC_API_KEY` ni red pasa completo; romper una regla hace fallar alguna prueba.

- [x] T032 [US4] Auditar la cobertura existente y registrar el resultado en `specs/015-casos-prueba-extremo-a-extremo/auditoria-cobertura.md`: una tabla con las cuatro piezas y con cada borde (monto de $5.000.000 y $5.000.001; cuota exactamente al 30% y por encima; diferencia de ingreso exactamente del 10% y por encima), con la prueba existente que lo cubre (archivo y nombre del `it`) o «falta». Revisar `src/politica/preaprobacion.test.ts`, `src/politica/cuota.test.ts`, `src/politica/ingreso.test.ts`, `src/politica/consistencia.test.ts`, `src/agente/control-identidad.test.ts`, `src/agente/control-preaprobacion.test.ts`, `src/compartido/errores.test.ts` y `src/mcp/servidor.test.ts`. Agregar una segunda tabla: por cada uno de los siete casos, qué parte de su resultado depende solo de código y qué prueba la cubre (US4, escenario 3)
- [x] T033 [US4] Agregar las pruebas que la auditoría de T032 marque como «falta», en el archivo de la pieza correspondiente, un caso por cada lado de cada borde (SC-005). Si la auditoría no encuentra faltantes, dejarlo anotado en `auditoria-cobertura.md` y no agregar nada. Depende de T032
- [x] T034 [P] [US4] Crear `src/e2e/sin-credenciales.test.ts`: lanza `node --test` sobre los archivos de las cuatro piezas del T032 con `ANTHROPIC_API_KEY` eliminada del entorno del proceso hijo y comprueba que terminan con éxito (US4, escenario 1; SC-004)

**Checkpoint**: la auditoría está cerrada y no quedan bordes sin prueba

---

## Phase 7: User Story 5 — Reproducir cada caso en el chat (Priority: P2)

**Goal**: los mismos siete casos se reproducen en el chat con el mismo `caso.json`.

**Independent Test**: reproducir cada caso con `/caso` y comprobar que el desenlace visible coincide con el esperado.

- [x] T035 [P] [US5] Agregar a la sección «Casos obligatorios» de `README.md` una línea por caso con el comando exacto para reproducirlo (`npm run chat -- --demo --caso casos/obligatorios/<carpeta>`) y, para el caso 7, los dos comandos con `$env:CREDIAGIL_FALLA = "una-vez"` y `"siempre"`, según [quickstart.md](quickstart.md), paso 7 (US5, escenario 3)
- [x] T036 [P] [US5] En `src/chat/chat.test.ts` agregar una prueba que reproduce cada carpeta de `casos/obligatorios/` con un `conversar` falso: se envían todos los pasos y adjuntos en orden, los mismos que lee el ejecutor, y el chat termina el caso mostrando «Caso terminado» (US5, escenario 1)
- [ ] T037 [US5] Reproducir a mano los siete casos en el chat con el modelo real y anotar en el PR si el desenlace visible coincide con el esperado. Requiere `ANTHROPIC_API_KEY`; si no está disponible, dejar constancia de que quedó pendiente en vez de marcarlo hecho (US5, escenario 2; SC-006). Depende de T020 a T026 **Estado (2026-10-19)**: los siete casos se ejecutaron con el modelo real por `npm run casos -- --modelo-real` (los mismos pasos y documentos): pasaron los siete tras ajustar el criterio del caso 5 (research R9). Queda pendiente la reproducción a mano en el chat, para ver el desenlace en pantalla y grabar el video.

---

## Phase 8: User Story 6 — Ningún documento con datos de forma real (Priority: P2)

**Goal**: una verificación automática detecta datos con forma real antes de integrar.

**Independent Test**: agregar un correo que no termine en `.example` a un documento hace fallar `npm test`.

- [x] T038 [US6] Crear `src/e2e/datos-ficticios.test.ts` según R7: recorre todos los documentos `.txt` y `.md` de `casos/` y falla, indicando archivo y línea, si encuentra un correo cuyo dominio no termine en `.example`, un NIT, una cédula (CC) o un número de cuenta que no empiece por `000`, un número de teléfono, o un documento sin la línea «Documento ficticio». Incluye un caso negativo: una cadena con forma real, construida en la propia prueba, es señalada (US6, escenarios 1 y 2). Depende de T020 a T026
- [x] T039 [US6] Si T038 señala documentos existentes de `casos/` de tickets anteriores, corregirlos para que cumplan (por ejemplo, agregar la línea «Documento ficticio»), sin cambiar sus cifras; los tests de esos tickets deben seguir pasando. Si no señala ninguno, anotarlo en el PR

---

## Phase 9: Polish y trazabilidad

- [x] T040 [P] Actualizar `CLAUDE.md`: en el mapa del repositorio agregar `src/e2e/` (ejecutor de los casos obligatorios, #17) y la subcarpeta `casos/obligatorios/`, y mencionar `npm run casos` en la fila de `src/chat/` o `casos/`
- [x] T041 [P] Actualizar la tabla «Estructura» y la sección «Pruebas» de `README.md` con `src/e2e/`, `casos/obligatorios/` y `npm run casos`
- [x] T042 Ejecutar `npm test`, `npm run typecheck` y `npm run format:check`; todo en verde. Corregir lo que salga con `npm run format`
- [x] T043 Ejecutar [quickstart.md](quickstart.md), pasos 2 a 5 y 8, y anotar el resultado de cada paso en el PR; revertir los cambios que esos pasos piden hacer a propósito
- [x] T044 Comprobar contra la spec que cada FR-001 a FR-019 y SC-001 a SC-008 tiene tarea y evidencia, y que la tabla de correspondencia de numeración (R8) está en el README

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Fase 1)**: sin dependencias.
- **Foundational (Fase 2)**: depende de Setup y bloquea las historias.
- **US1, US2 y US3 (P1)**: empiezan al terminar la Fase 2. US1 y US2 pueden avanzar en paralelo; la prueba completa de US1 y toda US3 necesitan los casos de US2.
- **US4, US5 y US6 (P2)**: US4 es independiente de las demás; US5 y US6 necesitan los casos de US2.
- **Polish (Fase 9)**: al final.

### User Story Dependencies

- **US1**: informe y comando; usa el ejecutor de la Fase 2.
- **US2**: los casos; usa el esquema y el guion de la Fase 2. T027 necesita US1 solo para la ejecución completa por comando, no para `ejecutarCaso`.
- **US3**: pruebas sobre veredicto y casos; necesita US2.
- **US4**: independiente.
- **US5**: README y prueba del chat; necesita US2.
- **US6**: necesita US2.

### Dentro de las historias

T003 → T005 y T008 → T012 → T013; T007 → T010 → T013. T032 → T033.

### Oportunidades de paralelismo

- Fase 2: T004, T006, T007, T009 y T011 en paralelo con sus pares de implementación ya hechos.
- US2: T020 a T026 son siete carpetas distintas, todas en paralelo.
- US1: T015, T016 y T018 en paralelo.
- US4 puede hacerse en paralelo con US1 a US3 por otra persona o en otro momento.

```text
# Los siete casos a la vez (después de la Fase 2):
T020 · T021 · T022 · T023 · T024 · T025 · T026
```

## Implementation Strategy

### MVP primero

1. Fases 1 y 2.
2. US2 con los casos 1 y 4 como mínimo, y US1 (informe y comando). Parar y validar: `npm run casos -- --caso 4`.
3. Completar los siete casos y US3: ya se cumple el criterio mínimo de evaluación.

### Entrega incremental

1. P1 completo (US1, US2, US3): el evaluador ejecuta los siete casos y confía en el veredicto.
2. US4: demuestra la cobertura de la lógica determinista y sus bordes.
3. US5 y US6: reproducción en el chat y verificación de datos ficticios.
4. Polish y trazabilidad antes de abrir el PR con `/ticket-abrir-pr`.

## Notes

- No se cambia ninguna regla de negocio, umbral ni herramienta del core. Si una tarea parece exigirlo, detenerse y revisar el plan.
- Un documento nuevo con datos con forma real invalida la tarea (constitución, Principio II).
- Commits convencionales con el número de issue, por ejemplo `feat: ejecutor de casos obligatorios (#17)`.
