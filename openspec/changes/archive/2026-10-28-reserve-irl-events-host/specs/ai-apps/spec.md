## MODIFIED Requirements

### Requirement: A LabOS-origin request is unchanged

The system SHALL NOT refuse a LabOS member token when the request `Origin` is the LabOS portal or another reserved platform host. The events submission host `irl` (`https://irl.os.pl.xyz`) is a reserved platform host. The system SHALL NOT refuse a LabOS member token when the request has no `Origin` header.

#### Scenario: The LabOS portal sends its own token

- **WHEN** a request from the LabOS origin carries a LabOS member token as Bearer or as an `authToken` cookie
- **THEN** `AiAppSessionScopeMiddleware` calls the next handler
- **AND** it does not log `ai_app_origin_labos_token`

#### Scenario: The events site sends a member token

- **WHEN** a request from `https://irl.os.pl.xyz` carries a LabOS member token as Bearer or as an `authToken` cookie
- **THEN** `AiAppSessionScopeMiddleware` calls the next handler
- **AND** it does not log `ai_app_origin_labos_token`
