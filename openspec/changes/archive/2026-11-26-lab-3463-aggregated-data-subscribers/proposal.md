## Why

`GET /v1/irl/aggregated-data` answers with no sign-in and lists every active gathering subscriber with member uid, name and photo (LAB-3463).

## What Changes

- A signed-out answer sets `subscribers` to `[]` on `GET /v1/irl/aggregated-data` and `GET /v1/home/featured`.
- The same answer sets `eventGuests` to `[]` on each gathering's events, past events and upcoming events.
- A signed-in answer stays as the events cards use it today.

## Capabilities

### New Capabilities

- `irl-aggregated-data`: signed-out aggregated gathering reads hide subscriber members.

## Impact

- `GET /v1/irl/aggregated-data` and `GET /v1/home/featured`. The internal aggregated read is unchanged.
- Events location cards still read `followers.length` for the count. They ignore a follower with no `memberUid`, so a blank entry cannot mark a signed-out viewer as following.
