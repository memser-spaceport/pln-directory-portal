## 1. Link token

- [ ] 1.1 Add `apps/web-api/src/team-news/labos-digest-link-token.util.ts` in the job-alerts format: `issueDigestLinkToken(payload)` and `verifyDigestLinkToken(token, maxAgeSeconds = 90 days)`, purpose `digest`, secret `DIGEST_LINK_SECRET`. Throw typed errors (`malformed`, `signature`, `purpose`, `expired`, `no-secret`).
- [ ] 1.2 Add a zod schema for the payload (`m`, `f` daily|weekly, `s` ISO, `n` ≤ 20 uids, `l` optional uid in `n`, `p` ≤ 10 positive ints, `iat`) and run it after the signature check.
- [ ] 1.3 Spec tests: round trip, changed body, changed signature, wrong purpose, 91 days, missing secret. Add a fixed test vector (secret, payload, `iat`, expected token) and record it in design.md for LAB-3265.

## 2. Data

- [ ] 2.1 Add the `LabosDigestChoice` model (uid, memberUid, newsItemUid, choice enum MORE|LESS, addedTags, removedTags, mutedAdded, mutedRemoved, before/after Json, createdAt, undoneAt) with relations to Member and TeamNewsItem (cascade on delete).
- [ ] 2.2 Write the migration, including a raw-SQL partial unique index on (`memberUid`, `newsItemUid`) WHERE `undoneAt` IS NULL, and regenerate the Prisma client.

## 3. Muted news tags

- [ ] 3.1 Add `readMutedNewsTags(preferences)` to `utils/news-tags.ts`. Validate `newsTagsMuted` in `toPreferencePatch` with `parseNewsTags`, and load the vocabulary in `updatePreference` when the body carries either key.
- [ ] 3.2 Subtract the expanded muted set in `getEffectiveTagsForMembers` and in `resolveNewsTags` / the preferences GET, so starting tags never return a muted tag.
- [ ] 3.3 In `pickDigestNewsByTags`, drop items with a muted tag unless the team is in the member's own or followed set, before matching and before the fallback. Leave the disabled path as it is.
- [ ] 3.4 Tests for the team-news delta scenarios: muted starting tag, unknown muted slug, muted tag from an unrelated team (including the fallback), from a followed team, and picks disabled.

## 4. Page read

- [ ] 4.1 Move the NodeBB member-proof call and the topic mapping out of `mcp-forum-tools.ts` into a shared forum reader. MCP tools keep the same behaviour, and their existing tests still pass.
- [ ] 4.2 Add `LabosDigestPageService.read(token)`: verify the token, load the news items by uid (keep token order, skip missing ones, add image variants as the feed does), load the member's first name and active choices, and read the topics in parallel as the member with a timeout. Return `forumUnavailable` on failure.
- [ ] 4.3 Add the contracts (`LabosDigestPageRequestSchema`, `LabosDigestPageSchema`) in `libs/contracts/src/schema/team-news.ts`.
- [ ] 4.4 Add `LabosDigestPublicController` at `v1/labos-digest`: `POST page`, `@NoCache()`, `safeParse` the body, map token errors to 401 (with `reason`) and a missing secret to 503. Register it in `TeamNewsModule`.
- [ ] 4.5 Tests: order and lead, deleted story, signed-in session ignored, forum down, and five reads change nothing.

## 5. Choices and Undo

- [ ] 5.1 Add `LabosDigestPageService.choose(token, newsItemUid, choice)`. In one transaction, lock the member row, compute the base (saved tags or starting tags), apply More or Less, write `newsTags` and `newsTagsMuted` with the jsonb merge, then insert, replace or undo the choice row. Clear the members cache.
- [ ] 5.2 Undo applies the inverse delta. If the current lists equal `after*`, restore `before*`, removing the key when it was absent.
- [ ] 5.3 Add `POST choices` to the controller, with the contract `{ token, newsItemUid, choice: more|less|none }` → `{ newsItemUid, choice, changed }`. Return 400 for a story not in the token.
- [ ] 5.4 Tests for every scenario in "More like this and Less like this", "One active choice per story" and "Undo", including a race between two presses.

## 6. Ship

- [ ] 6.1 Add `DIGEST_LINK_SECRET` to `.env.example` with a comment that the notification service must use the same value.
- [ ] 6.2 Run lint, the TypeScript 5.6 type-check and the team-news, members and mcp suites against the develop baseline.
- [ ] 6.3 On the `lab-3241` env (throwaway secret in `extra_env_json`), mint a token locally and check the page read, a More, a Less and an Undo with curl against `https://directory-lab-3241.os.pl.xyz`.
