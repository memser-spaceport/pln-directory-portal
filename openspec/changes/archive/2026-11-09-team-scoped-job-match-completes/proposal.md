## Why

A job-match run limited to `teamUids` finishes the requested teams and leaves the run `RUNNING`. The suggested-candidates email starts only after a run is `COMPLETED`, so that run never sends the email.

## What Changes

- A team-scoped run that finishes with no team failures is `COMPLETED` and starts the suggested-candidates email.
- A run with team failures stays `FAILED` and does not start the email.
- A `COMPLETED` run closes that UTC day.

## Capabilities

### Modified Capabilities
- `suggested-candidates-email`: a finished team-scoped run starts the email.

## Impact

`JobMatchRunner` completion. The email listener is unchanged.
