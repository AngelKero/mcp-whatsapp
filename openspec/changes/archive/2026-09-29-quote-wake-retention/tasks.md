# Tasks

## 1. Retención caliente + fallback

- [x] 1.1 Subir `sentIdsTtlMs` de 24h a 7 días en `modules/anti-echo-tracker.js` y verificar que la purga existente usa el nuevo umbral.
- [x] 1.2 Añadir fallback en `hasSentId`: si el ID no está en caché ni en `sent_messages`, una búsqueda indexada read-only en `messages` (`WHERE id=? AND is_from_me=1`, handle perezoso reutilizable, fail-open a false) y verificar que un ID purgado pero propio devuelve true y un ID ajeno devuelve false.

## 2. Suite normativa

- [x] 2.1 Añadir tests en `test/unit/` (dedicado o extensión de `ack-reactions.test.js`): wake por ID caliente, wake por ID viejo vía fallback con `sent_messages` vacío, negativo con ID desconocido, y guard de reacción pura intacto; verificar con `node --test` el archivo.
- [x] 2.2 Correr `npm run test:scenarios` y `npm run test:unit` completos y verificar cero regresiones (los 3 fallos preexistentes de `chat-permissions.test.js` documentados aparte, no cuentan).

## 3. Validación final

- [x] 3.1 Validar con `openspec validate quote-wake-retention --strict` y verificar cero errores antes de archivar.
