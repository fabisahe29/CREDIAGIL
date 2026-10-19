---
description: "Lista de tareas: atención de mensajes con varias preocupaciones"
---

# Tasks: Atención de mensajes con varias preocupaciones

**Input**: documentos de diseño en `specs/014-atencion-mensajes-varios-asuntos/`

**Issue de origen**: [fabisahe29/CREDIAGIL#16](https://github.com/fabisahe29/CREDIAGIL/issues/16)

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/politica.md](contracts/politica.md), [contracts/core-mcp.md](contracts/core-mcp.md), [contracts/agente.md](contracts/agente.md), [quickstart.md](quickstart.md)

**Tests**: la constitución los exige (política en sus bordes, herramientas MCP con validación del lado del servidor y escenarios de punta a punta). Cada módulo se escribe primero como prueba, en rojo, y después se implementa, en verde, con `node --test`. Ninguna prueba usa red ni el modelo real.

**Organization**: por historia de usuario.

- La Fase 2 deja lo que todas las historias usan: la política de asuntos, las observaciones del adaptador y la composición de la respuesta.
- US1 conecta el agente: detecta los asuntos del mensaje, deduce su estado y lo devuelve en el resultado de la conversación.
- US2 pone el bloque de estado en la respuesta única, con un solo asunto sin cambios.
- US3 deja seguir con la cuota tras escalar, lleva los asuntos pendientes al analista y resuelve la petición de persona con otros asuntos.
- US4 fija con el mensaje literal del enunciado el caso de prueba 1.

**Alcance mínimo**: US1 y US2 son el mínimo: el agente sabe qué asuntos trae el mensaje y responde una vez con el estado de cada uno. US3 cubre el escalamiento con otros asuntos y US4 cierra el caso de prueba del enunciado.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: se puede hacer en paralelo (archivos distintos, sin dependencias pendientes)
- **[Story]**: historia de usuario de la spec (US1 a US4)

## Path Conventions

- Código bajo `src/`: `src/politica/`, `src/compartido/`, `src/mcp/`, `src/agente/` y `src/chat/`. Cada `*.test.ts` va junto a su archivo (regla de tests).
- Los casos de demostración van bajo `casos/<nombre>/caso.json`, con el formato de `casos/escalamiento-pide-persona-con-datos/caso.json` (`nombre`, `descripcion` y `pasos`, con pasos `mensaje` o `adjuntar`).
- Escribir bajo `src/` exige esta spec, que ya existe (control `spec-primero` del #5).

## Reglas comunes a todas las tareas de código

- TypeScript `strict`, solo sintaxis borrable, imports con extensión `.ts` y `unknown` en lugar de `any`.
- **Datos solo ficticios** ([docs/datos-ficticios.md](../../docs/datos-ficticios.md)): Ana Pérez Ficticia de `src/mcp/datos-ejemplo.ts`, documentos `000…`, correos `.example`. Un dato con forma real se genera en la prueba, nunca se escribe literal.
- **Montos como enteros de pesos**. Ninguna comparación con un umbral usa flotantes.
- **El umbral de monto, el porcentaje de cuota y la tolerancia de ingreso viven solo en `src/politica/politica.ts`**: ningún archivo nuevo de producción repite `5_000_000`, `5.000.000`, el 30 ni el 10 como porcentaje, y ni la descripción de la herramienta ni el prompt los dan al modelo. Los **literales de umbral** que las pruebas comprueban que no aparecen son: `5.000.000`, `5_000_000`, `30 %`, `30%`, `10 %` y `10%`. El mensaje del enunciado trae `$4.000.000` y `$3.500.000`: son datos de un caso, no umbrales, y solo van en el caso de prueba y en las pruebas que lo citan.
- **El estado de cada asunto y el bloque de la respuesta salen de código**: nunca del texto del modelo.
- **Ninguna regla se relaja ni se reordena**: el orden 4 → 5 → 1 → 3 → 2 lo sigue decidiendo `prevalece`.
- **Los logs y el resumen no llevan el texto del mensaje, citas ni el contenido de los documentos.** `asuntos_atendidos` solo lleva nombres y estados.
- Los errores son los del contrato `Respuesta` de `src/compartido/errores.ts`.

---

## Phase 1: Setup

**Purpose**: confirmar la línea base antes de tocar código.

- [x] T001 Ejecutar `npm test` y `npm run typecheck` en la rama `16-atencion-de-mensajes-con-varias` y confirmar que están en verde antes de cambiar nada; si algo falla, anotarlo y no seguir (no es de esta feature).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: la política de asuntos, las observaciones del adaptador y la composición de la respuesta.

**⚠️ CRITICAL**: ninguna historia empieza antes de terminar esta fase.

- [x] T002 [P] Escribir `src/politica/asuntos.test.ts` (en rojo), parte de la detección, según [contracts/politica.md](contracts/politica.md): `ASUNTOS` es exactamente `solicitud`, `documentos`, `cuota`; `ESTADOS_ASUNTO` es `resuelto`, `pendiente`, `escalado`; `MOTIVOS_PENDIENTE` es `falta_identidad`, `falta_dato`, `lo_revisara_el_analista`, `sin_atender`; `detectarAsuntos` con cada fila de la tabla del contrato, incluida la del **mensaje literal del enunciado** («Hola, quiero pedir un crédito de $4.000.000 a 24 meses. Te pego mi certificado laboral y mis extractos de los últimos tres meses. Gano más o menos $3.500.000 al mes. ¿En cuánto me quedaría la cuota?» con adjuntos nuevos → los tres asuntos); mayúsculas y tildes («CUOTA», «credito»); «Hola» devuelve `[]`; `documentos` sale de `hayDocumentosNuevos` aunque el texto no hable de documentos y no sale sin ellos aunque el texto diga «adjunto»; una negación inmediata («no quiero un crédito, solo dime la cuota») descarta `solicitud` y deja `cuota`; el resultado sigue el orden del catálogo y no repite.
- [x] T003 Implementar en `src/politica/asuntos.ts` (depende de T002) los catálogos `ASUNTOS`, `ESTADOS_ASUNTO`, `MOTIVOS_PENDIENTE`, los tipos `Asunto`, `EstadoAsunto`, `MotivoPendiente` y `AsuntoObservado`, y `detectarAsuntos(mensaje, hayDocumentosNuevos)`. Las expresiones son listas cerradas y conservadoras: `cuota` (por ejemplo «cuota», «cuanto pagaria», «pago mensual», «mensualidad») y `solicitud` (un verbo de querer o pedir con «credito», «prestamo» o «solicitud»). Reutilizar el normalizador y la negación inmediata de la Regla 4: exportar `palabrasDe`, `LIMITE`, `NEGACIONES` y `VENTANA_DE_NEGACION` de `src/politica/escalamiento.ts` sin cambiar su comportamiento y comprobar que `src/politica/escalamiento.test.ts` sigue en verde. No repetir ningún umbral.
- [x] T004 Escribir en `src/politica/asuntos.test.ts` (en rojo, después de T002 en el mismo archivo) la parte del estado, con cada fila de la tabla de [data-model.md](data-model.md#cómo-se-decide-el-estado-de-cada-asunto): `estadoDeAsuntos` por asunto y por condición, en el orden de la tabla (la primera fila que aplique); `cuota` resuelta con `resultado` que incluye la cuota y el aviso de la `simulacion`, `pendiente` con `falta_dato` si hubo un error de validación, `sin_atender` si no hubo llamada; `documentos` `escalado` con una señal `caso_no_cubierto`, `documento_no_extraible` o `inconsistencia_documental`, `resuelto` con un `registrar_extraccion` con éxito por cada adjunto de `documentosNuevos` y `faltantes` en 0, `falta_dato` con `faltantes` mayor que 0, `falta_identidad` con un bloqueo de una herramienta de documentos; `solicitud` `escalado` con señales de identidad, de la Regla 3 o de la Regla 2, `resuelto` con `registrar_solicitud` o `preaprobar_credito` con éxito, `falta_identidad` con un bloqueo de registro; la señal `pide_persona` deja todos en `pendiente` con `lo_revisara_el_analista` aunque haya observaciones; una falla técnica no cambia el estado de cada asunto; un asunto observado por las herramientas pero no esperado entra al conjunto una sola vez, en el orden del catálogo; `resultado` solo con `resuelto` y `motivo` solo con `pendiente`; `asuntosPendientes` devuelve solo los `pendiente`, en el orden del catálogo.
- [x] T005 Implementar en `src/politica/asuntos.ts` (depende de T003 y T004) `estadoDeAsuntos(entrada)` con la interfaz `EntradaEstado` de [contracts/politica.md](contracts/politica.md#estadodeasuntosentrada-asuntoobservado) (`esperados`, `documentosNuevos`, `observaciones`, `bloqueosPorIdentidad`, `senales`) y `asuntosPendientes(asuntos)`. Puras; el orden de las filas es el de la tabla; la señal de la Regla 4 va primero. No decide el escalamiento: lo lee de las señales. Usar tablas indexadas por los catálogos, sin `any`.
- [x] T006 [P] Escribir en `src/agente/adaptador.test.ts` (en rojo) las pruebas de las observaciones, según [data-model.md](data-model.md#observación-de-una-llamada-estado-de-la-conversación): `crearEstado` incluye `observaciones: []`; cada llamada al core que pasa por `llamarConReintentos` agrega una observación con `herramienta`, `ok` y, si falla, `codigoError`; `calcular_capacidad_pago` con éxito guarda `simulacion` con `cuotaMensual` y `aviso` del core; `registrar_extraccion` con éxito guarda `faltantes` con la cantidad de campos que faltan, y 0 si el documento no es de un tipo con faltantes; una llamada negada por una señal vigente no agrega observación; ninguna observación contiene entradas del modelo, citas ni contenido de documentos.
- [x] T007 Implementar en `src/agente/adaptador.ts` (depende de T006): el tipo `ObservacionLlamada`, `EstadoConversacion.observaciones` inicializado en `crearEstado`, y el registro en `llamarConReintentos` al terminar cada llamada, con `simulacion` y `faltantes` según las filas anteriores y sin guardar ningún dato del solicitante. Reiniciar `observaciones` al empezar cada intento en `src/agente/agente.ts` junto a `estado.eventos.length = 0`, para que un intento fallido no cuente.
- [x] T008 [P] Escribir `src/agente/respuesta-unificada.test.ts` (en rojo), según [contracts/agente.md](contracts/agente.md#respuesta-unificada): con menos de dos asuntos y sin la rama de la Regla 4, `componerRespuesta` devuelve el `cuerpo` sin cambios; con dos o más, devuelve el cuerpo, una línea en blanco y el bloque «Estado de tus asuntos:» con una línea por asunto en el orden del catálogo; la frase de cada estado y motivo de la tabla del contrato; `resuelto` de `cuota` incluye la cuota en pesos con separador de miles y el aviso del core; `resuelto` de `solicitud` incluye su identificador; la rama de la Regla 4 con algún asunto detectado agrega el bloque aunque sea uno solo; el texto no contiene citas ni contenido de documentos; el resultado es determinista.
- [x] T009 Implementar `src/agente/respuesta-unificada.ts` (depende de T005 y T008): `componerRespuesta({ cuerpo, asuntos, regla4 })` con las frases fijas de la tabla de [contracts/agente.md](contracts/agente.md#respuesta-unificada). Formatear los pesos con el mismo `pesos` que ya usa `src/chat/presentacion.ts` (extraerlo a `src/compartido/` si hoy no es importable sin arrastrar el chat; sin duplicarlo).

**Checkpoint**: la política decide qué asuntos hay y en qué estado están; el adaptador observa y el texto se compone.

---

## Phase 3: User Story 1 — Que cada asunto del mensaje reciba atención (Priority: P1) 🎯 MVP

**Goal**: el agente detecta los asuntos del mensaje, deduce el estado de cada uno con lo que pasó en el turno y lo devuelve en el resultado de la conversación. Ningún asunto planteado queda sin atender ni sin mencionar.

**Independent Test**: [Escenario 1](quickstart.md#escenario-1-tres-asuntos-una-respuesta-us1-us2-us4) con una consulta inyectada y un core falso: el mensaje con los tres asuntos devuelve tres `AsuntoObservado`.

### Tests for User Story 1

- [x] T010 [US1] Escribir en `src/agente/agente.test.ts` (en rojo) con una consulta inyectada y un core falso, siguiendo los escenarios de [contracts/agente.md](contracts/agente.md#pruebas-obligatorias): (a) un mensaje con solicitud, adjuntos y pregunta por la cuota, donde el modelo llama a `calcular_capacidad_pago` y el solicitante no está identificado, devuelve `asuntos` con `cuota` `resuelto` y `solicitud` y `documentos` `pendiente` con `falta_identidad`; (b) el modelo atiende solo la cuota y olvida los documentos: `documentos` sale `pendiente` con `sin_atender`, no desaparece; (c) un asunto que el modelo atiende pero la detección no reconoce aparece igual por sus herramientas; (d) un mensaje de un solo asunto devuelve a lo sumo un asunto y la misma respuesta que antes; (e) un intento fallido del modelo que se reintenta no deja observaciones del primer intento; (f) `ResultadoConversacion.asuntos` existe siempre, vacío si no hubo asuntos; (g) se emite el log `asuntos_atendidos` con `correlationId` y la lista `{ asunto, estado, motivo? }` solo con dos o más asuntos, sin cuotas ni texto del mensaje.

### Implementation for User Story 1

- [x] T011 [US1] En `src/agente/agente.ts` (depende de T005, T007 y T010): calcular `hayDocumentosNuevos` como `documentos.length > documentosRevisados`, `esperados = detectarAsuntos(mensaje, hayDocumentosNuevos)`, y al cerrar el turno llamar a `estadoDeAsuntos` con las observaciones, las señales (`estado.senales`), los bloqueos de los eventos `bloqueo_por_regla` (su `valores.herramienta`) y `documentosNuevos = documentos.length - documentosRevisados`. Agregar `asuntos: AsuntoObservado[]` a `ResultadoConversacion` y poblarlo en las tres salidas de `conversar` (respuesta normal, `escalar` y el cierre por la Regla 4). Registrar `asuntos_atendidos` una vez por mensaje con dos o más asuntos.
- [x] T012 [US1] En `SYSTEM_PROMPT` de `src/agente/agente.ts`, agregar las indicaciones de [R8](research.md#r8-el-prompt-guía-y-el-código-garantiza) sobre atender en la misma respuesta todos los asuntos del mensaje, sin los umbrales de la política. Las indicaciones sobre seguir tras un escalamiento y sobre no escribir la lista de estados se agregan en T016 y T018. Ejecutar `src/agente/agente.test.ts` y arreglar solo las pruebas que fijan el prompt completo.

**Checkpoint**: el resultado de `conversar` dice cuántos asuntos hubo y cómo quedó cada uno.

---

## Phase 4: User Story 2 — Una sola respuesta con el estado de cada asunto (Priority: P1)

**Goal**: con dos o más asuntos, el solicitante recibe una sola respuesta que cubre todos con su estado y resultado. Con un solo asunto la respuesta no cambia.

**Independent Test**: [Escenario 1](quickstart.md#escenario-1-tres-asuntos-una-respuesta-us1-us2-us4) y [Escenario 5](quickstart.md#escenario-5-un-solo-asunto-no-cambia-fr-009).

### Tests for User Story 2

- [x] T013 [US2] Escribir en `src/agente/agente.test.ts` (en rojo, después de T010): la respuesta de un mensaje con los tres asuntos termina con el bloque «Estado de tus asuntos» y contiene la cuota y el aviso del core; la respuesta de una conversación escalada con dos asuntos conserva `AVISOS[motivo]` y la referencia como cuerpo y agrega el bloque con la cuota ya calculada, aunque el texto del modelo se descarte; un mensaje de un solo asunto devuelve exactamente el texto del modelo, sin bloque; las pruebas existentes de `AVISOS` y de respuestas del #8 al #15 siguen igual; `tipo` y `escalamiento` no cambian.

### Implementation for User Story 2

- [x] T014 [US2] En `src/agente/agente.ts` (depende de T009, T011 y T013): aplicar `componerRespuesta` a la respuesta normal y a la escalada, con `cuerpo` igual al texto del modelo y a `${AVISOS[motivo]} Referencia: …` respectivamente, y con `regla4: false` en esas dos salidas. Agregar al prompt la indicación de no escribir una lista de estados porque la agrega el sistema ([R8](research.md#r8-el-prompt-guía-y-el-código-garantiza)). Ejecutar `npm test` y confirmar que ninguna prueba del #9 al #15 cambió de resultado.

**Checkpoint**: US1 y US2 completas: el agente sabe qué asuntos hay y responde una sola vez con el estado de cada uno.

---

## Phase 5: User Story 3 — Un asunto pendiente o escalado no bloquea a los demás (Priority: P2)

**Goal**: tras un escalamiento, la cuota sigue disponible; el analista recibe los asuntos pendientes; y la petición de persona sigue escalando sin investigar, con los demás asuntos pendientes.

**Independent Test**: [Escenario 2](quickstart.md#escenario-2-petición-de-persona-y-cuota-fr-006), [Escenario 3](quickstart.md#escenario-3-un-asunto-escalado-no-bloquea-a-otro-us3-fr-004) y [Escenario 4](quickstart.md#escenario-4-un-asunto-pendiente-por-un-dato-us3).

### Tests for User Story 3

- [x] T015 [P] [US3] Escribir en `src/compartido/escalamiento.test.ts`, `src/mcp/core-simulado.test.ts` y `src/mcp/servidor.test.ts` (en rojo), según [contracts/core-mcp.md](contracts/core-mcp.md#pruebas-obligatorias): `asuntosPendientes` aceptado en la entrada (lista de `ASUNTOS`, sin repetidos, hasta 3, opcional); un valor fuera del catálogo, un repetido o más de 3 devuelven `formato_invalido` con el campo `asuntosPendientes`; el resumen siempre lleva `asuntosPendientes`, vacío si no hubo; una repetición con otra clave u otros asuntos devuelve el resumen original con `repetida: true`; la auditoría del escalamiento incluye los nombres del catálogo; sin el campo, el comportamiento es el del #15 en todas las pruebas existentes; el esquema del resumen rechaza un valor fuera del catálogo.
- [x] T016 [P] [US3] Escribir en `src/agente/adaptador.test.ts` y `src/agente/control-identidad.test.ts` (en rojo), según [contracts/agente.md](contracts/agente.md#qué-herramientas-siguen-tras-una-señal-r5): `admiteTrasEscalar` es verdadero para `calcular_capacidad_pago` tras señales de las reglas 1, 2, 3 y 5 y de `documento_no_extraible`, falso tras `pide_persona` y `falla_transitoria_persistente`, y conserva el caso de `registrar_solicitud` bajo la Regla 3; `extraer_documento`, `verificar_ingreso`, `registrar_solicitud` (fuera de la Regla 3), `preaprobar_credito`, `buscar_solicitante` y `verificar_identidad` siguen negadas tras cualquier señal; la simulación tras escalar no deja señal, no emite eventos y no cambia la causa del escalamiento; el hook de identidad y `llamarConReintentos` usan el mismo predicado.
- [x] T017 [US3] Escribir en `src/agente/agente.test.ts` (en rojo) los escenarios de [contracts/agente.md](contracts/agente.md#pruebas-obligatorias) de este paso: (a) la Regla 4 con una pregunta por la cuota escala sin llamar al modelo ni a ninguna herramienta, la respuesta lista la **Cuota** como `pendiente` con «lo revisará el analista» y la entrega al core lleva `asuntosPendientes: ["cuota"]`; (b) la Regla 4 solo con la petición, como en `casos/escalamiento-pide-persona-con-datos/`, devuelve la misma respuesta del #15 sin bloque; (c) un documento en dólares escala por la Regla 5 y el modelo, después, simula la cuota con éxito: `documentos` `escalado`, `cuota` `resuelto`, una sola respuesta; (d) la cuota sin ingreso queda `pendiente` con `falta_dato` y el agente no inventa el dato; (e) una escalada con asuntos `pendiente` entrega al core esos asuntos en `asuntosPendientes` y no incluye los `escalado`; (f) una falla técnica sigue negando la simulación; (g) la causa y la señal principal de cada caso siguen siendo las de antes del cambio.

### Implementation for User Story 3

- [x] T018 [US3] Implementar el contrato del core con `asuntosPendientes` (depende de T015): en `src/compartido/escalamiento.ts`, importar `ASUNTOS` de la política, agregar `asuntosPendientes` a `esquemaEntradaEscalamiento` (lista de `ASUNTOS`, sin repetidos, hasta 3, opcional), a `CAMPOS_CONOCIDOS` y a `validarEntradaEscalamiento` con el error `formato_invalido` y su campo; agregarlo a `esquemaResumenAnalista` (siempre presente, vacío por defecto) y una frase a `DESCRIPCION_ESCALAR_A_ANALISTA`. En `src/mcp/core-simulado.ts`, copiar la lista de la entrada al resumen y a la auditoría. Comprobar si `src/mcp/servidor.ts` declara la forma de entrada de `escalar_a_analista` y, si lo hace, agregar el campo. `src/agente/cliente-core.ts` no cambia: su tipo sale del esquema.
- [x] T019 [US3] Implementar `admiteTrasEscalar` en `src/agente/adaptador.ts` (depende de T016): las constantes `HERRAMIENTAS_QUE_SIGUEN_TRAS_ESCALAR` y `MOTIVOS_QUE_LO_IMPIDEN` de [contracts/agente.md](contracts/agente.md#qué-herramientas-siguen-tras-una-señal-r5), la función que reúne ese caso y el de `admiteRegistro`, y su uso en `llamarConReintentos`. En `src/agente/control-identidad.ts`, reemplazar la negación de herramientas por la misma función. Agregar al prompt la indicación de seguir con los asuntos independientes y de usar `calcular_capacidad_pago` aunque otro asunto haya escalado, salvo que el solicitante haya pedido una persona.
- [x] T020 [US3] En `src/agente/agente.ts` (depende de T017, T018, T019): en la rama de la Regla 4 antes del modelo, calcular los asuntos detectados como `pendiente` con `lo_revisara_el_analista`, componer la respuesta con `regla4: true` y pasar los asuntos a la entrega. En `armarEntradaHandoff`, agregar `asuntosPendientes` con `asuntosPendientes(asuntos)` cuando no esté vacío. Los asuntos `escalado` no se repiten: ya los cubren la causa y las causas adicionales.
- [x] T021 [P] [US3] Agregar los casos `casos/mensaje-varios-asuntos-con-persona/caso.json` y `casos/mensaje-varios-asuntos-escalado/caso.json` con el formato del #15, según la tabla de [quickstart.md](quickstart.md#2-casos-de-demostración). El segundo copia `certificado-dolares.md` de `casos/ingreso-moneda-extranjera/` y debe pasar las pruebas de documentos ficticios de `src/chat/casos.test.ts`; agregar ahí las pruebas de que ambos casos cargan sin errores.
- [x] T022 [P] [US3] En `src/chat/presentacion.ts`, agregar a `formatearHandoff` la línea «Asuntos pendientes: …» cuando `asuntosPendientes` no esté vacío, y la prueba correspondiente en `src/chat/presentacion.test.ts` (con la lista vacía no aparece, y con `--demo` solo se imprime en demostración, como hoy).

**Checkpoint**: la cuota se resuelve tras escalar, la Regla 4 sigue sin herramientas y el analista recibe los asuntos pendientes.

---

## Phase 6: User Story 4 — El mensaje de ejemplo del enunciado (Priority: P2)

**Goal**: con el mensaje literal del enunciado, la respuesta incluye la cuota simulada y el estado de la solicitud.

**Independent Test**: [Escenario 1](quickstart.md#escenario-1-tres-asuntos-una-respuesta-us1-us2-us4).

### Tests for User Story 4

- [x] T023 [P] [US4] Escribir en `src/agente/agente.test.ts` (en rojo) el caso del enunciado con una consulta inyectada y un core falso: el mensaje literal con certificado y tres extractos adjuntos, sin identificar; el modelo falso simula la cuota con `monto` 4.000.000, `plazoMeses` 24 e `ingresoMensual` 3.500.000; la respuesta incluye la cuota que calcula el core falso con `calcularCuota` (no escrita a mano) y el aviso de ingreso declarado, y las líneas de **Solicitud** y **Documentos** `pendiente` por falta de identidad; los asuntos del resultado son los tres; no se llama a `preaprobar_credito` ni a `registrar_solicitud`.
- [x] T024 [P] [US4] Agregar el caso `casos/mensaje-varios-asuntos/caso.json` con el mensaje literal del enunciado y los pasos `adjuntar` del certificado y de los tres extractos, y copiar los documentos ficticios de `casos/extraccion-certificado/` y `casos/extraccion-extractos/` con los mismos nombres. En `src/chat/casos.test.ts`, probar que carga sin errores, que sus documentos son idénticos a los originales y cumplen la convención de datos ficticios, y que el texto del mensaje es exactamente el del enunciado.

**Checkpoint**: el caso de prueba 1 del enunciado se ejecuta con una consulta inyectada y se puede lanzar con el modelo real.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [x] T025 [P] Actualizar `CLAUDE.md`: en el mapa del repositorio, `src/politica/` agrega «asuntos del mensaje desde el #16 (`asuntos.ts`)»; `src/agente/` agrega «`respuesta-unificada.ts` y asuntos del turno en `conversar` desde el #16»; `src/mcp/` y `src/compartido/` agregan `asuntosPendientes` de `escalar_a_analista` desde el #16; `casos/` agrega los tres casos desde el #16. Sin tocar el resto del archivo.
- [x] T026 [P] Comprobar que ningún archivo nuevo o modificado de producción repite un literal de umbral (`5.000.000`, `5_000_000`, `30 %`, `30%`, `10 %`, `10%`), con una prueba o con la búsqueda de las reglas comunes sobre `src/politica/asuntos.ts`, `src/agente/respuesta-unificada.ts` y los archivos tocados.
- [x] T027 Ejecutar `npm test`, `npm run typecheck` y `npm run format:check`; todo debe estar en verde sin tocar pruebas del #9 al #15 más allá de lo que justifican FR-004 y la respuesta con dos o más asuntos.
- [x] T028 Ejecutar los escenarios 1 a 7 de [quickstart.md](quickstart.md) con el modelo real (`ANTHROPIC_API_KEY` por variable de entorno) y anotar el resultado de cada uno, en especial que el escenario 7 no termine en `limite_de_turnos` ([R10](research.md#r10-el-límite-de-turnos-no-cambia)). Si no hay clave, dejar la tarea abierta y decirlo en el PR.
  - Resultado (2026-10-19, modelo real): escenarios 1 a 5 ejecutados y conformes. En el chat cada `adjuntar` es un turno propio, así que el caso `mensaje-varios-asuntos` muestra Solicitud y Cuota en la respuesta final; los tres asuntos juntos los cubren las pruebas del agente. El escenario 6 lo cubre la suite completa (2318 pruebas) y el 7 no se puede reproducir en el chat por lo mismo; queda abierto.
- [x] T029 Revisar que `specs/014-atencion-mensajes-varios-asuntos/checklists/requirements.md` sigue vigente y actualizar sus notas: el marcador de FR-006 ya está resuelto.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Fase 1)**: sin dependencias.
- **Foundational (Fase 2)**: depende de la Fase 1 y bloquea todas las historias.
  - T002 y T004 escriben el mismo archivo de pruebas, así que T004 va después de T002.
  - T003 y T005 escriben el mismo archivo de producción: T005 va después de T003.
  - T006, T008 y T002 son independientes entre sí.
- **US1 (Fase 3)**: depende de T005 y T007.
- **US2 (Fase 4)**: depende de T009 y de US1.
- **US3 (Fase 5)**: depende de US2. T015, T016 y T017 son pruebas y pueden hacerse en paralelo si no tocan el mismo archivo (T016 y T017 sí comparten `agente.test.ts` solo en parte: T016 va en `adaptador.test.ts` y `control-identidad.test.ts`). T018 y T019 son independientes entre sí; T020 depende de ambas.
- **US4 (Fase 6)**: depende de US2 y puede ir en paralelo con US3.
- **Polish (Fase 7)**: depende de las historias elegidas.

### Within Each User Story

- Las pruebas se escriben primero y deben fallar antes de implementar.
- La política va antes que el adaptador y el adaptador antes que el agente.
- Cada historia se completa y se prueba antes de pasar a la siguiente.

### Parallel Opportunities

```text
Fase 2:  T002 · T006 · T008          (archivos de prueba distintos)
Fase 5:  T015 · T016                 (core y adaptador, archivos distintos)
         T021 · T022                 (casos y vista del chat)
Fase 6:  T023 · T024                 (prueba del agente y caso)
Fase 7:  T025 · T026
```

---

## Implementation Strategy

### MVP First (US1 y US2)

1. Fase 1 y Fase 2: política, observaciones y composición.
2. US1: el agente sabe qué asuntos hay y cómo quedó cada uno.
3. US2: una sola respuesta con el bloque de estado.
4. **PARAR Y VALIDAR**: Escenarios 1 y 5 del quickstart.
5. Es un incremento seguro: no cambia ninguna decisión de política y los mensajes de un solo asunto no cambian.

### Incremental Delivery

1. Setup + Foundational → política, observaciones y composición listas.
2. US1 → asuntos en el resultado.
3. US2 → respuesta única con estado (MVP).
4. US3 → cuota tras escalar, asuntos pendientes al analista y Regla 4 con otros asuntos.
5. US4 → caso del enunciado.
6. Cada historia suma valor sin romper las anteriores.

---

## Trazabilidad de requisitos

| Requisito | Tareas |
|-----------|--------|
| FR-001 (identificar y resolver cada asunto) | T002 a T005, T010, T011, T012 |
| FR-002 (una sola respuesta) | T008, T009, T013, T014 |
| FR-003 (estado de cada asunto con su resultado) | T004, T005, T008, T009, T013, T014 |
| FR-004 (seguir con los independientes) | T016, T017, T019 |
| FR-005 (pendiente con motivo, sin inventar) | T004, T005, T017 |
| FR-006 (petición de persona con otros asuntos) | T015, T017, T018, T020 |
| FR-007 (reglas sin relajar) | T016, T017, T026, T027 |
| FR-008 (mensaje de ejemplo) | T002, T023, T024 |
| FR-009 (un solo asunto sin cambios) | T008, T010, T013, T017, T027 |
| FR-010 (misma auditoría y `correlationId`) | T010, T011, T015 |

## Notes

- [P] = archivos distintos, sin dependencias pendientes.
- [Story] enlaza cada tarea con su historia de la spec.
- Cada historia se puede completar y probar sola.
- Verificar que las pruebas fallan antes de implementar.
- Commit tras cada tarea o grupo lógico, con mensajes convencionales y el número del issue: `feat: … (#16)`.
- Evitar tareas vagas, conflictos en el mismo archivo y dependencias entre historias que rompan su independencia.
