# crediagil-controles

Controles reutilizables para equipos que usan Claude Code.

## Qué incluye

- **Hook `guardian-controles`**: antes de cada acción bloquea los archivos `.env`, los datos con forma real (cédula, NIT, cuenta, tarjeta) y que un revisor escriba.
- **Subagente `revisor-reglas`**: revisa un cambio contra las reglas del equipo. Solo lee.
- **Skill `revisar-reglas`**: obtiene el diff, se lo entrega al revisor y explica cómo leer el informe.

## Requisitos

Node.js 22.18 o posterior: el hook ejecuta TypeScript directamente.

## Configuración del equipo

La configuración vive en el repositorio del equipo, no aquí:

- `.claude/reglas-equipo.md`: las reglas que audita el revisor, un encabezado de segundo nivel por regla. Sin este archivo, el revisor informa `sin_configuracion` y no audita.
- `.claude/controles-equipo.json` (opcional): `{ "prefijoFicticio": "000" }`, de 3 a 6 dígitos. Una persona lo edita fuera de la sesión: el hook no deja que el agente lo escriba. Un número de identificación, cuenta o tarjeta ficticio empieza por este prefijo, contando solo los dígitos.

## Uso

```text
/crediagil-controles:revisar-reglas main...HEAD
```

El argumento es un rango de git; sin argumento revisa los cambios que aún no confirmas.

Las copias de esta carpeta se generan desde las fuentes del repositorio donde se desarrolla el plugin: no se editan a mano.
