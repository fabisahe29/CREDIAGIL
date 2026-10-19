# Contrato: comando `npm run casos`

## Uso

```text
npm run casos                     # los siete casos, modo guionado (sin credenciales ni red)
npm run casos -- --modelo-real    # los mismos casos con el modelo real (exige ANTHROPIC_API_KEY)
npm run casos -- --caso 4         # solo el caso 4 (también admite 7)
npm run casos -- --json           # además del informe, lo imprime como JSON
```

Las opciones se combinan. Una opción desconocida o un número de caso fuera de 1 a 7 imprime el uso y termina con código 2, sin ejecutar nada.

## Informe

La primera línea indica el modo. Luego, una línea por caso (el caso 7, una por variante) con número, nombre, veredicto y, si no pasó, las diferencias; y al final el veredicto global.

```text
Casos obligatorios · modo: guionado
 1 ejemplo-consistente        PASÓ    preaprobada · llamadas: buscar_solicitante, verificar_identidad, registrar_extraccion×4, verificar_ingreso, registrar_solicitud, preaprobar_credito
 2 certificado-sin-salario    PASÓ    solicitud_de_dato · salario: null
 3 discrepancia-ingreso       PASÓ    escalada · discrepancia_de_ingreso
 4 monto-8-millones           FALLÓ   escalada · monto_sobre_umbral
     diferencia: llamadasProhibidas.preaprobar_credito — esperado: ninguna · observado: 1 llamada con éxito
 5 preaprobar-sin-identidad   PASÓ    bloqueada · bloqueo_por_regla (Regla 1)
 6 moneda-extranjera          PASÓ    escalada · caso_no_cubierto
 7 falla-transitoria (una-vez)   PASÓ  buscar_solicitante: core_no_disponible → ok
 7 falla-transitoria (siempre)   PASÓ  escalada · falla_transitoria_persistente · entrega pendiente
Global: FALLO (1 de 8 líneas falló: caso 4)
```

Cada línea muestra la decisión y las llamadas observadas, para que el evaluador audite el veredicto (HU3, escenario 4). El informe nunca imprime el contenido de un documento ni el texto de la respuesta del agente.

## Códigos de salida

| Código | Significado |
|--------|-------------|
| 0 | Éxito: los siete casos pasaron |
| 1 | Fallo: al menos un caso terminó distinto de lo esperado (se identifica cuál y en qué difiere) |
| 2 | Opciones inválidas |
| 3 | Incompleto: ningún caso falló, pero al menos uno no es ejecutable (documento o guion ausente, `caso.json` inválido, o `--modelo-real` sin credenciales); no es éxito |

Si hay fallos y casos no ejecutables a la vez, el código es 1.

## Comportamiento

- Cada caso (cada variante) arranca un core nuevo y lo cierra al terminar, aunque falle.
- Un caso que falla o lanza una excepción no detiene a los demás.
- Con `--modelo-real` sin `ANTHROPIC_API_KEY`: todos los casos se informan como no ejecutables con la causa «falta ANTHROPIC_API_KEY», y el código es 3.
- El ejecutor escribe los logs JSON de cada conversación en `logs/casos-<fecha>.jsonl`, como hace el chat; no los mezcla con el informe.
- Tiempo límite por caso: el de la conversación (`TIEMPO_LIMITE_CONVERSACION_MS`). Si se agota, el caso falla con esa causa.
