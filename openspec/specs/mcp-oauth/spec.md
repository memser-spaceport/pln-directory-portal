# mcp-oauth Specification

## Purpose

MCP OAuth refresh grants expire by age and by idle time. A refresh past either limit revokes the grant. The member must consent again.

## Requirements

### Requirement: Refresh grants expire

The system SHALL reject a refresh token when the grant's consent is 30 days old or older. The system SHALL reject a refresh token when the grant's last use is 7 days old or older. When the grant has no last use, the idle age SHALL be measured from consent. The response SHALL be HTTP 401 with the message `Invalid refresh_token`. The system SHALL issue no new tokens.

#### Scenario: A grant inside both limits

- **GIVEN** a grant whose consent is under 30 days old and whose last use is under 7 days old
- **WHEN** the client refreshes
- **THEN** the system returns a new access token and a new refresh token
- **AND** the access token lifetime is 1 hour

#### Scenario: A grant older than 30 days

- **GIVEN** a grant whose consent is 30 days old or older
- **WHEN** the client refreshes
- **THEN** the response is HTTP 401 `Invalid refresh_token`
- **AND** the system issues no new tokens

#### Scenario: A grant idle for 7 days

- **GIVEN** a grant whose last use is 7 days old or older, and whose consent is under 30 days old
- **WHEN** the client refreshes
- **THEN** the response is HTTP 401 `Invalid refresh_token`
- **AND** the system issues no new tokens

### Requirement: An expired refresh revokes the grant

After a rejection for age or idle time, the system SHALL revoke the grant the same way as a manual disconnect. The grant SHALL be marked revoked, its tokens SHALL be cleared, and its agent sessions SHALL end. The member SHALL no longer see the grant as connected. A later refresh with the same token SHALL stay rejected.

#### Scenario: The member must consent again

- **GIVEN** a refresh was rejected for age or idle time
- **WHEN** the member consents again for that client
- **THEN** the new grant can refresh
- **AND** the rejected refresh token still fails
- **AND** the new grant stays connected
