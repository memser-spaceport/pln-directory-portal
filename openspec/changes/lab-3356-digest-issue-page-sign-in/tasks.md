## 1. Contracts

- [ ] 1.1 In `libs/contracts/src/schema/team-news.ts`, add `LabosDigestExchangeRequestSchema` (`token`, optional `issue`) and `LabosDigestExchangeResponseSchema` (`issueUid`), `LabosDigestIssuePageRequestSchema` (`issueUid`), `LabosDigestIssueChoiceRequestSchema` (`issueUid`, `newsItemUid`, `choice`)
- [ ] 1.2 Add `uid` (string or null) to the past issue item; add `locked` (boolean) to the forum post and make its `contentHtml` and author fields nullable; `firstName` nullable on the page

## 2. Service

- [ ] 2.1 Refactor `LabosDigestPageService.read` into `readIssue(issue, viewer)`: member-dependent queries run only with a viewer; the signed-out result matches "Issue read signed out"
- [ ] 2.2 Keep `read(token, issueKey?)` as a thin wrapper (token's issue, token's member as the viewer) so the deprecated route is unchanged; existing page specs stay green
- [ ] 2.3 Add `exchange(token, issueKey?)`: verify the token, find or upsert the issue row on `(memberUid, frequency, sentAt)`, or the recorded past issue by send time (404 when missing or another member's); return `{ issueUid }`
- [ ] 2.4 Add `readIssueByUid(issueUid, viewerEmail?)`: load the row (404), resolve the viewer by email (non-member → signed out), check `forum.read` for the viewer, call `readIssue`
- [ ] 2.5 Lock forum posts for readers without `forum.read`: title, reply count, URL, `locked: true`, no HTML or author
- [ ] 2.6 Signed-out topics: `followed` empty, `suggested` the offered tags ordered by title
- [ ] 2.7 Past issues: `uid` on every item; on the issue read list the viewer's own issues with `isLinkIssue` for the issue on the page, empty when signed out
- [ ] 2.8 Add `chooseByIssue(issueUid, memberUid, newsItemUid, choice)` on top of `chooseLocked` taking a member uid; story must be in the row's `newsItemUids` (400), unknown issue 404

## 3. Controllers

- [ ] 3.1 In `LabosDigestPublicController`: add `POST exchange` (401 reason / 503 like the other token routes); make `POST choices` throw `GoneException`; mark `POST page` deprecated in Swagger
- [ ] 3.2 New `LabosDigestReaderController` (`v1/labos-digest`): `POST issue-page` with `OptionalUserTokenCheckGuard`, `POST issue-choices` with `UserTokenValidation` (non-member → 403), both `@NoCache()`; register it in `team-news.module.ts`

## 4. Tests

- [ ] 4.1 Service specs: exchange (recorded, upsert idempotent, past issue by send time, other member's 404, expired 401), signed-out read (no member data, locked forum), signed-in read of another member's issue (reader's choices and topics), forum unlocked with `forum.read`, choice saves for the signed-in member only, story not in issue 400
- [ ] 4.2 Controller specs: route guards by decorator (as `team-news.controller.spec.ts` does), `choices` → 410, `issue-choices` without session → 401
- [ ] 4.3 Mutation-check the guard and lock tests (drop the guard / the lock and see them fail)
- [ ] 4.4 Type check with the real build: `NX_NO_CLOUD=true NX_DAEMON=false node --stack-size=4000 --max-old-space-size=4096 node_modules/nx/bin/nx.js build web-api --skip-nx-cache`

## 5. Verify and ship

- [ ] 5.1 Deploy the `lab-3345` feature env; with a minted env link: exchange → issue read signed out (no member data, locked forum) → signed in as a test member (own data) → More saves for that member → `choices` returns 410
- [ ] 5.2 Archive this change in the backend PR into `lab-3345`
- [ ] 5.3 File the follow-up: remove `POST page` once the released frontend no longer calls it
