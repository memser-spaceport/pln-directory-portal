## Why

A load-balancer timeout made the sign-in check fail. The directory API turned that failure, and an invalid refresh token (`EATH004`), into HTTP 500. The web app then cleared the session (LAB-3366).

## What Changes

- `POST /v1/auth/token` answers HTTP 401 when the auth service reports `EATH004`.
- A timeout or an HTTP 5xx from the auth service stays HTTP 500.
- Each directory API call to the auth service stops after 3 seconds.

## Capabilities

### New Capabilities

- `auth`: which auth-service answers end a session, and how long a call to the auth service may wait.

## Impact

- `POST /v1/auth/token` for `grantType: refresh_token`. Callers that treated every non-2xx as an outage can now treat 401 as a rejected token.
