# Quickstart: validar el paquete de entrega

Guía para comprobar que el ticket cumple su spec. Contratos: [comando-entrega.md](contracts/comando-entrega.md), [decisiones.md](contracts/decisiones.md), [estado-tickets.md](contracts/estado-tickets.md).

## Requisitos

Node.js ≥ 22.18, `git` y el repositorio con sus dependencias (`npm install`).

## 1. README y los cinco minutos (US1 · SC-001)

1. Clona el repositorio en una carpeta nueva, sin `node_modules`.
2. Con un cronómetro, sigue solo el «Inicio rápido» del README: `npm install`, `npm test`, `npm run casos`.
3. Esperado: las pruebas en verde y los siete casos en `PASÓ`, en menos de 5 minutos. Anota el tiempo medido en el PR.
4. Comprueba que el README enlaza el GitHub Project y el video, y que dice qué exige credenciales.

## 2. `DECISIONES.md` (US2 · SC-002)

```text
npm test
```

Esperado: pasa la prueba que cuenta las palabras (≤ 1000) y comprueba las 11 secciones con sus cuatro etiquetas y que cada enlace de **Detalle** existe. `docs/registro-decisiones.md` conserva el contenido anterior sin cambios.

## 3. Artefactos de Spec Kit (US3 · SC-003)

```text
npm run entrega:verificar
```

Esperado: la comprobación `specs` en `ok`. Antes de fusionar el #18, la carpeta `016-plugin-reutilizable-equipos` no existe y no es un hallazgo (la numeración puede tener huecos).

## 4. Video (US4 · SC-004)

Comprobación manual, justo antes de entregar:

1. Abre el enlace del README en una ventana de incógnito, sin sesión.
2. Esperado: se reproduce sin pedir acceso.
3. Duración de 5:00 o menos.
4. Aparecen los siete casos, cada uno con su número y su resultado.

## 5. El `.zip` (US5 · SC-005, SC-006)

```text
git status                      # sin cambios sin commit
npm run entrega:armar
npm run entrega:verificar
```

Esperado: veredicto `listo` y código de salida 0. Para comprobar que el control de verdad bloquea, el ciclo de pruebas de `npm test` cubre un `.zip` con un `.env` y otro con un token generado en ejecución: el veredicto es `bloqueado` y el informe no muestra el valor.

Comprueba también a mano el tamaño (`dist/crediagil-entrega.zip` ≤ 50 MB) y que el historial no cambió: `git log --oneline origin/main..HEAD` solo lista commits nuevos.

## 6. Estado de los tickets (US6 · SC-007)

La sesión, por el servidor MCP de GitHub, lista los tickets del Project. Cada uno debe estar en Done o tener el comentario `crediagil:entrega=estado`. Esperado: 0 tickets sin una cosa o la otra. El #19 queda en el estado que le corresponda al momento de cerrar.

## Pruebas

```text
npm test
npm run typecheck
npm run format:check
```
