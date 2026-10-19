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
| `src/politica/` | Módulo único de política de crédito: Regla 1 desde el #9; Regla 5 de documentos desde el #10; Regla 3 desde el #11 (ingreso verificado, discrepancia y consistencia entre documentos); tasa y cuota desde el #12 (`cuota.ts`); diferencia porcentual de ingreso informativa desde el #13 (`ingreso.ts`); Regla 2 de preaprobación desde el #14 (`preaprobacion.ts`: tope de monto y porcentaje máximo de la cuota); escalamiento desde el #15 (`escalamiento.ts`: catálogos de causas, motivos y acciones, causa y acción recomendada de cada caso y detección de la petición de persona de la Regla 4); asuntos del mensaje desde el #16 (`asuntos.ts`: catálogo de asuntos, detección y estado de cada uno) |
| `src/agente/` | Agente, adaptador de herramientas, control de identidad (#9) y subagente de extracción de documentos (#10); herramienta `calcular_capacidad_pago` (#12); herramienta `registrar_solicitud` y hook de la Regla 1 sobre el registro (#13); herramienta `preaprobar_credito` y hook de la Regla 2 (`control-preaprobacion.ts`) desde el #14; Regla 4 por código antes del modelo y entrega del resumen al analista (`entregarHandoff` en `agente.ts`) desde el #15; respuesta única con el estado de cada asunto del mensaje (`respuesta-unificada.ts` y los asuntos del turno en `conversar`) y simulación de cuota tras escalar (`admiteTrasEscalar`) desde el #16 |
| `src/mcp/` | Servidor MCP del core de originación (#7); identificación y verificación desde el #9; registro de extracciones desde el #10; verificación de ingreso y reextracción desde el #11; simulación de cuota `calcular_capacidad_pago` desde el #12; registro de la solicitud con procedencia (`registrar_solicitud`, `consultar_solicitud_registrada`) desde el #13; preaprobación (`preaprobar_credito`) desde el #14; escalamiento con resumen para el analista (`escalar_a_analista`, `consultar_escalamiento`) desde el #15; `asuntosPendientes` en `escalar_a_analista` desde el #16 |
| `src/chat/` | Chat de terminal: `npm run chat` (issue #8); con `--demo` imprime el resumen para el analista de un caso escalado (#15) |
| `src/e2e/` | Ejecutor de los casos obligatorios: `npm run casos` (#17). Veredicto por decisión, llamadas y estado del core; modo guionado (por defecto) o `--modelo-real` |
| `src/compartido/` | Contrato de errores, catálogo de eventos de negocio, logs, validación de extracciones con procedencia (#10) y esquemas de la verificación de ingreso (#11) y contrato de la simulación de capacidad de pago (#12) del registro de la solicitud con procedencia (#13), de la preaprobación (#14) y del escalamiento con su resumen para el analista (#15), con los asuntos pendientes (#16) |
| `casos/` | Casos de prueba ficticios para la demo (`/caso` en el chat); casos de escalamiento desde el #15; casos de mensajes con varios asuntos desde el #16; los siete casos obligatorios con su resultado esperado y su guion, en `casos/obligatorios/`, desde el #17 |
| `DECISIONES.md` | Decisiones de diseño con su alternativa descartada |

## Reglas por zona

En `.claude/rules/` hay reglas que se cargan solas al tocar archivos de su zona: tests (`*.test.ts`), política, servidor MCP y specs. Lo específico de una zona va en su regla, no aquí.

## Lo personal va aparte

- `CLAUDE.local.md` y `.claude/settings.local.json` no se versionan (están en `.gitignore`).
- Solo ajustan el estilo y la extensión de las respuestas, los permisos extra, el editor y el modelo.
- Ante un conflicto, prevalecen las convenciones de este archivo.
