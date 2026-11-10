## MODIFIED Requirements

### Requirement: A short suitable list is stored as-is

When fewer than 5 stories remain for Top stories, the system SHALL store only those ranks and SHALL log a warning. The system SHALL NOT invent the missing ranks from excluded stories. When fewer than 5 stories remain for Popular this week, the system SHALL store only those seed upvotes and SHALL log a warning.

#### Scenario: One suitable top story

- **WHEN** one story is suitable and the other candidates are excluded
- **THEN** the run stores editorial rank 1 only

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

The found news list SHALL accept `q`. A non-empty `q` SHALL keep a story whose title, summary, or HTML content contains that text, ignoring case. An empty `q` SHALL leave the list unfiltered by text. Each row SHALL include the story description. The description is the summary, as plain text.

#### Scenario: Title or content match

- **WHEN** an admin searches for a word that appears in a story title or in its content
- **THEN** the list contains that story

#### Scenario: Description on the row

- **WHEN** an admin opens found news
- **THEN** each row shows that story's summary as its description
