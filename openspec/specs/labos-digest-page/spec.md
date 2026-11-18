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

### Requirement: Digest email settings from the signed link

`POST /v1/labos-digest/email-settings/read` with `{ token }` SHALL return `{ firstName, enabled, frequency }` for the member in the token: `enabled` is the member's `forumDigestEnabled` and `frequency` is `daily` for `forumDigestFrequency` 1 and `weekly` for 7. A member with no stored setting SHALL read as off and daily, the notification service's defaults (the digest is opt-in). A stored frequency other than 1 or 7 SHALL read as daily, and turning the digest on without a frequency SHALL then store daily. Reading SHALL change nothing.

`POST /v1/labos-digest/email-settings` with `{ token, enabled?, frequency? }` SHALL save the given fields for the member in the token through the notification service, the same store the signed-in email settings page writes, and return the settings after the change. At least one of `enabled` and `frequency` SHALL be present; otherwise the call returns 400. Both endpoints SHALL check the token as the page read does and act only on the member in `m`, whoever is signed in.

#### Scenario: Read

- **GIVEN** a member whose digest is on and weekly
- **WHEN** the read is called with a valid link for them
- **THEN** it returns `enabled: true` and `frequency: 'weekly'` and changes nothing

#### Scenario: Unsubscribe and undo

- **WHEN** the change is called with a valid link and `enabled: false`
- **THEN** the member's `forumDigestEnabled` is false and the response says `enabled: false`
- **WHEN** it is called again with `enabled: true`
- **THEN** the digest is on again with the frequency it had

#### Scenario: Switch frequency

- **WHEN** the change is called with a valid link and `frequency: 'weekly'`
- **THEN** the member's `forumDigestFrequency` is 7 and the digest stays on or off as it was

#### Scenario: Expired link

- **GIVEN** a link issued 91 days ago
- **WHEN** the read or the change is called with it
- **THEN** the call returns 401 with the reason `expired` and nothing changes

#### Scenario: Signed in as someone else

- **GIVEN** a request that also carries another member's session
- **WHEN** the change is called with a valid link
- **THEN** only the member in the link changes

### Requirement: One-click unsubscribe

`POST /v1/labos-digest/unsubscribe?t=<token>` SHALL turn the digest off (`forumDigestEnabled: false`) for the member in the token and answer 200 with no body, as RFC 8058 asks of a `List-Unsubscribe-Post` target. It SHALL accept the form body `List-Unsubscribe=One-Click` and SHALL NOT require it. It SHALL check the token as the page read does. It SHALL NOT answer GET, so a link scanner that only opens URLs changes nothing.

#### Scenario: Gmail's unsubscribe button

- **WHEN** a mail client posts `List-Unsubscribe=One-Click` to the endpoint with a valid link's token
- **THEN** the member's digest is off and the response is 200

#### Scenario: Already off

- **GIVEN** a member whose digest is off
- **WHEN** the endpoint is called with a valid link
- **THEN** it answers 200 and the digest stays off

#### Scenario: Bad link

- **WHEN** the token's signature does not match
- **THEN** the call returns 401 and nothing changes

