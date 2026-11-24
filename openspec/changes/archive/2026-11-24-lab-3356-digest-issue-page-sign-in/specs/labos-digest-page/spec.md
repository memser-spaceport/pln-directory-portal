## ADDED Requirements

### Requirement: Link exchange

`POST v1/labos-digest/exchange` with `{ token, issue? }` SHALL return `{ issueUid }`, without sign-in. With no `issue`, or `issue` equal to the token's send time, it is the token's own issue; when that issue was not recorded, the call SHALL record it from the token first. With `issue` (a send time) it is that recorded issue of the token's member, else 404. A bad token SHALL return 401 with its reason, no secret 503. The call SHALL save no preference and no choice.

#### Scenario: Recorded issue

- **GIVEN** member M's weekly issue of 2026-11-18 11:00 UTC is recorded with uid `iss1`
- **WHEN** M's link for that issue is exchanged
- **THEN** the call returns `{ issueUid: "iss1" }` and records nothing new

#### Scenario: Issue not recorded yet

- **GIVEN** no issue row matches the token's member, frequency and send time
- **WHEN** the token is exchanged twice
- **THEN** both calls return the same `issueUid`, and one row holds the token's stories, top story and forum topic ids

#### Scenario: Old past-issue link

- **GIVEN** M's link and M's recorded issue sent at 2026-11-11 11:00 UTC with uid `iss0`
- **WHEN** the token is exchanged with `issue` = `2026-11-11T11:00:00.000Z`
- **THEN** the call returns `{ issueUid: "iss0" }`

#### Scenario: Expired link

- **GIVEN** a valid token issued 91 days ago
- **WHEN** it is exchanged
- **THEN** the call returns 401 with the reason `expired` and no `issueUid`

### Requirement: Issue read

`POST v1/labos-digest/issue-page` with `{ issueUid }` SHALL return the issue's `frequency`, `sentAt`, `stories` (in the issue's order, with `isTopStory` for its top story, as the page read), `forumPosts`, `networkNews`, `events` and `nextSendAt`, signed in or not. An unknown `issueUid` SHALL return 404 and no data. The response SHALL NOT be cached and SHALL NOT name the member the issue was sent to.

#### Scenario: Stories in issue order

- **GIVEN** issue `iss1` with stories B, A, C and top story B
- **WHEN** it is read
- **THEN** `stories` is B, A, C with positions 0, 1, 2, and only B has `isTopStory: true`

#### Scenario: Unknown issue

- **WHEN** the issue read is called with an id no issue has
- **THEN** it returns 404 and no stories

### Requirement: Issue read signed out

Read with no valid sign-in, the issue read SHALL return no member data: `firstName` null, every story's `choice` null and `followsTeam` false, `isTeamMember` false, `issues` empty, `topics.followed` empty, and `topics.suggested` the tags News preferences offers, ordered by title. An invalid or expired session SHALL count as signed out, not as an error.

#### Scenario: Forwarded link

- **GIVEN** member M chose `more` on story A of issue `iss1` and follows A's team
- **WHEN** a reader with no session reads `iss1`
- **THEN** A has `choice: null` and `followsTeam: false`, `firstName` is null and `issues` is empty

### Requirement: Issue read signed in

Read with a valid sign-in of a member, the issue read SHALL return that member's own data on the issue's stories: their `firstName`, each story's `choice` (their active choice) and `followsTeam`, their `isTeamMember`, their `topics` (as the page read) and their `issues` (see Past issues). The member does not have to be the one the issue was sent to. A signed-in user who is not a member SHALL get the signed-out result.

#### Scenario: Another member opens the link

- **GIVEN** member M's issue `iss1` with story A, on which M chose `more`, and member X who chose `less` on A
- **WHEN** X, signed in, reads `iss1`
- **THEN** A has `choice: less`, `firstName` is X's and `topics` are X's

### Requirement: Forum post bodies need forum access

In the issue read, a forum post SHALL carry its opening post's HTML and its author only when the reader is a signed-in member with forum read permission (`forum.read`). For any other reader each post SHALL have its `tid`, `title`, `replyCount` and forum URL, with `contentHtml` and the author null, and `locked: true`.

#### Scenario: Signed out

- **GIVEN** issue `iss1` lists forum topic 101
- **WHEN** a reader with no session reads it
- **THEN** post 101 has its title and reply count, `locked: true`, and no HTML or author

#### Scenario: Member without forum access

- **GIVEN** a signed-in member without `forum.read`
- **WHEN** they read `iss1`
- **THEN** post 101 is `locked: true` with no HTML

#### Scenario: Member with forum access

- **GIVEN** a signed-in member with `forum.read`
- **WHEN** they read `iss1`
- **THEN** post 101 has its HTML and author and `locked: false`

### Requirement: Token choice route is gone

`POST v1/labos-digest/choices` SHALL return 410 Gone for every call and change nothing. A link token SHALL never save a choice again.

#### Scenario: Old page presses More

- **WHEN** a valid token and a story of its issue are posted to `choices`
- **THEN** the call returns 410 and no choice or weight changes

## MODIFIED Requirements

### Requirement: Digest page read

`POST v1/labos-digest/page` with `{ token }` SHALL return, without sign-in, the digest the token describes: `frequency`, `sentAt`, the member's first name, `stories` and `forumPosts`. `stories` SHALL list the token's news items in token order. Each has `uid`, `position`, `isTopStory` (true only for the item named in `l`), `title`, `summary`, `contentHtml`, the image, `sourceUrl`, `sourceDomain`, `teamName`, `teamLogoUrl` (null when the team has no logo), `followsTeam` (true when the token's member follows the team), `sources`, `commentCount`, `eventType`, `tags` and `choice` (`more`, `less` or null, the member's active choice on that story). `sources` SHALL list the story's main source, then its other sources, each once after URL normalization, each with `url` and `domain` (without `www.`). `commentCount` SHALL count the story's feed comments, replies included. A news item that no longer exists SHALL be left out, and the others keep their order. `forumPosts` SHALL list the token's topics in token order, read from the forum with the backend's forum API key (`FORUM_API_KEY`), and only the topics the token names, each with `tid`, `title`, the author's name, role and avatar, the opening post's HTML, the forum URL and `replyCount` (the thread's replies now: the forum's post count less the opening post, 0 when the forum gives none). A topic the forum does not return SHALL be left out. A forum failure SHALL return the news with an empty `forumPosts` and `forumUnavailable: true`. The page SHALL also return `isTeamMember`, true when the token's member has a team role with no end date or an end date that has not passed, and `nextSendAt`, the next send of the token's frequency after now: daily at 11:00 UTC, weekly on Wednesday at 11:00 UTC, as in the notification service. The signed-in session, if any, SHALL NOT change the result. The response SHALL NOT be cached. This route is deprecated (LAB-3356): the page reads through the issue read, and this route is removed once no released frontend calls it. Every field above SHALL also be returned by the issue read, for its reader.

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

The page read, the link exchange and the issue read SHALL NOT change any preference or choice. Only `POST v1/labos-digest/issue-choices` SHALL change them. The exchange MAY record the token's own issue when it was not recorded; that changes no preference or choice.

#### Scenario: Scanner opens the link

- **WHEN** the page read is called 5 times with a token
- **THEN** the member's preferences and choices are unchanged

#### Scenario: Scanner follows the exchange

- **WHEN** a token is exchanged and its issue read 5 times
- **THEN** no member's preferences or choices change

### Requirement: More like this and Less like this

`POST v1/labos-digest/issue-choices` with `{ issueUid, newsItemUid, choice }` SHALL save the choice for the signed-in member. With no valid sign-in it SHALL return 401 and save nothing; a signed-in user who is not a member SHALL get 403. An unknown `issueUid` SHALL return 404. `newsItemUid` MUST be in the issue's stories, or the call returns 400. `choice` MUST be `more`, `less` or `none`. The story's topics are its `tags` that are focus-area slugs.

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

- **WHEN** the call names a news item that is not in the issue
- **THEN** it returns 400 and nothing changes

#### Scenario: Signed out

- **WHEN** the call has no valid session
- **THEN** it returns 401 and nothing changes

#### Scenario: Forwarded link saves for the reader

- **GIVEN** member M's issue `iss1` with story A, and member X signed in
- **WHEN** X chooses `more` on A in `iss1`
- **THEN** X's weights change and M's choices and weights do not

### Requirement: Past issues on the page read

The page read SHALL return `issues`: the token member's latest recorded issues, newest first, at most 8, each with `uid`, `sentAt`, `frequency`, `title` (the top story's title, else the first story's, null when that story is gone) and `isLinkIssue`. The token's own issue SHALL always be listed, even when it was not recorded; when that makes nine, the oldest other issue is left out. With `issue` (a send time) the read SHALL return that recorded issue of the same member, with its own stories, top story, forum posts, frequency and `sentAt`; another member's issue or an unknown one SHALL be not found. `issue` equal to the token's send time SHALL read the token's issue. More and Less with `issue` SHALL accept only stories of that issue. The issue read SHALL return in `issues` the signed-in member's own latest recorded issues, newest first, at most 8, with `isLinkIssue` true for the issue being read; signed out it is empty. An issue not recorded yet has `uid` null.

#### Scenario: Open a past issue

- **GIVEN** member M's link for the 16 November issue, and M's recorded issue of 9 November with stories Y, X and top story X
- **WHEN** the page is read with `issue` = 9 November
- **THEN** it returns stories Y, X with X as the top story and `sentAt` 9 November

#### Scenario: Link sent before recording

- **GIVEN** M's link issue was not recorded and M has two recorded issues
- **WHEN** the page is read
- **THEN** `issues` lists all three newest first, and only the link's has `isLinkIssue: true`

#### Scenario: Past issues on the issue read

- **GIVEN** member X signed in with recorded issues `x1` and `x2`, reading member M's issue `iss1`
- **WHEN** the issue read returns
- **THEN** `issues` is X's `x2`, `x1` with their uids, and none has `isLinkIssue: true`
