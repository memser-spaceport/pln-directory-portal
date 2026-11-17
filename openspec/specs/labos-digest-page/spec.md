# labos-digest-page Specification

## Purpose

The public digest page API (LAB-3263): a signed link in the LabOS digest email opens that member's digest on one page without sign-in, and lets them press More like this, Less like this and Undo on each story.

## Requirements

### Requirement: Signed digest link

A digest link token SHALL have the form `v1.<body>.<signature>`. `<body>` is the base64url JSON of `{ "purpose": "digest", "m": <member uid>, "f": "daily" | "weekly", "s": <send time, ISO 8601>, "n": [<news item uids, in email order>], "l": <the top story uid, when the email showed one>, "p": [<forum topic ids, in email order>], "iat": <issued at, Unix seconds> }`. `<signature>` is the base64url HMAC-SHA256 of `v1.<body>` with `DIGEST_LINK_SECRET`. The backend SHALL accept a token only when the signature matches (constant-time compare), the purpose is `digest`, `m` and `f` are present, and `iat` is at most 90 days old. When `DIGEST_LINK_SECRET` is not set, every page call SHALL return 503 and no data.

#### Scenario: Valid link

- **GIVEN** a token signed with `DIGEST_LINK_SECRET` 10 days ago
- **WHEN** the page read is called with it
- **THEN** the call succeeds for the member in `m`

#### Scenario: Changed payload

- **WHEN** one character of `<body>` is changed and the signature is kept
- **THEN** the call returns 401 with no member or story data

#### Scenario: Expired link

- **GIVEN** a valid token issued 91 days ago
- **WHEN** the page read is called with it
- **THEN** the call returns 401 with the reason `expired` and no member or story data

#### Scenario: Wrong purpose

- **WHEN** a token with a valid signature has a purpose other than `digest`
- **THEN** the call returns 401

### Requirement: Digest page read

`POST v1/labos-digest/page` with `{ token }` SHALL return, without sign-in, the digest the token describes: `frequency`, `sentAt`, the member's first name, `stories` and `forumPosts`. `stories` SHALL list the token's news items in token order. Each has `uid`, `position`, `isTopStory` (true only for the item named in `l`), `title`, `summary`, `contentHtml`, the image, `sourceUrl`, `sourceDomain`, `teamName`, `teamLogoUrl` (null when the team has no logo), `followsTeam` (true when the token's member follows the team), `sources`, `commentCount`, `eventType`, `tags` and `choice` (`more`, `less` or null, the member's active choice on that story). `sources` SHALL list the story's main source, then its other sources, each once after URL normalization, each with `url` and `domain` (without `www.`). `commentCount` SHALL count the story's feed comments, replies included. A news item that no longer exists SHALL be left out, and the others keep their order. `forumPosts` SHALL list the token's topics in token order, read from the forum with the backend's forum API key (`FORUM_API_KEY`), and only the topics the token names, each with `tid`, `title`, the author's name, role and avatar, the opening post's HTML and the forum URL. A topic the forum does not return SHALL be left out. A forum failure SHALL return the news with an empty `forumPosts` and `forumUnavailable: true`. The page SHALL also return `isTeamMember`, true when the token's member has a team role with no end date or an end date that has not passed, and `nextSendAt`, the next send of the token's frequency after now: daily at 11:00 UTC, weekly on Wednesday at 11:00 UTC, as in the notification service. The signed-in session, if any, SHALL NOT change the result. The response SHALL NOT be cached.

#### Scenario: Stories in email order

- **GIVEN** a token with `n` = [B, A, C] and `l` = B
- **WHEN** the page is read
- **THEN** `stories` is B, A, C with positions 0, 1, 2, and only B has `isTopStory: true`

#### Scenario: Signed in as someone else

- **GIVEN** member X is signed in and opens member Y's link
- **WHEN** the page is read
- **THEN** it returns Y's digest and Y's choices

#### Scenario: Deleted story

- **GIVEN** news item A in the token was deleted
- **WHEN** the page is read
- **THEN** the other stories are returned in order, and A is not

#### Scenario: Forum not set up

- **GIVEN** the environment has no `FORUM_API_URL` or `FORUM_API_KEY`
- **WHEN** the page is read
- **THEN** the stories are returned, `forumPosts` is empty and `forumUnavailable` is true

#### Scenario: Forum down

- **GIVEN** the forum does not answer
- **WHEN** the page is read
- **THEN** the stories are returned, `forumPosts` is empty and `forumUnavailable` is true

#### Scenario: Team header and sources

- **GIVEN** story A's team has a logo, the token's member follows that team, A has 3 feed comments, and A's sources are `https://src/a` plus `https://www.src/a/` and `https://press.example/a`
- **WHEN** the page is read
- **THEN** A has the logo URL, `followsTeam: true`, `commentCount: 3`, and `sources` `https://src/a` (`src`) and `https://press.example/a` (`press.example`)

#### Scenario: Next weekly digest

- **GIVEN** a weekly token, read on Tuesday 2026-11-17 at 15:00 UTC
- **WHEN** the page is read
- **THEN** `nextSendAt` is `2026-11-18T11:00:00.000Z`

### Requirement: Reading the link changes nothing

The page read SHALL NOT change any preference or choice. Only `POST v1/labos-digest/choices` SHALL change them.

#### Scenario: Scanner opens the link

- **WHEN** the page read is called 5 times with a token
- **THEN** the member's preferences and choices are unchanged

### Requirement: More like this and Less like this

`POST v1/labos-digest/choices` with `{ token, newsItemUid, choice }` SHALL save the choice for the token's member. `newsItemUid` MUST be in the token's `n`, or the call returns 400. `choice` MUST be `more`, `less` or `none`. The story's topics are its `tags` that are focus-area slugs.

- `more` SHALL raise the member's interest profile `TOPIC` weight of each story topic by one step (`DIGEST_CHOICE_WEIGHT_STEP`). A topic with no weight yet SHALL start at the step.
- `less` SHALL lower each of those weights by one step, never below 0.
- A choice SHALL NOT change the member's news tags or any other preference.
- The weights SHALL change in the same transaction as the choice, and the daily profile rebuild SHALL apply every active choice again on top of the built scores (no decay, never below 0).
- `none` SHALL undo the active choice (see Undo).

The response SHALL return the story's active `choice` and whether any weight changed (`changed`). A story with no focus-area tag SHALL be saved as a choice with `changed: false`.

#### Scenario: Less

- **GIVEN** a member with news tags `["ai"]` and an `ai` weight of 6
- **WHEN** they choose `less` on a story tagged `["ai"]`
- **THEN** their `ai` weight is 4 and their news tags are still `["ai"]`

#### Scenario: More from starting tags

- **GIVEN** a member with no saved news tags, no `web3` weight, and a story tagged `["web3", "launch"]`
- **WHEN** they choose `more` on it
- **THEN** their `web3` weight is 2, `launch` is ignored, and they still have no saved news tags

#### Scenario: Less never goes below 0

- **GIVEN** a member with an `ai` weight of 1
- **WHEN** they choose `less` on a story tagged `["ai"]`
- **THEN** their `ai` weight is 0

#### Scenario: The rebuild keeps the choice

- **GIVEN** a member chose `less` on a story tagged `["ai"]`
- **WHEN** the daily profile rebuild runs
- **THEN** their `ai` weight is the built score minus one step, not below 0

#### Scenario: Story not in the link

- **WHEN** the call names a news item that is not in the token
- **THEN** it returns 400 and nothing changes

### Requirement: One active choice per story

Each member SHALL have at most one active choice per news item. The same choice again SHALL change nothing and return the same result, so a page reload does not save twice. A different choice on the same story SHALL first undo the active one and then apply the new one.

#### Scenario: Repeat page load

- **GIVEN** a member chose `more` on story A
- **WHEN** the page sends `more` on A again
- **THEN** nothing changes and the response is `choice: more`

#### Scenario: Switch from More to Less

- **GIVEN** a member with an `ai` weight of 6 chose `more` on a story tagged `["ai"]` (weight 8)
- **WHEN** they choose `less` on it
- **THEN** their `ai` weight is 4

### Requirement: Undo

Undo (`choice: none`) SHALL revert only what the active choice changed. Each choice SHALL store the weights of the story's topics before and after it. A weight that still equals what the choice left SHALL go back to its value from before. A weight that changed since (another choice or the daily rebuild) SHALL lose only this choice's own change, never going below 0. Undo with no active choice SHALL change nothing and return `choice: null`. An active choice saved before weights SHALL be ended without changing any weight.

#### Scenario: Undo right after More

- **GIVEN** a member with no `web3` weight chose `more` on a story tagged `["web3"]`
- **WHEN** they undo it
- **THEN** they again have no `web3` weight

#### Scenario: Undo after another change

- **GIVEN** a member with an `ai` weight of 6 chose `less` (weight 4), and the rebuild then set it to 5
- **WHEN** they undo the choice
- **THEN** their `ai` weight is 7

### Requirement: Digest page topics

The page read SHALL also return `topics` for the token's member, each topic with `slug` and `title`. `topics.followed` SHALL be the tags News preferences shows as ticked: the member's saved news tags, else their starting tags, in that order, leaving out slugs that are not focus areas. `topics.suggested` SHALL be the tags News preferences offers (the tag list's groups and their children) that the member does not get yet: a followed tag and the children of a followed parent are left out. Suggested topics SHALL be ordered by the member's interest-profile topic score, highest first, with no score counting as 0, then by title. Reading SHALL store nothing: not the starting tags and not a weight. Topics SHALL be changed only through the member's own preferences save, never through the link.

#### Scenario: Saved tags and weights

- **GIVEN** the member saved `defi`, and has topic scores `llms` 5, `desci` 2 and `ai` -1
- **WHEN** the page is read
- **THEN** `followed` is DeFi, and `suggested` is LLMs, DeSci, AI

#### Scenario: Nothing saved

- **GIVEN** the member saved no tags and their starting tags are `ai`
- **WHEN** the page is read
- **THEN** `followed` is AI, `suggested` leaves out AI's child LLMs, and nothing is stored

#### Scenario: Every tag followed

- **GIVEN** the member follows every tag News preferences offers
- **WHEN** the page is read
- **THEN** `suggested` is empty

### Requirement: Recording sent issues

`POST v1/service/labos-digest/issues` with the service key SHALL record each member's issue as sent: member, frequency, send time, news item uids in email order, top story and forum topic ids (the link token's fields). An issue already recorded for the same member, frequency and send time SHALL be skipped. Issues of members that don't exist SHALL be left out. A top story that isn't among the stories SHALL be stored as none. The response SHALL say how many were recorded.

#### Scenario: Recorded twice

- **GIVEN** the notification service records member M's weekly issue sent at 2026-11-09 11:00 UTC
- **WHEN** it records the same issue again
- **THEN** the second call records 0 and the issue is stored once

### Requirement: Past issues on the page read

The page read SHALL return `issues`: the token member's latest recorded issues, newest first, at most 8, each with `sentAt`, `frequency`, `title` (the top story's title, else the first story's, null when that story is gone) and `isLinkIssue`. The token's own issue SHALL always be listed, even when it was not recorded; when that makes nine, the oldest other issue is left out. With `issue` (a send time) the read SHALL return that recorded issue of the same member, with its own stories, top story, forum posts, frequency and `sentAt`; another member's issue or an unknown one SHALL be not found. `issue` equal to the token's send time SHALL read the token's issue. More and Less with `issue` SHALL accept only stories of that issue.

#### Scenario: Open a past issue

- **GIVEN** member M's link for the 16 November issue, and M's recorded issue of 9 November with stories Y, X and top story X
- **WHEN** the page is read with `issue` = 9 November
- **THEN** it returns stories Y, X with X as the top story and `sentAt` 9 November

#### Scenario: Link sent before recording

- **GIVEN** M's link issue was not recorded and M has two recorded issues
- **WHEN** the page is read
- **THEN** `issues` lists all three newest first, and only the link's has `isLinkIssue: true`

### Requirement: Team membership for the digest email

`POST v1/members/by-ids` (service key) SHALL return `isTeamMember` for each member: true when the member has a team role with no end date or an end date that hasn't passed, the same rule as the page read's `isTeamMember`. The notification service SHALL show the digest email's "Got news from your team?" card only when it is true.

#### Scenario: Former team member

- **GIVEN** a member whose only team role ended last month
- **WHEN** the notification service fetches them by id
- **THEN** `isTeamMember` is false

### Requirement: More from the network on the page read

The page read SHALL return `networkNews`: other press about network teams for the issue's week. An item counts when it was ingested, not posted by a member (`postedByMemberUid` is null), it was added in the 7 days before the issue's send time, it isn't one of the issue's stories, and its team isn't one the feed hides. At most 5, newest event first. Each row has the uid, title, source URL, outlet domain (from the URL when not stored), image, event date and team name. An empty list means the page shows no section.

#### Scenario: A story is not repeated

- **GIVEN** an issue whose stories include news item `a`
- **WHEN** the page reads it
- **THEN** `networkNews` does not contain `a`

#### Scenario: Member posts are left out

- **GIVEN** a news item a team member posted in the issue's week
- **WHEN** the page reads the issue
- **THEN** `networkNews` does not contain it

#### Scenario: A past issue keeps its own week

- **GIVEN** a member opens a past issue sent on 10 November
- **WHEN** the page reads it
- **THEN** `networkNews` holds press added between 3 and 10 November

### Requirement: Upcoming events on the page read

The page read SHALL return `events`: `items`, the events starting in the next 28 days from the time of the read (not from the issue's send time, so a past issue still shows what's coming), by Home's events rail query (not deleted, soonest first), at most 5; and `total`, how many events that window holds. Each item has the uid, name, start and end, location, gathering uid, pln-events id, logo URL, type and `goingCount`. `goingCount` counts distinct listed members going, as the event drawer does (REJECTED members left out); the read counts as signed out, so an invite-only event's `goingCount` is null.

#### Scenario: Invite-only count hidden

- **GIVEN** an invite-only event in the next 28 days with 3 members going
- **WHEN** the page is read
- **THEN** its row has `goingCount` null

#### Scenario: Past issue shows what's coming

- **GIVEN** a member opens an issue sent two weeks ago
- **WHEN** the page is read
- **THEN** `events` holds the events of the next 28 days from now
