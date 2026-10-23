## Purpose

The office-hours module records meeting interactions and checks each member's office-hours booking link, storing the result as the member's office-hours status.

## ADDED Requirements

### Requirement: Link check status

The link check SHALL return `NOT_FOUND` for an empty link, `OK` when the link answers with a status from 200 to 399, and `BROKEN` for any other status, a timeout or a network error. A link with no scheme SHALL get `https://`. The member check-link endpoint, the admin batch check, the member link update and the per-member check SHALL all use this check.

#### Scenario: A public link answers 200

- **GIVEN** a member link `https://calendly.com/someone` that resolves to a public address
- **WHEN** the link is checked
- **THEN** the status is `OK`

#### Scenario: A public link answers 404

- **GIVEN** a public link that answers 404
- **WHEN** the link is checked
- **THEN** the status is `BROKEN`

### Requirement: Only public https links are fetched

The link check SHALL send a request only to an https URL on the default port whose host is a name (not an IP literal, not `localhost`) that resolves only to public addresses. The request SHALL connect to the checked address. A link that fails SHALL be `BROKEN` and SHALL get no request. Loopback, private, link-local, CGNAT, unique-local, IPv4-mapped, documentation, benchmarking, multicast and unspecified addresses are not public.

#### Scenario: A link to an internal address

- **GIVEN** a link `https://169.254.169.254/latest/meta-data`, `http://calendly.com/x`, `https://calendly.com:8443/x` or `https://localhost/`
- **WHEN** the link is checked
- **THEN** the status is `BROKEN`
- **AND** the server sends no request

#### Scenario: A host name that resolves to a private address

- **GIVEN** a link whose host name resolves to `10.0.0.5`
- **WHEN** the link is checked
- **THEN** the status is `BROKEN`
- **AND** the server sends no request

### Requirement: Each redirect is checked

The link check SHALL follow redirects by hand, at most 5, and SHALL check each redirect target with the same rule before it sends the request. A redirect to a target that fails, or a sixth redirect, SHALL make the status `BROKEN`, and the failing target SHALL get no request.

#### Scenario: A public link redirects to a private address

- **GIVEN** a public link that redirects to `https://169.254.169.254/`
- **WHEN** the link is checked
- **THEN** the status is `BROKEN`
- **AND** the server sends no request to the redirect target

#### Scenario: Too many redirects

- **GIVEN** a public link that redirects more than 5 times
- **WHEN** the link is checked
- **THEN** the status is `BROKEN`
