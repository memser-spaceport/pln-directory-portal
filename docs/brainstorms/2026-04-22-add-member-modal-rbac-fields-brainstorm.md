# Add New Member Modal — RBAC Fields

**Date:** 2026-04-22  
**Status:** Ready for planning

---

## What We're Building

Update the "Add new member" modal to include RBAC assignment at creation time. Currently the modal only sets the member's access level and profile details — admins have to navigate to a separate screen to assign roles/policies after creation. The redesigned modal adds Status, Roles, Groups, and Permissions exceptions fields at the top so a member can be fully provisioned in one flow.

---

## New Fields (at top of modal, before profile details)

| Field | Type | Behavior |
|-------|------|----------|
| **Status** * | Single-select dropdown | Maps to existing access level (L0–L6, Rejected). Replaces the current StatusSelector position in the form. |
| **Roles** * | Multi-select dropdown | Lists RBAC roles from `GET /v1/admin/rbac/roles`. Disabled when Status ≠ Approved. |
| **Groups** * | Multi-select dropdown | Lists unique group values from `GET /v2/admin/access-control-v2/policies`. Disabled when Status ≠ Approved. |
| **Permissions exceptions** | Section | Zero or more direct permissions, added one-by-one via a searchable permission picker. Shows warning banner. |

**Hint text under Status:** "Roles and groups can only be assigned to Approved members."  
**Warning banner in exceptions section:** "Exceptions grant permissions outside of assigned policies. Use only for temporary or one-off cases."

---

## Role × Group = Policy

When the admin selects roles `[R1, R2]` and groups `[G1, G2]`, the submit flow finds matching policies:

```
policies where (policy.role ∈ selectedRoles) AND (policy.group ∈ selectedGroups)
```

Each matched policy is then assigned via `POST /v2/admin/access-control-v2/assign-policy`.

Example: Role = "Director Admin", Group = "PL Internal" → assigns policy `director_admin_pl_internal`.

---

## Groups Dropdown Options

From Image 4, the group values visible in the dropdown:
- PL Internal, PL Partner, PLC-PLVS, PLC-Crypto, PLC-Founder Forge, PLC-Neuro, PLN Close Contributor, PLC Other, PLN Other, PL

These are derived at runtime by extracting `[...new Set(policies.map(p => p.group))]` from the policies list.

---

## Permissions Exceptions Flow

1. Admin clicks **+ Add Exception**
2. A searchable dropdown opens, listing all permissions from `GET /v1/admin/rbac/permissions`
3. Selecting a permission adds it as a chip in the exceptions list
4. Can repeat to add multiple
5. On submit, each exception is granted via `POST /v2/admin/access-control-v2/member-permissions`

---

## Submit Sequence (Multi-step)

```
Step 1: POST /v1/admin/members/create
        payload: { name, email, accessLevel, joinDate, bio, ... }
        → returns { uid: memberUid }

Step 2 (if status is Approved AND roles + groups selected):
        for each matched policy (role × group cross-product from policies list):
          POST /v2/admin/access-control-v2/assign-policy
          { memberUid, policyCode, assignedByUid }

Step 3 (if exceptions added):
        for each exception permissionCode:
          POST /v2/admin/access-control-v2/member-permissions
          { memberUid, permissionCode, grantedByUid }
```

All steps run sequentially after member creation. If step 2 or 3 fails, the member is already created — show a partial-success toast and allow retry.

---

## Conditional Field Behavior

- Roles and Groups dropdowns are **disabled** (greyed out, not clickable) when Status is not an Approved access level (L2–L6)
- Exceptions section is always visible but the "+ Add Exception" button is only active for Approved status
- When Status changes away from Approved, clear any selected roles, groups, and exceptions (or keep them but warn)

---

## Affected Files

| File | Change |
|------|--------|
| `screens/members/components/MemberForm/MemberForm.tsx` | Add RBAC section at top; wire new fields |
| `screens/members/components/MemberForm/helpers.ts` | Extend Yup schema with roles, groups, exceptions |
| `screens/members/components/MemberForm/MemberForm.module.scss` | Styles for RBAC section and exceptions banner |
| `screens/members/components/AddMember/AddMember.tsx` | Multi-step onSubmit: create → assign policies → grant exceptions |
| `screens/members/types/member.ts` | TMemberForm type: add `roles`, `groups`, `exceptions` fields |
| New: `RbacFieldsSection/RbacFieldsSection.tsx` | Optional sub-component for the Status/Roles/Groups/Exceptions block |

---

## Data Dependencies

| Data | Source | Hook |
|------|--------|------|
| Roles list | `GET /v1/admin/rbac/roles` | `useRbacRoles` (existing) |
| Policies list (for groups) | `GET /v2/admin/access-control-v2/policies` | `usePoliciesList` (existing) |
| Permissions list (for exceptions) | `GET /v1/admin/rbac/permissions` | `useRbacPermissions` (existing) |

---

## Open Questions

1. **Status options**: Does "Select status" keep the existing L0–L6 granularity, or does it simplify to Pending / Verified / Approved / Rejected? The current form filters out L0, L1, Rejected for new member creation.

2. **Roles required?**: The design marks Roles and Groups with `*` (required). But what if no matching policy exists for a role × group combination? Should the form validate that at least one policy match exists before submit?

3. **Partial success handling**: If member creation succeeds but policy assignment fails (network error), what should the UX show? A toast with "Member created, but policy assignment failed — please assign manually."?

4. **Edit Member modal**: Should the same RBAC fields appear in the Edit Member form (`EditMember` component)?
