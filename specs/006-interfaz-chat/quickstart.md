# Quickstart: validar la interfaz de chat

**Feature**: [spec.md](spec.md) · **Contratos**: [chat-cli.md](contracts/chat-cli.md), [eventos.md](contracts/eventos.md)

## Requisitos previos

- Node ≥ 22.18 y `npm install` hecho (como en el #7).
- Para los Escenarios 2 a 6: `ANTHROPIC_API_KEY` definida en la sesión de la terminal. Nunca en un archivo versionado.

## Escenario 1: pruebas sin red ni modelo (FR-022 · SC-002, SC-003, SC-005, SC-006, SC-007)

```text
npm test
npm run typecheck
npm run format:check
```

Esperado: todo en verde, sin `ANTHROPIC_API_KEY`. Cubre:
- el catálogo: un evento válido de cada tipo, cada campo obligatorio faltante, un tipo desconocido y campos extra;
- la derivación del estado: cada transición, estados finales absorbentes y varios eventos en un turno;
- la presentación: etiquetas, orden de campos, formato de valores y `[EVENTO NO RECONOCIDO]`;
- documentos: `.txt`/`.md` válidos, otra extensión, demasiado grande, UTF-8 inválido, bytes nulos, vacío e inexistente; y que los logs no contengan el contenido;
- casos: el de ejemplo, JSON inválido, paso con dos claves, adjunto inexistente y ruta que sale de la carpeta;
- el bucle del chat con `conversar` falso: turno a turno, descarte mientras está ocupado, `/pegar`, `/nueva`, conversación cerrada, caso detenido por estado final y modo `--demo`;
- `conversar` con historial, `persistSession: false` y el evento `escalamiento` derivado de la señal del #7.

## Escenario 2: arranque con un comando (FR-016, FR-017 · SC-004)

1. Sin `ANTHROPIC_API_KEY`: `npm run chat` termina con código 1 y el mensaje del contrato; no muestra ningún valor.
2. Con la clave: `npm run chat` muestra la ruta del log, el `correlationId` y la invitación a `/ayuda`.
3. `/ayuda` lista los seis comandos.

## Escenario 3: conversación turno a turno (US1 · FR-001 a FR-004)

1. `Hola, quiero saber cómo va mi solicitud SOL-0001000001`. Esperado: `Tú`, `Agente · trabajando…` y la respuesta con los datos del core.
2. Sin repetir el identificador: `¿Y en qué fecha la radiqué?`. Esperado: el agente responde sobre la misma solicitud (usa el historial).
3. Mientras el agente trabaja, escribir algo y Enter. Esperado: aviso de que no se envió.
4. `/nueva`. Esperado: `correlationId` nuevo; preguntar `¿y mi solicitud?` ya no tiene contexto.

## Escenario 4: documentos (US4 · FR-012 a FR-015 · SC-006)

1. `/adjuntar casos/demo-consulta/certificado-laboral.md`. Esperado: `Tú · adjunto certificado-laboral.md (<n> bytes)` y el agente acusa recibo del documento.
2. `/pegar`, tres líneas de texto, `/fin`. Esperado: un solo mensaje con las tres líneas.
3. Adjuntar un `.pdf` o `.png` cualquiera. Esperado: `(no soportado: formato)`; el agente recibe solo el nombre y el tipo.
4. Abrir el archivo de log de la ejecución y buscar una frase del certificado. Esperado: no aparece; sí aparecen nombre, tipo y tamaño.

## Escenario 5: eventos y estado (US2 · FR-007a, FR-009, FR-010 · SC-001)

1. Iniciar con la falla del core activada y el modo de demostración:

   ```text
   $env:CREDIAGIL_FALLA = "siempre"; npm run chat -- --demo
   ```

2. Preguntar por `SOL-0001000001`. Esperado: tres líneas de herramienta con `transitorio`, la respuesta de escalamiento, el bloque `[ESCALAMIENTO]` con motivo, regla y valores, y `Estado de la solicitud: ESCALADA A ANALISTA (conversación cerrada)`.
3. Escribir otro mensaje. Esperado: no se envía; aparece el recordatorio del estado y de `/nueva`.
4. Sin `--demo`, repetir: no aparecen las líneas de herramienta.
5. Abrir el log: el `evento_negocio` de tipo `escalamiento` tiene el mismo `correlationId` que mostró la interfaz.

Los otros tres tipos de evento solo los emiten tickets futuros: se validan en el Escenario 1 con el modelo simulado.

## Escenario 6: reproducir el caso de ejemplo (US5 · FR-018 a FR-020 · SC-005)

1. `npm run chat -- --caso casos/demo-consulta`. Esperado: `▶ Caso demo-consulta…`, cada paso con `▶ paso i/n`, en orden y esperando cada respuesta, y `▶ Caso terminado.`
2. `/caso casos/no-existe`. Esperado: `No pude cargar el caso: …` y nada enviado.

## Escenario 7: revisión del video

Grabar los Escenarios 5 y 6 y mostrarlos a alguien que no conoce el código. Esperado: identifica cada evento ocurrido y el estado final sin explicación adicional (SC-001).
