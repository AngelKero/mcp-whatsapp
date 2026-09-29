# Spec Delta

## Purpose

Synthesizes conversational, humanized Mexican Spanish audio voice notes for WhatsApp using local macOS speech synthesis and Opus PTT encoding.

## ADDED Requirements

### Requirement: Phonetic humanization pre-processing

The synthesizer SHALL pre-process text intended for speech by removing markdown formatting, code fences, URLs, and emoticons/emojis; it SHALL phoneticize technical and developer acronyms (e.g., API $\to$ ápi, BD $\to$ base de datos, JSON $\to$ yeison, Node.js $\to$ noud yeies, Notion $\to$ nóushon) and inject acoustic breath pauses via punctuation smoothing.

#### Scenario: Developer acronyms transformed for speech
- **WHEN** text containing `Revisa la API y la BD en Notion` is queued for synthesis
- **THEN** the text is transformed to `Revisa la ápi y la base de datos en nóushon` with natural pauses.

#### Scenario: Code and links suppressed
- **WHEN** text containing a URL and backtick code is synthesized
- **THEN** URLs and code blocks are replaced with natural verbal descriptors.

### Requirement: Native macOS speech synthesis with Mexican voice

The synthesizer SHALL invoke the macOS native speech engine (`/usr/bin/say`) configured with the Mexican Spanish voice (`Paulina`) at a conversational rate of approximately 185 words per minute, generating an intermediate uncompressed AIFF audio file.

#### Scenario: Native voice synthesis execution
- **WHEN** humanized text is provided to the synthesizer
- **THEN** `say -v Paulina -r 185` generates the intermediate audio without relying on external cloud APIs.

### Requirement: WhatsApp Push-to-Talk (PTT) Opus conversion

The synthesizer SHALL transcode the intermediate AIFF audio into an Ogg Opus stream using `ffmpeg` configured with `libopus`, 32 kbps bitrate, variable bitrate (`-vbr on`), and VoIP tuning (`-application voip`), ensuring native WhatsApp voice note player waveform rendering.

#### Scenario: Voice note delivery
- **WHEN** the Opus transcoding completes
- **THEN** the resulting audio is dispatched as a PTT voice message and temporary audio files are cleaned up.
