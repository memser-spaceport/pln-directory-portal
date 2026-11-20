## Why

The digest page v2 (LAB-3287) shows a team header with logo and Follow, a Sources line, a Comments button, a "Got news from your team?" card for team members, and "The next digest arrives on <date>". The page read does not return that data yet (LAB-3288).

## What Changes

- Each story in `POST v1/labos-digest/page` gains `teamLogoUrl`, `followsTeam`, `sources` and `commentCount`.
- The page gains `isTeamMember` and `nextSendAt`.
- Existing fields stay as they are.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `labos-digest-page`: the page read returns the new fields.

## Impact

- `apps/web-api/src/team-news/labos-digest-page.service.ts`, new `labos-digest-schedule.util.ts`.
- `libs/contracts/src/schema/team-news.ts` (`LabosDigestPageStorySchema`, `LabosDigestPageSchema`, new `LabosDigestPageSourceSchema`).
- No migration. The send schedule is copied from pl-notification-service `forum-digest.jobs.ts`; the two change together.
