---
title: "feat: inline roleCodes/policyCodes/permissionCodes on member create/update payload"
type: feat
date: 2026-04-24
---

# feat: Inline RBAC Fields on Member Create/Update Payload

## Overview

Add `roleCodes`, `policyCodes`, and `permissionCodes` to the main payload sent by `AddMember` and `EditMember`. The backend now accepts these fields inline, enabling a single atomic request instead of the current waterfall of separate `assignPolicy` / `grantPermission` / `revokePolicy` calls after member creation/update.

---

## Key Decisions

- **`roleCodes`** — role code strings (e.g. `"directory_admin"`), derived by mapping selected role name values through `useRbacRoles` data: `roleNameToCode.get(name)`
- **`policyCodes`** — codes of policies matching selected role+group pairs: `policiesData.filter(p => roleValues.includes(p.role) && groupValues.includes(p.group)).map(p => p.code)`
- **`permissionCodes`** — exception permission codes: `rbacExceptions.map(e => e.value)`
- **Replace separate calls**: remove all `assignPolicy` / `revokePolicy` / `grantPermission` calls from both components — the inline payload fields take over entirely
- **Replacement semantics**: backend treats `policyCodes` as full replacement set; `EditMember` always sends these fields, including empty `[]` when not Approved (clears existing assignments — replaces the current revoke-all logic)
- **`AddMember`**: only includes RBAC fields when `isApproved` (new member has no prior state to clear)

---

## Implementation Plan

### Phase 1 — Update hook payload types

**File:** `apps/back-office/hooks/members/useAddMember.ts`

Add to `MutationParams.payload`:
```ts
roleCodes?: string[];
policyCodes?: string[];
permissionCodes?: string[];
```

**File:** `apps/back-office/hooks/members/useUpdateMember.ts`

Read the full payload type and add same three optional fields.

---

### Phase 2 — `AddMember.tsx`

**File:** `apps/back-office/screens/members/components/AddMember/AddMember.tsx`

1. Add import: `import { useRbacRoles } from '../../../../hooks/access-control/useRbacRoles'`
2. Remove imports: `useAssignPolicy`, `useGrantDirectPermissionV2`
3. Add hook call: `const { data: rbacRolesData } = useRbacRoles({ authToken })`
4. Remove hook calls: `useAssignPolicy`, `useGrantDirectPermissionV2`
5. Inside `onSubmit`, after image upload, build role name→code map and compute RBAC fields:

```ts
const isApproved = formData.memberStateStatus?.value === 'Approved';

const roleNameToCode = new Map((rbacRolesData ?? []).map((r) => [r.name, r.code]));
const roleValues = (formData.rbacRoles ?? []).map((r) => r.value);
const groupValues = (formData.rbacGroups ?? []).map((g) => g.value);
const matchedPolicies = (policiesData ?? []).filter(
  (p) => roleValues.includes(p.role) && groupValues.includes(p.group)
);

const payload = {
  // ... existing fields unchanged ...
  ...(isApproved && {
    roleCodes: roleValues.map((name) => roleNameToCode.get(name)).filter(Boolean) as string[],
    policyCodes: matchedPolicies.map((p) => p.code),
    permissionCodes: (formData.rbacExceptions ?? []).map((e) => e.value),
  }),
};
```

6. Remove the entire post-`mutateAsync` RBAC block:
```ts
// DELETE this entire block:
if (isApproved && memberUid) {
  const roleValues = ...
  const matchedPolicies = ...
  await Promise.allSettled([...assignPolicy calls, ...grantPermission calls]);
}
```

7. Update `useCallback` deps: `[mutateAsync, rbacRolesData, policiesData, authToken]`

---

### Phase 3 — `EditMember.tsx`

**File:** `apps/back-office/screens/members/components/EditMember/EditMember.tsx`

1. Add import: `import { useRbacRoles } from '../../../../hooks/access-control/useRbacRoles'`
2. Remove imports: `useAssignPolicy`, `useRevokePolicy`, `useGrantDirectPermissionV2`
3. Add hook call: `const { data: rbacRolesData } = useRbacRoles({ authToken })`
4. Remove hook calls: `useAssignPolicy`, `useRevokePolicy`, `useGrantDirectPermissionV2`
5. Remove refs: `initialPolicyCodesRef`, `initialExceptionCodesRef` (entire `useRef` declarations)
6. Add `roleCodes?: string[]; policyCodes?: string[]; permissionCodes?: string[]` to the inline payload type annotation (lines 76-103)
7. Inside `onSubmit`, compute RBAC fields and include in payload (always sent, even when not approved):

```ts
const isApproved = formData.memberStateStatus?.value === 'Approved';
const roleNameToCode = new Map((rbacRolesData ?? []).map((r) => [r.name, r.code]));
const roleValues = isApproved ? (formData.rbacRoles ?? []).map((r) => r.value) : [];
const groupValues = isApproved ? (formData.rbacGroups ?? []).map((g) => g.value) : [];
const matchedPolicies = (policiesData ?? []).filter(
  (p) => roleValues.includes(p.role) && groupValues.includes(p.group)
);

// Add to payload object:
payload.roleCodes = roleValues.map((name) => roleNameToCode.get(name)).filter(Boolean) as string[];
payload.policyCodes = matchedPolicies.map((p) => p.code);
payload.permissionCodes = isApproved ? (formData.rbacExceptions ?? []).map((e) => e.value) : [];
```

8. Remove entire post-`mutateAsync` RBAC block:
```ts
// DELETE from "if (isApproved) {" through closing "}" of the else block (lines 151-186)
```

9. In `initialData` useMemo — remove:
   - `initialPolicyCodesRef.current = memberPolicyCodes`
   - `initialExceptionCodesRef.current = ...`

10. Update `useCallback` deps: `[mutateAsync, rbacRolesData, policiesData, uid, authToken]`

---

### Phase 4 — TypeScript check

```bash
npx tsc --noEmit -p apps/back-office/tsconfig.json
```

Fix any errors.

---

## Files Summary

| File | Change |
|------|--------|
| `hooks/members/useAddMember.ts` | Add optional RBAC fields to payload type |
| `hooks/members/useUpdateMember.ts` | Add optional RBAC fields to payload type |
| `screens/members/components/AddMember/AddMember.tsx` | Add `useRbacRoles`, compute + send RBAC fields inline, remove separate API calls |
| `screens/members/components/EditMember/EditMember.tsx` | Add `useRbacRoles`, compute + send RBAC fields inline (always), remove diff logic and separate API calls |

---

## References

- Brainstorm: `docs/brainstorms/2026-04-24-submit-rbac-fields-inline-brainstorm.md`
- `useAddMember`: `apps/back-office/hooks/members/useAddMember.ts`
- `useUpdateMember`: `apps/back-office/hooks/members/useUpdateMember.ts`
- `AddMember.tsx`: `apps/back-office/screens/members/components/AddMember/AddMember.tsx`
- `EditMember.tsx`: `apps/back-office/screens/members/components/EditMember/EditMember.tsx`
- `useRbacRoles`: `apps/back-office/hooks/access-control/useRbacRoles.ts` — `RoleWithCounts.code` is the role code string
- `usePoliciesList`: `apps/back-office/hooks/access-control/usePoliciesList.ts` — `Policy.role` is role name string, `Policy.code` is policy code
