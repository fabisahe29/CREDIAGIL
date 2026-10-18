# Modelo de datos: Ingreso verificado y validación de consistencia

**Feature**: [spec.md](spec.md) · **Plan**: [plan.md](plan.md) · **Investigación**: [research.md](research.md)

Todo es ficticio y en pesos colombianos enteros. Los esquemas se definen con Zod en `src/compartido/ingreso.ts` (los usan el core y el cliente) y las funciones puras en `src/politica/`. Los tipos de extracción son los del [#10](../008-extraccion-documentos/data-model.md); aquí solo se agregan los que se indican.

## Parámetros de política (nuevos, `src/politica/politica.ts`)

| Constante | Valor | Uso |
|-----------|-------|-----|
| `UMBRAL_DISCREPANCIA_INGRESO_PORCENTAJE` | `10` | Regla 3: la diferencia relativa que obliga a un analista (R2) |
| `PALABRAS_NOMINA` | `nomina`, `salario`, `sueldo` | Reconocer un abono de nómina por su descripción (R3) |
| `SUFIJOS_SOCIETARIOS` | `sas`, `sa`, `ltda`, `cia`, `sca`, `eu`… | Comparar empleador y pagador sin la forma societaria (R4) |
| `PALABRAS_VACIAS_NOMBRE` | `de`, `del`, `la`, `las`, `los`, `y` | Ídem |
| `MAX_DIAS_PERIODO_EXTRACTO` | `31` | Un extracto es un mes (R3) |
| `MAX_REEXTRACCIONES_POR_REGLA` | `1` | Una ronda por documento y regla (R6) |
| `VERSION_POLITICA` | sube de `2026-10-17.2` a `2026-10-18.1` | Acompaña cada decisión |

## Origen del dato

Un **uso** dice qué dato de qué documento entró al cálculo o a una comparación.

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `adjunto` | entero ≥ 1 o `null` | Número de adjunto del documento (FR-009 del #10); `null` solo para el nombre de la identidad verificada, que no es un documento |
| `nombre` | texto | Nombre de archivo del documento, o `identidad verificada` si `adjunto` es `null` |
| `campo` | texto | `salario`, `titular`, `empleador`, `movimientos[i]` o `nombre` (identidad) |
| `valor` | texto o entero | El valor tal como quedó extraído |
| `fragmento` | texto o `null` | Fragmento literal del documento, la procedencia del #10; `null` solo para la identidad verificada |

## IngresoVerificado

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `monto` | entero > 0 | Ingreso mensual verificado: el menor de los dos orígenes disponibles (FR-002) |
| `origen` | `certificado` · `extractos` · `ambos` | Cuál fijó el monto; `ambos` si los dos son iguales |
| `montoCertificado` | entero o `null` | Salario del certificado; `null` si no hay certificado con salario |
| `montoExtractos` | entero o `null` | Promedio mensual de abonos de nómina; `null` si no hay extractos |
| `extractosContados` | entero ≥ 0 | Extractos del promedio, con los que no traen nómina incluidos |
| `usos` | lista de **Uso** | Los datos que entraron: el salario y cada abono de nómina |
| `noUsados` | lista de `{ adjunto, nombre, motivo }` | Datos que no se usaron y por qué (campo nulo, abono que no es nómina) |

**Invariantes**: `monto` es entero. `monto = min(montoCertificado, montoExtractos)` sobre los que no son `null`. Si ambos son `null`, o el mínimo es 0, no hay `IngresoVerificado`. El ingreso declarado no es un campo ni interviene.

## Discrepancia

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `declarado` | entero ≥ 0 | Lo que declaró el solicitante |
| `verificado` | entero > 0 | `IngresoVerificado.monto` |
| `diferencia` | entero ≥ 0 | `|declarado − verificado|` |
| `umbralPorcentaje` | `10` | `UMBRAL_DISCREPANCIA_INGRESO_PORCENTAJE` |
| `supera` | booleano | `diferencia × 100 > umbralPorcentaje × verificado` |

Con `supera = false` no hay discrepancia, aunque la diferencia sea exactamente el 10%.

## Inconsistencia

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `regla` | `titular_vs_solicitante` · `empleador_vs_pagador` · `periodos_superpuestos` · `periodo_no_mensual` · `huecos_entre_periodos` | La regla de consistencia que falló (R4) |
| `descripcion` | texto | Qué se contrastó, en una línea, sin datos del solicitante |
| `detiene` | booleano | Si impide avanzar a la preaprobación (FR-010) |
| `corregible` | booleano | Si puede deberse a un error de extracción (FR-011) |
| `adjuntos` | lista de enteros | Documentos involucrados |
| `valores` | lista de **Uso** (mínimo 1) | Cada valor comparado, con su documento y su fragmento (FR-009) |

**Invariantes**: una inconsistencia sin al menos un `Uso` **de un documento** (con `adjunto` y `fragmento`) no es válida (FR-009). El nombre del solicitante verificado solo se guarda en el core: nunca se le entrega al modelo ni al subagente. Una `corregible` solo puede ser `titular_vs_solicitante`, `empleador_vs_pagador` o `periodo_no_mensual`.

## VerificacionIngreso (lo que guarda el core, por conversación)

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `correlationId` | UUID | La conversación |
| `idSolicitante` | `CLI-…` | El solicitante verificado con el que se contrastó |
| `estado` | `verificado` · `discrepancia` · `inconsistencia` · `sin_ingreso` · `falta_declarado` · `no_cubierto` | La decisión (R5) |
| `ingresoDeclarado` | entero ≥ 0 o `null` | El último declarado; `null` si nunca declaró |
| `ingreso` | **IngresoVerificado** o `null` | Presente salvo en `no_cubierto`, `inconsistencia` o `sin_ingreso` |
| `discrepancia` | **Discrepancia** o `null` | Presente con `verificado` y con `discrepancia` |
| `inconsistencias` | lista de **Inconsistencia** | Las que detienen y las que solo se reportan; vacía si no hay |
| `sinContrastar` | lista de textos | Comprobaciones que no se pudieron hacer por falta de un documento |
| `decision` | **DecisionIngreso** | Regla, motivo y valores de la decisión |
| `calculadaEn` | fecha-hora ISO | Marca de tiempo; no cuenta para decidir si el resultado cambió |

### DecisionIngreso

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `regla` | texto | `Regla 3 · ingreso verificado desde los documentos` o, con `no_cubierto`, la de la Regla 5 |
| `resultado` | igual a `estado` | |
| `motivo` | texto | Por qué, en una línea |
| `valores` | `{ [clave]: texto o entero }` | Ingreso verificado, declarado, diferencia, umbral y reglas de inconsistencia que detienen |
| `versionPolitica` | texto | `VERSION_POLITICA` |

### Transiciones

```text
(sin verificación)
   │ verificar_ingreso / verificación interna tras una extracción
   ▼
no_cubierto ◄── algún documento no_cubierto (Regla 5)
inconsistencia ◄── hay una inconsistencia que detiene         → escala
sin_ingreso ◄── sin ingreso verificado                         → pide documentos
falta_declarado ◄── hay ingreso, no hay declarado              → pide el dato
discrepancia ◄── supera el 10%                                 → escala
verificado ◄── lo demás
```

Cada verificación recalcula desde los registros guardados y el último declarado; el estado puede cambiar si llega un documento o una declaración nuevos. `inconsistencia` y `discrepancia` escalan y la conversación termina, así que no vuelven a cambiar en ella.

## RegistroExtraccion (cambia el del #10)

| Campo nuevo | Tipo | Descripción |
|-------------|------|-------------|
| `reextraidaPor` | lista de reglas, por defecto `[]` | Reglas de consistencia por las que se reemplazó el registro (R6); como mucho una por regla |

Un reemplazo conserva `huella`, `adjuntos` y `registradoEn` actualizado. El resultado anterior no se guarda; la auditoría deja que hubo reemplazo y por cuál regla.

## ErrorExtraccion (cambia el del #10)

`MOTIVOS_ERROR` agrega `inconsistencia_entre_documentos`. Solo se usa como error **de entrada** de una reextracción, con un `detalle` que lleva la regla y el valor extraído, nunca el valor esperado. La validación del #10 no lo produce.

## SenalEscalamiento (cambia el del #9/#10)

| Motivo nuevo | Regla | Aviso al solicitante |
|--------------|-------|----------------------|
| `discrepancia_de_ingreso` | Regla 3 | «Los ingresos de tus documentos no coinciden con lo que declaraste. Tu caso pasa a un analista, que te contactará.» |
| `inconsistencia_documental` | Regla 3 | «Encontré datos que no coinciden entre tus documentos. Tu caso pasa a un analista, que te contactará.» |

`ORDEN_REGLA` agrega la Regla 3 y la prevalencia usa el orden `[4, 5, 1, 3, 2]` (R7). El campo `valores` del evento `escalamiento` lleva `ingresoDeclarado`, `ingresoVerificado` y `umbralPorcentaje` (enteros) con `discrepancia_de_ingreso`, y `reglas` (texto) con `inconsistencia_documental`.

## Eventos de negocio (sin tipos nuevos)

| Situación | Evento | `motivo` | `dato` |
|-----------|--------|----------|--------|
| `falta_declarado` | `solicitud_de_dato` | `ingreso_declarado_faltante` | `ingreso mensual declarado` |
| `sin_ingreso` | `solicitud_de_dato` | `ingreso_no_verificable` | `certificado laboral con salario o extractos con abonos de nómina` |
| `discrepancia`, `inconsistencia` | `escalamiento` | el motivo de la señal | — |

## Documentos de prueba y casos

| Caso | Contenido | Resultado esperado |
|------|-----------|--------------------|
| `casos/ingreso-consistente/` | Certificado de 3.800.000 y tres extractos con nómina de 3.800.000 (copias de los del #10); declara 3.800.000 | `verificado`, 3.800.000, sin inconsistencias |
| `casos/ingreso-inflado/` | Los mismos documentos; declara 4.300.000 | `discrepancia` (13,2%): escala |
| `casos/ingreso-titular-distinto/` | Un extracto a nombre de otra persona ficticia | `inconsistencia` `titular_vs_solicitante`: escala |
| `casos/ingreso-empleador-distinto/` | Certificado de Industrias Imaginarias y nómina pagada por otro empleador ficticio | `inconsistencia` `empleador_vs_pagador`: escala |
| `casos/ingreso-moneda-extranjera/` | Certificado con salario en dólares | `no_cubierto` (Regla 5): escala |

Los números de documento, NIT y cuentas siguen [docs/datos-ficticios.md](../../docs/datos-ficticios.md) (prefijo `000`, correos `.example`, nombres inventados).
