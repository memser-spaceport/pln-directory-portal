---
date: 2026-04-23
topic: add-edit-member-dialog-rbac-fields
---

# Add/Edit Member Dialog — RBAC Fields at Top

## What We're Building

Both the "Add new member" and "Edit member" dialogs gain four new fields at the very top, before the existing form (Name, Email, etc.):

1. **Status** — single-select dropdown: Pending / Verified / Approved / Rejected. This is a NEW dropdown; the existing L0-L6 `StatusSelector` (which sets `accessLevel`) stays unchanged below.
2. **Roles** — multi-select: Directory Admin, Infra Team, Demo Day Admin, Demo Day Stakeholder, Founder, Investor, Unassigned, Advisor (sourced from `GET /v1/admin/rbac/roles` via `useRbacRoles`)
3. **Groups** — multi-select: PL Internal, PL Partner, PLC-PLVS, PLC-Crypto, etc. (sourced from `GET /v2/admin/access-control-v2/policies` — needs new `usePoliciesList` hook)
4. **Permissions exceptions** (Optional) — multi-select + warning banner when non-empty (sourced from `GET /v1/admin/rbac/permissions` via `useRbacPermissions`)

Constraint from design: **"Roles and groups can only be assigned to Approved members."** → Roles, Groups, Exceptions are disabled when Status ≠ "Approved".

## Why This Approach

### Reuse `RbacSection` with minor updates

The `RbacSection` component (`screens/members/components/MemberForm/RbacSection/RbacSection.tsx`) already implements multi-selects for `rbacRoles`, `rbacGroups`, `rbacExceptions`, group auto-pruning when roles change, and the exceptions warning banner. Its internal structure matches the design almost exactly.

**Changes needed to `RbacSection`:**
- Replace the internal `StatusSelector` (L0-L6) call with a new simplified Status dropdown (Pending/Verified/Approved/Rejected)
- The new Status is stored in a new form field `memberStateStatus` (separate from `accessLevel`)
- Pass `isApproved` (derived from `memberStateStatus === 'Approved'`) to disable/enable the RBAC multi-selects

**Why not a separate new component?** `RbacSection` already has the structure, styles, group-pruning logic, and `usePoliciesList` import. Starting fresh would duplicate all of that.

### Submission strategy: sequential API calls after member create/edit

The existing `useAddMember` / `useUpdateMember` hooks submit member profile data (no RBAC fields). After successful submission, if `memberStateStatus === 'Approved'`, make additional RBAC calls:
- `useAssignRole` for each selected role
- `useAssignPolicy` for each selected group/policy
- `useGrantDirectPermissionV2` for each exception

For EditMember: diff current vs. new RBAC data; revoke removed assignments before assigning new ones (`useRevokePolicy` for removed policies, no revoke hook for roles yet — check if needed).

## Key Decisions

- **New Status field**: Stored as `memberStateStatus: 'Pending' | 'Verified' | 'Approved' | 'Rejected' | null` in `TMemberForm`. Separate from `accessLevel` (L0-L6). Controls RBAC field enablement only — does NOT replace the existing `StatusSelector`.
- **RbacSection placement**: Rendered at the top of `MemberForm`, above all existing sections (ProfileDetails, AdditionalDetails, etc.)
- **RBAC fields in `TMemberForm`**: Add `rbacRoles`, `rbacGroups`, `rbacExceptions` (all `{ label, value }[]`) and `memberStateStatus` — RbacSection already references them, just need to add to the type.
- **`usePoliciesList` hook**: Must be created — calls `GET /v2/admin/access-control-v2/policies`, returns `Policy[]` with at minimum `{ uid, code, name, role }` shape. Import path already declared in `RbacSection.tsx:9`.
- **Roles options**: From `useRbacRoles` → `{ code, name }[]` → mapped to `{ label: name, value: code }[]`
- **Groups options**: From `usePoliciesList` → filtered/mapped to `{ label: name, value: code }[]`
- **Exceptions options**: From `useRbacPermissions` → `{ code, description }[]` → `{ label: description ?? code, value: code }[]`
- **Edit mode initial values**: Pre-populate from `member.roles[]`, `member.policies[]`, `member.permissions[]` (already on the `Member` type after today's type fix)

## Open Questions

- What is the exact shape of `Policy` returned by `GET /v2/admin/access-control-v2/policies`? (Need to read the API response schema to type `usePoliciesList` correctly.)
- For EditMember: is there a `useRevokeRole` / `useUnassignRole` hook? Or only `useRevokePolicy`? If missing, role revocation may need to be addressed separately.
- When "Approved" is selected in the new Status dropdown, should the existing L0-L6 dropdown auto-select a default value (e.g., L4)?

## Next Steps

→ `/workflows:plan` for implementation details
