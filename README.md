# Crediágil — agente de originación de crédito

Agente conversacional que atiende solicitudes de crédito de consumo de Crediágil. Está construido con TypeScript, el Claude Agent SDK y un servidor MCP propio que simula el core de originación.

**Todos los datos son ficticios**: solicitantes, empleadores, documentos y montos. Las reglas de negocio no negociables están en la [constitución](.specify/memory/constitution.md), y las decisiones de diseño, en [DECISIONES.md](DECISIONES.md).

## Requisitos

- Node.js ≥ 22.18 (LTS).
- `npm install`, con las dependencias opcionales: traen el binario de Claude Code que usa el Agent SDK.
- `ANTHROPIC_API_KEY` definida **en la sesión de la terminal**, nunca en un archivo versionado. Ver [.env.example](.env.example).

  ```powershell
  $env:ANTHROPIC_API_KEY = "<tu clave>"
  ```

## Iniciar el chat

```text
npm run chat
```

Al iniciar, el chat muestra la ruta del archivo de logs y el identificador de la conversación (`correlationId`). Escribe tu mensaje y pulsa Enter.

| Opción | Efecto |
|--------|--------|
| `npm run chat -- --demo` | Modo de demostración: muestra cada llamada del agente a las herramientas del core |
| `npm run chat -- --caso casos/demo-consulta` | Reproduce un caso de prueba apenas arranca |

### Comandos

| Comando | Qué hace |
|---------|----------|
| `/ayuda` | Lista los comandos |
| `/adjuntar <ruta>` | Envía al agente un documento `.txt` o `.md`. Otros formatos se informan al agente sin leer su contenido |
| `/pegar` | Abre un bloque de texto de varias líneas; se cierra con una línea que diga `/fin` |
| `/caso <ruta>` | Reproduce un caso de prueba (carpeta con `caso.json`) |
| `/nueva` | Empieza una conversación nueva, sin historial |
| `/salir` | Termina (también Ctrl+C) |

Para pegar un documento de varias líneas usa `/pegar` o `/adjuntar`: si pegas varias líneas como un mensaje normal, solo se envía la primera.

### Cómo leer la conversación

Además de los mensajes (`Tú:` y `Agente:`), el chat destaca los **eventos de negocio**:

| Etiqueta | Significa |
|----------|-----------|
| `[PREAPROBACIÓN]` | La solicitud quedó preaprobada, con la regla y los valores usados |
| `[SOLICITUD DE DATO]` | El agente pide un dato o un documento |
| `[ESCALAMIENTO]` | El caso pasa a un analista de crédito, con el motivo |
| `[BLOQUEO POR REGLA]` | Una regla de negocio impidió una acción: qué regla, con qué valores y qué sigue |
| `[EVENTO NO RECONOCIDO]` | Llegó un evento que no cumple el catálogo; no cambia nada |

La línea `══ Estado de la solicitud: … ══` muestra el estado: `EN CURSO`, `PREAPROBADA` o `ESCALADA A ANALISTA`. El estado cambia **solo** con eventos, nunca por lo que diga el texto del agente. Una solicitud preaprobada o escalada cierra la conversación; para seguir, usa `/nueva`.

### Logs

Cada ejecución escribe sus logs JSON en `logs/chat-<fecha>.jsonl`, que git ignora. Cada línea lleva el `correlationId` de la conversación. Los documentos aparecen solo con su nombre, tipo y tamaño, nunca con su contenido.

### Demo con el core caído

Para ver el escalamiento por una falla del core, inicia el chat con la falla simulada:

```powershell
$env:CREDIAGIL_FALLA = "siempre"; npm run chat -- --demo
```

`una-vez` hace fallar solo la primera llamada. Sin la variable, no hay falla.

## Casos de prueba

Cada caso es una carpeta en [casos/](casos/) con un `caso.json` y sus documentos:

```json
{
  "nombre": "demo-consulta",
  "descripcion": "…",
  "pasos": [{ "mensaje": "Hola…" }, { "adjuntar": "certificado-laboral.md" }]
}
```

Antes de enviar el primer paso, el chat valida el caso completo y comprueba que cada adjunto existe dentro de la carpeta.

## Pruebas

```text
npm test            # sin red ni modelo: el modelo y el core se simulan
npm run typecheck
npm run format:check
```

## Estructura

| Ruta | Contenido |
|------|-----------|
| `src/chat/` | Chat de terminal |
| `src/agente/` | Agente (Claude Agent SDK) y adaptador hacia el core |
| `src/mcp/` | Servidor MCP que simula el core de originación |
| `src/compartido/` | Contrato de errores, catálogo de eventos y logs |
| `casos/` | Casos de prueba ficticios para la demo |
| `specs/` | Especificación, plan y tareas de cada funcionalidad (Spec Kit) |
