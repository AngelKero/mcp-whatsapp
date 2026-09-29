# Spec Delta

## Purpose

How audio, image, video, document, and sticker bytes flow between WhatsApp, the transcoder, and the media root, so clients and contributors know what formats are accepted and where files may live.

## ADDED Requirements

### Requirement: Voice-note transcoding scope

`send_audio_message` SHALL deliver audio as a WhatsApp voice note, transcoding inputs to ogg/opus via ffmpeg ONLY when the input is not already ogg; ogg inputs upload without shell-out. Prerequisite ffmpeg MUST be on PATH for non-ogg inputs.

#### Scenario: Ogg input skips ffmpeg

- **WHEN** `media_path` points to an ogg/opus file
- **THEN** the file uploads as a voice note without invoking ffmpeg.

#### Scenario: Non-ogg input requires ffmpeg

- **WHEN** `media_path` points to mp3/m4a/wav and ffmpeg is missing from PATH
- **THEN** the call fails with an error naming ffmpeg as the missing prerequisite.

### Requirement: Media root allowlist

`media_path` (send paths) and `output_path` (download path) SHALL resolve symlinks and stay under `WHATSAPP_MCP_MEDIA_ROOT` (default `./store/uploads/`); paths escaping the root SHALL be rejected with an error naming the allowed root.

#### Scenario: Absolute escape rejected

- **WHEN** `send_file` is called with `media_path` `/etc/passwd`
- **THEN** the result is an error mentioning the allowed root.

#### Scenario: Symlink escape rejected

- **WHEN** `media_path` is a symlink inside the root pointing outside it
- **THEN** the call is rejected after symlink resolution, not by string prefix alone.

### Requirement: View-once and sticker constraints

`view_once` SHALL apply to image/video/audio submessages and be silently ignored for documents; `send_sticker` SHALL accept only `.webp` files under the media root.

#### Scenario: Document ignores view-once

- **WHEN** a document is sent with `view_once` true
- **THEN** delivery succeeds as a normal document without view-once semantics.

### Requirement: Renderable download embedding

`download_media` SHALL persist decrypted bytes under the daemon cache and, for image/audio payloads up to 5 MiB, ALSO embed the bytes in the tool result; video/document payloads SHALL NOT be embedded. An optional `output_path` copy SHALL obey the media-root allowlist.

#### Scenario: Sandboxed client copy

- **WHEN** a sandboxed client needs the file on its own filesystem
- **THEN** it passes `output_path` under the shared media root and receives the absolute path in the result payload.
