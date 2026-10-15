# Contrato: convención de datos ficticios

**Requisitos**: FR-001, FR-003, FR-004 · **Aclaración**: Q2 · **Decisión**: [research.md](../research.md), R3

Contrato de dos archivos que dicen lo mismo y que una prueba mantiene sincronizados:

- `.claude/hooks/lib/convencion-ficticia.ts`: **fuente única** que usa el control. Contiene las palabras clave, los rangos de dígitos y la regla del prefijo ficticio.
- `docs/datos-ficticios.md`: versión para personas. La enlazan `.claude/rules/tests.md` y los mensajes de bloqueo.

Una prueba (`convencion-ficticia.test.ts`) falla si una palabra clave o el prefijo aparecen en uno de los dos archivos y no en el otro.

## Regla ficticia

> Todo número de identificación, cuenta o tarjeta ficticio **empieza por `000`**, contando solo dígitos (se ignoran puntos, espacios y guiones).

- Ningún documento, NIT, cuenta ni tarjeta real empieza por `000`: es reconocible a simple vista y el control lo verifica sin listas.
- Complementa lo que ya pide la constitución (Principio II): dominios `.example` y nombres y empleadores inventados.

| Tipo | Ejemplo ficticio aceptado | Por qué pasa |
|------|---------------------------|--------------|
| Cédula | `CC 0001234567` | Empieza por `000` |
| NIT | `NIT 000123456-7` | Empieza por `000` |
| Cuenta | `cuenta de ahorros 0001234567890` | Empieza por `000` |
| Tarjeta | `0000 1234 5678 9010` | Empieza por `000` (aunque pase Luhn) |
| Correo | `ana.perez@empleador.example` | Dominio `.example` (constitución) |

## Palabras clave de contexto (misma línea, sin distinguir mayúsculas salvo `CC`)

| Tipo | Palabras clave |
|------|----------------|
| Cédula | `CC` (mayúsculas, palabra completa), `C.C.`, `cédula`, `cedula`, `documento de identidad`, `número de documento` |
| NIT | `NIT` (palabra completa) |
| Cuenta | `cuenta`, `cuentas`, `IBAN`, `número de cuenta`, `nro. de cuenta` |

Las tarjetas no necesitan palabra clave: se detectan por Luhn en cualquier contexto.

## Casos que deben pasar (no son falsos positivos, FR-004)

| Texto | Motivo |
|-------|--------|
| `const TOPE = 5_000_000;` | Monto sin palabra clave; además, `_` no es separador admitido |
| `monto: $5.000.000 COP` | Sin palabra clave de documento ni de cuenta |
| `cuota mensual 285.432` | Sin palabra clave |
| `tener en cuenta que el monto es 4.800.000` | La palabra clave está, pero 7 dígitos no alcanzan el mínimo de cuenta (10) |
| `CC 0001234567` | Convención ficticia |
| Un número de 16 dígitos que **no** pasa Luhn | No tiene forma de tarjeta real |

## Casos que deben bloquearse (FR-001)

Los valores concretos **no** se escriben aquí ni en las pruebas (FR-018). Las pruebas los generan en tiempo de ejecución: calculan el dígito Luhn sobre una base, o arman las cadenas por concatenación.

| Caso | Forma |
|------|-------|
| Tarjeta | 16 dígitos que pasan Luhn, en bloques de 4 con espacios o guiones, o sin separadores |
| Cédula | `cédula` o `CC` seguido de 8 a 10 dígitos que no empiezan por `000` |
| NIT | `NIT` seguido de 9 dígitos, guion y DV, sin prefijo `000` |
| Cuenta | `cuenta` o `IBAN` seguido de 10 a 20 dígitos sin prefijo `000` |
| Monto y palabra clave de cuenta | Un monto de 10 dígitos en la misma línea que la palabra de cuenta: se bloquea, porque el control no distingue un monto en esa línea (borde aceptado en la spec) |
