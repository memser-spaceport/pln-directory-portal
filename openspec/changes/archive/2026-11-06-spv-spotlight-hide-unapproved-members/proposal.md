## Why

The public SPV spotlight listed team leads and founders who are still pending (L0). The team profile hides those members.

## What Changes

- The public spotlight founders list includes only members whose approval state is `APPROVED`.

## Capabilities

### Modified Capabilities

- `spv-spotlights`: public founders follow the same approved-member rule as the team profile.

## Impact

Public `GET` of an SPV spotlight. Pending, verified, and rejected members no longer appear in founders.
