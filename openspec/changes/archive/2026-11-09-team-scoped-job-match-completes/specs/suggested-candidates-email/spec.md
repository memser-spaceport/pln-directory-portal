## ADDED Requirements

### Requirement: A finished run starts the email
When a job-match run finishes with no team failures, the run status SHALL be `COMPLETED` and the suggested-candidates email SHALL start for that run. This includes a run limited to `teamUids`. A run with team failures SHALL be `FAILED` and SHALL NOT start the email. A `COMPLETED` run closes that UTC day: a later start the same day SHALL return `already-completed`.

#### Scenario: A team-scoped run finishes
- **WHEN** `POST /v1/service/job-match/run` with `teamUids` finishes with no team failures
- **THEN** the run status is `COMPLETED`
- **AND** the suggested-candidates email starts for that run

#### Scenario: A run fails
- **WHEN** a job-match run finishes with one or more team failures
- **THEN** the run status is `FAILED`
- **AND** the suggested-candidates email does not start
