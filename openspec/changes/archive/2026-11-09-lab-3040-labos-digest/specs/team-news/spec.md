## ADDED Requirements

### Requirement: Admin top stories for the next digest

A directory admin SHALL read and replace one ordered list of 1 to 3 found news items. That list SHALL be the top stories for both the next daily digest and the next weekly digest. With no list, the top stories SHALL be the current editorial ranks 1 to 3 in the 14-day window, and the digest lead SHALL stay editorial rank 1. With a list, the digest lead SHALL be the first item, including a story outside that window. The home feed editorial ranks SHALL stay unchanged. A signed-in non-admin SHALL receive 403. A call with no admin token SHALL receive 401.

#### Scenario: Admin order

- **WHEN** an admin saves stories B then A
- **THEN** the next digest lead is B
- **AND** the ordered top stories are B then A
- **AND** each member's other news cards stay as they are today

#### Scenario: No admin change

- **WHEN** no admin list is saved
- **THEN** the digest lead is editorial rank 1, as before

#### Scenario: Non-admin

- **WHEN** a member who is not a directory admin reads or changes the list
- **THEN** the API returns 403

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
