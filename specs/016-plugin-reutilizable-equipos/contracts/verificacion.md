# Contrato: resultado de la verificación en el repositorio de prueba

**Feature**: [../spec.md](../spec.md) · Requisitos: FR-014; criterios SC-002 y SC-007

`npm run plugin:verificar` crea una carpeta temporal nueva en cada ejecución, con una estructura de carpetas distinta de la de este repositorio, y deja un resultado por pieza. No usa datos reales: los datos con forma real se generan en ejecución y no se escriben literales (Principio II).

## Procedimiento

1. Crear el repositorio de prueba temporal con carpetas propias (por ejemplo `app/` y `docs/`).
2. Registrar el catálogo desde la ruta de este repositorio e instalar `crediagil-controles` en el alcance del proyecto de prueba.
3. Ejecutar las comprobaciones de cada pieza (tabla siguiente).
4. Escribir el resultado y salir con código distinto de cero si alguna pieza quedó `reprobada`. Las `no_verificable` se informan y no cuentan como aprobadas.

## Comprobaciones por pieza

| Pieza | Comprobación | Esperado |
|-------|--------------|----------|
| hook | El guardián instalado recibe una escritura con una cédula con forma real, generada en ejecución | `deny`, con el valor enmascarado |
| hook | Recibe una escritura con un número que empieza por el prefijo ficticio | No bloquea |
| hook | Recibe una escritura con una cuenta con forma real junto a la palabra «cuenta» | `deny` |
| hook | Recibe una lectura de `.env` | `deny` |
| hook | Con `.claude/controles-equipo.json` inválido, recibe cualquier escritura | `deny` con mensaje legible |
| hook | Recibe una entrada que no es JSON | `deny` con tipo y causa |
| subagente | El archivo instalado declara solo `Read`, `Grep` y `Glob` | Cumple |
| subagente | Un revisor intenta `Write` (entrada simulada con su nombre) | `deny` |
| skill | El archivo instalado existe, y no contiene términos de portabilidad | Cumple |

## Formato del resultado

Se escribe en la salida estándar y en `specs/016-plugin-reutilizable-equipos/verificacion.json` solo si se pide con `--guardar`.

```json
{
  "version": "1.0.0",
  "fecha": "2026-10-19T18:00:00Z",
  "repositorioDePrueba": "carpeta temporal",
  "piezas": [
    {
      "pieza": "hook",
      "estado": "aprobada",
      "comprobaciones": [
        { "nombre": "bloquea cédula con forma real", "resultado": "ok" },
        { "nombre": "permite número con prefijo ficticio", "resultado": "ok" }
      ]
    },
    {
      "pieza": "skill",
      "estado": "no_verificable",
      "causa": "la CLI de Claude Code no está disponible en este entorno",
      "comprobaciones": []
    }
  ]
}
```

- `estado` es `aprobada`, `reprobada` o `no_verificable`.
- Si `estado` no es `aprobada`, `causa` es obligatoria y dice qué falló o qué faltó (historia 4, escenario 2).
- El resultado no incluye el contenido de ningún archivo ni datos con forma real, solo nombres de comprobación y su resultado.

## Repetibilidad

- La carpeta de prueba es nueva en cada ejecución y se borra al terminar.
- Dos ejecuciones seguidas sin cambios producen el mismo `estado` por pieza (SC-007). `fecha` es el único campo que cambia.

## Lo que no cubre

Que el revisor audite correctamente con un modelo real no se automatiza. Se comprueba a mano con la guía de [quickstart.md](../quickstart.md) y se anota en la descripción del pull request.
