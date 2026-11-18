## Why

In the digest email, "Read more" opens one story in a modal on Home, and readers expect the story to expand. Members also have no quick way to tune their digest. LAB-3241 adds one LabOS page that shows a member's whole digest, plus "More like this" and "Less like this" on each story. The page opens from the email without sign-in. This change is the backend part (LAB-3263): it checks the email link, serves the page's data and saves the choices.

## What Changes

- A signed digest link. The notification service signs one link per member per digest with `DIGEST_LINK_SECRET`. The link carries the member, the frequency, the send time, the member's news stories in email order and the forum topic ids. It is valid for 90 days. The backend checks it and keeps no per-member copy of the digest.
- A public page read call. Given a valid link, it returns that digest: each news story in full (title, summary, `contentHtml`, image, source, tags, top-story flag, the member's active choice) and each forum post in full (author, title, opening post, forum link), read from NodeBB with the backend's forum API key, only for the topics the link names.
- A public choice call. It saves "More like this" or "Less like this" for one story of the digest. More adds the story's focus-area tags to the member's news tags and unmutes them. Less removes them and mutes them. A new choice on the same story replaces the earlier one. "None" undoes the active choice and restores what that choice changed.
- Muted news tags. A new `Member.preferences.newsTagsMuted` list of focus-area slugs. Muted tags are dropped from the member's effective tags, including starting tags. When news tag picks are enabled, digest picks skip stories with a muted tag, unless the story is from a team the member belongs to or follows.
- A new `LabosDigestChoice` table records each choice and what it changed, so Undo is exact and a repeat page load saves nothing twice.

## Capabilities

### New Capabilities
- `labos-digest-page`: the signed digest link, the public page read, and the More / Less / Undo choice calls.

### Modified Capabilities
- `team-news`: adds muted news tags (stored, validated, removed from effective tags) and a rule that digest tag picks skip stories with a muted tag.

## Impact

- **Code:** `apps/web-api/src/team-news/` (a new link-token util, a public controller and a service for the page and choices; `news-tag-vocabulary.service.ts` effective tags; `team-news-query.service.ts` tag picks); `apps/web-api/src/members/member-preferences.ts` (validate `newsTagsMuted`); the forum member-proof read path shared with `mcp-forum-tools.ts`; `libs/contracts/src/schema/team-news.ts` (request and response schemas).
- **Database:** one additive migration that creates `LabosDigestChoice`.
- **API:** new public routes `POST v1/labos-digest/page` and `POST v1/labos-digest/choices`. They take no sign-in, only the link token, and the global throttler applies.
- **Config:** new secret `DIGEST_LINK_SECRET`, with the same value in web-api and pl-notification-service, on dev and prod (SSM). Without it the page calls return 503. More and Less change the digest only where `NEWS_TAG_PICKS_ENABLED=true`, which is a rollout prerequisite.
- **Other repos:** LAB-3265 (pl-notification-service) signs the links with the format defined here. LAB-3264 (frontend) calls these routes.
