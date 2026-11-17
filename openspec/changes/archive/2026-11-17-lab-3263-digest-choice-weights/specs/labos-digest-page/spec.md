## MODIFIED Requirements

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
