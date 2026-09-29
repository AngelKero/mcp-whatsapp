# Tasks

## 1. Store + módulo base

- [x] 1.1 Crear migración `memory_facts/memory_settings/memory_events` (`IF NOT EXISTS`, soft-delete, `source_msg_id` único) y verificar con `sqlite3 store/messages.db ".schema memory_facts"` en copia de test.
- [x] 1.2 Implementar `pipeline/memory-store.js` (CRUD por JID normalizado vía LID, `WHERE deleted_at IS NULL`, cola serializada de writes) y verificar con test Node que write→read→soft-delete→read-vacío pasa.
- [x] 1.3 Añadir `memory-inject` (pre-turno: perfil + top-8 facts + ventana reciente, budget) y verificar que con memoria deshabilitada no inyecta nada y el turno completa.

## 2. Extracción + comandos de chat

- [x] 2.1 Implementar `pipeline/middlewares/chat-memory.middleware.js` (gate System-One → extracción `agy`, cap 0–3 facts, bypass en `!recordar`) y verificar que `ya me voy a dormir` crea 0 facts y `soy vegetariano` crea 1.
- [x] 2.2 Implementar `!recordar/!olvidar/!memoria/!reset-memoria` con owner-gate en grupos (misma regla que `!buscar`) y verificar que un no-owner en grupo es ignorado y el owner recibe confirmación.
- [x] 2.3 Implementar confirmación de `!olvidar <texto>` (muestra match, espera `sí`) y `!olvidar todo` con doble confirmación, y verificar que sin confirmar no se borra nada.

## 3. Bootstrap offline

- [x] 3.1 Implementar `POST /api/chats/:jid/memory/bootstrap` (lee ≤50 de `messages`, extracción long-range con timestamps originales, dedupe por `source_msg_id`) y verificar que doble ejecución añade 0 duplicados.
- [x] 3.2 Registrar fila de progreso en `memory_events` (before/after) y verificar que el hot path responde durante el bootstrap sin bloqueo.

## 4. Panel (dashboard 8767)

- [x] 4.1 Añadir endpoints `GET/PUT /api/chats/:jid/memory` + `DELETE /api/chats/:jid/memory/facts` (400 en valores inválidos, fail-open) y verificar con `curl` que un PUT inválido devuelve 400 con valores válidos nombrados.
- [x] 4.2 Añadir UI en español: toggle memoria, botón `Generar contexto`, vista de facts con editar/borrar/limpiar, y verificar a 360px sin scroll horizontal con targets ≥44px.
- [x] 4.3 Verificar paridad de controles existentes (killswitch, modos, Notion/Media, reset IDLE, búsqueda, 5 tabs, 4 stats) siguen operables tras el cambio.

## 5. Verificación global

- [x] 5.1 Añadir/actualizar tests `test/unit/chat-memory.test.js` (aislamiento por JID, supervivencia de sesión, budget, LID normalizado) y verificar con `npm run test:scenarios` + `node --test test/unit/chat-memory.test.js`.
- [x] 5.2 Verificar superficie Go intacta: `make vet` limpio y `grep -r "subscribe_presence\|profile-photo\|communities" internal/mcp/` sin nuevas exposiciones (parity, 42 tools sin cambios).
- [x] 5.3 Validar OpenSpec estricto con `openspec validate per-chat-memory-context --strict` y verificar cero errores antes de archivar.
