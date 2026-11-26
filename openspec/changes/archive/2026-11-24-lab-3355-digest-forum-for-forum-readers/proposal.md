# Proposal

## Why

The web digest shows "From the forum" only to signed-in members with forum access (LAB-3355, approved by Vova on 2026-11-23). Today the issue read sends every reader the forum post titles, reply counts and URLs, with the post locked. The page could hide the section, but the titles would still be in the API answer and in the page HTML.

## What Changes

- `POST v1/labos-digest/issue-page` returns `forumPosts: []` and `forumUnavailable: false` for a signed-out reader and for a member without `forum.read` (a failed check counts as no access). The backend does not call the forum for them.
- For a member with `forum.read`, `forumPosts` does not change.
- `locked` stays in the schema and is always false.
- Out of scope: the email, the deprecated token read `POST v1/labos-digest/page` (removed in LAB-3359), the forum access rules.

## Capabilities

### Modified Capabilities

- `labos-digest-page`: forum posts in the issue read go only to readers with forum access.

## Impact

- Code: `apps/web-api/src/team-news/labos-digest-page.service.ts`, its spec, the `locked` comment in `libs/contracts/src/schema/team-news.ts`.
- The frontend (pln-directory-portal-v2) drops the signed-out forum rows and the forum sign-in prompts in the same change.
