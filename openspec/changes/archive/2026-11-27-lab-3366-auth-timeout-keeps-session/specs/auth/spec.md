## ADDED Requirements

### Requirement: An invalid refresh token is not an outage

`POST /v1/auth/token` SHALL answer HTTP 401 when the auth service reports error code `EATH004` (invalid or expired refresh token). A timeout, a network error, or an HTTP 5xx from the auth service SHALL stay an HTTP 500. Each call from this API to the auth service SHALL stop after 3 seconds.

#### Scenario: The refresh token is rejected

- **GIVEN** a refresh request whose token the auth service rejects with `EATH004`
- **WHEN** the caller requests `POST /v1/auth/token`
- **THEN** the API answers HTTP 401

#### Scenario: The auth service does not answer

- **GIVEN** a token request
- **WHEN** the auth service times out or answers HTTP 5xx
- **THEN** the API answers HTTP 500
- **AND** the call to the auth service stops after 3 seconds
