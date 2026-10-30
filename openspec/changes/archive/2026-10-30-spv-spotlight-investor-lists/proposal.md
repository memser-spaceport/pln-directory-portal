## Why

Admins select the same groups of investors on an SPV spotlight again and again, by hand or by CSV. They need to save a selection under a name and apply it later.

## What Changes

- New tables `SpvSpotlightInvestorList` and `SpvSpotlightInvestorListParticipant`.
- New admin endpoints to list, create and delete the investor lists of a spotlight.

## Capabilities

### New Capabilities

- `spv-spotlights`: saved investor lists per SPV spotlight.

## Impact

Backend only. The back-office UI that saves, shows, applies and deletes lists comes in a follow-up change.
