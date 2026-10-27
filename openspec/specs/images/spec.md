# images Specification

## Purpose

The API stores an uploaded image and returns its record. Sign-up and onboarding upload before a member account exists. Back-office and the events service upload with their own credentials.

## Requirements

### Requirement: Anonymous image upload has a per-IP limit

`POST /v1/images` SHALL accept an upload with no member token. The system SHALL limit that route to 60 requests per 60 seconds for one IP on one pod. A request over the limit SHALL answer 429. The directory profile, team and rich-text uploads SHALL keep using this route.

#### Scenario: Sign-up uploads a photo

- **WHEN** a caller posts a file to `POST /v1/images` with no member token
- **THEN** the upload is accepted
- **AND** the route does not require a member, admin or service credential

#### Scenario: One IP exceeds the limit

- **WHEN** one IP sends more than 60 requests to `POST /v1/images` within 60 seconds
- **THEN** the response status is 429

### Requirement: Back-office image upload requires an admin credential

`POST /v1/admin/images` SHALL require `AdminAuthGuard`. A request with no admin token SHALL answer 401. A token that is not an admin token SHALL answer 401. A token that lacks `directory.admin.full` SHALL answer 403.

#### Scenario: A caller with no admin token is refused

- **WHEN** a caller posts a file to `POST /v1/admin/images` with no `Authorization` header
- **THEN** the response status is 401

#### Scenario: An admin uploads an image

- **WHEN** a caller posts a file to `POST /v1/admin/images` with a valid admin token that includes `directory.admin.full`
- **THEN** the upload is accepted

### Requirement: Events-service image upload requires the service key

`POST /v1/service/images` SHALL require `ServiceAuthGuard`. The caller SHALL send `Authorization: Basic <INTERNAL_SERVICE_SECRET>` or `Authorization: Bearer <INTERNAL_SERVICE_SECRET>`. A missing or wrong secret SHALL answer 401. This route SHALL not use the member rate limiter.

#### Scenario: A caller with no service key is refused

- **WHEN** a caller posts a file to `POST /v1/service/images` with no `Authorization` header
- **THEN** the response status is 401

#### Scenario: The events service uploads an image

- **WHEN** a caller posts a file to `POST /v1/service/images` with the service secret
- **THEN** the upload is accepted
