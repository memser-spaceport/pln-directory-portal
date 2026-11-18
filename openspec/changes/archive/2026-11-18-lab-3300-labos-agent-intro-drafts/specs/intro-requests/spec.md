## MODIFIED Requirements

### Requirement: Only portfolio teams and PL Infra can send

A member who is not a current member of a portfolio team and is not assigned the PL Infra policy SHALL receive HTTP 403. A current membership has no end date, or an end date that is still ahead. The system SHALL NOT store that request.

One public method, `IntroRequestsService.findEligibleRequester`, SHALL hold this rule. `POST /v1/intro-requests` and the LabOS agent `draft_intro` tool (LAB-3300) SHALL both use it, so both give the same result for the same member. The target lookup `IntroRequestsService.findTargetName` SHALL also be shared. `IntroRequestsModule` SHALL export `IntroRequestsService`.

#### Scenario: Another member sends

- **GIVEN** a signed-in member with no current portfolio team and no PL Infra policy
- **WHEN** the member posts an intro request
- **THEN** the response is HTTP 403
- **AND** no request is stored
