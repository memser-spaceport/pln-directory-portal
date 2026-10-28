## Why

LAB-3022 (https://linear.app/protocollabs/issue/LAB-3022): Top stories should amplify useful network updates. A story with a negative sentiment about a team in the network can stay in the feed, and it must not lead Top stories or Popular this week.

## What Changes

- `seed-trending` asks the model for `excludedUids` and drops those UIDs from Top stories and from Popular this week, including the recency fill.
- An excluded Protocol Labs item is not forced into the liked list.
- A short suitable list is stored as-is. The run logs a warning. It does not invent the missing ranks.
- A failed model call keeps the current editorial ranks and does not fill from the newest stories.

## Capabilities

### New Capabilities

- `team-news`: keep negative stories out of Top stories and Popular this week.

## Impact

The home Top stories band and the digest top story use the same editorial ranks, so both change on the next successful seed. The normal news feed is unchanged. A failed model call no longer replaces Top stories with the newest items.
