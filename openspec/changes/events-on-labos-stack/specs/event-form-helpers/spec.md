# Spec Delta

## Purpose

Small lookups the event submit form needs while a member fills it in: place suggestions, a place's address and time zone, and an agenda turned into sessions. Each keeps a key on the server.

## ADDED Requirements

### Requirement: The form can look up venues

The system SHALL serve `GET /v1/irl/events/places?query=` for a signed-in member. It SHALL return up to 5 place suggestions of any kind (venues and addresses, not only cities), each with its text and a place id. An empty query SHALL answer 400.

#### Scenario: A street name

- **WHEN** the form asks for `query=Avenida da Liberdade`
- **THEN** the response lists suggestions with a text and a place id

#### Scenario: Empty query

- **WHEN** the form asks with an empty `query`
- **THEN** the response is 400

### Requirement: The form can resolve a place

`GET /v1/irl/events/places/resolve` SHALL accept a place id or an address text and SHALL return the formatted address, city, region, country, latitude, longitude, a map link and the place's IANA time zone. A text that matches no place SHALL answer 404. A failed time zone lookup SHALL return the place with a null time zone.

#### Scenario: A venue in Tokyo

- **WHEN** the form resolves a venue in Tokyo
- **THEN** the response has city Tokyo, a position, a map link and time zone `Asia/Tokyo`

#### Scenario: Unknown text

- **WHEN** the form resolves "zzzz qqqq"
- **THEN** the response is 404

### Requirement: The form can turn agenda text into sessions

`POST /v1/irl/events/agenda/parse` SHALL accept agenda text with the event's start, end and time zone, and SHALL return sessions (name, optional description, start and end as instants) or a message that says what is missing. A session with no end SHALL last one hour. A multi-day event whose text names no dates SHALL get a message asking for dates. The model key SHALL stay on the server.

#### Scenario: A one-day agenda

- **GIVEN** an event on Jan 28 in Europe/Lisbon
- **WHEN** the text "10:00 AM - 10:30 AM Opening Ceremony" is parsed
- **THEN** the response has one session named "Opening Ceremony" from 10:00 to 10:30 Lisbon time

#### Scenario: Text with no times

- **WHEN** the text "Opening ceremony, then lunch" is parsed
- **THEN** the response has no sessions and a message that times are missing

#### Scenario: The model is not available

- **WHEN** the parse request cannot reach the model
- **THEN** the response is 503 and the form keeps the text

### Requirement: The lookups need a signed-in member

Each lookup route SHALL require a user token, because the submit form is for signed-in members. A request with no user token SHALL answer 401 and SHALL NOT call Google or the model.

#### Scenario: A lookup with no session

- **WHEN** `GET /v1/irl/events/places?query=Lisbon` is called with no user token
- **THEN** the response is 401
