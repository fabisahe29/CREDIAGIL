# Crediágil — convenciones del equipo

Agente de originación de crédito: TypeScript, Claude Agent SDK y un servidor MCP propio que simula el core.

Las reglas no negociables (reglas de negocio, datos ficticios, decisiones deterministas, acciones solo por MCP) están en la constitución, que prevalece sobre todo lo demás:

@.specify/memory/constitution.md

## Convenciones

- **Idioma**: español en documentación, specs, issues, comentarios de avance y mensajes de commit.
- **Flujo de trabajo**: cada ticket del GitHub Project pasa por Spec Kit (especificar → aclarar → planificar → tareas → implementar).
  - Se toma con `/ticket-tomar`, se abre el PR con `/ticket-abrir-pr` y se fusiona con `/ticket-cerrar`.
  - Los comentarios de especificación y de plan los publican los hooks de Spec Kit.
  - Detalle del flujo: [.claude/flujo-github.md](.claude/flujo-github.md).
- **Commits**: convencionales (`feat:`, `fix:`, `docs:`, `chore:`, `test:`…), con el número de issue: `feat: … (#N)`.
- **Stack**: TypeScript con `strict` en Node.js LTS. No se usa `any` sin justificación escrita.

## Mapa del repositorio

| Ruta | Contenido |
|------|-----------|
| `specs/NNN-…/` | Una carpeta por feature: spec, plan, research, contratos y tareas |
| `.specify/` | Spec Kit: plantillas, scripts, hooks (`extensions.yml`) y constitución |
| `.claude/` | Comandos propios (`skills/`), reglas por zona (`rules/`) y configuración compartida (`settings.json`) |
| `src/politica/` | Módulo único de política de crédito: Regla 1 desde el #9; Regla 5 de documentos desde el #10; umbrales y tasa con #12 y #14 |
| `src/agente/` | Agente, adaptador de herramientas, control de identidad (#9) y subagente de extracción de documentos (#10) |
| `src/mcp/` | Servidor MCP del core de originación (#7); identificación y verificación desde el #9; registro de extracciones desde el #10 |
| `src/chat/` | Chat de terminal: `npm run chat` (issue #8) |
| `src/compartido/` | Contrato de errores, catálogo de eventos de negocio, logs y validación de extracciones con procedencia (#10) |
| `casos/` | Casos de prueba ficticios para la demo (`/caso` en el chat) |
| `DECISIONES.md` | Decisiones de diseño con su alternativa descartada |

## Reglas por zona

En `.claude/rules/` hay reglas que se cargan solas al tocar archivos de su zona: tests (`*.test.ts`), política, servidor MCP y specs. Lo específico de una zona va en su regla, no aquí.

## Lo personal va aparte

- `CLAUDE.local.md` y `.claude/settings.local.json` no se versionan (están en `.gitignore`).
- Solo ajustan el estilo y la extensión de las respuestas, los permisos extra, el editor y el modelo.
- Ante un conflicto, prevalecen las convenciones de este archivo.
