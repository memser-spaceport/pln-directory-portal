# warm-intros-v2 Specification

## Purpose

Warm Intros v2 stores connection edges and warm paths. A scheduled job refreshes profiles and paths. The directory API serves the live inputs for that job and records each run.

## Requirements

### Requirement: Service exports for the refresh job

The system SHALL return the same JSON the local export CLIs write, from these service routes:

- `GET /v1/service/warm-intros-v2/exports/portfolio-overlaps`
- `GET /v1/service/warm-intros-v2/exports/affinity-founders`
- `GET /v1/service/warm-intros-v2/exports/directory-linkedin`

Each route SHALL require the internal service secret. The founder export SHALL include Affinity lists 155463 and 281646.

#### Scenario: A service caller reads portfolio overlaps

- **WHEN** a caller with the service secret requests the portfolio-overlaps export
- **THEN** the response lists investors that have at least one portfolio overlap

### Requirement: One refresh run at a time

`POST /v1/service/warm-intros-v2/runs` SHALL claim a run. When a RUNNING row has a lock that is still in the future, the response SHALL be `{ action: "skipped" }` and SHALL NOT start another run. A RUNNING row whose lock is in the past MAY be taken over. `POST /v1/service/warm-intros-v2/runs/:uid/finish` SHALL set the row to COMPLETED or FAILED, clear the lock, and set `finishedAt`.

#### Scenario: A second start finds a live run

- **GIVEN** a RUNNING run whose lock is still in the future
- **WHEN** another start claims a run
- **THEN** the response action is `skipped`

### Requirement: Latest run is readable

`GET /v1/warm-intros-v2/runs/latest` SHALL require Investor DB view permission. The response SHALL be the newest run that is not SKIPPED, with `uid`, `status`, `startedAt`, `finishedAt`, and `error`. When no run exists, `run` SHALL be null.

#### Scenario: The team reads the last run

- **GIVEN** a completed weekly run
- **WHEN** a viewer requests the latest run
- **THEN** the response status is COMPLETED and `finishedAt` is set

### Requirement: Regenerate one investor

`POST /v1/warm-intros-v2/investors/:investorProfileUid/regenerate` SHALL require Investor DB edit permission. An unknown profile SHALL return 404 and SHALL NOT start a run. A profile with no Affinity person id SHALL return 400 and SHALL NOT start a run. An active run for that investor SHALL return 200 `{ status: "already_running" }`. Otherwise the system SHALL return 202 `{ status: "started", uid }` and SHALL ask data-enrichment to refresh that investor only.

`GET /v1/warm-intros-v2/investors/:investorProfileUid/regenerate` SHALL require Investor DB view permission and SHALL return that investor's newest run.

A weekly run SHALL NOT be blocked by an investor run, and an investor run SHALL NOT be blocked by a weekly run.

#### Scenario: A second request for the same investor

- **GIVEN** a RUNNING refresh for an investor whose lock is still in the future
- **WHEN** an editor requests regeneration for that investor
- **THEN** the response status is `already_running`

