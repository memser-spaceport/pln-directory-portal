## ADDED Requirements

### Requirement: INV-1. A member reads their own invite link

`GET /v1/members/me/invite-link` SHALL use the existing `UserTokenValidation` guard and resolve only the session member. It SHALL return `{ inviteCode, inviteUrl }` with `Cache-Control: private, no-store`. It SHALL not create a session, change auth data or send analytics events.

#### Scenario: First and repeat requests

- **GIVEN** a signed-in member without a code
- **WHEN** the member requests the link two times
- **THEN** the first request stores one random URL-safe code, and both requests return that code

#### Scenario: Parallel first requests

- **WHEN** two first requests for the same member run at the same time
- **THEN** the unique member constraint keeps one code, and both requests return it

#### Scenario: The request has no valid session

- **WHEN** the requester does not have a valid session
- **THEN** the guard returns 401 and the service stores nothing

#### Scenario: The member is not eligible

- **WHEN** there is no session email, no member, a deleted member or a `Rejected` member
- **THEN** the API answers 403 and stores nothing

### Requirement: INV-2. The link is a standard sign-up URL

`inviteUrl` SHALL be `<WEB_UI_BASE_URL origin>/sign-up?invite=<encoded code>`. The API SHALL not store the URL and SHALL not read the host from the request. The code has no expiry.

#### Scenario: The base URL is not valid

- **WHEN** `WEB_UI_BASE_URL` is missing or is not an absolute http(s) URL
- **THEN** the API answers 500 before it reads or writes the database
