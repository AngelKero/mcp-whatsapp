# ADR-004: Cola Token Bucket para Protección contra Rate-Limiting de Notion

## Estado
Aceptado

## Contexto
La API oficial de Notion impone un límite de tasa (*rate limit*) estricto de aproximadamente 3 solicitudes por segundo con rechazos HTTP 429 (`rate_limited`) si se excede. Durante ráfagas de mensajes de WhatsApp (ej. múltiples fotos de tickets con OCR, creación simultánea de tareas y notas de clase generadas en bloque), las llamadas paralelas no reguladas provocan errores 429 y pérdida silenciosa de datos.

## Decisión
Encapsular todas las llamadas a la API de Notion a través de un módulo centralizado (`notion-queue.js`) que implementa el algoritmo **Token Bucket Queue**:
- Capacidad máxima de ráfaga: 3 tokens.
- Tasa de reabastecimiento: ~2.85 tokens por segundo (un token cada 350 ms).
- Reintentos exponenciales automáticos con *jitter* ante respuestas HTTP 429 o errores de red transitorios.

## Consecuencias
- **Positivas:** Cero errores HTTP 429 en producción; absorción transparente de ráfagas multimodales; persistencia íntegra y ordenada de registros en el Second Brain.
- **Negativas:** Operaciones en lote muy grandes experimentan una latencia controlada mientras la cola despacha secuencialmente las solicitudes a 2.85 req/s.
