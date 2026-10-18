# Contrato: herramientas nuevas del core

**Decisiones**: [research.md](../research.md), R6 y R8 · **Datos**: [data-model.md](../data-model.md#almacén-de-extracciones-del-core--srcmcpcore-simuladots)

Siguen las convenciones del #7 y del #9: esquema de entrada anunciado laxo y validado estricto en el manejador, contrato de errores con `campo`, log estructurado con el `correlationId` y sin contenido de documentos.

## `registrar_extraccion`

Herramienta con efectos e idempotente.

**Entrada**

| Campo | Tipo | Regla |
|-------|------|-------|
| `correlationId` | UUID | Obligatorio |
| `adjunto` | entero ≥ 1 | Obligatorio |
| `nombre` | string, 1 a 255 | Obligatorio |
| `contenido` | string, 1 a 262 144 | El texto del documento; solo para revalidar, no se guarda |
| `resultado` | `ResultadoExtraccion`, con su `huella` | Obligatorio. El core comprueba que la huella sea la del `contenido` y que `adjunto` y `nombre` coincidan con los de la entrada |

**Orden de evaluación**

1. Entrada mal formada → `validacion`, `formato_invalido`, con `campo`.
2. Identidad no verificada para el `correlationId` → `negocio`, `identidad_no_verificada` (Regla 1 del lado del servidor).
3. Calcula la huella SHA-256 de `contenido`. Si ya hay un registro con esa huella en la conversación → devuelve ese registro, agregando el `adjunto` si es nuevo. Sin un efecto más ni auditoría duplicada.
4. Si el resultado es `extraido`, lo revalida con `validarResultado(resultado, contenido)` de `src/compartido/extraccion.ts`. Si no pasa → `validacion`, `extraccion_invalida`, con el primer `campo`.
5. Si el resultado es `no_cubierto`, comprueba la causa con `evaluarDocumento`. Si no coincide → `validacion`, `extraccion_invalida`, `campo: "resultado.causa"`.
6. Guarda el registro y deja la auditoría.

**Salida**: `exito({ extraccion: RegistroExtraccion })`.

**Auditoría** (`auditoria_extraccion`): `correlationId`, `adjunto`, los 12 primeros caracteres de la huella, `estado`, `tipo` o `causa`, `faltantes`, `regla`, `version` de la política y `ts`. Sin contenido, valores ni fragmentos.

## `consultar_extracciones`

Herramienta de solo lectura.

**Entrada**: `{ correlationId: UUID }`.

**Salida**: `exito({ extracciones: RegistroExtraccion[] })`, ordenadas por el primer adjunto. La lista vacía no es un error.

## Cliente del core — `src/agente/cliente-core.ts`

```ts
interface ClienteCore {
  // …
  registrarExtraccion(entrada: EntradaRegistroExtraccion, correlationId: string): Promise<Respuesta<{ extraccion: RegistroExtraccion }>>;
  consultarExtracciones(correlationId: string): Promise<Respuesta<{ extracciones: RegistroExtraccion[] }>>;
}
```

Valida la respuesta del core con los esquemas compartidos, como el #9.
