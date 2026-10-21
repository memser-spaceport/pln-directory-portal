# warm-intros-v2 Specification

## ADDED Requirements

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

- **GIVEN** a completed run
- **WHEN** a viewer requests the latest run
- **THEN** the response status is COMPLETED and `finishedAt` is set
