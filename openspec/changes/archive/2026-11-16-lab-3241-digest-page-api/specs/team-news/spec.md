## ADDED Requirements

### Requirement: Muted news tags

A member's muted news tags SHALL be stored as `newsTagsMuted`, a list of focus-area slugs, next to `newsTags`. Saving preferences with `newsTagsMuted` SHALL validate it the same way as `newsTags`: a slug that is not a focus area is rejected with 400 and nothing is stored. A member's effective news tags SHALL be their saved or starting tags, expanded as before, minus their muted tags and the children of a muted parent. A muted tag SHALL NOT come back as a starting tag. Saving `newsTags` without `newsTagsMuted` SHALL unmute every tag in the saved list, so a tag the member picks again on News preferences counts again.

#### Scenario: Muted starting tag

- **GIVEN** a member with no saved news tags, starting tags `["ai", "desci"]` and muted tags `["ai"]`
- **WHEN** their effective tags are read
- **THEN** they are `["desci"]`

#### Scenario: Picked again on News preferences

- **GIVEN** a member who muted `ai`
- **WHEN** they save `newsTags` `["ai", "desci"]`
- **THEN** `ai` is no longer muted

#### Scenario: Unknown muted slug

- **WHEN** a member saves `newsTagsMuted` `["not-a-focus-area"]`
- **THEN** the request is rejected with 400 and nothing is stored

### Requirement: Digest tag picks skip muted tags

When news tag picks are enabled, a member's digest picks SHALL leave out every story that has one of the member's muted tags, unless the story is from a team the member belongs to or follows. The fallback to the newest network stories SHALL leave those stories out as well. When news tag picks are disabled, picks SHALL be exactly as before. The top story SHALL be the same for everyone.

#### Scenario: Muted tag from an unrelated team

- **GIVEN** news tag picks are enabled and a member who muted `ai`
- **WHEN** a story tagged `ai` from a team they neither belong to nor follow is in the window
- **THEN** it is not picked for them, not even as a fallback

#### Scenario: Muted tag from a followed team

- **GIVEN** news tag picks are enabled and a member who muted `ai` and follows team T
- **WHEN** team T has a story tagged `ai` in the window
- **THEN** it can still be picked for them

#### Scenario: Picks disabled

- **GIVEN** news tag picks are disabled and a member who muted `ai`
- **WHEN** digest picks are built
- **THEN** they are the same as before this change
