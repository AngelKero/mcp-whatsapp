# Spec Delta

## MODIFIED Requirements

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
