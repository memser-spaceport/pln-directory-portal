## Why

PLAA needs guest and member access levels next to the legacy `plaa.access`, managed by the same integration key and RBAC checks.

## What Changes

- New permissions `plaa.guest` and `plaa.member` (migration, seed, constants).
- `POST /v1/integrations/plaa/members/:memberUid/permissions/{grant,revoke}` with `{"permission": ...}`, limited to the PLAA allowlist.
- Legacy `/access` routes unchanged.

## Capabilities

### New Capabilities
- `plaa-integration`: PLAA permission management through an integration key.

## Impact

`PlaaAccessController`, `PLAA_MANAGEABLE_PERMISSIONS`, one data migration. No schema change.
