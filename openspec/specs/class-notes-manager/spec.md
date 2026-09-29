# class-notes-manager Specification

## Purpose
Automates live audio recording of university lectures, Whisper speech-to-text transcription, pedagogical synthesis, and structured Notion note creation.

## Requirements

### Requirement: Academic timetable resolution

The system SHALL resolve the subject of a lecture by consulting the official weekly CUCEA schedule (covering Monday through Friday blocks, classrooms, and professors) or matching explicit subject aliases provided by the user.

#### Scenario: Implicit subject resolution during class hours
- **WHEN** the user requests `empieza a grabar clase` on Tuesday at 09:15 AM
- **THEN** the system resolves the current active slot to `Programación Web` (Aula I204, Prof. Raúl Fregoso).

#### Scenario: Explicit subject alias override
- **WHEN** the user requests `inicia clase de redes` outside normal timetable hours
- **THEN** the system resolves the request to `Fundamentos de Redes`.

### Requirement: Microphone recording lifecycle management

The system SHALL manage the local audio recording process (via Whisper Small MLX Python daemon) supporting `start`, `status`, and `stop` actions; the `status` command SHALL report elapsed minutes, processed audio chunks, and the latest transcribed snippet.

#### Scenario: Lecture recording status checked
- **WHEN** an active recording is in progress and the user asks `cómo va la clase`
- **THEN** the system reports the elapsed duration, number of audio chunks processed, and recent transcript text.

### Requirement: Pedagogical note synthesis

Upon terminating a recording session, the system SHALL synthesize the full transcript into a structured pedagogical schema containing an Executive Summary, Key Topics, Core Concepts/Definitions, Assigned Homework/Tasks, and Exam Key Points.

#### Scenario: Complete lecture synthesis generated
- **WHEN** the user requests `termina la clase`
- **THEN** the unified transcript is processed by the language model and formatted into the standardized five-section academic note.

### Requirement: Dual Notion insertion and high-priority task generation

The system SHALL insert the generated academic note into the Notion Notes database linked to the University pillar and course page, append a quick-access link inside the course page body, and automatically extract any detected homework assignments as high-priority tasks in the Notion Tasks database.

#### Scenario: Homework detected in lecture
- **WHEN** a lecture transcript mentions `entregar el diagrama de red el próximo martes`
- **THEN** the synthesized note is saved in Notion and a new task `Práctica/Tarea: entregar el diagrama de red` is created in Tasks with High priority.
