## Why

LAB-3040 (https://linear.app/protocollabs/issue/LAB-3040): directory admins need to see and change the digest top stories, and a separate service needs to read news and those stories.

## What Changes

- One admin override, ordered, up to 3 stories, for both the daily and the weekly digest.
- The digest email still highlights only the first story. Member cards stay as they are today.
- The override clears after the next real forum-digest send that used it.
- Found news shows past top-story history.
- `v1/service/labos-digest` returns the next top stories, found news, and a past digest. It requires the service key, paginates, and rate-limits.

## Capabilities

### New Capabilities

- `team-news`: admin top stories, send history, and the service read API.

## Impact

Home-feed editorial ranks do not change. With no admin list, the digest lead stays editorial rank 1. The future newsletter's extra fields and send callback stay open.
