# ai-apps Specification

## ADDED Requirements

### Requirement: App session tokens stay on the app-facing routes

The system SHALL accept an app session token on `GET /v1/ai-apps/me`, `POST /v1/ai-apps/track` and `GET /v1/ai-apps/access-check`. The system SHALL answer 401 when an app session token is sent to any other route, before a guard or an auth-service call. The system SHALL log `ai_app_session_disallowed_route` with the app id and the route.

#### Scenario: An app session token reaches the member routes

- **WHEN** a request carries an app session token to `GET /v1/ai-apps/me`, `POST /v1/ai-apps/track` or `GET /v1/ai-apps/access-check`
- **THEN** `AiAppSessionScopeMiddleware` does not answer 401

#### Scenario: An app session token on another route is refused

- **WHEN** a request carries an app session token to any other route
- **THEN** the response status is 401
- **AND** the log event is `ai_app_session_disallowed_route`

### Requirement: A LabOS token from an AI app origin is refused

The system SHALL answer 401 when a request `Origin` is a deployed AI app and the request carries a LabOS member token. The token MAY be an `Authorization: Bearer` value or an `authToken` cookie. The system SHALL log `ai_app_origin_labos_token` with the app id and the route. The system SHALL apply this only on routes that `AiAppSessionScopeMiddleware` covers. `GET /v1/ai-apps/me`, `POST /v1/ai-apps/track` and `GET /v1/ai-apps/access-check` stay out of that middleware.

#### Scenario: A LabOS bearer from an app origin is refused

- **WHEN** a request from `https://<appId>.<AI_APPS_APP_DOMAIN>` carries a LabOS member token as `Authorization: Bearer` to a route other than `/v1/ai-apps/me`, `/v1/ai-apps/track` and `/v1/ai-apps/access-check`
- **THEN** the response status is 401
- **AND** the body message is `LabOS member tokens are not accepted from an AI app origin`
- **AND** the log event is `ai_app_origin_labos_token`

#### Scenario: A LabOS cookie from an app origin is refused

- **WHEN** the same request carries the LabOS member token only as an `authToken` cookie
- **THEN** the response status is 401
- **AND** the log event is `ai_app_origin_labos_token`

#### Scenario: An app origin with no token is not refused here

- **WHEN** a request from an AI app origin carries no token
- **THEN** `AiAppSessionScopeMiddleware` calls the next handler

### Requirement: A LabOS-origin request is unchanged

The system SHALL NOT refuse a LabOS member token when the request `Origin` is the LabOS portal or another reserved platform host. The system SHALL NOT refuse a LabOS member token when the request has no `Origin` header.

#### Scenario: The LabOS portal sends its own token

- **WHEN** a request from the LabOS origin carries a LabOS member token as Bearer or as an `authToken` cookie
- **THEN** `AiAppSessionScopeMiddleware` calls the next handler
- **AND** it does not log `ai_app_origin_labos_token`
