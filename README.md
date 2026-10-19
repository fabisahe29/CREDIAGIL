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
| `/adjuntar <ruta>` | Envía al agente un documento `.txt` o `.md`, numerado como adjunto. Otros formatos se informan al agente sin leer su contenido |
| `/pegar` | Abre un bloque de texto de varias líneas; se cierra con una línea que diga `/fin`. El texto llega como mensaje y queda numerado como adjunto «texto pegado» |
| `/caso <ruta>` | Reproduce un caso de prueba (carpeta con `caso.json`) |
| `/nueva` | Empieza una conversación nueva, sin historial |
| `/salir` | Termina (también Ctrl+C) |

Para pegar un documento de varias líneas usa `/pegar` o `/adjuntar`: si pegas varias líneas como un mensaje normal, solo se envía la primera.

Cada documento de la conversación recibe un número de adjunto (1, 2, 3…) en orden de llegada; `/nueva` reinicia la numeración. Con la identidad verificada, el agente extrae los datos de un certificado laboral o de un extracto bancario por ese número, y cada dato indica de qué adjunto y de qué fragmento salió (#10). Los casos `casos/extraccion-*` lo muestran.

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

## Casos obligatorios

Los siete casos de prueba obligatorios del enunciado se ejecutan con un solo comando y entregan un veredicto por caso y uno global:

```text
npm run casos                     # los siete casos, modo guionado: no necesita credenciales ni red
npm run casos -- --modelo-real    # los mismos casos con el modelo real (exige ANTHROPIC_API_KEY)
npm run casos -- --caso 4         # un solo caso, del 1 al 7
npm run casos -- --json           # además del informe, lo imprime como JSON
```

**Qué necesita.** Para el modo guionado, solo `npm install`. Para `--modelo-real`, `ANTHROPIC_API_KEY` en la sesión; sin ella, todos los casos se informan como no ejecutables.

**Los dos modos.** En ambos corren de verdad el servidor MCP del core, los hooks, la política y el adaptador. En el modo guionado se sustituyen solo la consulta al modelo, el subagente de extracción y el clasificador de documentos, con un guion fijo por caso (`guion.json`), así que el resultado se repite. Con `--modelo-real` decide el modelo.

**Cómo leer el informe.** La primera línea dice el modo. Luego hay una línea por caso (el caso 7 tiene dos, una por variante) con su veredicto, la decisión final, los eventos y las llamadas que se observaron; si falló, debajo aparece cada diferencia con lo esperado y lo observado. El veredicto sale de la decisión, las llamadas a herramientas y el estado final del core: nunca del texto de la respuesta.

| Veredicto | Significado |
|-----------|-------------|
| `PASÓ` | La decisión, las llamadas, los eventos y el estado del core coinciden con lo esperado |
| `FALLÓ` | Algo difiere; el informe dice qué campo y en qué |
| `NO EJECUTABLE` | El caso no pudo correr (documento o guion ausente, `caso.json` inválido, o `--modelo-real` sin credenciales); no cuenta como pasado |

| Código de salida | Significado |
|------------------|-------------|
| 0 | Éxito: los siete casos pasaron |
| 1 | Fallo: al menos un caso terminó distinto de lo esperado |
| 2 | Opciones inválidas |
| 3 | Incompleto: ningún caso falló, pero alguno no se pudo ejecutar; no es éxito |

Cada caso es una carpeta de [casos/obligatorios/](casos/obligatorios/) con su `caso.json` (pasos y resultado esperado), su `guion.json` y sus documentos ficticios. Los logs JSON van a `logs/casos-<fecha>.jsonl`.

| N.º | Caso | Resultado esperado |
|-----|------|--------------------|
| 1 | Mensaje de ejemplo con documentos consistentes | Se registra y se preaprueba |
| 2 | Certificado laboral sin salario | El salario queda nulo y se pide el dato o el documento |
| 3 | Ingreso declarado con una diferencia de más del 10% | Escala por discrepancia de ingreso; no se preaprueba |
| 4 | Solicitud de $8.000.000 | Escala por superar el tope de monto; no se preaprueba |
| 5 | Intento de preaprobar sin identidad verificada | Bloqueado antes de producir efecto; no se registra ni se preaprueba |
| 6 | Ingresos en moneda extranjera | Escala por caso no cubierto; no se convierte la moneda |
| 7 | Falla transitoria del servidor del core | Reintento acotado; si se agota, escala sin afirmar una decisión |

La numeración es la del issue #17. En tickets anteriores se citó otra del enunciado: por ejemplo, la moneda extranjera se llamó «caso 7» en el #15 y es el caso 6 aquí, y `identidad-no-verificable` (tres fechas de expedición incorrectas) se llamó «caso 5» y es un escenario distinto del caso 5 de ahora.

### Reproducir un caso en el chat (para el video)

**Video de la ejecución de los casos de prueba**: [ver en Google Drive](https://drive.google.com/file/d/1yzjPuf3hHKW0aGjrBs1IzW1YIyCenfhV/view?usp=sharing).

Cada caso se reproduce con los mismos documentos y pasos que usa el comando. Con el modelo real, el chat necesita `ANTHROPIC_API_KEY`:

```powershell
npm run chat -- --demo --caso casos/obligatorios/1-ejemplo-consistente
npm run chat -- --demo --caso casos/obligatorios/2-certificado-sin-salario
npm run chat -- --demo --caso casos/obligatorios/3-discrepancia-ingreso
npm run chat -- --demo --caso casos/obligatorios/4-monto-8-millones
npm run chat -- --demo --caso casos/obligatorios/5-preaprobar-sin-identidad
npm run chat -- --demo --caso casos/obligatorios/6-moneda-extranjera
$env:CREDIAGIL_FALLA = "una-vez"; npm run chat -- --demo --caso casos/obligatorios/7-falla-transitoria
$env:CREDIAGIL_FALLA = "siempre"; npm run chat -- --demo --caso casos/obligatorios/7-falla-transitoria
```

El caso 7 usa la falla simulada del core (`una-vez` o `siempre`); límpiala con `Remove-Item Env:CREDIAGIL_FALLA` antes de reproducir otro caso. Al terminar, el chat muestra la decisión final y el motivo.

## Pruebas

```text
npm test            # sin red ni modelo: el modelo y el core se simulan
npm run casos       # los siete casos obligatorios, en modo guionado
npm run typecheck
npm run format:check
```

## Estructura

| Ruta | Contenido |
|------|-----------|
| `src/chat/` | Chat de terminal |
| `src/e2e/` | Ejecutor de los casos obligatorios (`npm run casos`) |
| `src/agente/` | Agente (Claude Agent SDK) y adaptador hacia el core |
| `src/mcp/` | Servidor MCP que simula el core de originación |
| `src/compartido/` | Contrato de errores, catálogo de eventos y logs |
| `casos/` | Casos de prueba ficticios para la demo |
| `casos/obligatorios/` | Los siete casos obligatorios, con su resultado esperado y su guion |
| `specs/` | Especificación, plan y tareas de cada funcionalidad (Spec Kit) |
