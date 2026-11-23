## Why

The digest page v2 design (LAB-3287 item 19, LAB-3294) has a Past issues card. Issues are personal (each member gets their own stories) and the link token carries only one issue, so nothing stored past issues.

## What Changes

- New table `LabosDigestIssue`: one row per member per sent issue (the link token's fields).
- `POST v1/service/labos-digest/issues` (service key): the notification service records the issues it sent.
- The page read returns `issues` (latest 8, the link's always listed) and accepts `issue` to open a past issue; More / Less accept `issue` too.

Assumption (Vova's Q2 still open): a past issue shows the same content as when it was sent, opened from the member's current link.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `labos-digest-page`: recording sent issues, and past issues on the page read.

## Impact

- Prisma: `LabosDigestIssue` + migration `20261117180000_labos_digest_issue`.
- `libs/contracts/src/schema/team-news.ts`, `labos-digest-page.service.ts`, both digest controllers.
- Needs the notification service to call the new endpoint (LAB-3294 NS).
