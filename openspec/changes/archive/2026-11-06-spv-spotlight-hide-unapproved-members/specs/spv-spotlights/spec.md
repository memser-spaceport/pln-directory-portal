## ADDED Requirements

### Requirement: The public spotlight lists only approved team members

The public spotlight response SHALL list a team member under founders only when that member's approval state is `APPROVED`, the role has no end date, and the role is a team lead or the role text contains "founder". The system SHALL omit pending (L0), verified, and rejected members. This is the same member set the public team profile lists.

#### Scenario: A pending team lead is on the team

- **GIVEN** a team lead whose member approval state is `PENDING`
- **WHEN** a visitor opens the public spotlight for that team
- **THEN** the founders list does not include that member

#### Scenario: An approved founder is on the team

- **GIVEN** a current team member whose role contains "founder" and whose member approval state is `APPROVED`
- **WHEN** a visitor opens the public spotlight for that team
- **THEN** the founders list includes that member
