## Why

`GET /v1/irl/aggregated-data` answers with no sign-in and lists every active gathering subscriber with member uid, name and photo (LAB-3463).

## What Changes

- A signed-out answer keeps one subscriber entry per follower and drops member uid, name and photo.
- A signed-in answer stays as the events cards use it today.

## Capabilities

### New Capabilities

- `irl-aggregated-data`: signed-out aggregated gathering reads hide subscriber members.

## Impact

- `GET /v1/irl/aggregated-data` only. Home featured data and the internal aggregated read are unchanged.
- Events location cards still read `followers.length` for the count. They ignore a follower with no `memberUid`, so a blank entry cannot mark a signed-out viewer as following.
