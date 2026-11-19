## MODIFIED Requirements

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
