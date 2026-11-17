## MODIFIED Requirements

### Requirement: Digest picks by news tags

When news tag picks are enabled, a member's digest picks SHALL be stories from teams they belong to or follow, plus stories sharing any of their effective tags, plus stories whose category is one of their `newsCategoryTags`, at most one per team (its newest story), ordered by the member's interest in them, up to the limit, falling back to the newest network stories when that set is empty. The member's interest in a story SHALL be the sum of their interest profile `TOPIC` weights for the story's tags, highest first, newest first on a tie; the order SHALL be set before the limit, so a weight change can bring a story in or push one out. Weights SHALL only order the picks: a topic weight alone SHALL NOT make a story eligible. An empty `newsCategoryTags` SHALL add no stories. The stored `newsCategories` list SHALL NOT narrow these picks. When disabled, picks SHALL be exactly as before. The top story SHALL be the same either way.

#### Scenario: Tag match from an unrelated team

- **GIVEN** news tag picks are enabled and a member with the tag `ai`
- **WHEN** a story tagged `ai` from a team they neither belong to nor follow is in the window
- **THEN** it can be picked for them

#### Scenario: Category match from an unrelated team

- **GIVEN** news tag picks are enabled and a member whose category tags are FUNDING
- **WHEN** a Funding story from a team they neither belong to nor follow is in the window
- **THEN** it can be picked for them

#### Scenario: No category tags

- **GIVEN** news tag picks are enabled and a member with no category tags
- **WHEN** a Funding story from a team they neither belong to nor follow is in the window, and it shares none of their tags
- **THEN** it is not picked because of its category

#### Scenario: Legacy verb tag

- **GIVEN** news tag picks are enabled
- **WHEN** a story is tagged only `launch`
- **THEN** it is never picked because of its tags

#### Scenario: Disabled

- **GIVEN** news tag picks are disabled
- **WHEN** digest picks are built
- **THEN** they are the same as before this change, including the news-category narrowing

#### Scenario: Less lowers a story out of the digest

- **GIVEN** news tag picks are enabled, a member with tags `ai` and `desci`, an `ai` weight of 0.5 and a `desci` weight of 6
- **WHEN** four matching stories are in the window, two tagged `ai` (newer) and two tagged `desci`, and the limit is 3
- **THEN** the picks are the two `desci` stories first, then the newest `ai` story

#### Scenario: A weight alone adds no story

- **GIVEN** news tag picks are enabled and a member with the tag `ai` and a high `web3` weight
- **WHEN** a story tagged only `web3` from an unrelated team is in the window
- **THEN** it is not picked

## REMOVED Requirements

### Requirement: Muted news tags

**Reason**: SU Nov 16 (Vova, Anuj): "More like this" / "Less like this" must not change the tags a member selected. They change interest profile weights instead (`labos-digest-page`).
**Migration**: None. The first version never reached prod. A `newsTagsMuted` key stored on dev is ignored.

### Requirement: Digest tag picks skip muted tags

**Reason**: There are no muted tags any more. A Less choice lowers topic weights instead of hiding stories.
**Migration**: None. Digest tag picks are as before LAB-3263.
