## ADDED Requirements

### Requirement: Digest email settings from the signed link

`POST /v1/labos-digest/email-settings/read` with `{ token }` SHALL return `{ firstName, enabled, frequency }` for the member in the token: `enabled` is the member's `forumDigestEnabled` and `frequency` is `daily` for `forumDigestFrequency` 1 and `weekly` for 7. A member with no stored setting SHALL read as enabled and daily, the notification service's defaults. Reading SHALL change nothing.

`POST /v1/labos-digest/email-settings` with `{ token, enabled?, frequency? }` SHALL save the given fields for the member in the token through the notification service, the same store the signed-in email settings page writes, and return the settings after the change. At least one of `enabled` and `frequency` SHALL be present; otherwise the call returns 400. Both endpoints SHALL check the token as the page read does and act only on the member in `m`, whoever is signed in.

#### Scenario: Read

- **GIVEN** a member whose digest is on and weekly
- **WHEN** the read is called with a valid link for them
- **THEN** it returns `enabled: true` and `frequency: 'weekly'` and changes nothing

#### Scenario: Unsubscribe and undo

- **WHEN** the change is called with a valid link and `enabled: false`
- **THEN** the member's `forumDigestEnabled` is false and the response says `enabled: false`
- **WHEN** it is called again with `enabled: true`
- **THEN** the digest is on again with the frequency it had

#### Scenario: Switch frequency

- **WHEN** the change is called with a valid link and `frequency: 'weekly'`
- **THEN** the member's `forumDigestFrequency` is 7 and the digest stays on or off as it was

#### Scenario: Expired link

- **GIVEN** a link issued 91 days ago
- **WHEN** the read or the change is called with it
- **THEN** the call returns 401 with the reason `expired` and nothing changes

#### Scenario: Signed in as someone else

- **GIVEN** a request that also carries another member's session
- **WHEN** the change is called with a valid link
- **THEN** only the member in the link changes

### Requirement: One-click unsubscribe

`POST /v1/labos-digest/unsubscribe?t=<token>` SHALL turn the digest off (`forumDigestEnabled: false`) for the member in the token and answer 200 with no body, as RFC 8058 asks of a `List-Unsubscribe-Post` target. It SHALL accept the form body `List-Unsubscribe=One-Click` and SHALL NOT require it. It SHALL check the token as the page read does. It SHALL NOT answer GET, so a link scanner that only opens URLs changes nothing.

#### Scenario: Gmail's unsubscribe button

- **WHEN** a mail client posts `List-Unsubscribe=One-Click` to the endpoint with a valid link's token
- **THEN** the member's digest is off and the response is 200

#### Scenario: Already off

- **GIVEN** a member whose digest is off
- **WHEN** the endpoint is called with a valid link
- **THEN** it answers 200 and the digest stays off

#### Scenario: Bad link

- **WHEN** the token's signature does not match
- **THEN** the call returns 401 and nothing changes
