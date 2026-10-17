# Data Model: Esqueleto del agente y del servidor MCP de originación

**Feature**: [spec.md](spec.md) · **Decisiones**: [research.md](research.md) · **Contratos**: [contracts/](contracts/)

Todo vive en memoria o en código del repositorio. No hay base de datos. Todos los datos son ficticios ([docs/datos-ficticios.md](../../docs/datos-ficticios.md)).

## Error del contrato (`src/compartido/errores.ts`)

| Campo | Tipo | Regla |
|-------|------|-------|
| `categoria` | `transitorio` · `validacion` · `negocio` · `permisos` | FR-005 |
| `reintentable` | booleano | `true` **si y solo si** `categoria` es `transitorio` (FR-006) |
| `codigo` | texto estable, `snake_case` | Por ejemplo `formato_invalido`, `solicitud_anulada`, `solicitud_reservada`, `core_no_disponible`, `transitorio_agotado`, `respuesta_fuera_de_contrato` |
| `mensaje` | texto no vacío, en español | Legible para el agente; sin datos con forma real |
| `campo` | texto, opcional | Obligatorio en `validacion`: el campo que falla (FR-008) |

Dos códigos los produce el agente, no el core:
- **`transitorio_agotado`**: los reintentos se agotaron. Categoría `transitorio`, pero `reintentable: false`, porque ya no se reintenta. Es la única excepción a la regla de `reintentable` y se marca explícitamente en el contrato.
- **`respuesta_fuera_de_contrato`**: la respuesta del core no cumple el esquema. Categoría `negocio`, `reintentable: false` (FR-009).

## Respuesta de herramienta

```text
Respuesta<T> = { ok: true, datos: T } | { ok: false, error: Error }
```

Va en `structuredContent`. Si `ok` es `false`, el resultado MCP lleva además `isError: true`. Una consulta sin resultados es `ok: true` con datos vacíos (FR-007).

## Solicitud (core simulado)

| Campo | Tipo | Regla |
|-------|------|-------|
| `idSolicitud` | texto | `SOL-` + 10 dígitos que empiezan por `000` |
| `solicitante` | `{ nombre, documento, correo }` | Nombre inventado; `documento` con prefijo `000`; correo con dominio `.example` |
| `monto` | entero, pesos | Entero positivo (constitución, Principio III) |
| `plazoMeses` | entero | 1 a 120 |
| `estado` | `en_estudio` · `anulada` · `reservada` | `anulada` → error `negocio`; `reservada` (de otro canal) → error `permisos` al consultarla |
| `creadaEn` | fecha ISO | |

**Datos de ejemplo** (`src/mcp/datos-ejemplo.ts`): al menos una solicitud `en_estudio`, una `anulada` y una `reservada`. Un identificador con formato válido que no existe da el éxito vacío.

## Falla simulada (`src/mcp/falla.ts`)

| Modo | Comportamiento |
|------|----------------|
| *(sin configurar)* | Sin falla |
| `una-vez` | La primera llamada a cualquier herramienta devuelve `transitorio` (`core_no_disponible`); las siguientes responden normal |
| `siempre` | Todas las llamadas devuelven `transitorio` |

Origen: opción `falla` al crear el core (pruebas) o variable de entorno `CREDIAGIL_FALLA` del servidor (demo). Un valor desconocido hace que el servidor no arranque, con un mensaje claro: no se adivina. No es una herramienta MCP (FR-010).

## Política de reintento (`src/agente/reintentos.ts`)

| Parámetro | Valor |
|-----------|-------|
| Intentos máximos | 3 (1 + 2 reintentos) |
| Esperas base | 500 ms antes del 2.º intento, 1000 ms antes del 3.º |
| Variación | ±20% de cada espera, con un azar inyectable |
| Reintenta | Solo errores `reintentable: true` y tiempos límite agotados |
| Tiempo límite por llamada al core | 5 s; agotarlo cuenta como `transitorio` (FR-013) |

## Señal de escalamiento

Evento de log `escalamiento`, el registro de auditoría de la decisión de escalar (constitución, Principio VI). Lo emite el adaptador cuando se agotan los reintentos del core, y el agente en los demás casos (FR-012):

| Campo | Valor |
|-------|-------|
| `motivo` | `falla_transitoria_persistente` · `falla_del_agente` · `limite_de_turnos` · `respuesta_incompleta` |
| `regla` | Texto de la norma aplicada, por ejemplo `constitución, Principio VI · reintentos agotados` |
| `resultado` | `escalada` |
| `correlationId` | El de la conversación |
| `ts` | Marca de tiempo ISO |
| `herramienta` | Solo con `falla_transitoria_persistente`, por ejemplo `consultar_solicitud` |
| `intentos` | 3 con `falla_transitoria_persistente`; 2 con `falla_del_agente` (conversación más su reintento) |
| `ultimoError` | Código del último error, o el `subtype`/`stop_reason` del SDK |

El agente la conserva también como estado de la conversación, para componer el aviso fijo (R4). En este ticket el registro de auditoría es el log JSON por stderr; el almacén durable llega con el handoff del #15.

## Conversación y resultado del agente

| Campo | Tipo | Regla |
|-------|------|-------|
| `correlationId` | UUID | Uno por conversación |
| `respuesta` | texto | Lo que lee el solicitante |
| `tipo` | `respuesta` · `escalada` | `respuesta` solo con `success` + `end_turn` y sin señal; todo lo demás es `escalada` (contrato del agente, «Interpretación del resultado») |
| `escalamiento` | señal o `null` | Presente si `tipo` es `escalada` |
| `turnos` | entero | `num_turns` del `result`, solo informativo |
