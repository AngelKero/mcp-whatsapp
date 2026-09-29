# passive-extractor Specification

## Purpose
Extracts structured personal productivity records (tasks, expenses, reminders, date plans, notes) from natural language messages into Notion.

## Requirements

### Requirement: Natural language expense and transaction extraction

The system SHALL intercept financial statements matching Mexican colloquial phrasing (e.g., `gasté $120 en uber`, `pagué 45 de tacos`, `300 varos de cena`, `ya pagué netflix`), determine the monetary amount and merchant concept, classify the category semantically, and record the entry in the Notion Transactions database.

#### Scenario: Explicit amount recorded
- **WHEN** the owner sends `gasté $150 en tacos`
- **THEN** an expense of $150.00 MXN with concept `tacos` categorized as food is created in Notion and confirmed to the user.

#### Scenario: Non-numeric payment recorded
- **WHEN** the owner sends `ya pagué la luz`
- **THEN** an expense transaction with concept `la luz` is recorded in Notion with a non-zero/pending amount.

### Requirement: Actionable task extraction with semantic gating

The system SHALL extract actionable personal and academic tasks (e.g., `tengo que subir la práctica 4`, `tarea: estudiar para examen`, `yo me encargo del reporte`), resolve the associated Life Pillar and academic course, and insert the task into Notion; the system MUST filter out conversational banter, presence statements, and sleep/rest intent using the local actionability classifier.

#### Scenario: Genuine obligation extracted
- **WHEN** the owner sends `tengo que entregar la práctica 3 de redes mañana`
- **THEN** a task is created under the University pillar and Networks course in Notion.

#### Scenario: Routine or rest statement rejected
- **WHEN** the owner sends `ya me voy a dormir` or `aquí ando en el centro`
- **THEN** the message is discarded by the actionability gate and no task is created.

### Requirement: Natural language datetime reminders

The system SHALL parse date and time expressions (e.g., `10:30 pm`, `a las 11am`, `mañana`), calculate the target ISO timestamp with Mexico City timezone offset (`-06:00`), and schedule a dated reminder task in Notion.

#### Scenario: Reminder with explicit hour
- **WHEN** the owner sends `recuérdame pagar el agua mañana a las 11am`
- **THEN** a reminder task is created in Notion with the calculated due date set to tomorrow at 11:00 AM CDMX.

### Requirement: Couple date planning extraction

The system SHALL detect shared couple date plans (e.g., `vamos a cenar alitas el sábado`, `compro los boletos para la cineteca`) in couple conversations; when sent by the owner's partner, the system SHALL send an interactive confirmation proposal to the owner rather than cluttering Notion directly.

#### Scenario: Partner plan proposal
- **WHEN** the partner sends `vamos al cine el viernes` in a direct chat
- **THEN** the system forwards a date proposal notification to the owner's phone without auto-creating an active task.

### Requirement: Rapid note and project creation

The system SHALL support explicit creation prefixes `nota: <texto>`, `idea: <texto>`, and `nuevo proyecto: <nombre>` to directly create records in the Notes and Projects databases in Notion with mapped life pillars.

#### Scenario: Quick note created
- **WHEN** the owner sends `nota: La IP del servidor es 192.168.1.50`
- **THEN** a new note page is created in Notion under the Professional pillar.

### Requirement: Immediate task rollback and cancellation

The system SHALL support task cancellation phrases (e.g., `eso no es una tarea`, `borra esa tarea`, `cancela esa tarea`) to immediately archive and delete from Notion the most recent task created within the last 30 minutes.

#### Scenario: Erroneous task deleted
- **WHEN** a task was erroneously created and the owner sends `eso no es una tarea`
- **THEN** the system archives the recent task in Notion and confirms its removal.

### Requirement: On-demand reports dispatching

The system SHALL recognize requests for financial summaries (`corte de gastos`, `cómo van mis finanzas`), morning briefings (`dame mi agenda de hoy`, `briefing`), and database health audits (`auditoría Notion`) ONLY in the owner's own chat, generating and returning the respective structured reports there. The same request from any other chat SHALL NOT trigger these actions and SHALL flow to normal conversational handling instead. Casual greetings (`buenos días` without an explicit agenda/briefing ask) SHALL NOT trigger the briefing path.

#### Scenario: Expense report requested

- **WHEN** the owner sends `corte de gastos`
- **THEN** the system calculates the weekly expense balance and delivers the itemized financial report.

#### Scenario: Third party request ignored

- **WHEN** anyone other than the owner sends `corte de gastos` in any non-owner chat
- **THEN** no financial report is generated or delivered there.

#### Scenario: Greeting is not a briefing

- **WHEN** anyone other than the owner sends a greeting like `buenos días` without an explicit agenda ask
- **THEN** no briefing is generated; the turn continues conversationally.
