# Tasks

## 1. Pipeline and SysAdmin Verification

- [x] 1.1 Verify `mac-control` behavior contract against `pipeline/middlewares/mac-control.middleware.js` (pmset battery parse, Ping.aiff, lock, and owner auth guard)
- [x] 1.2 Verify `chat-search` FTS5 schema and BM25 snippet logic against `modules/search/chat-history-search.js` and `pipeline/middlewares/chat-search.middleware.js`
- [x] 1.3 Verify `ai-turn-taking` three-state machine transitions (`IDLE`, `ACTIVE`, `LURK_MODE`) and Laya-MLX fast-path gatekeeper in `session-manager.js` and `pipeline/middlewares/gatekeeper.middleware.js`

## 2. Notion Second Brain Integration Verification

- [x] 2.1 Verify `passive-extractor` Mexican colloquial regexes, Actionability Gate, and Notion hierarchy mapping in `passive-extractor.js`
- [x] 2.2 Verify task rollback and cancellation handler (`eso no es una tarea`) archiving recent Notion tasks in `passive-extractor.js`
- [x] 2.3 Verify `school-notices` official CUCEA group whitelist and Laya-MLX classification schema in `pipeline/middlewares/school-notice.middleware.js`

## 3. Academic and Proactive Heartbeat Verification

- [x] 3.1 Verify `class-notes-manager` CUCEA 2026B timetable resolver and pedagogical note builder in `class-notes-manager.js` and `modules/academic/`
- [x] 3.2 Verify `proactive-pulse` 5h/2h deadline windows, class departure warnings, and battery health alerts in `modules/proactive/proactive-pulse.js`
- [x] 3.3 Verify SQLite idempotency table (`dispatched_pulses`) preventing duplicate alerts in `store/reminders.db`

## 4. Multimodal Systems Verification

- [x] 4.1 Verify `sticker-system` FTS5 vault schema, live auto-learning via Vision OCR + VLM, and cooldown logic in `modules/stickers/`
- [x] 4.2 Verify `voice-synthesizer` phonetic humanization, macOS Paulina `say` pipeline, and ffmpeg Opus PTT transcoding in `modules/communications/voice-synthesizer.js`

## 5. Specification Validation and Documentation

- [x] 5.1 Run `openspec validate add-assistant-ecosystem-specs --strict` and verify zero errors across all 9 new capability specs
- [x] 5.2 Archive change proposal using `openspec archive add-assistant-ecosystem-specs` to merge specs into `openspec/specs/`
