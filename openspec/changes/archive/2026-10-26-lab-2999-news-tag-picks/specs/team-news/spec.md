# Spec Delta

## ADDED Requirements

### Requirement: For You tag fields

The home feed's grouped news response SHALL include, for a signed-in viewer, the viewer's effective news tags (their saved tags, or their starting tags when they never saved any, with every parent focus area expanded to the focus areas under it) and the uids of the teams they belong to or follow. For a signed-out viewer both SHALL be empty. The existing For You team list SHALL be unchanged.

#### Scenario: Signed-in viewer

- **GIVEN** a member who saved the tag Digital Human Rights and belongs to team A
- **WHEN** they load the grouped home feed
- **THEN** the tags include `digital-human-rights` and the focus areas under it, and the own teams include team A

#### Scenario: Signed-out viewer

- **WHEN** a visitor who is not signed in loads the grouped home feed
- **THEN** the tags and own teams are empty, and the rest of the response is as before

### Requirement: Digest picks by news tags

When news tag picks are enabled, a member's digest picks SHALL be stories from teams they belong to or follow plus stories sharing any of their effective tags, newest first, at most one per team, up to the limit, falling back to the newest network stories. News categories SHALL NOT narrow these picks. When disabled, picks SHALL be exactly as before. The top story SHALL be the same either way.

#### Scenario: Tag match from an unrelated team

- **GIVEN** news tag picks are enabled and a member with the tag `ai`
- **WHEN** a story tagged `ai` from a team they neither belong to nor follow is in the window
- **THEN** it can be picked for them

#### Scenario: Legacy verb tag

- **GIVEN** news tag picks are enabled
- **WHEN** a story is tagged only `launch`
- **THEN** it is never picked because of its tags

#### Scenario: Disabled

- **GIVEN** news tag picks are disabled
- **WHEN** digest picks are built
- **THEN** they are the same as before this change, including the news-category narrowing
