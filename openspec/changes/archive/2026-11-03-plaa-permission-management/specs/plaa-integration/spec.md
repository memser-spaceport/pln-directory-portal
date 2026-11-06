# plaa-integration Specification

## Purpose

The PLAA service manages its members' PLAA permissions in Directory through an integration key. It can only touch PLAA permissions, and every grant goes through the same RBAC approval checks as Back Office.

## Requirements

### Requirement: PLAA permissions are a fixed allowlist
Directory SHALL register `plaa.access`, `plaa.guest` and `plaa.member` in the permission catalog (module `PLAA`), not attached to any policy. The PLAA integration SHALL manage only the codes in `PLAA_MANAGEABLE_PERMISSIONS`, and every code there SHALL start with `plaa.`. A new PLAA permission becomes manageable only when it is added to that list and to the catalog.

#### Scenario: Non-PLAA permission is rejected
- **WHEN** a PLAA key sends `{"permission": "admin.access"}` or any code outside the allowlist
- **THEN** the API returns 422 and no permission changes

### Requirement: Routes need a PLAA integration key
Every route under `/v1/integrations/plaa` SHALL require an integration key (`Authorization: Bearer <key>`) with the `plaa:access:manage` scope. A missing, unknown or revoked key SHALL get 401; a key without the scope SHALL get 403. The key is checked before the body is validated.

#### Scenario: Key without the scope
- **WHEN** a key with only `jobs:write` calls a PLAA route
- **THEN** the API returns 403 and no permission changes

### Requirement: Generic grant and revoke
`POST /v1/integrations/plaa/members/:memberUid/permissions/grant` and `.../permissions/revoke` SHALL take `{"permission": "<code>"}` and change only that direct permission through `AccessControlV2Service`. Grant SHALL require the member to be APPROVED or VERIFIED (403 otherwise) and SHALL upsert, so a repeated grant keeps one assignment. Revoke SHALL return `removed: false` when the member did not hold the permission. Grant returns `{ ok, permission }`; revoke returns `{ ok, removed, permission }`.

#### Scenario: Permissions are independent
- **WHEN** a member holds `plaa.access`, `plaa.guest` and `plaa.member` and the key revokes `plaa.guest`
- **THEN** the member still holds `plaa.access` and `plaa.member`

#### Scenario: Unapproved member
- **WHEN** the key grants `plaa.member` to a PENDING member
- **THEN** the API returns 403 and nothing is granted

### Requirement: Legacy access routes keep working
`POST` and `DELETE /v1/integrations/plaa/members/:memberUid/access` SHALL keep granting and revoking `plaa.access` with the same checks and responses (`{ ok: true }` and `{ ok, removed }`). Existing `plaa.access` assignments SHALL NOT be migrated to `plaa.member` or `plaa.guest`.

#### Scenario: Legacy grant
- **WHEN** the key calls `POST .../access` for an approved member
- **THEN** the member gets `plaa.access` only and the response is `{ "ok": true }`
