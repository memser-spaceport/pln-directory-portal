# team-news Specification

## Purpose

The team-news seed ranks a 14-day window into Top stories and Popular this week. Top stories use `editorialRank`. Popular this week uses synthetic upvotes from that seed. The news feed still lists every story. It also covers the news tags members can choose, and how the API stores and returns each member's tags for For You and the digest.

## Requirements

### Requirement: Story picking uses Claude Opus 5.5

`POST /v1/service/team-news/seed-trending` SHALL rank stories with Claude Opus 5.5 (`claude-opus-5-5`). The call SHALL use the Anthropic provider. The call SHALL NOT follow `AI_PROVIDER` or `CLAUDE_MODEL`. The model SHALL reply with one JSON object whose keys are `editorialUids`, `likedUids`, and `excludedUids`. The system SHALL store ranks only when that object matches the ranking schema. A reply that does not match SHALL leave the current ranks unchanged.

#### Scenario: The ranking call

- **WHEN** seed-trending ranks a window
- **THEN** the model call uses provider `anthropic` and model `claude-opus-5-5`

#### Scenario: The reply is wrapped in a markdown fence

- **WHEN** the model returns the ranking object inside a json code fence
- **THEN** the ranks are stored from that object

#### Scenario: The reply is not the ranking object

- **WHEN** the model returns text that is not the ranking object
- **THEN** the run does not clear `editorialRank`

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

When fewer than 5 stories remain for Top stories, the system SHALL store only those ranks and SHALL log a warning. The system SHALL NOT invent the missing ranks from excluded stories. When fewer than 5 stories remain for Popular this week, the system SHALL store only those seed upvotes and SHALL log a warning.

#### Scenario: One suitable top story

- **WHEN** one story is suitable and the other candidates are excluded
- **THEN** the run stores editorial rank 1 only

### Requirement: A failed model call keeps the current ranks

When the model call throws, the system SHALL keep the current `editorialRank` values. The system SHALL NOT fill Top stories or Popular this week from the newest stories.

#### Scenario: The model is unavailable

- **WHEN** the model call throws
- **THEN** the run does not clear `editorialRank`
- **AND** the run does not write seed upvotes

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

A member's chosen news tags SHALL be stored as a list of focus-area slugs. Saving the list SHALL replace the previous list and leave every other preference unchanged. A list with a slug that is not a focus-area slug SHALL be rejected with 400, and nothing SHALL be stored. An empty list SHALL be stored as a valid choice. A stored empty list SHALL be read as no saved tags: the member gets their starting tags.

#### Scenario: Save tags

- **GIVEN** a signed-in member
- **WHEN** they save `["ai", "desci"]`
- **THEN** reading their preferences returns `newsTags` `["ai", "desci"]`, and their other preferences are unchanged

#### Scenario: Unknown slug

- **WHEN** a member saves `["ai", "not-a-focus-area"]`
- **THEN** the request is rejected with 400 and their stored tags are unchanged

#### Scenario: Remove every tag

- **GIVEN** a member of a team with the focus areas DeSci and AI, and profile starting tags are disabled
- **WHEN** they save `[]`
- **THEN** the save is accepted, the stored list is `[]`, and reading their preferences returns `newsTags` `["desci", "ai"]` (in any order) with `newsTagsSeeded: true`

### Requirement: Starting tags

When a member has no saved news tags (they never saved a list, or their saved list is empty), reading their preferences SHALL return starting tags and `newsTagsSeeded: true`. When profile starting tags are enabled and the member's interest profile has topics with a positive score that are news tags, the starting tags SHALL be the 5 highest-scored of those topics. Otherwise the starting tags SHALL be the slugs of the focus areas of the teams they belong to. Reading SHALL NOT store anything. Once the member saves a list with 1 or more tags, that list SHALL be returned without the seeded marker.

#### Scenario: Never saved

- **GIVEN** a member of a team with the focus areas DeSci and AI, who never saved news tags, and profile starting tags are disabled
- **WHEN** their preferences are read
- **THEN** `newsTags` is `["desci", "ai"]` (in any order) and `newsTagsSeeded` is `true`

#### Scenario: No team

- **GIVEN** a member on no team, who never saved news tags, and profile starting tags are disabled
- **WHEN** their preferences are read
- **THEN** `newsTags` is `[]` and `newsTagsSeeded` is `true`

#### Scenario: Profile topics, no team

- **GIVEN** profile starting tags are enabled and a member on no team, who never saved news tags, has the profile topics `ai` and `desci`
- **WHEN** their preferences are read
- **THEN** `newsTags` is `["ai", "desci"]` (in any order) and `newsTagsSeeded` is `true`

#### Scenario: More than five profile topics

- **GIVEN** profile starting tags are enabled and a member who never saved news tags has seven profile topics that are news tags
- **WHEN** their preferences are read
- **THEN** `newsTags` is the five with the highest scores, highest first

#### Scenario: No usable profile topic

- **GIVEN** profile starting tags are enabled and a member who never saved news tags has no profile, or only profile topics that are not news tags
- **WHEN** their preferences are read
- **THEN** `newsTags` is the focus areas of their teams and `newsTagsSeeded` is `true`

#### Scenario: Saved tags win over the profile

- **GIVEN** profile starting tags are enabled and a member saved the tags `defi` and `desci`
- **WHEN** their profile later gains the topic `ai` and their preferences are read
- **THEN** `newsTags` is `["defi", "desci"]`, with no seeded marker

#### Scenario: Saved empty list, profile topics

- **GIVEN** profile starting tags are enabled and a member with the profile topic `ai` saved an empty list
- **WHEN** their preferences are read
- **THEN** `newsTags` is `["ai"]`, `newsTagsSeeded` is `true`, and the stored list is still `[]`

#### Scenario: Saved empty list, no profile

- **GIVEN** a member of a team with the focus areas DeSci and AI, with no interest profile, saved an empty list
- **WHEN** their preferences are read, with profile starting tags enabled or disabled
- **THEN** `newsTags` is `["desci", "ai"]` (in any order) and `newsTagsSeeded` is `true`

#### Scenario: Saved empty list, no team and no profile

- **GIVEN** a member on no team and with no interest profile saved an empty list
- **WHEN** their preferences are read
- **THEN** `newsTags` is `[]` and `newsTagsSeeded` is `true`

#### Scenario: Reading does not store

- **GIVEN** profile starting tags are enabled and a member who never saved news tags
- **WHEN** their preferences are read twice
- **THEN** the member still has no saved news tags

#### Scenario: Same starting tags everywhere

- **GIVEN** profile starting tags are enabled and a member who never saved news tags, or saved an empty list, has the profile topic `ai`
- **WHEN** they load the grouped home feed, or their digest picks are built with news tag picks enabled
- **THEN** their effective tags are `ai` and the focus areas under it, the same starting tags the preferences read returns

### Requirement: For You tag fields

The home feed's grouped news response SHALL include, for a signed-in viewer, the viewer's effective news tags (their saved tags, or their starting tags when they have no saved tags, with every parent focus area expanded to the focus areas under it) and the uids of the teams they belong to or follow. For a signed-out viewer both SHALL be empty. The existing For You team list SHALL be unchanged.

#### Scenario: Signed-in viewer

- **GIVEN** a member who saved the tag Digital Human Rights and belongs to team A
- **WHEN** they load the grouped home feed
- **THEN** the tags include `digital-human-rights` and the focus areas under it, and the own teams include team A

#### Scenario: Viewer who removed every tag

- **GIVEN** a member of a team with the focus area AI who saved an empty list, and profile starting tags are disabled
- **WHEN** they load the grouped home feed
- **THEN** the tags include `ai` and the focus areas under it

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

### Requirement: Admin top stories for the next digest

A directory admin SHALL read and replace one ordered list of 1 to 5 found news items. That list SHALL be the top stories for both the next daily digest and the next weekly digest. With no list, the top stories SHALL be the current editorial ranks 1 to 5 in the 14-day window, and the digest lead SHALL stay editorial rank 1. With a list, the digest lead SHALL be the first item, including a story outside that window. The digest email SHALL show one highlighted lead, the first top story, then up to 4 of that member's own picks. When the member has fewer than 4 picks, the email SHALL fill the remaining cards from the other top stories, up to 5 news cards. The home feed editorial ranks SHALL stay unchanged by an admin save. A signed-in non-admin SHALL receive 403. A call with no admin token SHALL receive 401.

#### Scenario: Admin order

- **WHEN** an admin saves stories B then A
- **THEN** the next digest lead is B
- **AND** the ordered top stories are B then A
- **AND** the email shows that lead, then up to 4 of the member's own picks, and fills any missing picks from the other top stories

#### Scenario: No admin change

- **WHEN** no admin list is saved
- **THEN** the digest lead is editorial rank 1, as before

#### Scenario: Non-admin

- **WHEN** a member who is not a directory admin reads or changes the list
- **THEN** the API returns 403

### Requirement: Found news search

The found news list SHALL accept `q`. A non-empty `q` SHALL keep a story whose title, summary, or HTML content contains that text, ignoring case. An empty `q` SHALL leave the list unfiltered by text.

#### Scenario: Title or content match

- **WHEN** an admin searches for a word that appears in a story title or in its content
- **THEN** the list contains that story

### Requirement: Admin edit and post change the real news item

A directory admin SHALL open one news item and change its title, description, and source links. The description is the summary. The change SHALL be stored on the news item, so the feed, the team page, and the digest show it. A directory admin SHALL post a news item for a team with a headline, a body, and one link, using the same rules as Post news on the team page.

#### Scenario: Edit the title

- **WHEN** an admin saves a new title for a story
- **THEN** the stored news item has that title

#### Scenario: Post for a team

- **WHEN** an admin posts a headline, body, and link for a team
- **THEN** the story is created for that team as a team post

### Requirement: Directory admins can read all news through MCP

The MCP tools `list_all_news`, `get_digest_top_stories`, `list_digest_sends`, and `get_digest_send` SHALL be visible only to a directory admin, in the news scope at read. `list_all_news` SHALL return the same found-news fields as the service news list. A member who is not a directory admin SHALL NOT see or call these tools. `list_news` and `post_team_news` SHALL stay unchanged.

#### Scenario: Admin list

- **WHEN** a directory admin calls `list_all_news`
- **THEN** the tool returns the found news for the requested filters

#### Scenario: Member

- **WHEN** a member who is not a directory admin lists MCP tools
- **THEN** the digest admin tools are absent

### Requirement: Admin picks last until the next real send

An admin list SHALL stay until the next successful daily or weekly forum digest that sends. A test send SHALL NOT clear it. A run that finds nothing to send SHALL NOT clear it. The send SHALL delete the list only when it used the admin picks and the list version still matches the version read at the start of that send. A newer save during the send SHALL stay. After the delete, the next digest SHALL use the AI picks again. The send SHALL record the ordered stories, and found news SHALL show when a story was in a past digest, with the date, frequency, position, and whether it was the email lead.

#### Scenario: The next send uses the admin lead

- **WHEN** an admin list is set and the daily digest sends
- **THEN** the email highlights the first admin story even if that frequency already sent it
- **AND** the list is deleted

#### Scenario: A newer save wins

- **WHEN** an admin saves a new list after the digest job has read the old list
- **THEN** the send records the old list and leaves the new list in place

#### Scenario: AI lead is still skipped when repeated

- **WHEN** no admin list is set and the AI lead is the lead this frequency already sent
- **THEN** the email does not highlight it

### Requirement: Service API for news and digest top stories

A service that sends `Authorization: Basic` or `Bearer` with `INTERNAL_SERVICE_SECRET` SHALL read the next daily and weekly top stories, in order, each marked `admin` or `ai`, and whether that frequency will use the first story as the email lead. It SHALL read found news for an `eventDate` range with `uid`, title, summary, source, link, date, tags, and team. It SHALL read the top stories of a past digest. Lists SHALL use `page`, `limit`, and `total`. A call with no key or a wrong key SHALL return 401. The read routes SHALL allow 60 requests per 60 seconds and return 429 over that limit. Request, response, and these errors SHALL appear on the internal API docs.

#### Scenario: Admin picks

- **WHEN** the service asks for the next top stories and an admin list is set
- **THEN** both frequencies return that list in the admin's order, marked `admin`

#### Scenario: AI picks

- **WHEN** no admin list is set
- **THEN** the service gets the AI list, marked `ai`

#### Scenario: Wrong key

- **WHEN** the call has no key or a wrong key
- **THEN** the API returns 401
