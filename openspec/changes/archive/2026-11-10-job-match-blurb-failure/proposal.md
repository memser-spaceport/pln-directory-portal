## Why

One role whose blurb JSON does not parse fails the whole job-match run. The suggested-candidates email never starts, including for teams that already finished.

## What Changes

- A blurb failure after retries saves the role's ranked candidates with an empty blurb.
- The run continues. It is `COMPLETED` when no team fails for another reason.

## Capabilities

### Modified Capabilities
- `suggested-candidates-email`: a blurb failure does not fail the run or block the email.

## Impact

`JobMatchRunner.finishRole`.
