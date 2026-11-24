## Context

The digest page (LAB-3241) reads and saves through a signed link token (`v1.<body>.<HMAC>`, 90 days) that names the member (`m`). `LabosDigestPageService.read(token, issueKey?)` and `choose(token, …)` resolve the issue through `issueOf(link, issueKey)`: the token's own issue, or a recorded `LabosDigestIssue` row of the same member by send time. Recorded rows exist since LAB-3294 (the notification service records every send through `POST v1/service/labos-digest/issues`, best effort).

Sign-in in this API: a Bearer token checked against the auth service. `OptionalUserTokenCheckGuard` sets `request.userEmail` when the token is valid and lets the request through otherwise; `UserTokenValidation` rejects with 401. Controllers map the email to a member with `MembersService.findMemberByEmail` (see `TeamNewsController.resolveMember`). Forum read access is checked with `AccessControlV2Service.hasPermissionByEmail(email, FORUM_PERMISSIONS.READ)` (as `SearchController` does).

## Goals / Non-Goals

**Goals:**
- A link token can only open an issue. It never names the reader and never saves.
- The issue read works signed out with no member data, and signed in with the reader's own data.
- More / Less saves only for the signed-in member.
- The frontend can ship on the same day (LAB-3351) without a broken window longer than a deploy.

**Non-Goals:**
- The email settings routes (`email-settings/read`, `email-settings`, `unsubscribe`): they keep the token (one-click unsubscribe, LAB-3309).
- Changes to `labos-digest-link-token.util.ts` or to any guard.
- Removing the deprecated token page read (follow-up after the frontend release).
- The notification service: emails keep `?t=` links.

## Decisions

1. **Issue identity = `LabosDigestIssue.uid`.** It already exists (cuid), so no schema change. The exchange upserts the row on the unique `(memberUid, frequency, sentAt)` key from the token's own fields when it is missing, so every valid link gets a uid. *Alternative:* a new random public id column: rejected; it needs a migration, and a read by uid returns only network news and forum titles (bodies need forum access, Decision 4), so a guessed id leaks little.

2. **Split the service by reader, not by route.** `read` becomes `readIssue(issue: IssueRow, viewer: Member | null)`, where all member-dependent queries (first name, choices, follows, active roles, topics, past issues) take `viewer?.uid` and are skipped when it is null. The deprecated token read calls it with the token's issue and the token's member as the viewer, so its behaviour does not change. `choose` becomes `chooseForMember(issue, memberUid, newsItemUid, choice)` around the existing `chooseLocked` (which takes the member uid instead of the link). One implementation keeps the two reads from drifting.

3. **Two controllers.** The public token controller keeps `page` (deprecated), the email-settings routes and `unsubscribe`, gets `exchange`, and its `choices` returns 410 (`GoneException`). A new `LabosDigestReaderController` holds `issue-page` with `@UseGuards(OptionalUserTokenCheckGuard)` and `issue-choices` with `@UseGuards(UserTokenValidation)`, both `@NoCache()`. Guards are per route, so the token routes stay guard-free.

4. **Forum bodies need `forum.read`.** Today the token's member got the bodies because they were sent the email. A read by issue id can come from anyone, so the issue read returns bodies and authors only to a signed-in member with forum read permission; everyone else gets `locked: true` rows with title, reply count and URL. The forum is still read once per issue with the backend key. This also covers LAB-3347 R2 ("forum posts ask for sign-in").

5. **Signed-out topics.** `followed` is empty and `suggested` is the offered tag list ordered by title (no profile scores to order by). The frontend decides how many to show (LAB-3348).

6. **Past issues carry `uid`.** The issue read lists the reader's own issues; `isLinkIssue` means "the issue on the page". The token read keeps listing the token member's issues and its link issue first; an unrecorded link issue has `uid` null (the exchange records it, so the frontend always has a uid to link to after the swap).

7. **410 at once for `choices`.** The email no longer has More / Less (LAB-3357), so only an open page from before the deploy hits it; the frontend shows its existing error toast. Keeping it would leave the forward-acts-for-sender hole open.

## Risks / Trade-offs

- **Deploy gap** → the old frontend's More / Less gets 410 until the new frontend is out. Mitigation: ship backend and frontend in the same release, backend first, minutes apart.
- **Fewer More / Less presses** (sign-in needed) → accepted product trade-off (LAB-3345 decisions 3); tracked by the page's existing `digest-more-clicked` / `digest-less-clicked` events.
- **cuid is not a secret** → issue content is network news; forum bodies are gated by Decision 4. No member data in a signed-out read.
- **The deprecated token read still returns the token member's data** to whoever holds the link, until it is removed → the frontend stops calling it in LAB-3351; remove it in the follow-up right after the release.
- **Auth service latency** on every issue read with a session (introspect call) → same cost as other signed-in reads; signed-out reads skip it.

## Migration Plan

1. Backend to `lab-3345`, feature env, then develop and prod together with the frontend (LAB-3351), backend first.
2. No data migration. The exchange fills in missing issue rows on demand.
3. Rollback: revert the backend; the old frontend works again (it only used `page` and `choices`).
4. Follow-up: remove `POST page` once the released frontend no longer calls it.

## Open Questions

- Vova's yes on the sign-in model (LAB-3351 gate Q1). The build only uses existing guards and edits no token or guard code.
