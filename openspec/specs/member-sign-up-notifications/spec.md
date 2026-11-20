# member-sign-up-notifications Specification

## Purpose

The member-sign-up-notifications module posts a Telegram message for each new Directory sign-up, each LinkedIn verification that moves a member to Verified, and each new Job Aspirant sign-up. It enqueues the message in the notification service Telegram outbox (`POST /telegram-outbox/messages`), which routes it by channel type to a chat set per environment.

## Requirements

### Requirement: Post each new sign-up

The system SHALL post to the `SIGN_UP_AND_VERIFIED` channel when a member is created by `POST /v1/participants-request/member`, by the legacy `POST /v1/participants-request` with participant type `MEMBER`, or by the Job Board sign-up. The system SHALL NOT post for a member created by a directory admin, by a Demo Day or Team Pitch participant import, or by a Demo Day investor application.

#### Scenario: A person signs up

- **GIVEN** no member with the email `ada@example.com`
- **WHEN** the person signs up with that email
- **THEN** the `SIGN_UP_AND_VERIFIED` channel gets one message that starts with `🆕 New sign-up`

#### Scenario: A sign-up fails

- **GIVEN** a member with the email `ada@example.com`
- **WHEN** a person signs up with that email again and the sign-up is refused
- **THEN** no message is posted

### Requirement: Post each LinkedIn verification

The system SHALL post to the `SIGN_UP_AND_VERIFIED` channel when a member's LinkedIn verification moves the member from Pending to Verified, the same event that sends the "New Member LinkedIn Verified" admin email. A verification that does not change the approval state SHALL NOT post.

#### Scenario: A pending member verifies LinkedIn

- **GIVEN** a member in the Pending state
- **WHEN** the member completes the LinkedIn verification
- **THEN** the `SIGN_UP_AND_VERIFIED` channel gets one message that starts with `✅ LinkedIn verified`

#### Scenario: An approved member connects LinkedIn

- **GIVEN** a member in the Approved state
- **WHEN** the member completes the LinkedIn verification
- **THEN** no message is posted

### Requirement: Post each Job Aspirant sign-up to both channels

A Job Board sign-up with no team assigns the Job Aspirant policy. For it the system SHALL post to the `JOB_ASPIRANT_SIGN_UP` channel and to the `SIGN_UP_AND_VERIFIED` channel. The `SIGN_UP_AND_VERIFIED` message SHALL carry the `💼 Job Aspirant` tag, so it is posted after the policy is assigned. A LinkedIn verification message for a Job Aspirant SHALL carry the same tag. A Job Board sign-up with a team SHALL post only to `SIGN_UP_AND_VERIFIED`.

#### Scenario: A person signs up as a Job Aspirant

- **GIVEN** a Job Board sign-up with no team
- **WHEN** the sign-up completes
- **THEN** the `JOB_ASPIRANT_SIGN_UP` channel gets a message that starts with `💼 New Job Aspirant sign-up`
- **AND** the `SIGN_UP_AND_VERIFIED` channel gets a message that starts with `🆕 New sign-up · 💼 Job Aspirant`

#### Scenario: A person signs up on the Job Board with a team

- **GIVEN** a Job Board sign-up with a selected team
- **WHEN** the sign-up completes
- **THEN** only the `SIGN_UP_AND_VERIFIED` channel gets a message

### Requirement: Message content

Each message SHALL show, one per line: the headline, the name linked to the Directory profile (`WEB_UI_BASE_URL/members/<uid>`), the email, the team names with the main team first, the role, the LinkedIn profile link, the sign-up source (`signUpSource / signUpMedium / signUpCampaign`, empty parts left out), and an "Open in back office" link to the members list searched by email (`level0` tab for a sign-up, `level1` for a LinkedIn verification). A Job Aspirant message SHALL also show the job search status. An empty field SHALL show `-`. Values SHALL be escaped for Telegram HTML.

#### Scenario: A name with angle brackets

- **GIVEN** a member named `Ada <Lovelace>`
- **WHEN** the member signs up
- **THEN** the message shows `Ada &lt;Lovelace&gt;`, so Telegram accepts it

### Requirement: Skip bots and test accounts

The system SHALL NOT post for a member that `isExcludedMember` excludes: sign-up source `system-trending-seed`, or an email at a test domain (`yopmail.com`).

#### Scenario: A QA sign-up with a test email

- **GIVEN** a person signs up with `qa@yopmail.com`
- **WHEN** the sign-up completes
- **THEN** no message is posted

### Requirement: A failed post never fails the flow

A failed post (the notification service is down or refuses the message) SHALL be logged and SHALL NOT fail or delay the sign-up or the LinkedIn verification. Retries after the message is enqueued belong to the notification service outbox.

#### Scenario: The notification service is down

- **GIVEN** the notification service answers HTTP 500
- **WHEN** a person signs up
- **THEN** the sign-up succeeds
- **AND** the failure is logged
