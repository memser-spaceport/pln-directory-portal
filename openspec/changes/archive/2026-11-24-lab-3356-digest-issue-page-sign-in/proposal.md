# Proposal

## Why

The digest page link carries a signed token, and the token names the member. Whoever holds the link reads that member's digest and presses More / Less as that member, so a forwarded link acts for the sender (LAB-3345, LAB-3351). From now on the token only opens an issue. Who the reader is comes from sign-in.

## What Changes

- New `POST v1/labos-digest/exchange` (public): swaps a valid link token, with an optional past-issue send time, for the issue's id (`issueUid`). It creates the issue row from the token when the notification service did not record it. It saves nothing.
- New `POST v1/labos-digest/issue-page` (optional sign-in): reads one issue by `issueUid`. Signed out it returns the issue's stories and forum post titles, with no member data. Signed in it returns the signed-in member's own data (first name, topics, choices, follows, past issues) on that issue's stories. Forum post bodies only go to a member with forum read access.
- New `POST v1/labos-digest/issue-choices` (sign-in required): saves More / Less / none on a story of the issue, for the signed-in member, with the existing weight, one-active-choice and Undo rules.
- **BREAKING** `POST v1/labos-digest/choices` (token) saves nothing and returns 410 Gone.
- `POST v1/labos-digest/page` (token) keeps working for one release, so the page does not break while the frontend switches (LAB-3351). It is removed in a follow-up.
- Past issues in the read carry their `uid`, so the page links to `?issue=<uid>`.
- Out of scope: the email settings routes (`email-settings/read`, `email-settings`, `unsubscribe`). They keep the token for one-click unsubscribe (LAB-3309). No change to the link-token util or to any guard.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `labos-digest-page`: the token no longer names the reader. New exchange, issue read and issue choice routes; the token choice route is gone; the page read by token is deprecated; past issues carry their uid; forum post bodies need forum read access.

## Impact

- Code: `apps/web-api/src/team-news/labos-digest-public.controller.ts`, a new reader controller in `team-news`, `labos-digest-page.service.ts`, `team-news.module.ts`, `libs/contracts/src/schema/team-news.ts`, their specs.
- Guards: the existing `OptionalUserTokenCheckGuard` and `UserTokenValidation`; the forum permission check through `AccessControlV2Service.hasPermissionByEmail(email, FORUM_PERMISSIONS.READ)`, as search does.
- DB: no schema change. `LabosDigestIssue.uid` exists; the exchange may insert rows.
- Clients: the frontend digest page (LAB-3351) moves to the new routes. The frontend still on the old routes gets 410 on a More / Less press, so the backend and frontend ship together, backend first. The notification service is not touched (its emails keep `?t=` links; More / Less left the email in LAB-3357).
