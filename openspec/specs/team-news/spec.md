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

When a member has no saved news tags (they never saved a list, or their saved list is empty), reading their preferences SHALL return starting tags and `newsTagsSeeded: true`. The starting tags SHALL come from the first of these sources that has a news tag: (1) when profile starting tags are enabled, the 5 highest-scored topics of the member's interest profile that have a positive score and are news tags; (2) the member's stored AI news tags; (3) the slugs of the focus areas of the teams they belong to. Reading SHALL NOT store anything. Once the member saves a list with 1 or more tags, that list SHALL be returned without the seeded marker.

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

#### Scenario: Stored AI tags, on a team

- **GIVEN** a member of a team with the focus area DeSci, who never saved news tags, has the stored AI tags `ai` and `defi`, and profile starting tags are disabled
- **WHEN** their preferences are read
- **THEN** `newsTags` is `["ai", "defi"]` and `newsTagsSeeded` is `true`

#### Scenario: Profile topics win over AI tags

- **GIVEN** profile starting tags are enabled and a member who never saved news tags has the profile topic `desci` and the stored AI tags `ai` and `defi`
- **WHEN** their preferences are read
- **THEN** `newsTags` is `["desci"]` and `newsTagsSeeded` is `true`

#### Scenario: AI tags in For You and the digest

- **GIVEN** a member who never saved news tags and did not answer the tag card has the stored AI tag `ai`
- **WHEN** they load the grouped home feed, or their digest picks are built with news tag picks enabled
- **THEN** their effective tags are `ai` and the focus areas under it

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

### Requirement: Default news tags

`GET /v1/team-news/default-tags` SHALL return, for the signed-in member, the news tags the system uses for them, with `source`, `approved`, `approvedAt` and `generatedAt`. `source` SHALL be `member-set` for a saved list of 1 or more tags, otherwise the source of the starting tags: `interest-profile`, `ai` or `team`. The read SHALL store nothing and SHALL NOT call a language model. A request with no valid sign-in SHALL be rejected with 401.

#### Scenario: Stored AI tags

- **GIVEN** a signed-in member with no saved tags, no usable profile topic and the stored AI tags `ai` and `desci`
- **WHEN** they request the default tags
- **THEN** the response holds those two tags with their titles, `source` `ai`, `approved` `false` and the time the tags were generated, and no model is called

#### Scenario: Saved list

- **GIVEN** a signed-in member who saved the tags `ai` and `defi`
- **WHEN** they request the default tags
- **THEN** `source` is `member-set`, `approved` is `true` and `tags` are `ai` and `defi`

#### Scenario: No AI tags yet

- **GIVEN** a signed-in member of a team with the focus area DeSci, with no saved tags and no stored AI tags, and profile starting tags are disabled
- **WHEN** they request the default tags
- **THEN** `tags` is `desci`, `source` is `team` and `approved` is `false`

#### Scenario: Interest profile

- **GIVEN** profile starting tags are enabled and a signed-in member with no saved tags has the profile topic `ai`
- **WHEN** they request the default tags
- **THEN** `tags` is `ai` and `source` is `interest-profile`

#### Scenario: Signed-out request

- **WHEN** a visitor who is not signed in requests the default tags
- **THEN** the request is rejected with 401

### Requirement: Default news tags approval

`POST /v1/team-news/default-tags/approve` SHALL record the signed-in member's answer to the tag card and return the default tags after the call. Without `tags` it SHALL set the approval time and leave the tags as they are. With `tags` (1 or more news tag slugs) it SHALL save them as the member's own news tags and set the approval time. Any other `tags` value SHALL be rejected with 400, and nothing SHALL be stored.

#### Scenario: Approve as shown

- **GIVEN** a signed-in member whose default tags are the AI tags `ai` and `desci`, not approved
- **WHEN** they approve with no `tags`
- **THEN** the response has `approved` `true`, the same tags and `source` `ai`, and their saved news tags are unchanged

#### Scenario: Replace

- **GIVEN** a signed-in member whose default tags are `ai` and `desci`
- **WHEN** they approve with `tags` `["ai"]`
- **THEN** the response has `tags` `ai`, `source` `member-set` and `approved` `true`, and reading their preferences returns `newsTags` `["ai"]` with no seeded marker

#### Scenario: Unknown slug

- **WHEN** a member approves with `tags` `["ai", "not-a-tag"]`
- **THEN** the request is rejected with 400, their saved tags are unchanged and no approval time is set

#### Scenario: Empty list

- **WHEN** a member approves with `tags` `[]`
- **THEN** the request is rejected with 400 and nothing is stored

### Requirement: Approval only records the answer

The first answer SHALL set the approval time, and a later answer SHALL keep it. The approval SHALL NOT change which tags For You and the digest use: default tags are used whether the member approved them or not.

#### Scenario: Approve twice

- **GIVEN** a member who approved yesterday
- **WHEN** they approve again
- **THEN** the response is 200 and `approvedAt` is still yesterday's time

#### Scenario: Not approved tags are used

- **GIVEN** a member with the stored AI tag `ai`, no saved tags and no approval
- **WHEN** they load the grouped home feed
- **THEN** their tags include `ai`

### Requirement: AI news tags generation

An hourly job SHALL make AI news tags for members with no saved news tags and no usable interest-profile topic. It SHALL skip deleted members, bots and test accounts. A language model SHALL pick the tags from the member's own directory data (bio, skills, office hours topics, teams and projects). Only news tags SHALL be kept, at most 6. A reply with fewer than 3 news tags, or a failed call, SHALL store no tags and keep the member's earlier AI tags.

#### Scenario: New member with a bio

- **GIVEN** generation is enabled and a member with a bio, no saved tags and no AI tags
- **WHEN** the job runs and the model picks `cryptography`, `ai`, `defi` and `not-a-tag`
- **THEN** the member's AI tags are `cryptography`, `ai` and `defi`

#### Scenario: Too few tags

- **GIVEN** a member with the AI tags `ai`, `desci` and `defi` whose data changed
- **WHEN** the job runs and the model returns 2 news tags
- **THEN** the member's AI tags are still `ai`, `desci` and `defi`, and the job tries again the next day

#### Scenario: Member with saved tags

- **GIVEN** a member who saved the tag `ai`
- **WHEN** the job runs
- **THEN** no model is called for that member

#### Scenario: Nothing to read

- **GIVEN** a member with no bio, skill, office hours topic, team or project
- **WHEN** the job runs
- **THEN** no model is called for that member and no tags are stored

#### Scenario: Profile starting tags disabled

- **GIVEN** profile starting tags are disabled
- **WHEN** the job runs
- **THEN** the interest profile is not read, and every member with no saved tags is a candidate

### Requirement: AI news tags refresh and limits

The job SHALL run only where AI news tags generation is enabled. It SHALL make tags again for a member only when the member's data changed and 7 days passed since it last looked at that member. The same data SHALL be tried at most 3 times, at most once a day. One run SHALL make at most 50 model calls. Two API instances SHALL NOT process the same member in the same run.

#### Scenario: Unchanged member

- **GIVEN** a member whose AI tags were made 8 days ago and whose data did not change
- **WHEN** the job runs
- **THEN** no model is called for that member and the tags stay

#### Scenario: Changed member

- **GIVEN** a member whose AI tags were made 8 days ago and who changed their bio since
- **WHEN** the job runs
- **THEN** the model is called and the AI tags are replaced

#### Scenario: Generation disabled

- **GIVEN** AI news tags generation is not enabled in the environment
- **WHEN** the hour passes
- **THEN** no member is processed and no model is called

#### Scenario: Retry after a failure

- **GIVEN** a member whose generation failed today
- **WHEN** the job runs in the next hour, and again the next day
- **THEN** the model is not called in the next hour, and is called the next day

### Requirement: Default news tags events

The system SHALL record `team-news-default-tags-generated` when the job stores AI tags for a member, `team-news-default-tags-generation-failed` when a generation stores none, `team-news-default-tags-approved` when a member approves the tags as shown, and `team-news-default-tags-replaced` when a member approves with their own tags. The events SHALL hold the member uid, counts, the source, the model and the duration, and SHALL NOT hold an email, a bio or any other free text.

#### Scenario: Generation recorded

- **WHEN** the job stores 5 AI tags for a member who had none
- **THEN** `team-news-default-tags-generated` is recorded with the member uid, 5 tags, the model, the duration and trigger `created`

#### Scenario: Approval recorded

- **WHEN** a member approves 5 shown AI tags
- **THEN** `team-news-default-tags-approved` is recorded with the member uid, source `ai` and 5 tags

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
