# Contrato: herramientas del core de originación (MCP)

**Feature**: [../spec.md](../spec.md) · **Modelo**: [../data-model.md](../data-model.md) · **Decisiones**: R5, R6, R8 y R9 de [../research.md](../research.md) · **Base**: [#10](../../008-extraccion-documentos/contracts/core-mcp.md)

Todas las herramientas siguen el contrato de errores del #7: `{ ok, datos? , error? }`, con `categoria`, `codigo` y `mensaje`, y `correlationId` obligatorio. La entrada se valida de forma estricta en el servidor, y el servidor vuelve a aplicar las reglas del lado del core (Principio IV).

## `verificar_ingreso` (nueva)

Calcula el ingreso verificado y evalúa la discrepancia y las inconsistencias de la conversación con lo que el core ya tiene guardado. Tiene efecto: guarda la verificación y, si el resultado cambió, la audita.

**Entrada**

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `correlationId` | UUID | La conversación |
| `ingresoDeclarado` | entero ≥ 0, `null` o ausente | Lo que declaró el solicitante, en pesos. Ausente: se conserva el último declarado. `null`: borra la declaración. Se guarda; nunca interviene en el ingreso verificado |

No hay ningún campo de ingreso verificado: lo calcula el core, nunca lo recibe.

**Salida**: `{ ok: true, datos: { verificacion: VerificacionIngreso } }`

**Reglas del lado del servidor**

1. **Regla 1**: sin identidad verificada → `identidad_no_verificada` (categoría `negocio`), sin efecto ni auditoría.
2. El solicitante es el verificado de la conversación; la comparación de titular usa su nombre registrado en el core.
3. El cálculo es `decidirIngreso` de la [política](politica.md) sobre los registros de la conversación. Con registros `no_cubierto`, el estado es `no_cubierto`.
4. **Idempotencia**: la verificación es una función de los registros y del último declarado. Repetirla con los mismos datos devuelve el mismo resultado (salvo `calculadaEn`, que se conserva) y no audita de nuevo.
5. `ingresoDeclarado` que no es un entero ≥ 0 → `formato_invalido`, campo `ingresoDeclarado`, sin efecto. Un valor mayor que `Number.MAX_SAFE_INTEGER / 100` también se rechaza, para que la comparación entera no desborde.

| Código de error | Categoría | Cuándo |
|-----------------|-----------|--------|
| `identidad_no_verificada` | `negocio` | La conversación no tiene identidad verificada |
| `formato_invalido` | `validacion` | Entrada fuera de contrato, con el `campo` |
| `core_no_disponible` / `tiempo_agotado` | `transitorio` | Falla simulada o del servidor; el agente reintenta |

**Auditoría** (`auditoria_ingreso`, solo si el resultado cambió): `correlationId`, `regla`, `estado`, `ingresoVerificado`, `ingresoDeclarado`, `diferencia`, `umbralPorcentaje`, `reglasInconsistencia` (solo los nombres), `versionPolitica` y `ts`. Nunca fragmentos, valores de documentos ni el contenido.

## `consultar_verificacion_ingreso` (nueva)

Solo lectura. La usan el #13 (registro de la solicitud) y el #14 (preaprobación) para leer la decisión ya guardada, sin recalcular.

**Entrada**: `{ correlationId }`

**Salida**: `{ ok: true, datos: { verificacion: VerificacionIngreso | null } }`. `null` si todavía no se verificó.

El #14 MUST rechazar una preaprobación cuando esta consulta devuelve `null`, o un estado distinto de `verificado`. Esta feature deja esa decisión consultable y probada; el rechazo de la preaprobación se cablea en el #14, cuya herramienta todavía no existe.

## `registrar_extraccion` (cambia)

**Entrada nueva**

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `reextraccion` | `{ regla: texto }` o ausente | Pide **reemplazar** el registro de este contenido tras una inconsistencia corregible (R6) |

**Reglas del lado del servidor para `reextraccion`**

1. Debe haber ya un registro `extraido` con la misma huella; si no, `reextraccion_no_aplica`.
2. El core **recalcula** la consistencia con lo guardado. La `regla` debe ser una inconsistencia `corregible` vigente que involucre el adjunto; si no, `reextraccion_no_aplica`. El agente no puede reemplazar un registro porque «crea» que falló.
3. A lo sumo `MAX_REEXTRACCIONES_POR_REGLA` (1) por `(huella, regla)`: la segunda devuelve `reextraccion_agotada`.
4. El resultado nuevo se revalida igual que un registro nuevo (esquema, fragmentos, montos). Si no pasa, el registro anterior se conserva.
5. El reemplazo agrega la regla a `reextraidaPor` y deja `auditoria_extraccion` con `reextraccion: <regla>`.

Orden de las comprobaciones, tal como quedó implementado: primero que haya un registro `extraido` (`reextraccion_no_aplica`), luego el tope por `(huella, regla)` (`reextraccion_agotada`) y después que la inconsistencia siga vigente (`reextraccion_no_aplica`). Así, una repetición tras una corrección que ya resolvió la inconsistencia responde `reextraccion_agotada` y no «no aplica». Un resultado nuevo con otro estado (por ejemplo `no_cubierto`) también reemplaza al anterior. El log `herramienta` de `registrar_extraccion` lleva `reextraccion: <regla>` si viene, y la entrada estricta valida `reextraccion` en el core: un campo extra o una regla vacía es validación del campo `reextraccion`.

Sin `reextraccion`, el comportamiento es el del #10: el mismo contenido devuelve el registro previo sin efecto.

| Código de error nuevo | Categoría | Cuándo |
|-----------------------|-----------|--------|
| `reextraccion_no_aplica` | `negocio` | No hay registro previo, o la regla no es una inconsistencia corregible vigente del documento |
| `reextraccion_agotada` | `negocio` | Ya se reextrajo ese documento por esa regla |

## `consultar_extracciones` (sin cambios de entrada)

Devuelve registros con el campo nuevo `reextraidaPor`.

## Cliente del core (`src/agente/cliente-core.ts`)

```ts
verificarIngreso(
  entrada: { ingresoDeclarado?: number | null },
  correlationId: string,
): Promise<Respuesta<{ verificacion: VerificacionIngreso }>>;

consultarVerificacionIngreso(
  correlationId: string,
): Promise<Respuesta<{ verificacion: VerificacionIngreso | null }>>;

// registrarExtraccion acepta `reextraccion?: { regla: string }` en su entrada.
```

La respuesta se valida contra el esquema de `src/compartido/ingreso.ts`: una respuesta fuera de contrato es un error `fuera_de_contrato`, nunca se adivina.

## Servidor (`src/mcp/servidor.ts`)

- Registra las dos herramientas nuevas con entrada estricta (`correlationId` obligatorio, sin campos extra) y su `outputSchema`.
- `registrar_extraccion` acepta `reextraccion` en su entrada estricta.
- El log `herramienta` de las dos nuevas lleva `correlationId`, el resultado y el `estado`, sin valores de documentos.
