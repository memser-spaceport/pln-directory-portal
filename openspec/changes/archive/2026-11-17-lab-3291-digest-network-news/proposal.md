## Why

The digest page v2 (LAB-3291, item 12 of LAB-3287) lists other press about network teams after the stories: "More from the network".

## What Changes

- The page read returns `networkNews`: ingested press (not member posts) added in the 7 days before the issue went out, minus the issue's stories and the feed's hidden teams, newest first, at most 5.
- `excludedTeamsWhere` in `labos-digest.service.ts` is exported for the page read.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `labos-digest-page`: More from the network on the page read.

## Impact

`labos-digest-page.service.ts`, `LabosDigestPageSchema` (new `networkNews` field). One more indexed query per page read.
