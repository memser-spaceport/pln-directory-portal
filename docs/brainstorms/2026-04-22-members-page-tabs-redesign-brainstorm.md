# Members Page Tabs Redesign — Brainstorm

**Date:** 2026-04-22  
**Status:** Ready for planning

---

## What We're Building

Replace the current icon-based access-level filter on the Members page with a 5-tab layout. Each tab shows a different view of member data, with tab-specific columns and filters. The Policies tab breaks away from the member pattern entirely and shows policy definitions.

---

## Tabs & Data Sources

| Tab | Filter | Data Source | Special Columns |
|-----|--------|-------------|-----------------|
| Pending Members | `memberState === "PENDING"` | `useMembersList` (all) | Member, Team/Project, Actions |
| Verified Members | `memberState === "VERIFIED"` | `useMembersList` (all) | Member, Team/Project, Actions |
| Approved Members | `memberState === "APPROVED"` | `useMembersList` (all) | Member, Team/Project, **Role, Group, Exceptions**, Actions |
| Policies | — | `GET /v2/admin/access-control-v2/policies` | Policy, Role, Group, Description, Modules, Members count, Action |
| Rejected Members | `memberState === "REJECTED"` | `useMembersList` (all) | Member, Team/Project, Actions |

---

## Approach: Fetch All, Filter Client-Side

**Decision:** Fetch all members in one call (no `accessLevel` filter), then filter locally by `memberState` for each tab.

**Why:**
- Simpler than 5 separate API calls
- Tab counts can all be derived from a single data source (no count endpoint needed)
- Works today without any backend changes
- Straightforward to change to server-side filtering later if performance becomes an issue

**Tradeoff:** If the member list is very large (3000+), filtering/rendering could slow down. Pagination is already in place which mitigates most of this.

---

## Column Breakdown

### Pending / Verified / Rejected Tabs
Simple 3-column layout:
- **Member** — avatar, name, email, external link icon (existing `MemberCell`)
- **Team/Project** — blue badges with org/project icons (existing `ProjectsCell`)
- **Actions** — Edit button (existing `EditCell`)

### Approved Members Tab
5-column layout with filter dropdowns in the control bar:
- **Member** — same as above
- **Team/Project** — same as above
- **Role** — derived from `roles[].name` (may be multiple per member, stacked)
- **Group** — derived from `policies[].group` (the group each policy belongs to)
- **Exceptions** — direct permissions outside any policy; shown as orange warning badge
- **Actions** — Edit button

Control bar additions: **"All groups"** and **"All roles"** select dropdowns for client-side filtering.

### Policies Tab
Completely different table using `GET /v2/admin/access-control-v2/policies`:
- **Policy** — icon + policy name (`policy.name`)
- **Role** — `policy.role`
- **Group** — `policy.group` as a grey badge
- **Description** — `policy.description`
- **Modules** — `policy.policyPermissions[].permission.code` shown as chips, overflow with `+N`
- **Members** — member count (needs API to return this, or compute separately)
- **Action** — "View" button → links to policy detail page

Control bar: **"All roles"** and **"All groups"** select dropdowns.

---

## Data Model Changes

### `Member` type needs new fields
```ts
memberState: 'PENDING' | 'VERIFIED' | 'APPROVED' | 'REJECTED' | string;
roles: { uid: string; code: string; name: string; description: string }[];
policies: { uid: string; code: string; name: string; role: string; group: string }[];
effectivePermissions: { uid: string; code: string; description: string }[];
effectivePermissionCodes: string[];
```

Currently `roles` is typed as `string[]` — needs update to full objects.

### New `Policy` type
```ts
type Policy = {
  uid: string;
  code: string;
  name: string;
  description: string | null;
  role: string;
  group: string;
  isSystem: boolean;
  policyPermissions: { permission: { uid: string; code: string; description: string } }[];
  memberCount?: number;
};
```

### New hook: `usePoliciesList`
```ts
GET /v2/admin/access-control-v2/policies
→ Policy[]
```

---

## Tab Counts

Since we're fetching all members, counts are derived client-side:
```ts
const counts = {
  pending: allMembers.filter(m => m.memberState === 'PENDING').length,
  verified: allMembers.filter(m => m.memberState === 'VERIFIED').length,
  approved: allMembers.filter(m => m.memberState === 'APPROVED').length,
  rejected: allMembers.filter(m => m.memberState === 'REJECTED').length,
  policies: policiesData?.length ?? 0,
};
```

The current `useAccessLevelCounts` hook is no longer needed once this is in place.

---

## Approved Tab: Exceptions Column

"Exceptions" = permissions a member has that are **not** covered by their assigned policies.

Logic: `effectivePermissionCodes` minus the union of all `policyPermissions` from the member's policies. Any leftover permissions are exceptions, shown as orange badge chips.

---

## Open Questions

1. **Members count on Policies tab** — does `GET /v2/admin/access-control-v2/policies` already include a member count per policy, or does it need to be added? The screenshot shows a "Members" column with numbers (22, 23, 26...).

2. **Group/Role on empty policies[]** — the sample member has `"policies": []`. Do approved members always have policies? Or do some have roles without a matching policy (i.e., direct role grants)? How should Group display in that case?

3. **Policy detail page** — the "View" button on the Policies tab should link somewhere. Does a policy detail page exist? (`/access-control/policies/[code]`?)

4. **useMembersList call** — does the current endpoint return `memberState` when called without an `accessLevel` filter? May need a small backend confirmation before implementation.

---

## Files Affected

| File | Change |
|------|--------|
| `screens/members/types/member.ts` | Add `memberState`, update `roles` type, add `policies[]` |
| `hooks/members/useMembersList.ts` | Fetch without `accessLevel` (or with all values) |
| `hooks/access-control/usePoliciesList.ts` | New hook for policies API |
| `pages/members/index.tsx` | Tab routing, pass data to tab-specific tables |
| `screens/members/hooks/useMembersTable.tsx` | Add `approved` mode with Role/Group/Exceptions columns |
| `screens/members/components/` | New: `RoleCell`, `GroupCell`, `ExceptionsCell`, `PolicyRow` |
| `pages/members/styles.module.scss` | Minor: control bar filter dropdowns |
