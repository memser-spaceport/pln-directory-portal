# irl-aggregated-data Specification

## Purpose

The public lists of IRL gatherings on `GET /v1/irl/aggregated-data` and `GET /v1/home/featured`. A signed-out viewer sees the gatherings and their events. They do not see who follows a gathering or who is a guest.

## Requirements

### Requirement: A signed-out location list hides members

`GET /v1/irl/aggregated-data` and `GET /v1/home/featured` SHALL answer without a token. For each gathering, a signed-out answer SHALL set `subscribers` to `[]`. It SHALL also set `eventGuests` to `[]` on that gathering's `events`, `pastEvents` and `upcomingEvents`. The answer SHALL NOT include a member uid, name or image inside `locations`. A signed-in answer SHALL keep today's subscriber and guest members. The internal aggregated route SHALL keep the full list.

#### Scenario: A signed-out request

- **GIVEN** a gathering with two subscribers and a guest on a past event
- **WHEN** a signed-out caller requests either route
- **THEN** that gathering has `subscribers` `[]`
- **AND** each of its event lists has `eventGuests` `[]`
- **AND** `locations` has no member uid, name or image

#### Scenario: A signed-in request

- **GIVEN** a signed-in member
- **WHEN** they request either route
- **THEN** each gathering still includes the subscriber and guest member uid, name and image the cards read today
