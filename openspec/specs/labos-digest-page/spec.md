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

`POST v1/labos-digest/page` with `{ token }` SHALL return, without sign-in, the digest the token describes: `frequency`, `sentAt`, the member's first name, `stories` and `forumPosts`. `stories` SHALL list the token's news items in token order. Each has `uid`, `position`, `isTopStory` (true only for the item named in `l`), `title`, `summary`, `contentHtml`, the image, `sourceUrl`, `sourceDomain`, `teamName`, `eventType`, `tags` and `choice` (`more`, `less` or null, the member's active choice on that story). A news item that no longer exists SHALL be left out, and the others keep their order. `forumPosts` SHALL list the token's topics in token order, read from the forum with the backend's forum API key (`FORUM_API_KEY`), and only the topics the token names, each with `tid`, `title`, the author's name, role and avatar, the opening post's HTML and the forum URL. A topic the forum does not return SHALL be left out. A forum failure SHALL return the news with an empty `forumPosts` and `forumUnavailable: true`. The signed-in session, if any, SHALL NOT change the result. The response SHALL NOT be cached.

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

### Requirement: Reading the link changes nothing

The page read SHALL NOT change any preference or choice. Only `POST v1/labos-digest/choices` SHALL change them.

#### Scenario: Scanner opens the link

- **WHEN** the page read is called 5 times with a token
- **THEN** the member's preferences and choices are unchanged

### Requirement: More like this and Less like this

`POST v1/labos-digest/choices` with `{ token, newsItemUid, choice }` SHALL save the choice for the token's member. `newsItemUid` MUST be in the token's `n`, or the call returns 400. `choice` MUST be `more`, `less` or `none`. The story's tags are its `tags` that are focus-area slugs.

- `more` SHALL add the story's tags to the member's news tags and remove them from the muted tags.
- `less` SHALL remove the story's tags from the member's news tags and add them to the muted tags.
- When the member has no saved news tags, their starting tags SHALL be the base that `more` and `less` change, and the result SHALL be saved.
- A choice SHALL change no other preference.
- `none` SHALL undo the active choice (see Undo).

The response SHALL return the story's active `choice` and whether any tag changed (`changed`). A story with no focus-area tag SHALL be saved as a choice with `changed: false`.

#### Scenario: More from starting tags

- **GIVEN** a member with no saved news tags, starting tags `["desci"]`, and a story tagged `["ai", "launch"]`
- **WHEN** they choose `more` on it
- **THEN** their saved news tags are `["desci", "ai"]`, `ai` is not muted, and `launch` is ignored

#### Scenario: Less

- **GIVEN** a member with news tags `["ai", "desci"]` and a story tagged `["ai"]`
- **WHEN** they choose `less` on it
- **THEN** their news tags are `["desci"]` and their muted tags contain `ai`

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

- **GIVEN** a member with news tags `["desci"]` chose `more` on a story tagged `["ai"]`
- **WHEN** they choose `less` on it
- **THEN** their news tags are `["desci"]` and `ai` is muted

### Requirement: Undo

Undo (`choice: none`) SHALL revert only what the active choice changed: it removes the tags the choice added, puts back the tags it removed, and resets the muted tags it changed. When the member's news tags and muted tags still equal exactly what the choice left, Undo SHALL restore the stored values from before the choice, including no saved list. Changes the member made after the choice SHALL be kept. Undo with no active choice SHALL change nothing and return `choice: null`.

#### Scenario: Undo right after More

- **GIVEN** a member with no saved news tags chose `more` on a story
- **WHEN** they undo it
- **THEN** they again have no saved news tags and get starting tags

#### Scenario: Undo after another change

- **GIVEN** a member chose `less` on a story tagged `ai`, then chose `more` on a story tagged `web3`
- **WHEN** they undo the first choice
- **THEN** `ai` is back in their news tags and no longer muted, and `web3` stays

