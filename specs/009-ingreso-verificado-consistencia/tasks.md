---
description: "Lista de tareas: ingreso verificado y validación de consistencia"
---

# Tasks: Ingreso verificado y validación de consistencia

**Input**: documentos de diseño en `specs/009-ingreso-verificado-consistencia/`

**Issue de origen**: [fabisahe29/CREDIAGIL#11](https://github.com/fabisahe29/CREDIAGIL/issues/11)

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/politica.md](contracts/politica.md), [contracts/core-mcp.md](contracts/core-mcp.md), [contracts/agente.md](contracts/agente.md), [quickstart.md](quickstart.md)

**Tests**: la spec los **exige** (FR-018), y la constitución también: política en el borde exacto y herramientas MCP con rechazo del lado del servidor. Cada módulo se escribe primero como prueba, en rojo, y después se implementa, en verde, con `node --test`. Ninguna prueba usa red ni el modelo real.

**Organization**: por historia de usuario.
- La Fase 2 deja la política base, los esquemas compartidos y los motivos de escalamiento de la Regla 3 con el orden de reglas completo.
- US1 entrega el ingreso verificado de punta a punta: política, core, servidor, cliente, herramienta del agente, control de identidad y prompt.
- US2 agrega la discrepancia del 10% y su escalamiento.
- US3 agrega la consistencia entre documentos y la verificación interna tras cada extracción.
- US4 deja a la Regla 5 por encima de la Regla 3 con moneda extranjera.
- US5 agrega la reextracción de una inconsistencia corregible.

**Alcance mínimo**: US1 y US2 juntas son el mínimo que cumple la Regla 3. En US1, con un ingreso declarado, la decisión es `verificado` de forma provisional; la comparación del 10% llega en US2 (T028), y US1 no se integra sin US2.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: se puede hacer en paralelo (archivos distintos, sin dependencias pendientes)
- **[Story]**: historia de usuario de la spec (US1 a US5)

## Path Conventions

- Código bajo `src/`: `src/politica/`, `src/compartido/`, `src/mcp/` y `src/agente/`. Cada `*.test.ts` va junto a su archivo (regla de tests).
- Escribir bajo `src/` exige esta spec, que ya existe (control `spec-primero` del #5).
- Casos de demostración en `casos/<nombre>/`, cada uno con sus propios documentos: el chat rechaza un adjunto fuera de la carpeta del caso.

## Reglas comunes a todas las tareas de código

- TypeScript `strict`, solo sintaxis borrable, imports con extensión `.ts` y `unknown` en lugar de `any`.
- **Datos solo ficticios** ([docs/datos-ficticios.md](../../docs/datos-ficticios.md)): NIT, documentos y cuentas con prefijo `000`, correos `.example`, nombres y empleadores inventados. Un monto nunca comparte línea con una palabra clave de documento o de cuenta.
- **Montos como enteros de pesos**, nunca flotantes (Principio III). Ninguna comparación contra el 10% usa una división.
- **El 10%, las palabras de nómina, los sufijos societarios y los días de periodo se toman de `src/politica/politica.ts`**: ningún otro archivo los repite como literal.
- **Los logs y la auditoría no llevan contenido, fragmentos ni valores de documentos** (Principio VI). Cada prueba de adaptador, core y servidor que verifique ingreso comprueba que los logs capturados no los contienen.
- **El nombre del solicitante verificado nunca llega al modelo ni al subagente**: se queda en el core.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: confirmar el punto de partida.

- [X] T001 Ejecutar `npm test`, `npm run typecheck` y `npm run format:check` en la rama `11-ingreso-verificado-y-validacion-de-consistencia` y confirmar que todo está en verde antes de cambiar nada

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: piezas que usan todas las historias.

**⚠️ CRITICAL**: ninguna historia empieza antes de terminar esta fase.

### Parámetros de política (R1)

- [X] T002 Agregar a `src/politica/politica.ts`, con comentario que cite la aclaración y la Regla 3, las constantes de [data-model.md](data-model.md#parámetros-de-política-nuevos-srcpoliticapoliticats): `UMBRAL_DISCREPANCIA_INGRESO_PORCENTAJE = 10`, `PALABRAS_NOMINA = ["nomina", "salario", "sueldo"]`, `SUFIJOS_SOCIETARIOS` (`sas`, `sa`, `ltda`, `cia`, `sca`, `eu`…), `PALABRAS_VACIAS_NOMBRE = ["de", "del", "la", "las", "los", "y"]`, `MAX_DIAS_PERIODO_EXTRACTO = 31` y `MAX_REEXTRACCIONES_POR_REGLA = 1`. Subir `VERSION_POLITICA` de `2026-10-17.2` a `2026-10-18.1`. Crear `src/politica/ingreso.ts` solo con `export const REGLA_3 = "Regla 3 · ingreso verificado desde los documentos"`; las funciones llegan en US1. Ajustar las pruebas que fijen la versión anterior como literal

### Esquemas compartidos (R5)

- [X] T003 [P] Escribir en rojo `src/compartido/ingreso.test.ts` con datos ficticios inline:
  - `esquemaVerificacionIngreso` acepta una verificación de cada `estado` (`verificado`, `discrepancia`, `inconsistencia`, `sin_ingreso`, `falta_declarado`, `no_cubierto`) con la forma de [data-model.md](data-model.md#verificacioningreso-lo-que-guarda-el-core-por-conversación) y rechaza campos extra;
  - `monto` debe ser un «entero > 0»; `ingresoDeclarado`, un «entero ≥ 0» o `null`; `diferencia`, un «entero ≥ 0»; `umbralPorcentaje` es el literal `10`;
  - `esquemaInconsistencia` rechaza una inconsistencia «sin al menos un `Uso` **de un documento** (con `adjunto` y `fragmento`)» y acepta una con un uso de identidad (`adjunto: null`, `fragmento: null`) además de uno de documento;
  - `corregible: true` solo se acepta para `titular_vs_solicitante`, `empleador_vs_pagador` y `periodo_no_mensual`;
  - `regla` solo admite los cinco valores de la tabla de R4
- [X] T004 Implementar `src/compartido/ingreso.ts` hasta poner en verde T003, con los esquemas Zod `esquemaUso`, `esquemaIngresoVerificado`, `esquemaDiscrepancia`, `esquemaInconsistencia`, `esquemaDecisionIngreso` y `esquemaVerificacionIngreso`, y los tipos inferidos. Constraints de [data-model.md](data-model.md): `adjunto`: «entero ≥ 1 o `null`»; `fragmento`: «texto o `null`»; `origen`: «`certificado` · `extractos` · `ambos`»; `extractosContados`: «entero ≥ 0»; `valores` de una inconsistencia: «lista de **Uso** (mínimo 1)»; `calculadaEn`: fecha-hora ISO; `estado`: los seis valores de [R5](research.md)

### Registro y errores de extracción (R6)

- [X] T005 [P] Escribir en rojo en `src/compartido/extraccion.test.ts`: `MOTIVOS_ERROR` incluye `inconsistencia_entre_documentos`; `esquemaRegistroExtraccion` acepta un registro con `reextraidaPor: ["titular_vs_solicitante"]` y uno sin el campo, que queda con `reextraidaPor: []`; rechaza `reextraidaPor` con elementos que no sean texto
- [X] T006 Modificar `src/compartido/extraccion.ts` hasta poner en verde T005: agregar `inconsistencia_entre_documentos` a `MOTIVOS_ERROR` (la validación del #10 no lo produce) y `reextraidaPor` («lista de reglas, por defecto `[]`») al registro de las tres variantes. Agregar `reextraidaPor: []` al registro que arma `registrarExtraccion` en `src/mcp/core-simulado.ts` para que compile, sin otro cambio de comportamiento en el core

### Escalamiento de la Regla 3 y orden de reglas (R7)

- [X] T007 [P] Escribir en rojo en `src/agente/adaptador.test.ts` sobre `dejarSenal`:
  - una señal técnica (por ejemplo `falla_transitoria_persistente`) ni reemplaza a una de la Regla 3 ni es reemplazada por ella: la primera prevalece;
  - una señal de la Regla 4, 5 o 1 reemplaza a una de la Regla 3 (`discrepancia_de_ingreso` o `inconsistencia_documental`);
  - una señal de la Regla 3 **no** reemplaza a una de la 4, la 5 ni la 1;
  - entre las dos de la Regla 3, la primera prevalece;
  - `ORDEN_REGLA` marca ambos motivos como Regla 3
- [X] T008 Modificar `src/agente/adaptador.ts` y `src/agente/agente.ts` hasta poner en verde T007: agregar `discrepancia_de_ingreso` e `inconsistencia_documental` a `SenalEscalamiento["motivo"]`; los campos opcionales `ingresoDeclarado?: number`, `ingresoVerificado?: number`, `umbralPorcentaje?: number` y `reglas?: string` a la señal; `ORDEN_REGLA` con la Regla 3 (`1 | 3 | 4 | 5`); `prevalece` con el orden completo `[4, 5, 1, 3, 2]`; y en `agente.ts` los textos de `AVISOS` y las reglas de `REGLAS` de [data-model.md](data-model.md#senalescalamiento-cambia-el-del-910), con `REGLA_3` de `src/politica/ingreso.ts`. Las pruebas existentes del orden 4 → 5 → 1 siguen en verde

**Checkpoint**: parámetros, esquemas y motivos de escalamiento listos y en verde. Empiezan las historias.

---

## Phase 3: User Story 1 - Ingreso verificado que sale solo de los documentos (Priority: P1) 🎯 MVP

**Goal**: el ingreso mensual verificado se calcula por código a partir de los datos extraídos, nunca del ingreso declarado, y el agente lo obtiene por una herramienta que exige identidad verificada.

**Independent Test**: con los documentos ficticios del caso consistente ya extraídos, calcular el ingreso verificado y comprobar que es el mismo con cualquier ingreso declarado, y que el resultado indica de qué documentos y campos salió.

### Tests for User Story 1 ⚠️

- [X] T009 [P] [US1] Escribir en rojo `src/politica/ingreso.test.ts`:
  - `esAbonoDeNomina`: abono con «Nómina Industrias Imaginarias», «SALARIO octubre» y «Pago sueldo» → sí; un cargo con «Nómina» → no; un abono «Transferencia a ahorro programado» → no; «nominal» no coincide (palabra completa);
  - `pagadorDe`: «Nómina Industrias Imaginarias» → «Industrias Imaginarias»;
  - `promediarHaciaAbajo(11, 3)` → 3, `(12, 3)` → 4, `(0, 3)` → 0 y lanza con cantidad 0, negativa o decimal;
  - `calcularIngresoVerificado`: certificado 3.800.000 y tres extractos con 3.800.000 → `monto` 3.800.000, `origen: "ambos"`, `usos` con el salario y los tres abonos, cada uno con adjunto, nombre de archivo y fragmento; promedio menor que el salario → `origen: "extractos"`; salario menor → `"certificado"`; solo certificado → `montoExtractos: null`; solo extractos → `montoCertificado: null`; salario nulo en el certificado → ese origen se ignora y queda en `noUsados` con el motivo; un extracto sin nómina cuenta en `extractosContados` y baja el promedio; extractos sin ninguna nómina → no hay ingreso (`null`);
  - un registro `no_extraible` se ignora y el mismo contenido registrado dos veces cuenta una vez;
  - `decidirIngreso` sin ingreso declarado → `falta_declarado`, con `ingreso`; sin documentos de ingreso → `sin_ingreso`; algún `no_cubierto` → `no_cubierto` con la regla de la Regla 5 y sin cálculo;
  - **independencia**: dos llamadas idénticas salvo `ingresoDeclarado` dan el mismo `ingreso`;
  - cada decisión trae `regla`, `valores`, `motivo` y `versionPolitica` igual a `VERSION_POLITICA`
- [X] T010 [P] [US1] Escribir en rojo pruebas en `src/mcp/core-simulado.test.ts` para `verificarIngreso` y `consultarVerificacionIngreso`:
  - sin identidad verificada → `negocio` `identidad_no_verificada`, sin efecto ni auditoría (`auditoria: null`);
  - `ingresoDeclarado` negativo, con decimales, de texto o mayor que `Number.MAX_SAFE_INTEGER / 100` → `validacion` `formato_invalido` con campo `ingresoDeclarado`, sin efecto;
  - ausente conserva el último declarado; `null` lo borra;
  - **idempotencia**: repetir con los mismos datos devuelve el mismo resultado y la misma `calculadaEn`, y la auditoría es `null` la segunda vez; si cambia el estado (llega un documento o una declaración), audita de nuevo;
  - la auditoría trae `regla`, `estado`, `ingresoVerificado`, `ingresoDeclarado`, `versionPolitica` y ningún fragmento, valor de documento ni contenido;
  - `consultarVerificacionIngreso` devuelve `null` antes de verificar y la verificación después;
  - la entrada de `verificarIngreso` no tiene ningún campo de ingreso verificado
- [X] T011 [P] [US1] Escribir en rojo pruebas en `src/mcp/servidor.test.ts` con el cliente MCP en memoria: `verificar_ingreso` y `consultar_verificacion_ingreso` aparecen con su `outputSchema`; entrada mal formada, con campos extra (por ejemplo `ingresoVerificado`) o sin `correlationId` devuelve `validacion` con el `campo`; los logs `herramienta` y `auditoria_ingreso` capturados no contienen contenido, fragmentos ni valores de documentos
- [X] T012 [P] [US1] Escribir en rojo pruebas en `src/agente/cliente-core.test.ts` para `verificarIngreso` y `consultarVerificacionIngreso`: envían `correlationId` y, en la primera, `ingresoDeclarado` solo si se pasa; validan la respuesta con `esquemaVerificacionIngreso`; una respuesta fuera de contrato es `fuera_de_contrato`
- [X] T013 [P] [US1] Escribir en rojo pruebas en `src/agente/adaptador.test.ts` para la herramienta `verificar_ingreso` con un core falso: `verificado` → `exito({ estado, ingresoVerificado, origen })` sin eventos; `falta_declarado` → evento `solicitud_de_dato` con motivo `ingreso_declarado_faltante` y dato `ingreso mensual declarado`; `sin_ingreso` → `solicitud_de_dato` con motivo `ingreso_no_verificable` y dato `certificado laboral con salario o extractos con abonos de nómina`; ninguno escala; al modelo no le llegan inconsistencias ni diferencia; el core que falla tras los reintentos escala con `falla_transitoria_persistente`; los logs `verificacion_ingreso` llevan estado, origen, número de inconsistencias y `declarado: true/false`, sin valores de documentos
- [X] T014 [P] [US1] Escribir en rojo pruebas en `src/agente/control-identidad.test.ts`: `HERRAMIENTAS_CON_IDENTIDAD` es `["extraer_documento", "verificar_ingreso"]`; sin identidad verificada, `mcp__originacion__verificar_ingreso` se bloquea con `bloqueo_por_regla` (Regla 1); con identidad de otro solicitante, también
- [X] T015 [P] [US1] Escribir en rojo pruebas en `src/agente/agente.test.ts`: el `systemPrompt` contiene las tres instrucciones de [contracts/agente.md](contracts/agente.md#prompt-del-modelo-srcagenteagentets) (llamar a `verificar_ingreso` con el entero declarado o sin él; no calcular ni comparar ingresos por cuenta propia; ingreso en otra moneda → `solicitar_analista` con `caso_no_cubierto` y `moneda_extranjera`)

### Implementation for User Story 1

- [X] T016 [US1] Implementar en `src/politica/ingreso.ts` hasta poner en verde T009: `esAbonoDeNomina`, `pagadorDe`, `promediarHaciaAbajo`, `calcularIngresoVerificado` y `decidirIngreso` según [contracts/politica.md](contracts/politica.md). `decidirIngreso` devuelve `no_cubierto`, `sin_ingreso`, `falta_declarado` y, con un declarado, `verificado` de forma **provisional** (la comparación llega en T028). El ingreso declarado no interviene en `calcularIngresoVerificado`. Usar `PALABRAS_NOMINA` y `MAX_DIAS_PERIODO_EXTRACTO` de la política, sin literales
- [X] T017 [US1] Implementar en `src/mcp/core-simulado.ts` hasta poner en verde T010: `verificarIngreso` y `consultarVerificacionIngreso` en la interfaz `Core`; almacén `verificaciones` por conversación y último declarado; exigencia de identidad con `evaluarRegla1`; el nombre del solicitante sale de `registrados`; auditoría `AuditoriaIngreso` solo si el resultado cambió (comparar sin `calculadaEn`); validación estricta del declarado; falla simulada como en las demás
- [X] T018 [US1] Implementar en `src/mcp/servidor.ts` hasta poner en verde T011: las dos herramientas con entrada estricta (`correlationId` obligatorio, sin campos extra), `outputSchema` con `esquemaVerificacionIngreso`, log `herramienta` con `estado` y `auditoria_ingreso` con la auditoría del core
- [X] T019 [US1] Implementar en `src/agente/cliente-core.ts` hasta poner en verde T012: `verificarIngreso(entrada, correlationId)` y `consultarVerificacionIngreso(correlationId)` con los esquemas de `src/compartido/ingreso.ts`
- [X] T020 [US1] Implementar en `src/agente/adaptador.ts` hasta poner en verde T013: herramienta `verificar_ingreso` (`esquemaVerificarIngreso` con `ingresoDeclarado` entero ≥ 0 opcional y la descripción de [contracts/agente.md](contracts/agente.md)), manejador con `llamarConReintentos("verificar_ingreso", …)`, efectos de `verificado`, `falta_declarado` y `sin_ingreso`, respuesta mínima al modelo, log `verificacion_ingreso`, y registro en `herramientas` y en `createSdkMcpServer`
- [X] T021 [US1] Agregar `"verificar_ingreso"` a `HERRAMIENTAS_CON_IDENTIDAD` en `src/agente/control-identidad.ts` hasta poner en verde T014, actualizando su comentario
- [X] T022 [US1] Agregar a `SYSTEM_PROMPT` en `src/agente/agente.ts` las tres instrucciones de T015 hasta ponerlo en verde
- [X] T023 [P] [US1] Crear `casos/ingreso-consistente/` con `caso.json` y las copias de `certificado-completo.md` y de los tres extractos de `casos/extraccion-*`: identificación de Ana Pérez Ficticia, los cuatro adjuntos y el mensaje «gano 3.800.000 al mes». Agregar en `src/chat/casos.test.ts` la comprobación de que el caso carga, de que cada documento copiado es idéntico al del #10 y de que cumple la convención de datos ficticios

**Checkpoint**: el ingreso verificado sale de los documentos y se obtiene por una herramienta con identidad. Todo en verde: `npm test`, `npm run typecheck`, `npm run format:check`.

---

## Phase 4: User Story 2 - Discrepancia con lo declarado envía al analista (Priority: P1)

**Goal**: una diferencia de más del 10% sobre el ingreso verificado queda registrada y lleva la solicitud a un analista; con exactamente el 10% no escala.

**Independent Test**: con verificado 3.800.000, declarado 4.180.000 (10% exacto) no escala; 4.180.001 sí escala.

### Tests for User Story 2 ⚠️

- [X] T024 [P] [US2] Escribir en rojo en `src/politica/ingreso.test.ts`:
  - `evaluarDiscrepancia` con verificado 3.800.000: declarado 4.180.000 y 3.420.000 → `supera: false` (exactamente el 10%); 4.180.001 y 3.419.999 → `supera: true`; declarado igual → `diferencia: 0`; declarado 0 → `supera: true`; verificado 1 y declarado 2 no desborda;
  - la discrepancia trae `declarado`, `verificado`, `diferencia` y `umbralPorcentaje: 10`;
  - `decidirIngreso` con `supera: true` → `estado: discrepancia`, con `discrepancia` y los valores `ingresoDeclarado`, `ingresoVerificado`, `diferencia` y `umbralPorcentaje` en `decision.valores`; con `supera: false` → `verificado`;
  - declarado mayor y menor que el verificado escalan por igual
- [X] T025 [P] [US2] Escribir en rojo en `src/mcp/core-simulado.test.ts`: un declarado que supera el 10% guarda `estado: discrepancia` y audita con `diferencia` y `umbralPorcentaje`; declarar después un valor dentro del 10% vuelve a `verificado` y audita de nuevo
- [X] T026 [P] [US2] Escribir en rojo en `src/agente/adaptador.test.ts`: `discrepancia` → señal `discrepancia_de_ingreso` con la Regla 3, `ingresoDeclarado`, `ingresoVerificado` y `umbralPorcentaje`, y respuesta `{ escalada: true, estado }`; el evento `escalamiento` lleva esos tres enteros en `valores`; una señal de la Regla 5 o 4 previa o posterior prevalece sobre la de la Regla 3; con la conversación escalada, `verificar_ingreso` no se ejecuta

### Implementation for User Story 2

- [X] T027 [US2] Implementar `evaluarDiscrepancia` en `src/politica/ingreso.ts` hasta poner en verde la parte de T024: `diferencia * 100 > UMBRAL_DISCREPANCIA_INGRESO_PORCENTAJE * verificado`, solo con enteros, y exigir `verificado > 0`
- [X] T028 [US2] Integrar la discrepancia en `decidirIngreso` (`src/politica/ingreso.ts`): con ingreso y declarado, `discrepancia` si supera y `verificado` si no, reemplazando el resultado provisional de T016. Hasta poner en verde T024 y T025
- [X] T029 [US2] Implementar en `src/agente/adaptador.ts` el efecto de `discrepancia`: `senal({ motivo: "discrepancia_de_ingreso", regla: REGLA_3, herramienta: "verificar_ingreso", ingresoDeclarado, ingresoVerificado, umbralPorcentaje })` y respuesta `{ escalada: true, estado }`; y en `src/agente/agente.ts` incluir esos tres enteros en los `valores` del evento `escalamiento`. Hasta poner en verde T026
- [X] T030 [P] [US2] Crear `casos/ingreso-inflado/` con `caso.json` y las copias de los cuatro documentos del caso consistente, con el mensaje «gano 4.300.000 al mes» (13,2% sobre 3.800.000). Agregar su comprobación en `src/chat/casos.test.ts`

**Checkpoint**: la Regla 3 completa en ingreso y discrepancia. Todo en verde.

---

## Phase 5: User Story 3 - Consistencia entre documentos y con el solicitante (Priority: P1)

**Goal**: los documentos se contrastan entre sí y con el solicitante verificado; cada inconsistencia queda registrada con su procedencia, y las que detienen escalan sin depender de que el modelo llame a la herramienta.

**Independent Test**: cambiar el titular de un extracto y el empleador del certificado; comprobar que cada cambio produce una inconsistencia distinta con los campos y documentos que la originan.

### Tests for User Story 3 ⚠️

- [X] T031 [P] [US3] Escribir en rojo `src/politica/consistencia.test.ts`:
  - `mismoNombre`: «Pérez Ficticia, Ana» y «ana perez ficticia» → iguales; un apellido de menos → distintos; una palabra de más → distintos;
  - `mismoEmpleador`: «Industrias Imaginarias del Valle S.A.S.» y «Industrias Imaginarias» → coinciden; «Industrias» frente al empleador de tres palabras → no; empleador y pagador de una palabra iguales → sí; otro empleador → no;
  - `validarConsistencia` consistente → lista vacía; titular distinto → `titular_vs_solicitante` con `detiene: true`, `corregible: true` y dos usos (el titular con su procedencia y el nombre del solicitante con `adjunto: null`); pagador distinto → `empleador_vs_pagador` con el empleador y el abono, cada uno con su procedencia; una por cada pagador distinto;
  - periodos de 31 días → sin inconsistencia y de 32 → `periodo_no_mensual` (`detiene: true`, `corregible: true`), contando los dos extremos;
  - dos extractos que se tocan en un día → `periodos_superpuestos` (`detiene: true`, `corregible: false`); sin superposición → ninguna;
  - extractos de meses no consecutivos → `huecos_entre_periodos` con `detiene: false`;
  - titular nulo o sin certificado → nada que contrastar y la lista `sinContrastar` lo dice;
  - el orden de la lista es estable (por regla y luego por adjunto) entre dos corridas;
  - ninguna inconsistencia carece de un uso de documento
- [X] T032 [P] [US3] Escribir en rojo en `src/politica/ingreso.test.ts`: `decidirIngreso` con una inconsistencia que detiene → `estado: inconsistencia`, sin `ingreso`, aunque haya discrepancia o falte el declarado; una inconsistencia con `detiene: false` no cambia el estado; la prioridad completa `no_cubierto` > `inconsistencia` > `sin_ingreso` > `falta_declarado` > `discrepancia` > `verificado`; `decision.valores` lleva los nombres de las reglas que detienen
- [X] T033 [P] [US3] Escribir en rojo en `src/mcp/core-simulado.test.ts`: `verificarIngreso` devuelve las inconsistencias con procedencia usando el nombre registrado del solicitante verificado; un titular distinto produce `inconsistencia`; la auditoría trae solo los nombres de las reglas (`reglasInconsistencia`) y nunca fragmentos, valores ni el nombre del solicitante
- [X] T034 [P] [US3] Escribir en rojo en `src/agente/adaptador.test.ts`:
  - tras `extraer_documento` de un extracto con titular distinto, el adaptador verifica por código **sin** `ingresoDeclarado`, deja la señal `inconsistencia_documental` (Regla 3, `reglas` con el nombre) y la conversación escala sin que el modelo llame a `verificar_ingreso`;
  - el camino interno no emite `solicitud_de_dato` ni escala por discrepancia;
  - una extracción reutilizada (mismo contenido) no vuelve a verificar;
  - una inconsistencia con `detiene: false` no escala;
  - `verificar_ingreso` con una inconsistencia que detiene → `{ escalada: true, estado: "inconsistencia" }`; al modelo no le llega el nombre del solicitante ni los valores;
  - el log `verificacion_ingreso` lleva las reglas, sin valores

### Implementation for User Story 3

- [X] T035 [US3] Implementar `src/politica/consistencia.ts` hasta poner en verde T031: `mismoNombre`, `mismoEmpleador` y `validarConsistencia` según [contracts/politica.md](contracts/politica.md#srcpoliticaconsistenciats-nuevo), usando `SUFIJOS_SOCIETARIOS`, `PALABRAS_VACIAS_NOMBRE` y `MAX_DIAS_PERIODO_EXTRACTO` de la política
- [X] T036 [US3] Integrar `validarConsistencia` en `decidirIngreso` (`src/politica/ingreso.ts`) con la prioridad de R5, hasta poner en verde T032, y pasar al core el nombre del solicitante verificado en `src/mcp/core-simulado.ts` hasta poner en verde T033
- [X] T037 [US3] Implementar en `src/agente/adaptador.ts` hasta poner en verde T034: la verificación interna tras registrar un documento `extraido` nuevo (`core.verificarIngreso({}, correlationId)` sin declarado), el efecto de `inconsistencia` (`senal({ motivo: "inconsistencia_documental", regla: REGLA_3, herramienta, reglas })`) y su respuesta `{ escalada: true, estado }` en la herramienta. Y en `src/agente/agente.ts`, `reglas` en los `valores` del evento `escalamiento`
- [X] T038 [P] [US3] Crear `casos/ingreso-titular-distinto/` y `casos/ingreso-empleador-distinto/`, cada uno con `caso.json` y sus documentos ficticios, según [data-model.md](data-model.md#documentos-de-prueba-y-casos): el primero con un extracto a nombre de otra persona ficticia, el segundo con el certificado de Industrias Imaginarias y nómina pagada por otro empleador ficticio (NIT y cuentas con prefijo `000`, correos `.example`). Agregar sus comprobaciones en `src/chat/casos.test.ts`

**Checkpoint**: la consistencia se verifica en cada extracción y las inconsistencias que detienen escalan solas. Todo en verde.

---

## Phase 6: User Story 4 - Ingresos en moneda extranjera escalan (Priority: P2)

**Goal**: un ingreso en moneda extranjera es un caso no cubierto: no se convierte ni se calcula, y la Regla 5 prevalece sobre la Regla 3.

**Independent Test**: con un certificado cuyo salario está en dólares, no se calcula ingreso verificado y la causa de escalamiento es la Regla 5, «moneda extranjera».

### Tests for User Story 4 ⚠️

- [X] T039 [P] [US4] Escribir en rojo en `src/agente/adaptador.test.ts`: un documento `no_cubierto` por moneda extranjera ya escaló en `extraer_documento`; `verificar_ingreso` después responde `{ escalada: true, estado: "no_cubierto" }`, no calcula ni convierte y **no cambia** el motivo ni la causa de la señal (`caso_no_cubierto`, `moneda_extranjera`); con documentos de monedas distintas (uno COP y otro no) el caso es no cubierto, no una inconsistencia; si concurren moneda extranjera y discrepancia, queda la señal de la Regla 5 y no se evalúa la discrepancia (orden 4 → 5 → 1 → 3); si el modelo declara un ingreso en dólares y llama a `solicitar_analista`, esa señal de la Regla 5 prevalece sobre una de la Regla 3 ya dejada

### Implementation for User Story 4

- [X] T040 [US4] Ajustar `src/agente/adaptador.ts` hasta poner en verde T039: el efecto de `no_cubierto` en `verificar_ingreso` y en la verificación interna deja la señal de la Regla 5 solo si no había una, sin pisar la existente, y la verificación interna no la reemplaza por una de la Regla 3. Confirmar en `src/mcp/core-simulado.test.ts` (agregar el caso) que `verificarIngreso` con un registro `no_cubierto` devuelve `estado: no_cubierto`, sin `ingreso`, y audita con la regla de la Regla 5
- [X] T041 [P] [US4] Crear `casos/ingreso-moneda-extranjera/` con `caso.json` y un certificado ficticio con el salario en dólares (por ejemplo «USD 1.200 mensuales»). Agregar su comprobación en `src/chat/casos.test.ts`

**Checkpoint**: la Regla 5 prevalece sobre la Regla 3 con moneda extranjera. Todo en verde.

---

## Phase 7: User Story 5 - Reintentar una inconsistencia corregible con la regla que falló (Priority: P2)

**Goal**: una inconsistencia que puede deberse a un error de lectura se reextrae una vez, diciéndole al subagente la regla que falló y el valor que extrajo, sin el valor esperado; si persiste, queda registrada y se aplica la regla de FR-010.

**Independent Test**: con el subagente falso, un primer intento que lee mal el titular y un segundo que lo lee bien: el segundo recibe la regla específica y no queda inconsistencia. Si persiste en todos los intentos, queda registrada.

### Tests for User Story 5 ⚠️

- [X] T042 [P] [US5] Escribir en rojo en `src/agente/extraccion.test.ts`: `extraerConIntentos` con `erroresIniciales` los pasa al **primer** intento y los errores de un intento inválido siguen pasando al siguiente; sin `erroresIniciales` se comporta como en el #10; el prompt de una reextracción contiene la regla, el campo y el valor extraído, y **no** contiene el nombre del solicitante ni el empleador del otro documento; un helper `errorDeInconsistencia(inconsistencia, adjunto)` arma `{ campo, motivo: "inconsistencia_entre_documentos", detalle }` con «Valor extraído» y sin el valor esperado, para `titular_vs_solicitante`, `empleador_vs_pagador` y `periodo_no_mensual`
- [X] T043 [P] [US5] Escribir en rojo en `src/mcp/core-simulado.test.ts` para `registrarExtraccion` con `reextraccion: { regla }`:
  - sin un registro `extraido` previo con esa huella → `negocio` `reextraccion_no_aplica`;
  - con una regla que no es una inconsistencia **corregible vigente** del documento (por ejemplo `periodos_superpuestos`, o una que ya no existe) → `reextraccion_no_aplica`;
  - con la inconsistencia vigente, reemplaza el registro, agrega la regla a `reextraidaPor` y deja una auditoría con `reextraccion: <regla>`;
  - una segunda reextracción de la misma `(huella, regla)` → `reextraccion_agotada` (`MAX_REEXTRACCIONES_POR_REGLA` es 1);
  - un resultado nuevo que no pasa la revalidación conserva el registro anterior;
  - sin `reextraccion`, el comportamiento del #10 no cambia: el mismo contenido devuelve el registro previo sin efecto
- [X] T044 [P] [US5] Escribir en rojo en `src/mcp/servidor.test.ts` y `src/agente/cliente-core.test.ts`: `registrar_extraccion` acepta `reextraccion` con la regla en su entrada estricta, rechaza campos extra dentro de `reextraccion`, y el cliente la envía y valida la respuesta
- [X] T045 [P] [US5] Escribir en rojo en `src/agente/adaptador.test.ts` con core y subagente falsos:
  - **corrige**: el primer intento de la reextracción lee mal el titular y el segundo bien; el registro se reemplaza, la verificación posterior no tiene inconsistencia y no escala;
  - **persiste**: la inconsistencia sigue tras la ronda y escala con `inconsistencia_documental`;
  - **una sola ronda** por `(adjunto, regla)`: otra entrega del mismo documento no reextrae de nuevo;
  - una inconsistencia no corregible (`periodos_superpuestos`) no se reextrae;
  - se reextraen todos los documentos involucrados (certificado y extractos en `empleador_vs_pagador`);
  - el subagente sin respuesta en la ronda conserva el registro anterior y la inconsistencia vigente decide; no escala por esa falla;
  - `reextraccion_no_aplica` y `reextraccion_agotada` del core se conservan sin escalar por sí solos;
  - el subagente nunca recibe el nombre del solicitante, y el log `intento_extraccion` lleva `reextraccion` con la regla, sin valores

### Implementation for User Story 5

- [X] T046 [US5] Implementar en `src/agente/extraccion.ts` hasta poner en verde T042: `erroresIniciales?: readonly ErrorExtraccion[]` en `OpcionesIntentos` y `errorDeInconsistencia`, con el texto de [contracts/agente.md](contracts/agente.md#reextracción) y sin el valor esperado
- [X] T047 [US5] Implementar en `src/mcp/core-simulado.ts` hasta poner en verde T043: `reextraccion` en `EntradaRegistroExtraccion` y en el esquema de entrada; recalcular la consistencia con lo guardado y exigir una inconsistencia `corregible` vigente que involucre el adjunto; tope `MAX_REEXTRACCIONES_POR_REGLA`; revalidar el resultado nuevo antes de reemplazar; `reextraidaPor` y auditoría con `reextraccion`; los códigos `reextraccion_no_aplica` y `reextraccion_agotada` de [contracts/core-mcp.md](contracts/core-mcp.md#registrar_extraccion-cambia)
- [X] T048 [US5] Implementar `reextraccion` en `src/mcp/servidor.ts` y en `src/agente/cliente-core.ts` (`EntradaRegistroExtraccion`) hasta poner en verde T044, y en el log `herramienta` de `registrar_extraccion` agregar la regla si viene
- [X] T049 [US5] Implementar en `src/agente/adaptador.ts` hasta poner en verde T045: la ronda de reextracción dentro de la verificación interna de T037. Para cada inconsistencia `corregible` que involucre al documento, reextraer cada documento involucrado (el contenido sale de `documentos`) con `extraerConIntentos({ erroresIniciales })`, registrar con `reextraccion: { regla }`, verificar de nuevo una sola vez y llevar un conjunto de `(adjunto, regla)` ya reextraídos en el turno. Si no hay respuesta o el core rechaza el reemplazo, conservar el registro anterior

**Checkpoint**: una inconsistencia corregible se reextrae una vez y el resultado queda explicado. Todo en verde.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: cierre de la feature.

- [X] T050 [P] Actualizar `CLAUDE.md`: en el mapa del repositorio, la fila de `src/politica/` suma la Regla 3 desde el #11 (ingreso verificado, discrepancia y consistencia) y la de `src/compartido/` suma los esquemas de la verificación de ingreso; la de `src/mcp/` suma la verificación de ingreso (#11)
- [X] T051 [P] Comprobar que el 10%, las palabras de nómina, los sufijos societarios y los 31 días no aparecen como literales fuera de `src/politica/politica.ts` (buscar en `src/` y en las pruebas de otros módulos) y que no queda ningún `any` nuevo
- [X] T052 Ejecutar `npm test`, `npm run typecheck` y `npm run format:check` y el Escenario 1 de [quickstart.md](quickstart.md): todo en verde sin `ANTHROPIC_API_KEY`
- [X] T053 Con `ANTHROPIC_API_KEY` definida, ejecutar los Escenarios 2 a 7 de [quickstart.md](quickstart.md) y anotar el resultado y los tiempos en `research.md` (sección de hallazgos de la validación). Si una ronda de reextracción se acerca al límite de 120 s de la conversación, subir el límite y registrarlo en `DECISIONES.md`. Sin la clave, dejar la tarea abierta y decirlo en el PR
- [X] T054 Revisar [data-model.md](data-model.md) y los tres contratos contra lo implementado y corregir cualquier diferencia; marcar la casilla de cada fase terminada y hacer commit al cerrarla (`feat: … (#11)` o `test: … (#11)`)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Fase 1)**: sin dependencias.
- **Foundational (Fase 2)**: depende de la Fase 1 y bloquea todas las historias.
- **US1 (Fase 3)**: depende de la Fase 2.
- **US2 (Fase 4)**: depende de US1, porque reemplaza el resultado provisional de `decidirIngreso`.
- **US3 (Fase 5)**: depende de US1 y de US2 (la prioridad de estados las incluye), y extiende `extraer_documento`.
- **US4 (Fase 6)**: depende de US1; no depende de US2 ni de US3, pero toca el mismo archivo del adaptador, así que se hace en orden.
- **US5 (Fase 7)**: depende de US3, porque reextrae las inconsistencias que esa historia detecta.
- **Polish (Fase 8)**: depende de todas las historias.

### Within Each User Story

- Las pruebas se escriben primero y fallan.
- Política antes que core, core antes que servidor, servidor antes que cliente y cliente antes que adaptador.
- Cada historia termina con su checkpoint en verde.

### Parallel Opportunities

- Fase 2: T003, T005 y T007 en paralelo; luego T004, T006 y T008.
- US1: T009 a T015 en paralelo; luego T016 → T017 → T018 → T019 → T020, con T021, T022 y T023 en paralelo con ellos una vez listo T016.
- US2: T024 a T026 en paralelo; T030 en paralelo con T027 a T029.
- US3: T031 a T034 en paralelo; T038 en paralelo con T035 a T037.
- US4: T039 y T041 en paralelo.
- US5: T042 a T045 en paralelo.
- Polish: T050 y T051 en paralelo.

## Parallel Example: User Story 1

```text
T009 Pruebas de la política en src/politica/ingreso.test.ts
T010 Pruebas del core en src/mcp/core-simulado.test.ts
T011 Pruebas del servidor en src/mcp/servidor.test.ts
T012 Pruebas del cliente en src/agente/cliente-core.test.ts
T013 Pruebas de verificar_ingreso en src/agente/adaptador.test.ts
T014 Pruebas del control en src/agente/control-identidad.test.ts
T015 Pruebas del prompt en src/agente/agente.test.ts
```

## Implementation Strategy

### MVP First (US1 y US2)

1. Fase 1 y Fase 2.
2. Fase 3 (US1) y Fase 4 (US2).
3. **Parar y validar**: los Escenarios 2 y 3 del quickstart y el borde del 10%.

### Incremental Delivery

1. US1 y US2 → el ingreso sale de los documentos y la discrepancia escala (Regla 3 completa).
2. US3 → consistencia entre documentos y con el solicitante, con escalamiento automático.
3. US4 → la Regla 5 prevalece con moneda extranjera.
4. US5 → reextracción de lo corregible.

Cada paso deja las pruebas en verde y no rompe lo anterior.

## Notes

- [P] = archivos distintos, sin dependencias pendientes.
- Hacer commit al cerrar cada fase, con `feat: … (#11)` o `test: … (#11)`.
- No integrar con pruebas en rojo (constitución).
- Las revisiones del #6 corren en `/ticket-abrir-pr`.
- La preaprobación sobre una discrepancia o una inconsistencia la rechaza el #14 con `consultar_verificacion_ingreso`; aquí queda probada la consulta y el estado (SC-005 se cierra con el #14).
