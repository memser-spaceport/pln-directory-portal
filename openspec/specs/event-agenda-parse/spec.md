# event-agenda-parse Specification

## Purpose

How `POST /v1/irl/events/agenda/parse` turns pasted agenda text into sessions for the event submit form, and what the API logs when the AI provider fails.

## Requirements

### Requirement: A failed model call answers 503 and logs safe provider facts

The system SHALL answer 503 with the text "The agenda could not be read right now. Please try again." when the model call fails. The provider comes from `EVENT_AGENDA_PARSE_AI_PROVIDER`, else `AI_PROVIDER`, through the shared `AiProviderService`. The system SHALL log one error line with the model name, the error class, the HTTP status, the provider's error `type`, `code` and `param`, and whether the call can be retried (LAB-3443). The log line SHALL NOT hold the agenda text, the model output, the request body, the provider's error message or a stack trace.

#### Scenario: The provider refuses the request

- **GIVEN** the provider answers 400 with `type` `invalid_request_error` and `code` `invalid_json_schema`
- **WHEN** a member posts agenda text
- **THEN** the API answers 503
- **AND** the log line has `"status":400`, the type, the code and the model name
- **AND** the log line does not contain the agenda text

#### Scenario: The model cannot be reached

- **GIVEN** the model call fails with no HTTP status (for example a missing API key)
- **WHEN** a member posts agenda text
- **THEN** the API answers 503 and the log line names the error class
