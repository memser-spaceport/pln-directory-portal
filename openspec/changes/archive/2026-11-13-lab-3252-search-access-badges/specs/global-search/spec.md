# Spec Delta

## Purpose

The header Search full-text endpoint (`GET /v1/global-search/all`) returns teams, members, projects, events and forum threads. This spec covers the admin-only access fields on team and member results.

## ADDED Requirements

### Requirement: Admin search results carry access fields

When the caller has the `directory.admin.full` permission, each team result SHALL carry `accessLevel` (`L0`, `L1` or `null`). Each member result SHALL carry `memberState` and `isJobAspirant`. A member with no approval record SHALL have `memberState` `PENDING`. The fields SHALL also apply to the `top` results.

#### Scenario: A directory admin searches

- **GIVEN** a caller with `directory.admin.full`
- **WHEN** the caller searches for a term that matches an `L0` team and a `VERIFIED` member
- **THEN** the team result has `accessLevel` `L0`
- **AND** the member result has `memberState` `VERIFIED` and `isJobAspirant` set

### Requirement: Other callers get no access fields

When the caller does not have `directory.admin.full`, the response SHALL not carry `accessLevel`, `memberState` or `isJobAspirant`. The endpoint SHALL not run the access lookups for these callers.

#### Scenario: A signed-in member or investor searches

- **GIVEN** a signed-in caller without `directory.admin.full`
- **WHEN** the caller searches
- **THEN** no result has `accessLevel`, `memberState` or `isJobAspirant`

#### Scenario: A signed-out visitor searches

- **WHEN** a signed-out visitor searches
- **THEN** no result has `accessLevel`, `memberState` or `isJobAspirant`
