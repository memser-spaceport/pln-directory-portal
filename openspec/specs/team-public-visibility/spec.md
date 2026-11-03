# team-public-visibility Specification

## Purpose

Which teams a logged-out visitor can open, and the crawl index that lists exactly those teams for the frontend sitemap. A team at access level `L0` (soft-deleted, or no member has ever logged in) is hidden from logged-out visitors. A crawler must never be sent to such a team's profile.

## Requirements

### Requirement: L0 teams are hidden from logged-out visitors

The system SHALL refuse `GET /v1/teams/:uid` with 403 `"Team is inactive"` when the team's access level is `L0` and the request carries no logged-in user. A logged-in user SHALL still be checked by the existing requestor validation. A team whose access level is any other value, or null, SHALL be public.

#### Scenario: A logged-out visitor opens an L0 team

- **GIVEN** a team with access level `L0`
- **WHEN** `GET /v1/teams/<uid>` is called without a user token
- **THEN** the response is 403 with the message `Team is inactive`

#### Scenario: A team with no access level is public

- **GIVEN** a team whose access level is null
- **WHEN** `GET /v1/teams/<uid>` is called without a user token
- **THEN** the team is returned

### Requirement: Crawl index lists only publicly visible teams

The system SHALL serve `GET /v1/teams/crawl-index` without authentication and without caching. It SHALL return `{ teams: [{ uid, updatedAt }] }`, where `updatedAt` is an ISO 8601 string, ordered by `updatedAt` descending. The list SHALL contain every team whose status is not `INACTIVE` and whose access level is not `L0`, including teams whose access level is null. It SHALL NOT contain any team that a logged-out `GET /v1/teams/:uid` refuses.

#### Scenario: L0 teams are left out

- **GIVEN** an active team with access level `L0` and an active team with access level `L1`
- **WHEN** `GET /v1/teams/crawl-index` is called
- **THEN** the response lists the `L1` team
- **AND** it does not list the `L0` team

#### Scenario: Null access level is kept

- **GIVEN** an active team whose access level is null
- **WHEN** `GET /v1/teams/crawl-index` is called
- **THEN** the response lists that team

#### Scenario: Inactive teams are left out

- **GIVEN** a team with status `INACTIVE` and access level `L1`
- **WHEN** `GET /v1/teams/crawl-index` is called
- **THEN** the response does not list that team

#### Scenario: The path is not taken for a team uid

- **WHEN** `GET /v1/teams/crawl-index` is called
- **THEN** the crawl index is returned, not a team lookup for the uid `crawl-index`
