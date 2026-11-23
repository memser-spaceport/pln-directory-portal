# intro-requests Specification

## Purpose

The intro-requests module accepts an intro request from a signed-in member, stores it, and posts one message to the LabOS asks Telegram group.

## Requirements

### Requirement: Accept an intro request

The system SHALL accept `POST /v1/intro-requests` from a signed-in member. The body has `type` (`MEMBER` or `TEAM`), `targetId`, and `text`. `text` is required, trimmed, and at most 4000 characters. The response is `{ uid }`.

#### Scenario: A portfolio member requests an intro to a member

- **GIVEN** a signed-in member of a team with the PL Portfolio affiliation
- **WHEN** the member posts type `MEMBER`, a member `targetId`, and text
- **THEN** the response is `{ uid }`

#### Scenario: A PL Infra member requests an intro to a team

- **GIVEN** a signed-in member assigned the PL Infra policy
- **WHEN** the member posts type `TEAM`, a team `targetId`, and text
- **THEN** the response is `{ uid }`

### Requirement: Only portfolio teams and PL Infra can send

A member who is not a current member of a portfolio team and is not assigned the PL Infra policy SHALL receive HTTP 403. A current membership has no end date, or an end date that is still ahead. The system SHALL NOT store that request.

#### Scenario: Another member sends

- **GIVEN** a signed-in member with no current portfolio team and no PL Infra policy
- **WHEN** the member posts an intro request
- **THEN** the response is HTTP 403
- **AND** no request is stored

### Requirement: Refuse a deleted team target

The system SHALL answer HTTP 404 "Team not found" when the type is `TEAM` and the target team does not exist. The system SHALL apply the rule of `GET /v1/teams/:uid` (`enforceDeletedTeamHidden`, LAB-3192) to the target team. A deleted (INACTIVE) team SHALL get HTTP 404 "Team not found" for a member who is not a directory admin. A directory admin keeps the same access as on `GET /v1/teams/:uid`. The system SHALL NOT store a refused request and SHALL NOT post it to Telegram (LAB-3323).

#### Scenario: A member requests an intro to a deleted team

- **GIVEN** an eligible member who is not a directory admin
- **WHEN** the member posts type `TEAM` with the uid of an INACTIVE team
- **THEN** the response is HTTP 404 "Team not found"
- **AND** no request is stored and no Telegram message is sent

#### Scenario: A directory admin requests an intro to a deleted team

- **GIVEN** an eligible member who is a directory admin
- **WHEN** the member posts type `TEAM` with the uid of an INACTIVE team
- **THEN** the response is `{ uid }`

#### Scenario: A stored request to a team that is deleted later

- **GIVEN** a stored request to a team with no Telegram message id
- **WHEN** the team becomes INACTIVE and the retry posts the request
- **THEN** the message still shows the team name

### Requirement: Store each request

The system SHALL store the requester, the type, the target, the text, the time, and the Telegram message id after a successful post. The message id stays empty until the post succeeds.

#### Scenario: A request is stored

- **GIVEN** an eligible member and a target that exists
- **WHEN** the member sends an intro request
- **THEN** the stored row has that requester, type, target, text, and time

### Requirement: Post one message to the intake group

The system SHALL post one HTML message to the chat in `TELEGRAM_ASKS_CHAT_ID` with the bot token in `TELEGRAM_ASKS_BOT_TOKEN`. The message shows the requester name, the requester team, a profile link, the type (`intro to member` or `intro to team`), the target name with a link, and the text. The token SHALL NOT be written to the logs. A member of a portfolio team is shown with that team. A PL Infra member with no portfolio team is shown as PL Infra.

#### Scenario: The message names the requester and the target

- **GIVEN** an eligible member and a target that exists
- **WHEN** the post succeeds
- **THEN** the group receives one message with the requester, the team, the profile link, the type, the target link, and the text
- **AND** the stored row has the Telegram message id

### Requirement: A failed post is retried and is not sent twice

When the Telegram post fails, the system SHALL keep the request, return `{ uid }` to the member, and retry later. A retry SHALL post a request that has no message id. A request that already has a message id SHALL NOT be posted again. Two retries at the same time SHALL post the request once.

#### Scenario: Telegram is down

- **GIVEN** the Telegram post fails
- **WHEN** an eligible member sends an intro request
- **THEN** the response is `{ uid }`
- **AND** the request is stored with no message id

#### Scenario: A later retry posts the request once

- **GIVEN** a stored request with no message id
- **WHEN** the retry runs and the post succeeds
- **THEN** the request is posted once and the message id is stored
- **AND** a further retry does not post it again
