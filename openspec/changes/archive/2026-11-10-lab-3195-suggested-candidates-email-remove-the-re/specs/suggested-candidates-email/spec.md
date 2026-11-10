## MODIFIED Requirements

### Requirement: Role sections and cards

Each role section SHALL show its title, a "View role" link to the public posting, and "N matches · none have applied" (or "1 has applied" / "N have applied"), then up to two cards, then an "All N matches for this role" button to the role's Suggested tab. A card SHALL show the photo or initials, name, match pill, "role · company, location", one "Why" line and "View profile". The email SHALL have no requirements count, no "Review all" button and no Edit criteria link.

#### Scenario: A lead reads a card

- **GIVEN** a suggested member with a blurb who meets 4 of the role's 5 requirements
- **WHEN** the lead reads the email
- **THEN** the card shows the blurb as one line
- **AND** the card does not show "4 of 5 requirements"

#### Scenario: Each role ends with its button

- **GIVEN** a lead whose email covers three roles
- **WHEN** the lead reads the email
- **THEN** each role section ends with its own "All N matches for this role" button, where N is that role's match count
- **AND** no "Review all" button follows the last role

#### Scenario: A role with one match

- **GIVEN** a role with exactly 1 match
- **WHEN** the lead reads the email
- **THEN** the role's button reads "All 1 match for this role"
