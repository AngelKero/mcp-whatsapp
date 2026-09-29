# school-notices Specification

## Purpose
Monitors official university course WhatsApp groups to detect, classify, and log cancellation, virtual session, and classroom change notices in Notion.

## Requirements

### Requirement: Monitored course groups whitelist

The system SHALL restrict school notice evaluation to an explicit whitelist of official WhatsApp group JIDs corresponding to enrolled semester courses (Web Programming, Database Systems II, Networks, Business Intelligence, Software Engineering).

#### Scenario: Message in unmonitored group
- **WHEN** a message arrives in a social or non-academic group
- **THEN** school notice middleware ignores the message and passes it to subsequent pipeline stages.

### Requirement: Local semantic notice classification

The system SHALL classify incoming group messages using the local Laya-MLX model into one of three critical notice categories: `🚨 No hay clase` (class cancelled/teacher absent), `💻 Clase virtual / Asíncrona` (online meeting/remote work), or `⚠️ Cambio de aula / horario` (room/time reassignment).

#### Scenario: Teacher cancellation notice detected
- **WHEN** a classmate posts `el profesor de redes avisó que hoy no habrá clase por junta de academia`
- **THEN** Laya-MLX classifies the message as `🚨 No hay clase` with high confidence.

#### Scenario: Casual conversation in course group
- **WHEN** a classmate asks `alguien tiene el link de la tarea 2?`
- **THEN** Laya-MLX classifies the message as `otro` and no school notice is registered.

### Requirement: Notion notice registration

Upon detecting a valid academic notice, the system SHALL record an entry in the Notion Notice repository populated with the course name, linked subject ID, sender display name, raw message text, notice type, and origin timestamp.

#### Scenario: Notice published to Notion
- **WHEN** a classroom change notice is verified
- **THEN** a new notice record is created in Notion linking the course and classroom details without sending invasive spam back to the group.
