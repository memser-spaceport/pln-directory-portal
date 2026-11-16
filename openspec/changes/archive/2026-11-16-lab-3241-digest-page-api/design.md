## Context

- pl-notification-service builds and sends the digest. It asks the backend for each member's picks (`POST v1/team-news/digest-picks`), adds the shared top story, caps the news cards and renders each member's email. After the run it records one `LabosDigestSend` with the shared story list only. No per-member record exists, and the send is recorded after the emails go out.
- The digest's links carry `target_uid` and `target_email` in plain text and need sign-in at the target. The backend's only signed one-click links are `job-alerts-token.util.ts` and `job-match/suggested-candidates-token.util.ts` (HMAC, `v1.<body>.<sig>`).
- News preferences: `Member.preferences.newsTags` (focus-area slugs) is written through `MembersService.updatePreference`, a jsonb merge. A saved empty list counts as no saved tags, and the member then gets starting tags (`resolveNewsTags`, `getEffectiveTagsForMembers`).
- Digest tag picks (`pickDigestNewsByTags`) run only when `NEWS_TAG_PICKS_ENABLED=true`. Otherwise picks come from For You teams and categories, and tags do not matter.
- Forum reads as a member go through NodeBB with an `X-PL-Member-Proof` header (`mcp-forum-tools.ts`, `callForum`, `GET /api/topic/:tid`), but proofs exist only for MCP connections. The notification service reads the forum with a `FORUM_API_KEY` bearer key.
- The decisions behind this change are on LAB-3241 and LAB-3263 (2026-11-16).

## Goals / Non-Goals

**Goals:**
- One link format that pl-notification-service signs and this backend checks, with no per-member storage of digests.
- A page read that is safe for email link scanners.
- More, Less and exact Undo on a member's news tags.
- Digest tag picks that respect Less.

**Non-Goals:**
- Showing muted tags on the News preferences page (a follow-up).
- Changing picks when `NEWS_TAG_PICKS_ENABLED` is off.
- Changing the email template or links (LAB-3265) or building the page (LAB-3264).
- Signed links for the footer, Unsubscribe or News preferences.

## Decisions

1. **A stateless signed link, not stored per-member rows.** The token carries the member, the frequency, the send time, the ordered news uids, the lead uid and the forum tids. It reuses the job-alerts format (`v1.<base64url JSON>.<base64url HMAC-SHA256>`) with its own secret `DIGEST_LINK_SECRET` and `purpose: "digest"`.
   - Why: the notification service already knows each member's exact cards when it renders the email, so the token can record them as sent. No table grows by subscribers × stories each day, and the send job doesn't have to create a send row before emailing.
   - Alternative: create the send first and post each member's list to the backend in batches. That means more calls, a reordered send job, and a table that keeps growing. Rejected.
   - Cost: the URL grows by about 400 characters (5 cuids and 2 tids). Email clients handle that.
   - Short JSON keys (`m`, `f`, `s`, `n`, `l`, `p`) keep the URL short. The util lives in `team-news/labos-digest-link-token.util.ts` and exports `issue` (for tests and for the env seed) and `verify`. The spec gets a fixed test vector that LAB-3265 copies, so the two signers can't drift.

2. **Read is a POST with the token in the body**, the same as `job-alerts/verify-redirect`. This keeps the token out of API access logs and query-string caches. Neither route needs sign-in. `@NoCache()`, and the global throttler applies (it skips only `v1/service`).

3. **Routes live under `v1/labos-digest`** in a new `LabosDigestPublicController`, next to the existing admin and service controllers (AGENTS rules 16 and 17). The logic goes in a new `LabosDigestPageService` in the team-news module.

4. **Undo reverts a recorded delta, not a full snapshot.** `LabosDigestChoice` has: `uid`, `memberUid`, `newsItemUid`, `choice` (MORE | LESS), `addedTags`, `removedTags`, `mutedAdded`, `mutedRemoved`, `beforeNewsTags` / `beforeMuted` (Json, null when the key was absent), `afterNewsTags` / `afterMuted`, `createdAt`, `undoneAt`. There is a partial unique index on (`memberUid`, `newsItemUid`) where `undoneAt` is null: one active choice per story.
   - Undo applies the inverse delta. If the current lists still equal `after*`, it writes `before*` back, including removing the key, so a member who had no saved tags goes back to starting tags.
   - Why: restoring a whole snapshot would wipe changes the member made later on another story or on News preferences (see the "Preferences blob clobbers" trap).

5. **Writes go through one transaction with a row lock** on the member: `SELECT … FOR UPDATE` on `Member`, read the preferences, compute the new lists, write `newsTags` and `newsTagsMuted` with the existing jsonb merge, and insert or update the choice. This prevents two fast presses from racing.
   - The base for a member with no saved tags is their starting tags (from the same seeding as `getEffectiveTagsForMembers`), so More and Less from a fresh member are saved as an explicit list.
   - Clear the members cache afterwards, as `updatePreference` does.

6. **Muted tags are applied in one place.** `getEffectiveTagsForMembers` and `resolveNewsTags` subtract the expanded muted set, so starting tags never bring a muted tag back. `pickDigestNewsByTags` also filters items that carry a muted tag, unless the team is in the member's own or followed set, before matching and before the fallback. The disabled path is unchanged, which keeps the "Digest picks by news tags / Disabled" scenario true.

7. **Forum posts are read with the backend's forum API key, not as the member.** Found during build: NodeBB member proofs are issued only for MCP connections (`McpMemberProofService.issueForAuthorization` needs an MCP authorization), so a signed-out page has no way to read as the member. The backend reads `GET /api/topic/:tid` with `Authorization: Bearer FORUM_API_KEY`, the same kind of key the notification service uses to build the digest, and only for the tids signed into the link (`LabosDigestForumReader`). `mcp-forum-tools.ts` is unchanged. The topics are fetched in parallel with a 5 s timeout each; a 403/404 topic is left out; when the forum is not set up or no topic answers, the page gets `forumUnavailable: true`. The opening post's HTML is returned as NodeBB renders it, and the frontend sanitises it with `SafeHtml`. Trade-off: a forwarded link shows those topics to whoever opens it, which is the same exposure the email itself has (it already carries the post titles and excerpts). Needs a new BE secret `FORUM_API_KEY` in dev and prod SSM.

8. **Contracts.** The request and response zod schemas go in `libs/contracts/src/schema/team-news.ts`, next to the other LabosDigest schemas. Request bodies are checked with `safeParse` in the controller (ts-rest `@Api` skips body validation).

### Shared test vector (for LAB-3265)

Secret `digest-link-test-secret`. Payload, serialised with the keys in this order:
`{"purpose":"digest","m":"cm-member-1","f":"daily","s":"2026-11-16T09:00:00.000Z","n":["news-b","news-a","news-c"],"l":"news-b","p":[101,102],"iat":1763283600}`
Token:
`v1.eyJwdXJwb3NlIjoiZGlnZXN0IiwibSI6ImNtLW1lbWJlci0xIiwiZiI6ImRhaWx5IiwicyI6IjIwMjYtMTEtMTZUMDk6MDA6MDAuMDAwWiIsIm4iOlsibmV3cy1iIiwibmV3cy1hIiwibmV3cy1jIl0sImwiOiJuZXdzLWIiLCJwIjpbMTAxLDEwMl0sImlhdCI6MTc2MzI4MzYwMH0.w8SOyedllelo39DQrxPHy-VcEAFEgYrsxTJ2qmN0Lbs`

## Risks / Trade-offs

- [A forwarded email lets anyone press More or Less for its owner] → Accepted, as for every one-click email link. The worst outcome is changed news tags, which Undo or News preferences can fix. The token reveals only the story list and the first name.
- [`NEWS_TAG_PICKS_ENABLED` is off in an environment, so More and Less save but the digest doesn't change] → Make it a rollout prerequisite, checked with the lead before the template goes live.
- [`FORUM_API_KEY` is not set in an environment] → The page still shows the stories and says the forum posts can't load (`forumUnavailable`). The key goes into dev and prod SSM with `DIGEST_LINK_SECRET`.
- [The secret leaks or rotates] → Rotating `DIGEST_LINK_SECRET` makes every sent link show "expired". That's acceptable, and the page offers Home.
- [Story tags that aren't focus areas (legacy verbs)] → They're ignored. A story with none still records the choice, with `changed: false`.
- [Big weekly digests] → The token holds at most 5 news uids and 2 tids today. The schema caps them at 20 and 10 to bound the URL and the work.

## Migration Plan

1. Run one additive Prisma migration (`LabosDigestChoice` and the partial unique index). It auto-applies on deploy, and rollback is drop-table safe.
2. Ship the code to `lab-3241`, then develop. The routes return 503 until `DIGEST_LINK_SECRET` is set. No email links point at them until LAB-3265's template goes live.
3. Get `DIGEST_LINK_SECRET` into dev and prod SSM, with the same value for web-api and the notification service. Confirm `NEWS_TAG_PICKS_ENABLED=true` on prod.
4. Feature env: pass a throwaway `DIGEST_LINK_SECRET` in `extra_env_json`, and mint test tokens locally with `issue` and the same value.

## Open Questions

- Who adds `DIGEST_LINK_SECRET` to SSM, and is `NEWS_TAG_PICKS_ENABLED` on in prod? (lead / Vova)
