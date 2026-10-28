## Why

LAB-2985: `POST /v1/images` had no credential that every current caller can send. Sign-up and onboarding upload before a member account exists. Back-office and the events service upload without a member token.

## What Changes

- `POST /v1/images` stays open for sign-up, onboarding and directory profile, team and rich-text uploads. The route allows 60 requests per 60 seconds per IP per pod.
- `POST /v1/admin/images` requires `AdminAuthGuard`. Back-office uploads use this route and send the admin token.
- `POST /v1/service/images` requires `ServiceAuthGuard` (`INTERNAL_SERVICE_SECRET`). The events service uses this route. The route is outside the member rate limiter.
- A caller that uses an admin or service route without the matching credential is refused.

## Capabilities

### New Capabilities

- `images`: who may upload an image, and the per-IP limit on the anonymous route.

## Impact

Directory profile, team and rich-text uploads stay on `POST /v1/images`. An events-service client that still posts to `POST /v1/images` keeps working and counts against the per-IP limit. That client must move to `POST /v1/service/images` and send the service secret. Size, content and temp-file cleanup are not in this change.
