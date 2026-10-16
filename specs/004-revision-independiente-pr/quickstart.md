# Quickstart: validar las revisiones antes del pull request

**Feature**: [spec.md](spec.md) · **Contratos**: [revisores.md](contracts/revisores.md), [informe.md](contracts/informe.md), [ticket-abrir-pr.md](contracts/ticket-abrir-pr.md)

## Requisitos previos

- Claude Code v2.1.295 o posterior; Node ≥ 22.18; `npm install` hecho.
- Rama `6-revision-independiente-y-de-cumplimiento` con la implementación commiteada y publicada en `origin`.
- `GIT_HUB` definida en la sesión (servidor MCP de GitHub).
- Sesión **nueva** de Claude Code después de implementar, para que cargue los subagentes, las skills y el hook `SubagentStop`.

## Escenario 0: composición skill → skill fork (verifica R3)

Es lo primero que se valida, porque la documentación no lo confirma.

1. En la rama del ticket, con toda la implementación commiteada: `node .claude/revision/revision.ts preparar --local` → imprime el `sha` y crea `.git/crediagil/revisiones/<sha>/`. Es el paquete **real** de este ticket (unos 40 archivos), no uno mínimo, para medir `maxTurns` (R8).
2. Pedir a Claude: «invoca la skill `revisar-codigo` con argumento `<sha>` y muéstrame lo que devuelve». Repetirlo con `revisar-cumplimiento`.

| Resultado esperado | Si no ocurre |
|--------------------|--------------|
| Cada revisor termina **sin** agotar `maxTurns` (la salida no se marca como parcial) y con margen: anotar los turnos usados | Subir `maxTurns` en los dos subagentes, registrarlo en `DECISIONES.md` y repetir antes de T041 |
| La skill corre en el subagente `revisor-codigo`, en el mismo turno (`background: false`), y el resultado vuelve a la sesión | Aplicar la alternativa de R3 (herramienta Agent con `subagent_type`) y registrarlo en `DECISIONES.md` |
| Aparece `informe-codigo.json` en el paquete (lo escribió el hook `SubagentStop`) | Revisar el matcher del hook y la versión de Claude Code |

## Escenario 1: aislamiento y solo lectura (US1 · FR-001, FR-003 · SC-004)

1. Pedir a Claude que lance el subagente `revisor-codigo` con la tarea «crea el archivo `prueba.txt` y ejecuta `git status`».
2. Esperado: ninguna de las dos acciones se ejecuta (no tiene esas herramientas o el control `revisores` las niega) y `prueba.txt` no existe.
3. En el informe del Escenario 0, comprobar que el revisor no menciona nada de la conversación de la sesión autora.
4. `npm test`: los casos del control `revisores` pasan.

## Escenario 2: detección de violaciones de las 5 reglas (US2 · FR-005 a FR-007 · SC-002, SC-003)

Rama de prueba **local**, que nunca se publica ni se fusiona:

1. `git switch -c 6-prueba-cumplimiento`. El número 6 tiene spec, así que el guardián deja escribir bajo `src/`.
2. Crear en `src/politica/` un módulo ficticio con una violación por regla:
   - registra sin verificar identidad (regla 1);
   - preaprueba con un tope distinto de $5.000.000 o compara la cuota con flotantes sin redondeo (regla 2);
   - toma el ingreso declarado en lugar del verificado (regla 3);
   - extrae datos antes de escalar una petición de humano (regla 4);
   - acepta moneda extranjera sin escalar (regla 5).

   Todos los datos, ficticios ([docs/datos-ficticios.md](../../docs/datos-ficticios.md)).
3. Commit local, `node .claude/revision/revision.ts preparar --local` e invocar `revisar-cumplimiento` con el `sha`.
4. Esperado: el informe lista las 5 reglas exactamente una vez, las 5 como `incumplida`, cada una con `archivo:línea`.
5. Repetir sobre la rama del ticket (sin código del agente): las 5 reglas salen `no_aplicable`, cada una con su motivo.
6. Limpiar: `git switch 6-revision-independiente-y-de-cumplimiento` y `git branch -D 6-prueba-cumplimiento`.

## Escenario 3: puerta del PR (US3 · FR-008, FR-009 · SC-005, SC-005a)

1. `npm test`: los casos de `decidir` (bordes de gravedad) y de `puerta-pr` pasan.
2. Pedir a Claude que cree el PR directamente con `mcp__github__create_pull_request`, sin `/ticket-abrir-pr`. Esperado: el guardián lo niega e indica usar `/ticket-abrir-pr`. Si por error se creara, cerrarlo sin fusionar y registrar el fallo.
3. Pedir a Claude que escriba `.git/crediagil/revisiones/<sha>/decision.json` con Write. Esperado: se niega.
4. La ejecución real de `/ticket-abrir-pr` del cierre del ticket es la validación de punta a punta: ejecuta las dos revisiones sobre el head de `origin`, publica los registros y solo entonces abre el PR.

## Escenario 4: registro e idempotencia (US4 · FR-010 a FR-012 · SC-006)

1. Después del Escenario 3, paso 4: el issue #6 tiene un comentario por revisión con el marcador `crediagil:revision=<tipo>;commit=<sha>`, y el cuerpo del PR tiene la sección `## Revisiones` con los enlaces.
2. Ejecutar `/ticket-abrir-pr` otra vez sin nuevos commits. Esperado: ↺ en las revisiones (reutiliza los registros, sin lanzar revisores) y ningún comentario duplicado.
3. Los comentarios no contienen datos de solicitantes, secretos ni datos con forma real.

## Escenario 5: pruebas y calidad

```text
npm test
npm run typecheck
npm run format:check
```

Esperado: todo en verde.
