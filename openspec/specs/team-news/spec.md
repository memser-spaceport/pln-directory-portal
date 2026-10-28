# team-news Specification

## Purpose

The team-news seed ranks a 14-day window into Top stories and Popular this week. Top stories use `editorialRank`. Popular this week uses synthetic upvotes from that seed. The news feed still lists every story.

## Requirements

### Requirement: Story picking uses Claude Sonnet 5.5

`POST /v1/service/team-news/seed-trending` SHALL rank stories with Claude Sonnet 5.5 (`claude-sonnet-5-5`). The call SHALL use the Anthropic provider. The call SHALL NOT follow `AI_PROVIDER` or `CLAUDE_MODEL`.

#### Scenario: The ranking call

- **WHEN** seed-trending ranks a window
- **THEN** the model call uses provider `anthropic` and model `claude-sonnet-5-5`

### Requirement: Negative stories stay off Top stories and Popular this week

`POST /v1/service/team-news/seed-trending` SHALL ask the model to exclude a story that has a negative sentiment or a negative connotation about a team in the network. The model SHALL return those UIDs in `excludedUids`. The system SHALL drop an excluded UID from `editorialUids` and from `likedUids` when the model also returns it as a pick. The system SHALL NOT use an excluded UID to fill an empty slot. The system SHALL NOT force an excluded Protocol Labs item into `likedUids`. An excluded story SHALL remain a normal news item.

#### Scenario: The newest story is excluded

- **WHEN** the model marks the newest story as excluded and also returns it as a pick
- **THEN** that story is not editorial rank 1
- **AND** that story receives no seed upvotes

#### Scenario: An excluded Protocol Labs item is not forced into Popular

- **WHEN** the only Protocol Labs item in the window is excluded
- **THEN** the liked list does not contain that item

### Requirement: A short suitable list is stored as-is

When fewer than 3 stories remain for Top stories, the system SHALL store only those ranks and SHALL log a warning. The system SHALL NOT invent the missing ranks from excluded stories. When fewer than 5 stories remain for Popular this week, the system SHALL store only those seed upvotes and SHALL log a warning.

#### Scenario: One suitable top story

- **WHEN** one story is suitable and the other candidates are excluded
- **THEN** the run stores editorial rank 1 only

### Requirement: A failed model call keeps the current ranks

When the model call throws, the system SHALL keep the current `editorialRank` values. The system SHALL NOT fill Top stories or Popular this week from the newest stories.

#### Scenario: The model is unavailable

- **WHEN** the model call throws
- **THEN** the run does not clear `editorialRank`
- **AND** the run does not write seed upvotes
