## ADDED Requirements

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
