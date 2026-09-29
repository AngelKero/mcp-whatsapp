# Roadmap de Integraciones y Capacidades para el Asistente Personal (WhatsApp & macOS)

Este documento contiene el plan maestro y la especificación técnica de las **6 grandes verticales de expansión** para el ecosistema de automatizaciones de Ángel en macOS M1 y WhatsApp (`mcp-whatsapp`).
Está diseñado para ser consultado e implementado **módulo por módulo** de manera incremental, aprovechando la arquitectura de **Middlewares y Repositorios** recién establecida.

---

## Estado Actual de la Suite (Baseline)
- **Infraestructura:** Node.js 24 + SQLite (`node:sqlite`) con Token Bucket Queue (`notion-queue.js` a ~2.85 req/s).
- **Sistema 1 Local:** Laya-MLX (322M) corriendo en GPU Metal (`localhost:8766`) con latencias de 28-35 ms y costo \$0.
- **Pipeline:** Middlewares componibles (`anti-echo`, `media-extractor`, `gatekeeper`, `passive-extractor`, `school-notice`).
- **Daemons Activos:** `com.angelzaragoza.system-one`, `com.angelzaragoza.whatsapp-watcher`, `com.angelzaragoza.cucea-sync`.

---

## 📌 Lista Maestra de Integraciones Pendientes

```
[x] Módulo 1: SysAdmin Móvil & Control Remoto de macOS (!mac) [Completado 28-09-2026]
[x] Módulo 2: Alertas Predictivas de Tareas Próximas a Vencer (Classroom & Notion) [Completado 28-09-2026]
[x] Módulo 3: Respuestas con Notas de Voz Reales (Text-to-Speech con voz Paulina + Humanizer) [Completado 28-09-2026]
[x] Módulo 4: Búsqueda Semántica en Historial de Chats (SQLite FTS5 / RAG Local) [Completado 28-09-2026]
[ ] Módulo 5: Lector Inteligente y Resumen de URLs en Chat (!resumen)
[ ] Módulo 6: DevOps Personal & CLI de Notificaciones (notify-wa en zsh)
[x] Módulo 7: Comprensión Multimodal & Auto-Aprendizaje de Stickers WhatsApp [Completado 28-09-2026]
```

---

## 🛠️ Especificación Técnica por Módulo

### 1. Módulo: SysAdmin Móvil & Control Remoto de macOS (`!mac`)
* **Objetivo:** Consultar el estado de la Mac y ejecutar acciones remotas seguras mediante mensajes de WhatsApp.
* **Archivos a crear/tocar:**
  - `pipeline/middlewares/mac-control.middleware.js` (Nuevo middleware en el pipeline).
* **Comandos a soportar:**
  - `!mac status` $\to$ Nivel de batería (`pmset -g batt`), estado de corriente, RAM libre, temperatura térmica del M1 y uptime.
  - `!mac ping` $\to$ Alerta acústica forzada con `afplay /System/Library/Sounds/Ping.aiff` a máximo volumen por si la Mac está traspapelada.
  - `!mac lock` $\to$ Bloqueo inmediato de sesión mediante `osascript -e 'tell application "System Events" to sleep'` o `pmset displaysleepnow`.
  - `!mac screen` $\to$ Captura de pantalla silenciosa enviada como foto por WhatsApp para monitorear renders o procesos largos.
  - **Alerta Proactiva de Batería Crítica:** Si la Mac queda desconectada en casa y la batería baja al 20%, el watcher envía un ping automático a tu WhatsApp.
* **Costo computacional:** 0% CPU adicional, \$0.

---

### 2. Módulo: Alertas Predictivas de Tareas Próximas a Vencer
* **Objetivo:** Anticipar entregables académicos de Classroom y tareas de Notion antes de que expire el plazo.
* **Archivos a crear/tocar:**
  - `modules/academic/deadline-watcher.js` o extensión de `reminder-scheduler.js`.
* **Lógica:**
  - Cada 30 minutos revisa tareas en `TaskRepository` con fecha límite para el día de hoy.
  - Si faltan **5 horas** o **2 horas** para las 23:59 (hora usual de entrega en Classroom) y la tarea sigue en estado `No iniciado` o `En progreso`:
    - Dispara una alerta amistosa: *"Ojo Ángel: Quedan 4 horas para entregar 'Práctica 3 de Redes'. Aún no está marcada como lista 🔥"*.
  - Evita saturar con un flag en SQLite `dispatched_deadlines`.

---

### 3. Módulo: Respuestas con Notas de Voz Reales (TTS Local)
* **Objetivo:** Permitir que el bot responda con audios de WhatsApp cuando tú le mandes una nota de voz.
* **Archivos a crear/tocar:**
  - `modules/communications/voice-synthesizer.js`.
* **Herramientas nativas de macOS:**
  - Sintetizador nativo: `say -v Paulina "mensaje" -o /tmp/reply.aiff`.
  - Conversión a Opus para WhatsApp: `ffmpeg -y -i /tmp/reply.aiff -c:a libopus -b:a 32k /tmp/reply.ogg`.
  - Envío como PTT: `send_audio_message` con bandera `ptt: true` vía whatsmeow.
* **Activación:** Si el mensaje entrante fue `isAudio: true`, el bot responde automáticamente en formato de nota de voz con tono natural mexicano.

---

### 4. Módulo: Búsqueda Semántica en Historial de Chats (RAG Local)
* **Objetivo:** Convertir los 32,800+ mensajes guardados en `messages.db` en una base de conocimiento consultable al instante.
* **Archivos a crear/tocar:**
  - `modules/search/chat-history-search.js`.
* **Implementación:**
  - Configurar tabla virtual SQLite FTS5 (Full Text Search) sobre `messages(content)`.
  - Comando por chat: `!buscar [término]` o preguntas en lenguaje natural al bot: *"¿Cuándo dijo el profe de redes que no venía?"*.
  - Devuelve fragmento exacto, fecha, hora y remitente.

---

### 5. Módulo: Lector Inteligente y Resumen de URLs en Chat (`!resumen`)
* **Objetivo:** Procesar enlaces web de artículos, documentación o repositorios compartidos en WhatsApp.
* **Archivos a crear/tocar:**
  - `pipeline/middlewares/url-summarizer.middleware.js`.
* **Flujo:**
  - Detección de URLs con regex `https?://[^\s]+`.
  - Fetch de contenido en texto plano mediante `read_url_content`.
  - Resumen ejecutivo de 3 bullets mediante Laya-MLX o `agy`.
  - Pregunta con botón de acción: *"¿Guardar en Notion en Notas / Recursos?"*.

---

### 6. Módulo: DevOps Personal & CLI de Notificaciones (`notify-wa`)
* **Objetivo:** Enviar pings a tu WhatsApp personal desde cualquier comando largo de terminal en tu Mac.
* **Archivos a crear/tocar:**
  - `/usr/local/bin/notify-wa` (ejecutable zsh/Node.js).
* **Uso:**
  ```bash
  npm run build && notify-wa "Build de producción listo"
  shopify theme push && notify-wa "Tema de Shopify desplegado"
  ```
  - Llama a `mcp-client.js` para enviar el mensaje directamente a `MY_PHONE_JID`.

---

### 7. Módulo: Comprensión Multimodal & Auto-Aprendizaje de Stickers WhatsApp
* **Objetivo:** Comprender stickers e imágenes en contexto conversacional, recolectar y auto-indexar stickers recibidos durante sesiones activas, y responder autónomamente con stickers usando WhatsApp Stickers nativos.
* **Archivos implementados:**
  - `internal/client/events.go`, `internal/client/download.go`, `internal/client/send.go`, `internal/mcp/tools_send.go` (whatsmeow `waProto.StickerMessage` & tool `send_sticker`).
  - `modules/stickers/sticker-vault.js` (SQLite WAL + virtual table FTS5 con BM25 ranking).
  - `modules/stickers/sticker-vision.js` (Motor dual Apple Vision OCR + VLM low-effort con sanitización anti-prompt injection).
  - `modules/stickers/sticker-responder.js` (Despachador autónomo con cooldown de >= 4 turnos / 60s, bypass explícito y matching estocástico).
  - `scripts/harvest-mac-stickers.js` (Extractor de stickers desde WhatsApp Desktop macOS).
  - `pipeline/middlewares/media-extractor.middleware.js` (Detección de stickers, gating anti-saturación de auto-aprendizaje, fusión contextual no destructiva).
  - `whatsapp-watcher.js` (Integración en bucle de IA).

---

## 📌 Guía de Consulta para el Asistente Antigravity
Cuando el usuario diga:
- *"Vamos haciendo el de la batería / control remoto de la Mac"* $\to$ Consultar y aplicar **Módulo 1**.
- *"Vamos haciendo las alertas de entregas de Classroom"* $\to$ Consultar y aplicar **Módulo 2**.
- *"Quiero que el bot me conteste con audios"* $\to$ Consultar y aplicar **Módulo 3**.
- *"Quiero buscar en mis mensajes viejos de WhatsApp"* $\to$ Consultar y aplicar **Módulo 4**.
- *"Quiero que resuma links que le mande"* $\to$ Consultar y aplicar **Módulo 5**.
- *"Quiero un comando en mi terminal para avisarme a WhatsApp"* $\to$ Consultar y aplicar **Módulo 6**.
- *"Cómo funciona el sistema de stickers o cómo agregar más"* $\to$ Consultar y aplicar **Módulo 7**.

