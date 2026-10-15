# Convención de datos ficticios

Todo dato de solicitantes, empleadores, cuentas y documentos es ficticio ([constitución](../.specify/memory/constitution.md), Principio II). Esta convención hace que un dato ficticio se reconozca a simple vista y que el guardián del repositorio lo acepte. Un dato con forma real se bloquea en cualquier archivo, comando o comentario.

La fuente que usa el guardián es [`.claude/hooks/lib/convencion-ficticia.ts`](../.claude/hooks/lib/convencion-ficticia.ts). Una prueba falla si este documento y ese módulo dejan de coincidir.

## La regla

> Todo número de identificación, cuenta o tarjeta ficticio **empieza por `000`**, contando solo los dígitos (se ignoran puntos, espacios y guiones).

Ningún documento, NIT, cuenta ni tarjeta real empieza por `000`.

Para lo demás valen las reglas de la constitución: correos con dominio `.example` y nombres, empleadores y NIT inventados.

| Tipo | Ejemplo ficticio |
|------|------------------|
| Cédula | `CC 0001234567` |
| NIT | `NIT 000123456-7` |
| Cuenta | `cuenta de ahorros 0001234567890` |
| Tarjeta | `0000 1234 5678 9010` |
| Correo | `ana.perez@empleador.example` |

## Qué bloquea el guardián

- **Tarjeta**: de 13 a 19 dígitos, en bloques de 4 con espacios o guiones, o sin separadores, que pasan el dígito de control Luhn. Se bloquea en cualquier contexto.
- **Cédula**: de 6 a 10 dígitos, con o sin puntos de miles, cuando en la misma línea aparece una palabra clave de documento.
- **NIT**: 9 dígitos, con o sin puntos y con o sin dígito de verificación, cuando en la misma línea aparece `NIT`.
- **Cuenta**: de 10 a 20 dígitos, cuando en la misma línea aparece una palabra clave de cuenta.

En todos los casos, un número que empieza por `000` es ficticio y pasa.

## Palabras clave (misma línea)

`CC` y `NIT` se buscan en mayúsculas y como palabra completa. Las demás, sin distinguir mayúsculas.

| Tipo | Palabras clave |
|------|----------------|
| Cédula | `CC`, `C.C.`, `cédula`, `cedula`, `documento de identidad`, `número de documento` |
| NIT | `NIT` |
| Cuenta | `cuenta`, `cuentas`, `IBAN`, `número de cuenta`, `nro. de cuenta` |

## Montos del dominio

Los montos no se bloquean mientras su línea no tenga una palabra clave de documento o de cuenta:

- `const TOPE = 5_000_000;`
- `monto: $5.000.000 COP`
- `cuota mensual 285.432`
- `tener en cuenta que el monto es 4.800.000` (7 dígitos no alcanzan el mínimo de una cuenta)

Si un monto de 10 o más dígitos comparte línea con la palabra "cuenta", el guardián lo trata como una cuenta. Escribe el monto en otra línea o reformula la frase.
