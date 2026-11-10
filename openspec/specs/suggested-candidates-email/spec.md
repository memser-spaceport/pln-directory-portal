# suggested-candidates-email Specification

## Purpose

The suggested-candidates email tells a team lead about job-match candidates for a live role.

## Requirements

### Requirement: A finished run starts the email
When a job-match run finishes with no team failures, the run status SHALL be `COMPLETED` and the suggested-candidates email SHALL start for that run. This includes a run limited to `teamUids`. A run with team failures SHALL be `FAILED` and SHALL NOT start the email. A `COMPLETED` run closes that UTC day: a later start the same day SHALL return `already-completed`.

#### Scenario: A team-scoped run finishes
- **WHEN** `POST /v1/service/job-match/run` with `teamUids` finishes with no team failures
- **THEN** the run status is `COMPLETED`
- **AND** the suggested-candidates email starts for that run

#### Scenario: A run fails
- **WHEN** a job-match run finishes with one or more team failures
- **THEN** the run status is `FAILED`
- **AND** the suggested-candidates email does not start

### Requirement: BCC LabOS on the team-lead email

When `LABOS_EMAIL` is set, each suggested-candidates email to a team lead SHALL also go to that address as BCC. The BCC address SHALL NOT appear in the message headers. When `LABOS_EMAIL` is empty or unset, the email SHALL have no BCC.

#### Scenario: LabOS is copied

- **GIVEN** `LABOS_EMAIL` is `labos@example.com`
- **WHEN** a suggested-candidates email is sent to a team lead
- **THEN** the lead is the To address
- **AND** `labos@example.com` receives the email as BCC
- **AND** the message headers have no Bcc line

#### Scenario: LabOS address is not set

- **GIVEN** `LABOS_EMAIL` is empty or unset
- **WHEN** a suggested-candidates email is sent to a team lead
- **THEN** the email has no BCC

### Requirement: One weekly email per team

Each week, a team lead SHALL get at most one suggested-candidates email per team they lead. It SHALL cover at most the team's three most recently published live roles that have someone to suggest. Roles SHALL appear newest first, and each SHALL show at most two candidates. "Not looking" members SHALL never be named or counted.

#### Scenario: Team with two roles

- **GIVEN** a team has 2 live roles with suggested candidates
- **WHEN** the weekly email runs
- **THEN** each opted-in lead of the team gets one email covering both roles

#### Scenario: Team with five roles

- **GIVEN** a team has 5 live roles with suggested candidates
- **WHEN** the weekly email runs
- **THEN** the email covers only the 3 most recently published roles

### Requirement: Role sections and cards

Each role section SHALL show its title with a "View role" link to the public posting, and "N matches · none have applied" (or "1 has applied" / "N have applied", counting matched members who applied). It SHALL then show up to two cards and end with an "All N matches for this role" button to the role's Suggested tab. A card SHALL show the photo or initials, name, match pill, "role · company, location", one "Why" line (the run's blurb) and "View profile", and no requirements count.

#### Scenario: A lead reads a card

- **GIVEN** a suggested member with a blurb who meets 4 of the role's 5 requirements
- **WHEN** the lead reads the email
- **THEN** the card shows the blurb as one line
- **AND** the card does not show "4 of 5 requirements"
- **AND** a "Strong match" pill is solid brand blue, and a "Good match" pill is a light brand tint

### Requirement: Per-role primary button and email end

The "All N matches for this role" button of each role (or "View 1 match" when the role has one match) SHALL use the primary button style and be full width on a phone. After the last role, the email SHALL show email preferences and unsubscribe. It SHALL have no "Review all" button and no Edit criteria link.

#### Scenario: Each role ends with its button

- **GIVEN** a lead whose email covers three roles
- **WHEN** the lead reads the email
- **THEN** each role section ends with its own "All N matches for this role" button, where N is that role's match count
- **AND** no "Review all" button follows the last role

#### Scenario: A role with one match

- **GIVEN** a role with exactly 1 match
- **WHEN** the lead reads the email
- **THEN** the role's button reads "View 1 match"

### Requirement: First, new or reminder

Which email a lead gets SHALL be judged against the members already emailed to that lead for each role.

- When the lead has had no email for any of the roles, the email SHALL be a first email naming everyone.
- When any role has someone the lead was never emailed about, the email SHALL be a new email. Its subject and intro SHALL count only the new people, and the new people SHALL come first in their role.
- When nobody is new, the email SHALL be a reminder. It SHALL say "No new members matched your open roles at <team> since last week. Here are your strongest matches." and show the people not yet contacted, each with their "Why" line. A reminder SHALL NOT follow a reminder, and SHALL NOT be sent when everyone has been contacted.

#### Scenario: No new candidates since last week

- **GIVEN** the lead was emailed about everyone now suggested, and their last email was not a reminder
- **WHEN** the weekly email runs
- **THEN** the lead gets a reminder showing each waiting candidate with a "Why" line
- **AND** the next week, with still nobody new, the lead gets no email

#### Scenario: Some roles have new people

- **GIVEN** one role has 1 new person and another has nobody new
- **WHEN** the weekly email runs
- **THEN** the lead gets one new email covering both roles, counting 1 new member
