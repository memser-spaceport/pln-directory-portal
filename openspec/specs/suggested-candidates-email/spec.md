# suggested-candidates-email Specification

## Purpose
The suggested-candidates email tells a team lead about job-match candidates for a live role.

## Requirements

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
