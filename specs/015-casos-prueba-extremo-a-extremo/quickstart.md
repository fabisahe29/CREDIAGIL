# Quickstart: validar los casos obligatorios

Guía para comprobar la feature una vez implementada. Formatos en [contracts/](contracts/) y campos en [data-model.md](data-model.md).

## Requisitos

- Node.js ≥ 22.18 y las dependencias instaladas (`npm install`).
- Para el modo con modelo real: `ANTHROPIC_API_KEY` en la sesión (ver `.env.example`). Para el guionado y las pruebas, nada.

## 1. Pruebas de la lógica determinista (sin credenciales ni red)

```text
npm test
npm run typecheck
npm run format:check
```

Esperado: todo en verde, incluidas las pruebas nuevas de `src/e2e/` y las de bordes de $5.000.000, 30% y 10%, una por cada lado del borde.

## 2. Los siete casos en modo guionado

```text
npm run casos
```

Esperado: informe con el modo «guionado», una línea por caso (dos para el 7), todos `PASÓ`, `Global: ÉXITO` y código de salida 0.

## 3. Repetibilidad (HU3, escenario 1)

Ejecutar `npm run casos` dos veces. Esperado: el mismo veredicto y las mismas decisiones y llamadas; solo puede variar el texto de la respuesta, que el informe no muestra.

## 4. Un fallo se detecta (SC-003, HU3, escenario 2)

Romper a propósito una regla, por ejemplo subir el tope de monto en `src/politica/preaprobacion.ts` a 9.000.000, y ejecutar `npm run casos -- --caso 4`. Esperado: `FALLÓ`, con la diferencia indicada (la preaprobación que no debía ocurrir) y código de salida 1. Revertir el cambio.

## 5. Caso no ejecutable (FR-018)

Renombrar un documento de un caso y ejecutar `npm run casos`. Esperado: ese caso `NO EJECUTABLE` con el documento ausente, los demás se ejecutan, y el código de salida es 3. Revertir el cambio.

## 6. Modo con modelo real

```powershell
$env:ANTHROPIC_API_KEY = "<tu clave>"; npm run casos -- --modelo-real
```

Esperado: el mismo informe con modo «modelo real». Sin la clave: todos `NO EJECUTABLE` con la causa y código 3.

## 7. Reproducir un caso en el chat (US5)

```text
npm run chat -- --demo --caso casos/obligatorios/4-monto-8-millones
```

Esperado: el chat envía los mismos pasos y documentos, y muestra la decisión final y el motivo. El caso 7 usa la falla simulada:

```powershell
$env:CREDIAGIL_FALLA = "una-vez"; npm run chat -- --demo --caso casos/obligatorios/7-falla-transitoria
$env:CREDIAGIL_FALLA = "siempre"; npm run chat -- --demo --caso casos/obligatorios/7-falla-transitoria
```

## 8. Datos ficticios (US6)

`npm test` incluye `src/e2e/datos-ficticios.test.ts`. Para ver que detecta, agregar a un documento de `casos/obligatorios/` un correo que no termine en `.example` y ejecutar `npm test`. Esperado: falla señalando el archivo y la línea. Revertir el cambio.
