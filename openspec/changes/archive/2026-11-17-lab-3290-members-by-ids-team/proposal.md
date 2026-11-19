## Why

The digest email v2 (LAB-3290) shows "Got news from your team?" only to team members. The notification service reads recipients from `POST v1/members/by-ids`, which said nothing about teams.

## What Changes

- `findMembersByIds` returns `isTeamMember` (an active team role), the same rule as the digest page.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `labos-digest-page`: team membership for the digest email.

## Impact

`apps/web-api/src/members/members.service.ts`. Adds one field to the by-ids response; existing readers ignore it.
