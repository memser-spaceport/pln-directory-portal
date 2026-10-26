# team-news Specification

## Purpose

What the API offers members as news tags, and how it stores and returns each member's chosen tags for For You and the digest.

## Requirements

### Requirement: News tag list

The API SHALL list the news tags members can choose: every focus area whose slug appears in the tags of at least one news item created in the last 90 days, plus the parent of any such focus area. Each entry SHALL carry the slug and the focus-area title, and second-level focus areas SHALL be listed under their parent. Tags that are not focus-area slugs SHALL NOT be listed. The list SHALL be readable without signing in.

#### Scenario: Focus areas used by news

- **GIVEN** news from the last 90 days tagged `ai`, `desci` and `launch`
- **WHEN** a client requests the tag list
- **THEN** it contains AI and DeSci with their titles, and no entry for `launch`

#### Scenario: Child focus area

- **GIVEN** news tagged `data-ownership`, a child of Digital Human Rights
- **WHEN** a client requests the tag list
- **THEN** Data Ownership is listed under Digital Human Rights

#### Scenario: Old news only

- **GIVEN** a focus area used only by news older than 90 days
- **WHEN** a client requests the tag list
- **THEN** that focus area is not listed

### Requirement: Member news tags

A member's chosen news tags SHALL be stored as a list of focus-area slugs. Saving the list SHALL replace the previous list and leave every other preference unchanged. A list with a slug that is not a focus-area slug SHALL be rejected with 400, and nothing SHALL be stored. An empty list SHALL be stored as a valid choice.

#### Scenario: Save tags

- **GIVEN** a signed-in member
- **WHEN** they save `["ai", "desci"]`
- **THEN** reading their preferences returns `newsTags` `["ai", "desci"]`, and their other preferences are unchanged

#### Scenario: Unknown slug

- **WHEN** a member saves `["ai", "not-a-focus-area"]`
- **THEN** the request is rejected with 400 and their stored tags are unchanged

#### Scenario: Remove every tag

- **WHEN** a member saves `[]`
- **THEN** reading their preferences returns `newsTags` `[]` with no seeded marker

### Requirement: Starting tags

When a member has never saved news tags, reading their preferences SHALL return the slugs of the focus areas of the teams they belong to, and `newsTagsSeeded: true`. Reading SHALL NOT store anything. Once the member saves any list, including an empty one, that list SHALL be returned without the seeded marker.

#### Scenario: Never saved

- **GIVEN** a member of a team with the focus areas DeSci and AI, who never saved news tags
- **WHEN** their preferences are read
- **THEN** `newsTags` is `["desci", "ai"]` (in any order) and `newsTagsSeeded` is `true`

#### Scenario: No team

- **GIVEN** a member on no team, who never saved news tags
- **WHEN** their preferences are read
- **THEN** `newsTags` is `[]` and `newsTagsSeeded` is `true`

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
