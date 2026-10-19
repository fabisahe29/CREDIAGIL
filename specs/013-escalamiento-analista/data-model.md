# Data Model: Escalamiento con criterio y handoff al analista

**Feature**: [spec.md](spec.md) · **Plan**: [plan.md](plan.md) · **Research**: [research.md](research.md)

Esta feature guarda el resumen para el analista, en memoria y en el core, uno por conversación. Los esquemas viven en [src/compartido/escalamiento.ts](../../src/compartido/escalamiento.ts) y reutilizan los de `solicitud.ts`, `extraccion.ts` y `preaprobacion.ts`. Los catálogos viven en [src/politica/escalamiento.ts](../../src/politica/escalamiento.ts), única fuente (R14).

## Catálogos de política

| Catálogo | Valores |
|----------|---------|
| `CAUSAS_ESCALAMIENTO` | `peticion_de_persona`, `monto_sobre_umbral`, `cuota_sobre_porcentaje`, `discrepancia_de_ingreso`, `caso_no_cubierto` |
| `MOTIVOS_ESCALAMIENTO` | `pide_persona`, `caso_no_cubierto`, `identidad_ambigua`, `identidad_no_verificable`, `discrepancia_de_ingreso`, `inconsistencia_documental`, `documento_no_extraible`, `preaprobacion_fuera_de_politica`, `falla_transitoria_persistente`, `falla_del_agente`, `limite_de_turnos`, `respuesta_incompleta` |
| `ACCIONES_RECOMENDADAS` | `contactar_al_solicitante`, `revisar_con_simulacion_de_cuota`, `verificar_ingresos_con_soporte`, `revisar_tipo_de_documento_o_moneda`, `revisar_documentos_manualmente`, `verificar_identidad_manualmente`, `atender_falla_tecnica` |
| `PENDIENTES` | `identidad`, `monto`, `plazo`, `ingreso_verificado`, `documentos` |

`MOTIVOS_ESCALAMIENTO` es el mismo conjunto de doce que hoy escribe `SenalEscalamiento["motivo"]` en `adaptador.ts`; el tipo se deriva de la tupla.

### Funciones puras

| Función | Entrada | Salida |
|---------|---------|--------|
| `causaDeEscalamiento` | `{ motivo, codigo? }` | una causa, según la tabla de [R1](research.md#r1-dos-niveles-de-clasificación-la-causa-cerrada-y-el-motivo) |
| `accionRecomendada` | `{ motivo, codigo? }` | una acción, según la tabla de [R2](research.md#r2-la-acción-recomendada-sale-de-un-catálogo-cerrado-de-la-política) |
| `reglaDeEscalamiento` | `motivo` | el texto de la regla que se audita, p. ej. «Regla 4 · el solicitante pide hablar con una persona» |
| `detectarPeticionPersona` | texto del mensaje | `true` si pide explícitamente hablar con una persona y no la niega |

`REGLA_4` es nueva: hoy el texto de la Regla 4 vive en el adaptador.

## Entrada de `escalar_a_analista`

Lo que recibe el core. Nunca lleva datos del solicitante que el core ya tiene (R3).

| Campo | Tipo | Notas |
|-------|------|-------|
| `correlationId` | UUID | Obligatorio. |
| `claveIdempotencia` | texto de 1 a 64 | La calcula el código (R8). |
| `causa` | `CAUSAS_ESCALAMIENTO` | Debe coincidir con `causaDeEscalamiento(motivo, codigo)`. |
| `motivo` | `MOTIVOS_ESCALAMIENTO` | |
| `codigo` | `CODIGOS_BLOQUEO` o ausente | Solo con `motivo = preaprobacion_fuera_de_politica`, y obligatorio entonces. |
| `causasAdicionales` | lista de hasta 8 `{ causa, motivo, codigo? }` | Las demás señales del turno (R6). |
| `declarado` | `{ monto?, plazoMeses? }` o ausente | Cada uno `{ valor, procedencia }`. Solo se usa si el core no tiene solicitud registrada; si la tiene, se ignora (R4). |

El esquema es estricto: un campo de más es un error de formato que lo nombra.

## ResumenAnalista

Lo que el core guarda y devuelve. Todo sale de su estado, salvo `declarado`.

| Campo | Tipo | Notas |
|-------|------|-------|
| `idEscalamiento` | texto `ESC-000` + 7 dígitos | Lo asigna el core. |
| `correlationId` | UUID | |
| `claveIdempotencia` | texto de 1 a 64 | |
| `escaladoEn` | fecha ISO 8601 | Reloj del core. |
| `versionPolitica` | texto | `VERSION_POLITICA`. |
| `causa` | `CAUSAS_ESCALAMIENTO` | La principal. |
| `motivo` | `MOTIVOS_ESCALAMIENTO` | |
| `codigo` | `CODIGOS_BLOQUEO` o ausente | |
| `regla` | texto | `reglaDeEscalamiento(motivo)`. |
| `accionRecomendada` | `ACCIONES_RECOMENDADAS` | `accionRecomendada(motivo, codigo)`. |
| `causasAdicionales` | lista de `{ causa, motivo, codigo?, accionRecomendada }` | Vacía si solo hay una causa. |
| `solicitante` | ver abajo | |
| `solicitud` | `{ idSolicitud, estado }` o `null` | La solicitud registrada de la conversación, si la hay. |
| `monto` | `{ valor, procedencia }` o `null` | De la solicitud registrada o, si no hay, de `declarado`. |
| `plazoMeses` | `{ valor, procedencia }` o `null` | Igual. |
| `ingresoDeclarado` | `{ valor, procedencia }` o `null` | De la solicitud registrada. |
| `verificacionIngreso` | `VerificacionRegistrada` o `null` | De la solicitud o, si no hay, de la última verificación del core. |
| `discrepancias` | lista de `Discrepancia` | Derivada de la verificación. |
| `datosExtraidos` | lista de `RegistroExtraccion` | De todos los documentos de la conversación, con su procedencia y el estado de cada uno. Sin el contenido. |
| `decision` | `DecisionExplicable` o `null` | La Regla 2 recalculada con la solicitud registrada, solo con las causas de monto, cuota y discrepancia. |
| `pendientes` | lista de `PENDIENTES` | Lo que falta (R9). |

### Solicitante

Una unión por `identificado`:

| Variante | Campos |
|----------|--------|
| `identificado: true` | `idSolicitante`, `nombre`, `documentoEnmascarado` (solo los 4 últimos dígitos) |
| `identificado: false` | ninguno más; se corresponde con `identidad` en `pendientes` |

Un solicitante sin identidad verificada es el caso de la aclaración Q1: el resumen lleva solo lo que dijo y la identidad queda pendiente.

### Discrepancia

Una unión por `tipo`:

| Tipo | Campos |
|------|--------|
| `ingreso` | `declarado`, `verificado`, `diferenciaPorcentaje`, `umbralPorcentaje` |
| `documental` | `regla`, `adjuntos` (los números de adjunto involucrados) |

### DecisionExplicable

`regla`, `motivo`, `valores` (textos o enteros, como `DecisionRegla2`) y `versionPolitica`. Es la forma estructurada del Principio III: regla aplicada, valores usados y motivo.

### Invariantes del esquema

- `pendientes` es exactamente el conjunto de lo que falta: `identidad` si `solicitante.identificado` es falso, `monto` si `monto` es `null`, `plazo` si `plazoMeses` es `null`, `ingreso_verificado` si la verificación no trae ingreso, `documentos` si `datosExtraidos` está vacía.
- `causa` coincide con `causaDeEscalamiento(motivo, codigo)`, y lo mismo cada causa adicional.
- `accionRecomendada` coincide con `accionRecomendada(motivo, codigo)`.
- Un dato con valor lleva su procedencia; un dato sin procedencia no existe.
- Ninguna causa adicional repite la principal: dos causas son la misma si comparten motivo y código. Dos motivos distintos pueden tener la misma causa (por ejemplo, una identidad no verificable y un documento no extraíble, ambos `caso_no_cubierto`) y entonces las dos se conservan.
- No hay campos con el contenido de los documentos (FR-012): solo los datos extraídos y sus fragmentos de procedencia, que ya están acotados.

## Respuesta de `escalar_a_analista`

`{ escalamiento: ResumenAnalista, repetida: boolean }`. `consultar_escalamiento` devuelve `{ escalamiento: ResumenAnalista | null }`.

## Errores del core

Los dos tipos del contrato común ([errores.ts](../../src/compartido/errores.ts)). Escalar nunca se rechaza por no poder comprobar una causa (Principio V): solo por la forma de la entrada.

| Código | Categoría | Cuándo |
|--------|-----------|--------|
| `core_no_disponible` | transitorio | Falla simulada del core. |
| `formato_invalido` | validación | Un campo mal formado, de más o ausente; `campo` lo nombra. |
| `causa_incoherente` | validación | La `causa` no corresponde al `motivo` y el `codigo`. `campo`: `causa`. |
| `procedencia_faltante`, `procedencia_invalida` | validación | El monto o el plazo de `declarado` sin procedencia, o con una mal formada. `campo`: `procedencia.<dato>`. |
| `resumen_invalido` | negocio | El resumen armado no pasa su esquema. No debería ocurrir; el agente escala igual (R7). |

Aquí **no** hay `identidad_no_verificada` ni `solicitud_no_registrada`: se puede escalar sin identificar y sin registrar (aclaraciones Q1 y Q3).

## Estado del core

| Campo nuevo | Tipo | Notas |
|-------------|------|-------|
| `escalamientos` | `Map<correlationId, ResumenAnalista>` | Uno por conversación (R8). En memoria, como el resto del core. |

Contador de `idEscalamiento`: el siguiente número libre, como el de las solicitudes registradas.

## EstadoConversacion y SenalEscalamiento (agente)

| Cambio | Detalle |
|--------|---------|
| `EstadoConversacion.senales` | Lista de las señales observadas en el turno, con su `motivo` y `codigo`, sin repetir (R6). |
| `EstadoConversacion.declarado` | El monto y el plazo con procedencia que citó el modelo en `solicitar_analista` y que pasaron la comprobación (R4). |
| `SenalEscalamiento.motivo` | Pasa a derivarse de `MOTIVOS_ESCALAMIENTO`. Los valores no cambian. |
| `ResultadoConversacion.handoff` | El `ResumenAnalista` entregado, o `null`. |
| `ResultadoConversacion.entrega` | `"entregada"`, `"pendiente"` o `null` si la conversación no escaló. |

## Evento `escalamiento`

Sin tipo nuevo: el evento del catálogo del #8 suma a `valores` tres claves. Las que ya tenía, incluida la `causa` de un caso no cubierto del #9, no cambian.

| Clave | Valor |
|-------|-------|
| `causaEscalamiento` | La causa principal. |
| `entrega` | `entregada` o `pendiente`. |
| `idEscalamiento` | Solo si se entregó. |
