---
title: "feat: RBAC form roles and groups from usePoliciesList"
type: feat
date: 2026-04-23
---

# feat: RBAC Form Roles & Groups from usePoliciesList

## Overview

Replace `useRbacRoles` in `MemberForm` with role options derived directly from `usePoliciesList`. Show group options as React-Select grouped options organised by role, filtered to only the selected roles. Fix two existing silent bugs where role codes were used in contexts that expected role name strings, causing submit and group-validation to silently produce empty results.

---

## Problem Statement

`MemberForm` makes two separate API calls to populate the RBAC section:

1. `useRbacRoles` → `/v1/admin/rbac/roles` — role option **value = `r.code`** (e.g. `"directory_admin"`)
2. `usePoliciesList` → `/v2/admin/access-control-v2/policies` — `p.role` is a **name string** (e.g. `"Directory Admin"`)

This code/name mismatch causes two silent bugs:

**Bug 1 — Submit never assigns any policies**

```ts
// AddMember.tsx:107 / EditMember.tsx:156
const roleValues = (formData.rbacRoles ?? []).map((r) => r.value); // ["directory_admin"]
const matchedPolicies = policiesData.filter(
  (p) => roleValues.includes(p.role) // p.role = "Directory Admin" — never matches!
);
// matchedPolicies is always empty → no policies are ever assigned
```

**Bug 2 — Group removal warning never fires**

```ts
// RbacSection.tsx:163
const isValid = policiesData.some(
  (p) => newRoleValues.includes(p.role) // same mismatch — groups never removed
);
```

**Bug 3 — EditMember pre-populates roles with codes instead of names**

```ts
// EditMember.tsx:210
const rbacRoles = (member.roles ?? []).map((r) => ({ label: r.name, value: r.code }));
// value = r.code → form loads with wrong values → submit still produces empty matchedPolicies
```

---

## Proposed Solution

1. **Drop `useRbacRoles`.** Derive role options from `usePoliciesList`: unique, sorted `policy.role` name strings. Values are role name strings, matching what the submit logic already expects.

2. **Grouped group options.** Replace the flat `groupsOptions` array with React-Select grouped options computed inside `RbacSection`, filtered to only the roles currently selected in the form.

3. **Fix EditMember initial data.** Derive `rbacRoles` from `assignedPolicies` (same way `rbacGroups` already works) instead of from `member.roles`.

---

## Technical Approach

### Role options (MemberForm.tsx)

```ts
// Remove:
const { data: rbacRolesData, isLoading: rolesLoading } = useRbacRoles({ authToken });
const rolesOptions = useMemo(
  () => (rbacRolesData ?? []).map((r) => ({ label: r.name, value: r.code })),
  [rbacRolesData]
);

// Add:
const rolesOptions = useMemo(
  () =>
    [...new Set((policiesData ?? []).map((p) => p.role).filter(Boolean))]
      .sort()
      .map((r) => ({ label: r, value: r })),
  [policiesData]
);

// Remove groupsOptions computation (moves into RbacSection)
// Update:
const isLoadingOptions = policiesLoading || permsLoading; // remove rolesLoading
```

### Grouped group options (RbacSection.tsx)

```ts
// In RbacSection — after existing watch() calls:
const selectedRoles = (watch('rbacRoles') ?? []) as SelectOption[];

const groupedGroupOptions = useMemo(() => {
  const targetRoles =
    selectedRoles.length > 0 ? new Set(selectedRoles.map((r) => r.value)) : null;
  const map = new Map<string, Set<string>>();
  for (const p of policiesData ?? []) {
    if (!p.role || !p.group) continue;
    if (targetRoles && !targetRoles.has(p.role)) continue;
    if (!map.has(p.role)) map.set(p.role, new Set());
    map.get(p.role)!.add(p.group);
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([role, groups]) => ({
      label: role,
      options: [...groups].sort().map((g) => ({ label: g, value: g })),
    }));
}, [selectedRoles, policiesData]);
```

### RbacMultiSelect options type

```ts
// Import:
import type { GroupBase, OptionsOrGroups } from 'react-select';

// In RbacMultiSelectProps:
options: OptionsOrGroups<SelectOption, GroupBase<SelectOption>>;
// (React-Select's <Select> already accepts this; no rendering change needed)
```

### RbacSectionProps

```ts
// Remove:
groupsOptions: SelectOption[];

// groupsOptions is no longer passed; RbacSection derives it internally.
// MemberForm no longer passes the prop.
```

### EditMember initial rbacRoles

```ts
// Remove (line 210):
const rbacRoles = (member.roles ?? []).map((r) => ({ label: r.name, value: r.code }));

// Add (after assignedPolicies is computed on line 213):
const uniqueRoles = [...new Set(assignedPolicies.map((p) => p.role).filter(Boolean))].sort();
const rbacRoles = uniqueRoles.map((r) => ({ label: r, value: r }));
```

---

## Acceptance Criteria

- [ ] `MemberForm` no longer calls `useRbacRoles` (no request to `/v1/admin/rbac/roles`)
- [ ] Roles dropdown shows unique role name strings derived from `usePoliciesList`
- [ ] Groups dropdown renders as grouped options with role name as section header
- [ ] When roles are selected, groups dropdown is filtered to only those roles' groups
- [ ] When no roles are selected, groups dropdown shows all groups (all role sections)
- [ ] Changing roles removes now-invalid selected groups with the existing warning message
- [ ] `AddMember` submit correctly assigns policies (previously always empty — now fixed)
- [ ] `EditMember` loads with correct pre-populated role selections
- [ ] `EditMember` submit correctly diffs and assigns/revokes policies
- [ ] No TypeScript errors

---

## Implementation Plan

### Phase 1 — `MemberForm.tsx`

**File:** `apps/back-office/screens/members/components/MemberForm/MemberForm.tsx`

- Remove `import { useRbacRoles } from '../../../../hooks/access-control/useRbacRoles'`
- Remove `const { data: rbacRolesData, isLoading: rolesLoading } = useRbacRoles({ authToken })`
- Replace `rolesOptions` memo with derivation from `policiesData`
- Remove `groupsOptions` memo entirely
- Remove `groupsOptions` prop from `<RbacSection>` call
- Change `isLoadingOptions` to `policiesLoading || permsLoading`

### Phase 2 — `RbacSection.tsx`

**File:** `apps/back-office/screens/members/components/MemberForm/RbacSection/RbacSection.tsx`

- Add `import type { GroupBase, OptionsOrGroups } from 'react-select'`
- Change `RbacMultiSelect.options` type to `OptionsOrGroups<SelectOption, GroupBase<SelectOption>>`
- Remove `groupsOptions` from `RbacSectionProps`
- Add `watch('rbacRoles')` (already exists via `watch`) — add `useMemo` for `groupedGroupOptions`
- Replace `options={groupsOptions}` with `options={groupedGroupOptions}` in the groups `<RbacMultiSelect>`
- `handleRolesChange` validation logic is unchanged (now works correctly since values are role name strings)

### Phase 3 — `EditMember.tsx`

**File:** `apps/back-office/screens/members/components/EditMember/EditMember.tsx`

- Replace line 210 `rbacRoles` derivation from `member.roles` with derivation from `assignedPolicies` (computed just above on line 213)

### Phase 4 — TypeScript check

```bash
npx tsc --noEmit -p apps/back-office/tsconfig.json
```

---

## Files Summary

| File | Change |
|------|--------|
| `MemberForm.tsx` | Remove `useRbacRoles`, derive `rolesOptions` from policies, remove `groupsOptions` |
| `RbacSection.tsx` | Remove `groupsOptions` prop, add `groupedGroupOptions` memo, update `RbacMultiSelect` type |
| `EditMember.tsx` | Fix `rbacRoles` initial value: derive from `assignedPolicies` not `member.roles` |

---

## References

- Brainstorm: `docs/brainstorms/2026-04-23-rbac-form-options-from-policies-brainstorm.md`
- `MemberForm.tsx`: `apps/back-office/screens/members/components/MemberForm/MemberForm.tsx:78-96`
- `RbacSection.tsx`: `apps/back-office/screens/members/components/MemberForm/RbacSection/RbacSection.tsx:116-178`
- `EditMember.tsx`: `apps/back-office/screens/members/components/EditMember/EditMember.tsx:200-226`
- `AddMember.tsx`: `apps/back-office/screens/members/components/AddMember/AddMember.tsx:104-116`
- `usePoliciesList`: `apps/back-office/hooks/access-control/usePoliciesList.ts`
