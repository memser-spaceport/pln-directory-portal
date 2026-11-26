# irl-aggregated-data Specification

## Purpose

The public list of aggregated IRL events and gatherings (`GET /v1/irl/aggregated-data`) used by the events cards. A signed-out viewer may see how many people follow a gathering. They may not see who those people are.

## Requirements

### Requirement: A signed-out aggregated read hides subscriber members

`GET /v1/irl/aggregated-data` SHALL answer without a token. For each gathering, a signed-out answer SHALL keep one subscriber entry per active subscriber and SHALL NOT include a member uid, name or photo. A signed-in answer SHALL keep the subscriber members the events cards use today, limited to publicly visible members.

#### Scenario: A signed-out request

- **GIVEN** a gathering with two active subscribers
- **WHEN** a signed-out caller requests `GET /v1/irl/aggregated-data`
- **THEN** that gathering has two subscriber entries
- **AND** the answer has no member uid, name or photo for those subscribers

#### Scenario: A signed-in request

- **GIVEN** a signed-in member
- **WHEN** they request `GET /v1/irl/aggregated-data`
- **THEN** each gathering still includes the subscriber member uid, name and photo the events cards read today
