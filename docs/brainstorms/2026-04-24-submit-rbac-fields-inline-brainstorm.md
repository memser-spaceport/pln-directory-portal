---
date: 2026-04-24
topic: submit-rbac-fields-inline
---

# Inline RBAC Fields on Member Create/Update Payload

## What We're Building

Add `roleCodes`, `policyCodes`, and `permissionCodes` as optional fields to the member create and update API payloads in `AddMember` and `EditMember`. The backend now (or will) accept these inline, enabling a single atomic request instead of the current waterfall of separate `assignPolicy` / `grantPermission` calls after member creation.

## Current Flow (Problem)

`AddMember.onSubmit`:
1. POST `/v1/admin/members/create` — creates member (no RBAC)
2. POST `assign-policy` × N — assign each matched policy
3. POST `member-permissions` × N — grant each permission exception

`EditMember.onSubmit`:
1. PATCH `/v1/admin/members/edit/:uid` — updates member (no RBAC)
2. POST `assign-policy` / DELETE `revoke-policy` × N — diff-based policy changes
3. POST `member-permissions` × N — new exception grants

Problems: non-atomic (partial failures leave member in broken state), extra round trips, EditMember's diff-based revoke logic is complex.

## Why This Approach

Sending RBAC data inline lets the backend handle assignment atomically. One request → consistent member state. The existing separate-call logic can be removed after the backend confirms it reads these fields.

## Key Decisions

- **Replace, don't supplement**: Remove the separate `assignPolicy` / `grantPermission` / `revokePolicy` calls from both submit handlers. The payload fields take over entirely. The hooks (`useAssignPolicy`, `useRevokePolicy`, `useGrantDirectPermissionV2`) stay in the codebase for other use but are removed from these two callers.
- **`policyCodes`**: same computation already in place — `policiesData.filter(p => roleValues.includes(p.role) && groupValues.includes(p.group)).map(p => p.code)`. Sent only when `isApproved`.
- **`permissionCodes`**: `rbacExceptions.map(e => e.value)`. Sent only when `isApproved`.
- **`roleCodes`**: derive from matched policies → `[...new Set(matchedPolicies.map(p => ???))]`. Open question below.
- **Hook payload types**: add `roleCodes?: string[]`, `policyCodes?: string[]`, `permissionCodes?: string[]` to `MutationParams.payload` in `useAddMember.ts` and `useUpdateMember.ts`. TypeScript guards the contract.
- **EditMember revoke**: no more manual diff; the backend receives the full new set of `policyCodes` and handles revocation internally. Remove `initialPolicyCodesRef`, `policiesToRevoke`, and related diff logic.

## Open Questions

1. **`roleCodes` source**: `Policy` has `role: string` (name) but the `useAssignRole` hook uses `roleCode` (from `useRbacRoles` which returns `r.code`). What should `roleCodes` contain — role name strings (e.g. `"Directory Admin"`) or role codes (e.g. `"directory_admin"`)? If codes are needed, we must re-introduce a role code lookup. If names are treated as codes by the backend, `matchedPolicies.map(p => p.role)` works without extra hooks.

2. **Backend status for EditMember revoke**: does the backend accept a full `policyCodes` replacement set (replacing all existing policies) or an additive list? If additive, we still need the diff + revoke logic.

## Next Steps

→ `/workflows:plan` for implementation details
