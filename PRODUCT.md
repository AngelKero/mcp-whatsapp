# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Ángel, owner-operador único, gestiona su bot personal de WhatsApp desde el celular (abre el panel desde el link que le manda el bot por WhatsApp, mismo Wi-Fi) o desde su Mac. Job: prender, apagar o silenciar chats y grupos en segundos, y matar o reactivar el bot global cuando hace falta.

## Product Purpose

Exponer una cuenta personal de WhatsApp a agentes LLM mediante un daemon MCP local (Go), con una capa Node de automatizaciones (pipeline, watcher, panel de control) que decide cuándo el bot escucha, responde o calla en cada chat. Éxito = gestionar cualquier chat desde el celular sin fricción, con jerarquía y craft visiblemente superiores, y calidad medible (detector en cero P0, todo operable).

## Positioning

Un operador, una cuenta, control total por chat: killswitch global + tres modos de autonomía por chat (SILENT / MENTIONS_ONLY / AUTONOMOUS) con defaults inteligentes, gobernados desde un panel local sin cuentas, sin nube y sin build step.

## Operating Context

Daemon Go en `127.0.0.1:8765` (`/mcp`, `/pair`); watcher Node con pipeline de middlewares; panel web en `:8767` alcanzable por LAN; SQLite (`messages.db`, `chat-permissions.db`, `sessions.db`); clasificador local Laya-MLX en `:8766`. Ritual: `!panel` en cualquier chat devuelve el link del panel.

## Capabilities and Constraints

41+ herramientas MCP (lectura, envío, polls, grupos, blocklist, privacidad); backfill de historia con anchors y retención de WhatsApp; superficie diferida prohibida sin propuesta (`subscribe_presence`, fotos de perfil, comunidades). Constraints: single-file SPA inline sin dependencias ni build step; copy en español; mobile-first 360px; API del panel congelada; `store/*.db` y secretos nunca se commitean.

## Brand Commitments

Nombre "Panel de Control Antigravity"; tono coloquial con `:3`; dirección visual elegida por el owner: Vibrante lúdico (color atrevido, micro-detalles alegres). Sin esquema oscuro obligatorio.

## Evidence on Hand

Panel vivo con ~1500 chats y sesiones activas; `modules/dashboard/server.js` (SPA actual); `modules/permissions/chat-permissions.js`; `pipeline/middlewares/chat-permissions.middleware.js`; `test/unit/chat-permissions.test.js` (20 tests). Sincreenshots base aún — se capturan en el apply como evidencia before/after.

## Product Principles

1. Un operador decide todo; el sistema nunca habla por él en un chat silenciado.
2. Cero fricción móvil: lo que no se opera con el pulgar a 360px no existe.
3. Fail-open con rastro: ante duda técnica, el bot sigue activo y lo visible lo explica.
4. Español siempre, tono propio siempre; nada de copy genérico en inglés.
5. Sin nube ni cuentas: todo corre en localhost y LAN.

## Accessibility & Inclusion

Piso spec: controles con etiqueta visible, contraste 4.5:1 en body, foco visible con teclado, targets táctiles de 44px.
