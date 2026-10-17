# Data Model: Identificación y verificación del solicitante

**Feature**: [spec.md](spec.md) · **Research**: [research.md](research.md)

Todo vive en la memoria del proceso del core mientras corre (R1). Los esquemas se definen con Zod. Todos los datos de ejemplo son ficticios (`docs/datos-ficticios.md`).

## Solicitante — `src/mcp/datos-ejemplo.ts`

| Campo | Tipo | Regla |
|-------|------|-------|
| `idSolicitante` | string | `^CLI-000\d{7}$`, único |
| `nombre` | string | nombre completo inventado |
| `documento` | string | solo dígitos, 6 a 10, con prefijo `000`, único |
| `fechaExpedicion` | string | `AAAA-MM-DD`, fecha de calendario válida, no futura |
| `correo` | string | dominio `.example` |

**Nunca sale del core**: `fechaExpedicion` no aparece en ninguna respuesta, log ni registro de auditoría.

### Datos de ejemplo (FR-017)

| Caso | Constante | Nombre | Documento |
|------|-----------|--------|-----------|
| Único | `ID_SOLICITANTE_UNICO` | Ana Pérez Ficticia | `0001234567` (el mismo de la solicitud `SOL-0001000001`) |
| Homónimo 1 | `ID_HOMONIMO_1` | Elena Martínez Inventada | `0002020202` |
| Homónimo 2 | `ID_HOMONIMO_2` | Elena Martínez Inventada | `0003030303` |
| Sin coincidencias | `DOCUMENTO_SIN_COINCIDENCIAS`, `NOMBRE_SIN_COINCIDENCIAS` | «Nadie Registrado Ficticio» | `0009090909` |

Los homónimos tienen fechas de expedición distintas. Las fechas exactas se fijan en el código y en sus pruebas, no en esta documentación.

## CoincidenciaBusqueda — salida de `buscar_solicitante`

| Campo | Tipo | Regla |
|-------|------|-------|
| `idSolicitante` | string | el del solicitante |
| `nombre` | string | tal como está en el core |
| `documentoEnmascarado` | string | `*` por cada dígito salvo los 4 últimos (p. ej. `******4567`) |

## CriterioBusqueda — entrada de `buscar_solicitante`

Exactamente uno de los dos (R2):

| Campo | Normalización | Válido si |
|-------|---------------|-----------|
| `documento` | quitar `.`, espacios y `-` | 6 a 10 dígitos |
| `nombre` | minúsculas, sin tildes (NFD), espacios colapsados y recortados | ≥ 3 letras, solo letras y espacios |

Ambos o ninguno → error `validacion`, `campo: "criterio"`.

## EstadoIdentidad — por `correlationId`

| Campo | Tipo | Regla |
|-------|------|-------|
| `correlationId` | UUID | el de la conversación |
| `verificada` | boolean | `false` hasta una verificación exitosa |
| `idSolicitante` | string \| null | el verificado; `null` si `verificada` es `false` |
| `verificadaEn` | ISO 8601 \| null | marca de tiempo de la verificación; `null` si no |

**Transiciones**:

```text
no verificada ──verificar_identidad ok (A)──▶ verificada (A)
verificada (A) ──verificar_identidad ok (A)──▶ verificada (A)   # idempotente: misma verificadaEn
verificada (A) ──verificar_identidad sobre B (existe)──▶ no verificada   # no se transfiere
no verificada  ──verificar_identidad ok (B)──▶ verificada (B)
cualquiera     ──verificar_identidad mal formado o inexistente──▶ sin cambio
```

Una conversación sin registro en el core responde `verificada: false`, como estado inicial.

## IntentosVerificacion — por `(correlationId, idSolicitante)`

| Campo | Tipo | Regla |
|-------|------|-------|
| `fallidos` | entero 0…`MAX_INTENTOS_VERIFICACION` | suma 1 solo con `dato_no_coincide` |
| `bloqueada` | boolean | `true` al llegar a `MAX_INTENTOS_VERIFICACION` (3) |

`bloqueada` es absorbente durante la conversación. Una conversación nueva tiene su propio contador.

## RespuestaPorIntento — por `(correlationId, idIntento)`

| Campo | Tipo | Regla |
|-------|------|-------|
| `idIntento` | string | 1 a 64 caracteres; lo genera el adaptador, un UUID por llamada del modelo |
| `respuesta` | `Respuesta<{ identidad: EstadoIdentidad }>` | la que se devolvió la primera vez |

Un `idIntento` repetido devuelve la `respuesta` guardada sin contar otro intento ni auditar (Principio VI; R4).

## DecisionRegla1 — `src/politica/identidad.ts`

Resultado de `evaluarRegla1(estado: EstadoIdentidad, idSolicitanteAccion?: string)`, una función pura (R5). Con `idSolicitanteAccion`, también exige que coincida con el verificado; si no coincide, `permitido: false` y `valores.identidad: "verificada para otro solicitante"`.

| Campo | Tipo | Valor |
|-------|------|-------|
| `regla` | string | `"Regla 1 · identidad verificada antes de registrar"` |
| `permitido` | boolean | `estado.verificada` |
| `motivo` | string | lenguaje claro: verificada / sin verificar |
| `valores` | `Record<string, string>` | `{ identidad: "verificada" \| "no verificada" }` |
| `versionPolitica` | string | `VERSION_POLITICA` |

## Cambios en el estado del agente — `src/agente/adaptador.ts`

`EstadoConversacion` suma:

| Campo | Tipo | Uso |
|-------|------|-----|
| `busquedasAmbiguas` | entero ≥ 0 | la segunda búsqueda ambigua seguida escala con el motivo `identidad_ambigua`; una búsqueda con una sola coincidencia lo reinicia (R6) |
| `ambiguaEnTurno` | boolean | si ya contó una búsqueda ambigua en el turno; `conversar` lo reinicia en cada intento (R6) |

`SenalEscalamiento.motivo` suma `identidad_ambigua` e `identidad_no_verificable`. `SenalEscalamiento` suma el campo opcional `coincidencias` (entero ≥ 2), que solo se usa con `identidad_ambigua`.

## Errores nuevos del contrato

Se usa la misma forma del #7; solo se agregan códigos:

| Código | Categoría | Herramienta | Cuenta intento |
|--------|-----------|-------------|----------------|
| `formato_invalido` | `validacion` (con `campo`) | las tres | no |
| `solicitante_inexistente` | `negocio` | `verificar_identidad` | no |
| `dato_no_coincide` | `negocio` | `verificar_identidad` | sí |
| `verificacion_bloqueada` | `negocio` | `verificar_identidad` | — (lo devuelve el 3.er fallo y todo intento posterior) |
| `core_no_disponible` | `transitorio` | las tres (falla simulada) | no |
