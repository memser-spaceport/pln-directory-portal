## ADDED Requirements

### Requirement: AI App events reach PostHog with any analytics provider

The system SHALL send each `ai_app_*` event from `POST /v1/ai-apps/track` to PostHog when `ANALYTICS_PROVIDER` is not `posthog` and `POSTHOG_API_KEY` and `POSTHOG_HOST` are set. The system SHALL also send the event to the selected provider. Server events named `ai_apps_*` SHALL stay on the selected provider only.

#### Scenario: Database provider still reaches PostHog

- **GIVEN** `ANALYTICS_PROVIDER` is `db` and PostHog is configured
- **WHEN** an AI app sends `ai_app_opened` to `POST /v1/ai-apps/track`
- **THEN** PostHog gets `ai_app_opened`
- **AND** the database provider also gets `ai_app_opened`

#### Scenario: A server AI Apps event stays on the selected provider

- **GIVEN** `ANALYTICS_PROVIDER` is `db` and PostHog is configured
- **WHEN** the server sends `ai_apps_agent_feedback_submitted`
- **THEN** only the database provider gets the event
