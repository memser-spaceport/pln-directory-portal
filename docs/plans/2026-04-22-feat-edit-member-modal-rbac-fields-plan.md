---
title: "feat: Edit member modal — RBAC status, roles, groups, and exceptions fields"
type: feat
date: 2026-04-22
---

# feat: Edit Member Modal — RBAC Fields

## Overview

The "Edit member" modal currently only edits profile and status fields. After saving, admins must navigate to the separate Access Control screen to update roles, groups, and direct permissions. This plan adds Status, Roles, Groups, and Permissions exceptions to the top of the Edit Member modal (mirroring the Add Member modal), pre-populated from existing RBAC assignments, with a live orange warning when role changes invalidate currently-selected groups.

On save, the modal diffs old vs new assignments and calls assign/revoke APIs for only what changed.

---

## Background

From the Figma design (Image #1):

- **Top of modal (new):** Status dropdown → "Roles and groups can only be assigned to Approved members." hint → Roles multi-select (pre-populated) → Groups multi-select (pre-populated) → orange removal warning → profile fields
- **Orange warning pattern:** When the admin changes Roles and a previously-selected Group no longer has a matching policy, that group is auto-removed with an orange message: _"[Group] group removed — not available for selected roles"_
- **Second "Roles *" in screenshot:** Design artifact — only one Roles field exists
- **Exceptions section:** Same as Add Member — pre-populated from member's direct permissions

---

## Data Sources for Pre-Population

RBAC data is **not** returned by `useMember` (the hook used in `EditMember`). A separate `useRbacMember` hook must be called:

| Form Field | Source | API |
|------------|--------|-----|
| `rbacRoles` | `rbacMember.roles.map(r => ({ label: r.name, value: r.name }))` | `GET /v1/admin/rbac/members/{uid}` |
| `rbacGroups` | Cross-reference `rbacMember.roles` × `policiesData` → unique groups | `GET /v1/admin/rbac/members/{uid}` + `GET /v2/admin/access-control-v2/policies` |
| `rbacExceptions` | `rbacMember.directPermissions.map(p => ({ label: p.description \|\| p.code, value: p.code }))` | `GET /v1/admin/rbac/members/{uid}` |

**Groups derivation:**
```ts
const memberRoleNames = rbacMember.roles.map(r => r.name);
const matchedPolicies = policiesData.filter(p => memberRoleNames.includes(p.role));
const rbacGroups = [...new Set(matchedPolicies.map(p => p.group))].map(g => ({ label: g, value: g }));
```

---

## Orange Warning Logic (Live in RbacSection)

When the admin changes the Roles multi-select, `RbacSection` recomputes group validity:

```ts
// Called when rbacRoles changes via handleRolesChange:
const newRoleValues = newRoles.map(r => r.value);
const { validGroups, removedGroups } = currentGroups.reduce(
  (acc, g) => {
    const isValid = newRoleValues.length === 0 ||
      policiesData?.some(p => newRoleValues.includes(p.role) && p.group === g.value);
    if (isValid) acc.validGroups.push(g);
    else acc.removedGroups.push(g);
    return acc;
  },
  { validGroups: [], removedGroups: [] }
);
// Auto-remove invalid groups from form field
setValue('rbacGroups', validGroups);
// Show orange warnings
setRemovedWarnings(removedGroups.map(g => `${g.label} group removed — not available for selected roles`));
```

Warnings are cleared when:
- Roles change again (re-compute)
- Groups field is manually cleared

---

## Save Sequence (Policy Diff)

```
onSubmit(formData):

  Step 1: PATCH member profile (same as today)
  
  Step 2 (policy diff):
    initialRoleCodes  = captured on modal open from rbacMember.roles
    initialGroupCodes = derived from policiesData × initialRoleCodes (captured on modal open)
    
    oldPolicies = policiesData.filter(p =>
      initialRoleCodes.includes(p.role) && initialGroupCodes.includes(p.group)
    )
    newPolicies = policiesData.filter(p =>
      formData.rbacRoles.map(r => r.value).includes(p.role) &&
      formData.rbacGroups.map(g => g.value).includes(p.group)
    )
    toAssign = newPolicies.filter(p => !oldPolicies.map(o => o.code).includes(p.code))
    toRevoke = oldPolicies.filter(p => !newPolicies.map(n => n.code).includes(p.code))
    
    Promise.allSettled([
      ...toAssign.map(p => assignPolicy({ authToken, memberUid, policyCode: p.code })),
      ...toRevoke.map(p => revokePolicy({ authToken, memberUid, policyCode: p.code })),
    ])

  Step 3 (exceptions diff):
    oldExceptionCodes = rbacMember.directPermissions.map(p => p.code)
    newExceptionCodes = formData.rbacExceptions.map(e => e.value)
    
    toGrant  = newExceptionCodes.filter(c => !oldExceptionCodes.includes(c))
    toRevoke = oldExceptionCodes.filter(c => !newExceptionCodes.includes(c))
    
    Promise.allSettled([
      ...toGrant.map(c => grantPermission({ authToken, memberUid, permissionCode: c })),
      ...toRevoke.map(c => revokePermission({ authToken, memberUid, permissionCode: c })),
    ])
```

Failure handling: same as Add Member — partial failure shows warning toast, modal still closes.

---

## Implementation Plan

### Phase 1 — New `useRevokePolicy` Hook

**New file:** `apps/back-office/hooks/access-control/useRevokePolicy.ts`

Mirror of `useAssignPolicy.ts`:

```ts
// useRevokePolicy.ts
interface MutationParams {
  authToken: string | undefined;
  memberUid: string;
  policyCode: string;
}

export function useRevokePolicy() {
  return useMutation({
    mutationFn: async (params: MutationParams) => {
      const { data } = await api.post(
        '/v2/admin/access-control-v2/revoke-policy',
        { memberUid: params.memberUid, policyCode: params.policyCode },
        { headers: { authorization: `Bearer ${params.authToken}` } }
      );
      return data;
    },
  });
}
```

> **Note:** If `/v2/admin/access-control-v2/revoke-policy` doesn't exist on the backend, this step is blocked. The onSubmit in Phase 4 should skip `toRevoke` calls in that case.

---

### Phase 2 — Extend `RbacSection` with Orange Warning + `policiesData` prop

**File:** `apps/back-office/screens/members/components/MemberForm/RbacSection/RbacSection.tsx`

#### 2a. Add `policiesData` prop and `removedWarnings` state

```tsx
// Add to RbacSectionProps:
interface RbacSectionProps {
  rolesOptions: SelectOption[];
  groupsOptions: SelectOption[];
  exceptionsOptions: SelectOption[];
  isLoadingOptions: boolean;
  isAddNew: boolean;
  policiesData?: Policy[];  // NEW — for live group validation
}
```

Add local state inside `RbacSection`:
```tsx
const [removedGroupWarnings, setRemovedGroupWarnings] = useState<string[]>([]);
```

#### 2b. Override Roles onChange to intercept and validate groups

Add `handleRolesChange` inside `RbacSection` that auto-removes invalid groups and sets warnings. Pass this as an `onChange` override to the roles `RbacMultiSelect`.

Update `RbacMultiSelect` to accept optional `onChange` prop:
```tsx
interface RbacMultiSelectProps {
  // ...existing...
  onChange?: (selected: SelectOption[]) => void;  // NEW
}
```

When provided, called instead of default `setValue`.

#### 2c. Render orange warning messages under Groups field

```tsx
// After Groups RbacMultiSelect:
{removedGroupWarnings.map((msg, i) => (
  <p key={i} className={s.groupRemovedWarning}>{msg}</p>
))}
```

Add to `RbacSection.module.scss`:
```scss
.groupRemovedWarning {
  font-size: 12px;
  color: #d97706;  // amber-600
  margin-top: -8px;
}
```

#### 2d. Clear warnings when roles change (already handled by `handleRolesChange`)

---

### Phase 3 — Pass `policiesData` from `MemberForm` to `RbacSection`

**File:** `apps/back-office/screens/members/components/MemberForm/MemberForm.tsx`

`MemberForm` already calls `usePoliciesList({ authToken })` and has `policiesData`. Pass it to `RbacSection`:

```tsx
<RbacSection
  rolesOptions={rolesOptions}
  groupsOptions={groupsOptions}
  exceptionsOptions={exceptionsOptions}
  isLoadingOptions={isLoadingOptions}
  isAddNew={!initialData}
  policiesData={policiesData}  // NEW
/>
```

No other changes to `MemberForm.tsx`.

---

### Phase 4 — Update `EditMember.tsx`

**File:** `apps/back-office/screens/members/components/EditMember/EditMember.tsx`

#### 4a. Add new hook calls

```tsx
// After existing useMember call:
const { data: rbacMemberData } = useRbacMember({ authToken, memberUid: uid, enabled: open });
const { data: policiesData } = usePoliciesList({ authToken });
```

Import: `useRbacMember`, `usePoliciesList`.

#### 4b. Capture initial RBAC state for diff on save

```tsx
// Refs to capture state at modal-open time (before user edits):
const initialRoleNamesRef = useRef<string[]>([]);
const initialGroupValuesRef = useRef<string[]>([]);
const initialExceptionCodesRef = useRef<string[]>([]);
```

Set in the `initialData` useMemo (or a separate useEffect that runs when `rbacMemberData` loads).

#### 4c. Pre-populate `rbacRoles`, `rbacGroups`, `rbacExceptions` in `initialData`

```tsx
const initialData = useMemo(() => {
  if (!data || !formOptions || !rbacMemberData || !policiesData) return null;

  const roleNames = rbacMemberData.roles.map(r => r.name);
  const matchedPolicies = policiesData.filter(p => roleNames.includes(p.role));
  const groupValues = [...new Set(matchedPolicies.map(p => p.group))];

  // Capture initial state for diff
  initialRoleNamesRef.current = roleNames;
  initialGroupValuesRef.current = groupValues;
  initialExceptionCodesRef.current = rbacMemberData.directPermissions.map(p => p.code);

  return {
    // ...existing fields...
    rbacRoles: rbacMemberData.roles.map(r => ({ label: r.name, value: r.name })),
    rbacGroups: groupValues.map(g => ({ label: g, value: g })),
    rbacExceptions: rbacMemberData.directPermissions.map(p => ({
      label: p.description || p.code,
      value: p.code,
    })),
  };
}, [data, formOptions, rbacMemberData, policiesData]);
```

#### 4d. Fix: forward `authToken` to `<MemberForm>`

```tsx
// Line 221 — add authToken prop:
<MemberForm
  ...
  authToken={authToken}  // was missing
/>
```

#### 4e. Add RBAC diff logic to `onSubmit`

```tsx
const { mutateAsync: assignPolicy } = useAssignPolicy();
const { mutateAsync: revokePolicy } = useRevokePolicy();
const { mutateAsync: grantPermission } = useGrantDirectPermissionV2();
const { mutateAsync: revokePermission } = useRevokePermission();
const queryClient = useQueryClient();
const { user } = useAuth();

// Inside onSubmit, after the existing profile update succeeds:

// Step 2: policy diff
if (APPROVED_ACCESS_LEVELS.includes(formData.accessLevel?.value ?? '')) {
  const oldPolicies = policiesData?.filter(p =>
    initialRoleNamesRef.current.includes(p.role) &&
    initialGroupValuesRef.current.includes(p.group)
  ) ?? [];
  const newPolicies = policiesData?.filter(p =>
    formData.rbacRoles.map(r => r.value).includes(p.role) &&
    formData.rbacGroups.map(g => g.value).includes(p.group)
  ) ?? [];
  const oldCodes = oldPolicies.map(p => p.code);
  const newCodes = newPolicies.map(p => p.code);

  const toAssign = newPolicies.filter(p => !oldCodes.includes(p.code));
  const toRevoke = oldPolicies.filter(p => !newCodes.includes(p.code));

  if (toAssign.length > 0 || toRevoke.length > 0) {
    const policyResults = await Promise.allSettled([
      ...toAssign.map(p => assignPolicy({ authToken, memberUid, policyCode: p.code, assignedByUid: user?.uid })),
      ...toRevoke.map(p => revokePolicy({ authToken, memberUid, policyCode: p.code })),
    ]);
    const failures = policyResults.filter(r => r.status === 'rejected');
    if (failures.length > 0) {
      toast.warn(`Profile updated. ${failures.length} policy change(s) failed — please update manually.`);
      rbacFailed = true;
    }
  }
}

// Step 3: exceptions diff
const oldExcCodes = initialExceptionCodesRef.current;
const newExcCodes = formData.rbacExceptions.map(e => e.value);
const toGrant  = newExcCodes.filter(c => !oldExcCodes.includes(c));
const toRevoke = oldExcCodes.filter(c => !newExcCodes.includes(c));

if (toGrant.length > 0 || toRevoke.length > 0) {
  const excResults = await Promise.allSettled([
    ...toGrant.map(c => grantPermission({ authToken, memberUid, permissionCode: c, grantedByUid: user?.uid })),
    ...toRevoke.map(c => revokePermission({ authToken, memberUid, permissionCode: c })),
  ]);
  const excFailures = excResults.filter(r => r.status === 'rejected');
  if (excFailures.length > 0) {
    toast.warn(`Profile updated. ${excFailures.length} permission exception change(s) failed — please update manually.`);
    rbacFailed = true;
  }
}

// Invalidate caches
queryClient.invalidateQueries({ queryKey: [MembersQueryKeys.GET_MEMBERS_LIST] });
queryClient.invalidateQueries({ queryKey: [RbacQueryKeys.MEMBERS_LIST] });
queryClient.invalidateQueries({ queryKey: [RbacQueryKeys.MEMBER_DETAILS, authToken, uid] });

if (!rbacFailed) toast.success('Member updated successfully!');
handleClose();
```

---

## Files Summary

### New Files

| File | Purpose |
|------|---------|
| `hooks/access-control/useRevokePolicy.ts` | v2 mutation: POST revoke-policy |

### Modified Files

| File | Change |
|------|--------|
| `screens/members/components/MemberForm/RbacSection/RbacSection.tsx` | Add `policiesData` prop; `handleRolesChange` with auto-remove and warnings; `removedGroupWarnings` state; render orange warnings |
| `screens/members/components/MemberForm/RbacSection/RbacSection.module.scss` | Add `.groupRemovedWarning` orange style |
| `screens/members/components/MemberForm/MemberForm.tsx` | Pass `policiesData` to `RbacSection` |
| `screens/members/components/EditMember/EditMember.tsx` | Add `useRbacMember` + `usePoliciesList`; pre-populate RBAC `initialData`; capture initial state refs; forward `authToken` to MemberForm; RBAC diff in `onSubmit` |

---

## Acceptance Criteria

### Functional

- [x] Roles, Groups, and Exceptions fields are pre-populated with the member's current assignments when the Edit modal opens
- [x] Status field pre-populates from `accessLevel` (existing behavior — unchanged)
- [x] When Roles changes and a selected group becomes invalid, that group is auto-removed and an orange warning appears: `"{group} group removed — not available for selected roles"`
- [x] Orange warning disappears when roles are changed back to a state where the group is valid again
- [x] When saving: only the diff of policies (new minus old, removed minus old) is applied — no unnecessary re-assignment
- [x] New policies in diff are assigned via `POST /v2/admin/access-control-v2/assign-policy`
- [x] Removed policies in diff are revoked via `POST /v2/admin/access-control-v2/revoke-policy`
- [x] Added exception permissions are granted via `POST /v2/admin/access-control-v2/member-permissions`
- [x] Removed exception permissions are revoked via `POST /v1/admin/rbac/permissions/revoke`
- [x] Partial failure (profile saved but RBAC changes failed): warning toast shown, modal closes
- [x] Form reset on Cancel clears RBAC fields back to empty (handled by RHF `reset()`)
- [x] `authToken` is forwarded to `MemberForm` (fixes pre-existing missing prop bug)
- [x] Modal waits for `rbacMemberData` and `policiesData` to load before `initialData` is ready

### Non-Functional

- [x] No TypeScript errors
- [x] `APPROVED_ACCESS_LEVELS` constant from `helpers.ts` used for all Approved checks
- [x] No unnecessary API calls when no RBAC changes were made (diff is empty → skip steps 2/3)

---

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| `POST /v2/admin/access-control-v2/revoke-policy` doesn't exist on backend | Add backend check in Phase 1. If endpoint missing, skip `toRevoke` in save and note in warning toast. |
| `rbacMemberData` loads after `data` — modal flashes | Guard `initialData` on all three: `if (!data \|\| !formOptions \|\| !rbacMemberData \|\| !policiesData) return null` |
| `initialData` dependency array grows large | Accepted — useMemo with 4 deps is fine |
| Role change clears all groups (no matching policies at all) | Expected behavior. If `newRoles.length === 0`, keep all groups valid (don't auto-remove) |
| `useRevokePermission` uses v1 endpoint | Pre-existing — consistent with `useGrantPermission` also using v1 |

---

## References

- Brainstorm: `docs/brainstorms/2026-04-22-edit-member-modal-rbac-fields-brainstorm.md`
- Add Member modal (reference implementation): `screens/members/components/AddMember/AddMember.tsx`
- `useRbacMember`: `hooks/access-control/useRbacMember.ts` — returns `MemberAccessDetails`
- `useRevokePermission`: `hooks/access-control/useRevokePermission.ts`
- `useAssignPolicy`: `hooks/access-control/useAssignPolicy.ts`
- `useGrantDirectPermissionV2`: `hooks/access-control/useGrantDirectPermissionV2.ts`
- `RbacSection`: `screens/members/components/MemberForm/RbacSection/RbacSection.tsx`
- `MemberAccessDetails`: `screens/access-control/types.ts`
- RBAC v2 API: `docs/rbac-v2.md`
