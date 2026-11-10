## ADDED Requirements

### Requirement: A blurb failure does not fail the run
When the blurb call for a role fails after its retries, the run SHALL still save that role's ranked candidates with an empty blurb and continue. The team SHALL still be able to finish, and a run with no other team failures SHALL be `COMPLETED` and SHALL start the email.

#### Scenario: Platform Lead blurbs do not parse
- **WHEN** the blurb JSON for one role fails after its retries
- **THEN** that role is saved with its ranked candidates and empty blurbs
- **AND** the run continues with the next role
