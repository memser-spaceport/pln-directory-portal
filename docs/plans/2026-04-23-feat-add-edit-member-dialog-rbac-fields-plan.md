---
title: "feat: Add RBAC fields (Status/Roles/Groups/Exceptions) to Add and Edit member dialogs"
type: feat
date: 2026-04-23
---

# Add RBAC Fields to Add/Edit Member Dialogs

## Overview

Add four new fields at the top of both the "Add new member" and "Edit member" dialogs:

1. **Status** (Pending / Verified / Approved / Rejected) — new simplified status dropdown, separate from the existing L0-L6 `accessLevel` selector. Gates whether the RBAC fields below are enabled.
2. **Roles** — multi-select from available RBAC roles.
3. **Groups** — multi-select from available policy groups.
4. **Permissions exceptions** (Optional) — multi-select direct permissions with ⚠️ warning banner when non-empty.

After the member is created/updated, if Status is "Approved", additional RBAC API calls are made to assign roles, policies (matched by role × group), and direct permissions.

## Context

Most of the building blocks already exist as untracked files:
- `RbacSection/` component — multi-selects for roles/groups/exceptions + internal StatusSelector
- `useAssignPolicy.ts` — POST /v2/admin/access-control-v2/assign-policy
- `useGrantDirectPermissionV2.ts` — POST /v2/admin/access-control-v2/member-permissions
- `useRevokePolicy.ts` — currently has wrong endpoint (POST instead of DELETE), must be fixed
- `useRbacRoles.ts` — GET /v1/admin/rbac/roles
- `useRbacPermissions.ts` — GET /v1/admin/rbac/permissions

Missing: `usePoliciesList.ts` (hook imported by RbacSection but not yet created), RBAC fields in `TMemberForm`, wiring in MemberForm/AddMember/EditMember.

## Technical Approach

### Step 1 — Create `usePoliciesList` hook

**File to create:** `apps/back-office/hooks/access-control/usePoliciesList.ts`

The hook is already imported in `RbacSection.tsx:9` — only the file is missing.

```ts
// apps/back-office/hooks/access-control/usePoliciesList.ts
import { useQuery } from '@tanstack/react-query';
import api from '../../utils/api';

export type Policy = {
  uid: string;
  code: string;
  name: string;
  description: string | null;
  role: string;   // role code this policy maps to
  group: string;  // group name/value this policy maps to
  isSystem: boolean;
  permissions: string[];
  assignmentsCount: number;
  permissionsCount: number;
};

export function usePoliciesList(authToken: string | undefined) {
  return useQuery({
    queryKey: ['POLICIES_LIST', authToken],
    queryFn: async () => {
      const { data } = await api.get<Policy[]>(
        '/v2/admin/access-control-v2/policies',
        { headers: { authorization: `Bearer ${authToken}` } }
      );
      return data;
    },
    enabled: !!authToken,
  });
}
```

### Step 2 — Fix `useRevokePolicy` endpoint

**File to modify:** `apps/back-office/hooks/access-control/useRevokePolicy.ts`

The current hook calls `POST /v2/admin/access-control-v2/revoke-policy` which does not exist in the controller. The correct endpoint is `DELETE /v2/admin/access-control-v2/members/:memberUid/policies/:policyCode`.

```ts
// Fixed version
export function useRevokePolicy() {
  return useMutation({
    mutationFn: async (params: MutationParams) => {
      const { data } = await api.delete(
        `/v2/admin/access-control-v2/members/${params.memberUid}/policies/${params.policyCode}`,
        { headers: { authorization: `Bearer ${params.authToken}` } }
      );
      return data;
    },
  });
}
```

### Step 3 — Add RBAC fields to `TMemberForm`

**File to modify:** `apps/back-office/screens/members/types/member.ts`

```ts
export type TMemberForm = {
  // ... existing fields ...
  memberStateStatus?: { label: string; value: 'Pending' | 'Verified' | 'Approved' | 'Rejected' } | null;
  rbacRoles?: { label: string; value: string }[];
  rbacGroups?: { label: string; value: string }[];
  rbacExceptions?: { label: string; value: string }[];
};
```

### Step 4 — Add RBAC fields to Yup schema

**File to modify:** `apps/back-office/screens/members/components/MemberForm/helpers.ts`

Append to `memberFormSchema`:

```ts
memberStateStatus: yup.object({ label: yup.string(), value: yup.string() }).nullable().optional(),
rbacRoles: yup.array().of(yup.object({ label: yup.string(), value: yup.string() })).optional(),
rbacGroups: yup.array().of(yup.object({ label: yup.string(), value: yup.string() })).optional(),
rbacExceptions: yup.array().of(yup.object({ label: yup.string(), value: yup.string() })).optional(),
```

### Step 5 — Update `RbacSection` — replace internal StatusSelector with simplified dropdown

**File to modify:** `apps/back-office/screens/members/components/MemberForm/RbacSection/RbacSection.tsx`

Currently `RbacSection` calls `<StatusSelector isAddNew={isAddNew} onStatusChange={handleStatusChange} />` which renders the L0-L6 access level picker. Replace this with a new inline single-select showing Pending/Verified/Approved/Rejected (stored in `memberStateStatus` form field).

```tsx
const MEMBER_STATE_OPTIONS = [
  { label: 'Pending', value: 'Pending' },
  { label: 'Verified', value: 'Verified' },
  { label: 'Approved', value: 'Approved' },
  { label: 'Rejected', value: 'Rejected' },
] as const;

// Inside RbacSection:
const memberStateStatus = watch('memberStateStatus');
const isApproved = memberStateStatus?.value === 'Approved';

const handleMemberStateChange = (opt: SelectOption | null) => {
  setValue('memberStateStatus', opt, { shouldDirty: true });
  if (opt?.value !== 'Approved') {
    setValue('rbacRoles', [], { shouldDirty: true });
    setValue('rbacGroups', [], { shouldDirty: true });
    setValue('rbacExceptions', [], { shouldDirty: true });
  }
};

// In JSX (replaces <StatusSelector .../>):
<div className={s.field}>
  <div className={clsx(s.label, s.required)}>Status</div>
  <Select
    options={MEMBER_STATE_OPTIONS}
    value={memberStateStatus ?? null}
    onChange={handleMemberStateChange}
    placeholder="Select status"
    styles={singleSelectStyles}
    isClearable={false}
    menuPortalTarget={document.body}
  />
  <p className={s.hint}>Roles and groups can only be assigned to Approved members.</p>
</div>
```

Pass `isDisabled={isLoadingOptions || !isApproved}` to the Roles and Groups `RbacMultiSelect` components.

Remove the now-unused `isAddNew` prop (or keep for backward compatibility). Remove the `handleStatusChange` function that set `accessLevel`.

### Step 6 — Update `MemberForm` — add authToken prop and render RbacSection at top

**File to modify:** `apps/back-office/screens/members/components/MemberForm/MemberForm.tsx`

**6a. Add `authToken` prop:**

```ts
interface Props {
  onClose: () => void;
  title: string;
  desc: string;
  onSubmit: (data: TMemberForm) => Promise<void>;
  initialData?: TMemberForm;
  existingImageUrl?: string;
  authToken?: string;  // NEW
}
```

**6b. Inside MemberForm, fetch RBAC options:**

```ts
const { data: rbacRolesData, isLoading: rolesLoading } = useRbacRoles(authToken);
const { data: policiesData, isLoading: policiesLoading } = usePoliciesList(authToken);
const { data: rbacPermissionsData, isLoading: permsLoading } = useRbacPermissions(authToken);
const isLoadingOptions = rolesLoading || policiesLoading || permsLoading;

const rolesOptions = useMemo(
  () => (rbacRolesData ?? []).map((r) => ({ label: r.name, value: r.code })),
  [rbacRolesData]
);

const groupsOptions = useMemo(
  () => [...new Set((policiesData ?? []).map((p) => p.group))]
    .sort()
    .map((g) => ({ label: g, value: g })),
  [policiesData]
);

const exceptionsOptions = useMemo(
  () => (rbacPermissionsData ?? []).map((p) => ({ label: p.description ?? p.code, value: p.code })),
  [rbacPermissionsData]
);
```

**6c. Add RBAC default values:**

```ts
defaultValues: {
  // ... existing ...
  memberStateStatus: null,
  rbacRoles: [],
  rbacGroups: [],
  rbacExceptions: [],
},
```

**6d. Render `RbacSection` at the top (before existing `StatusSelector`):**

```tsx
<form ...>
  <RbacSection
    rolesOptions={rolesOptions}
    groupsOptions={groupsOptions}
    exceptionsOptions={exceptionsOptions}
    isLoadingOptions={isLoadingOptions}
    policiesData={policiesData ?? []}
  />
  <StatusSelector isAddNew={!initialData} />  {/* existing L0-L6 selector — unchanged */}
  <ProfileDetails existingImageUrl={existingImageUrl} />
  ...
```

### Step 7 — Update `AddMember` — multi-step RBAC submit

**File to modify:** `apps/back-office/screens/members/components/AddMember/AddMember.tsx`

**7a. Add hooks at top of component:**

```ts
const { mutateAsync: assignPolicy } = useAssignPolicy();
const { mutateAsync: grantPermission } = useGrantDirectPermissionV2();
const { data: policiesData } = usePoliciesList(authToken);
```

**7b. After `mutateAsync` (member creation), if Approved, run RBAC calls:**

```ts
const res = await mutateAsync({ payload, authToken });

if (res?.data) {
  const memberUid = res.data.uid;
  const isApproved = formData.memberStateStatus?.value === 'Approved';

  if (isApproved && memberUid) {
    const roleValues = (formData.rbacRoles ?? []).map((r) => r.value);
    const groupValues = (formData.rbacGroups ?? []).map((g) => g.value);

    // Find matched policies (role × group cross-product)
    const matchedPolicies = (policiesData ?? []).filter(
      (p) => roleValues.includes(p.role) && groupValues.includes(p.group)
    );

    await Promise.allSettled([
      ...matchedPolicies.map((p) => assignPolicy({ memberUid, policyCode: p.code, authToken })),
      ...(formData.rbacExceptions ?? []).map((e) =>
        grantPermission({ memberUid, permissionCode: e.value, authToken })
      ),
    ]);
  }

  setOpen(false);
  toast.success('New member added successfully!');
}
```

**7c. Pass `authToken` to MemberForm:**

```tsx
<MemberForm
  onClose={handleClose}
  desc="Invite new members into the PL ecosystem."
  title="Add New Member"
  onSubmit={onSubmit}
  authToken={authToken}
/>
```

### Step 8 — Update `EditCell` — pass `member` to `EditMember`

**File to modify:** `apps/back-office/screens/members/components/EditCell/EditCell.tsx`

```tsx
export const EditCell = ({ member, authToken }: { member: Member; authToken: string }) => (
  <div className={s.root}>
    <EditMember className={s.btn} member={member} authToken={authToken} />
  </div>
);
```

### Step 9 — Update `EditMember` — accept `member` prop, pre-populate RBAC, diff-based save

**File to modify:** `apps/back-office/screens/members/components/EditMember/EditMember.tsx`

**9a. Change prop from `uid: string` to `member: Member`:**

```ts
interface Props {
  className?: string;
  member: Member;
  authToken: string;
}
export const EditMember = ({ className, member, authToken }: Props) => {
  const uid = member.uid;
  // ...
```

**9b. Add RBAC hooks:**

```ts
const { mutateAsync: assignPolicy } = useAssignPolicy();
const { mutateAsync: revokePolicy } = useRevokePolicy();
const { mutateAsync: grantPermission } = useGrantDirectPermissionV2();
const { data: policiesData } = usePoliciesList(authToken);
```

**9c. Pre-populate RBAC fields in `initialData` useMemo:**

```ts
// Derive memberStateStatus from member.memberState
const stateMap = { PENDING: 'Pending', VERIFIED: 'Verified', APPROVED: 'Approved', REJECTED: 'Rejected' };
const stateLabel = stateMap[member.memberState] ?? 'Pending';

// Roles from member.roles[]
const rbacRoles = (member.roles ?? []).map((r) => ({ label: r.name, value: r.code }));

// Groups: find assigned policies, extract unique group values
const memberPolicyCodes = (member.policies ?? []).map((p) => p.code);
const assignedPolicies = (policiesData ?? []).filter((p) => memberPolicyCodes.includes(p.code));
const groupValues = [...new Set(assignedPolicies.map((p) => p.group))];
const rbacGroups = groupValues.map((g) => ({ label: g, value: g }));

// Exceptions from member.permissions[]
const rbacExceptions = (member.permissions ?? []).map((p) => ({ label: p.code, value: p.code }));

return {
  ...existingFormData,
  memberStateStatus: { label: stateLabel, value: stateLabel },
  rbacRoles,
  rbacGroups,
  rbacExceptions,
};
```

**9d. Diff-based RBAC save in `onSubmit`:**

```ts
// Capture initial state for diffing
const initialPolicyCodes = (member.policies ?? []).map((p) => p.code);
const initialExceptionCodes = (member.permissions ?? []).map((p) => p.code);

// After successful member update:
const isApproved = formData.memberStateStatus?.value === 'Approved';

if (isApproved) {
  const roleValues = (formData.rbacRoles ?? []).map((r) => r.value);
  const groupValues = (formData.rbacGroups ?? []).map((g) => g.value);
  const newMatchedPolicies = (policiesData ?? []).filter(
    (p) => roleValues.includes(p.role) && groupValues.includes(p.group)
  );
  const newPolicyCodes = newMatchedPolicies.map((p) => p.code);
  const newExceptionCodes = (formData.rbacExceptions ?? []).map((e) => e.value);

  const policiesToAssign = newPolicyCodes.filter((c) => !initialPolicyCodes.includes(c));
  const policiesToRevoke = initialPolicyCodes.filter((c) => !newPolicyCodes.includes(c));
  const exceptionsToGrant = newExceptionCodes.filter((c) => !initialExceptionCodes.includes(c));

  await Promise.allSettled([
    ...policiesToAssign.map((c) => assignPolicy({ memberUid: uid, policyCode: c, authToken })),
    ...policiesToRevoke.map((c) => revokePolicy({ memberUid: uid, policyCode: c, authToken })),
    ...exceptionsToGrant.map((c) => grantPermission({ memberUid: uid, permissionCode: c, authToken })),
  ]);
} else {
  // If status changed to non-Approved, revoke ALL existing policies and exceptions
  await Promise.allSettled([
    ...initialPolicyCodes.map((c) => revokePolicy({ memberUid: uid, policyCode: c, authToken })),
  ]);
}
```

**9e. Pass `authToken` and use `member.uid` for MemberForm:**

```tsx
<MemberForm
  onClose={handleClose}
  title="Edit Member"
  desc="Verify the information or change the member's information."
  onSubmit={onSubmit}
  initialData={initialData}
  existingImageUrl={data?.image?.url}
  authToken={authToken}
/>
```

## Acceptance Criteria

- [ ] `usePoliciesList` hook created, exports `Policy` type, queries `/v2/admin/access-control-v2/policies`
- [ ] `useRevokePolicy` fixed to use DELETE `/v2/admin/access-control-v2/members/:memberUid/policies/:policyCode`
- [ ] `TMemberForm` has `memberStateStatus`, `rbacRoles`, `rbacGroups`, `rbacExceptions` fields
- [ ] Yup schema updated with optional RBAC fields (no validation errors)
- [ ] `RbacSection` shows simplified Status dropdown (Pending/Verified/Approved/Rejected) at top
- [ ] Roles/Groups/Exceptions multi-selects are disabled when Status ≠ "Approved"
- [ ] Selecting non-Approved status clears all RBAC fields
- [ ] Hint text "Roles and groups can only be assigned to Approved members." visible below Status
- [ ] `MemberForm` renders `RbacSection` at top (before existing L0-L6 StatusSelector)
- [ ] Existing L0-L6 StatusSelector unchanged
- [ ] On AddMember submit with "Approved": policies assigned (role × group cross-product) + exceptions granted via parallel API calls
- [ ] On EditMember: RBAC fields pre-populated from `member.roles`, `member.policies`, `member.permissions`
- [ ] On EditMember save: diff-based — only changed policies assigned/revoked; new exceptions granted
- [ ] If member creation/update fails, modal stays open; if RBAC calls fail (partial), member profile is still saved and modal closes
- [ ] TypeScript compiles without errors

## Files Changed

| File | Action | Purpose |
|---|---|---|
| `apps/back-office/hooks/access-control/usePoliciesList.ts` | **Create** | Fetch available policies, export `Policy` type |
| `apps/back-office/hooks/access-control/useRevokePolicy.ts` | **Fix** | Correct API endpoint (POST → DELETE) |
| `apps/back-office/screens/members/types/member.ts` | **Modify** | Add RBAC fields to `TMemberForm` |
| `apps/back-office/screens/members/components/MemberForm/helpers.ts` | **Modify** | Add optional RBAC fields to Yup schema |
| `apps/back-office/screens/members/components/MemberForm/MemberForm.tsx` | **Modify** | Add `authToken` prop, fetch RBAC options, render `RbacSection` at top, add RBAC defaults |
| `apps/back-office/screens/members/components/MemberForm/RbacSection/RbacSection.tsx` | **Modify** | Replace internal `StatusSelector` with simplified Pending/Verified/Approved/Rejected, add `isApproved` gating |
| `apps/back-office/screens/members/components/AddMember/AddMember.tsx` | **Modify** | Multi-step submit: create member → RBAC calls; pass `authToken` to MemberForm |
| `apps/back-office/screens/members/components/EditCell/EditCell.tsx` | **Modify** | Pass full `member` object to EditMember |
| `apps/back-office/screens/members/components/EditMember/EditMember.tsx` | **Modify** | Accept `member` prop, pre-populate RBAC, diff-based save |

## Dependencies & Risks

- `useRbacRoles` and `useRbacPermissions` hooks must accept `authToken` — verify their signature before wiring (they're in `hooks/access-control/`)
- The `member.memberState` field is optional on the `Member` type — use `?? 'PENDING'` as a safe fallback
- If `policiesData` hasn't loaded yet when `initialData` is computed in EditMember, groups will be empty — `useMemo` with `[data, formOptions, policiesData]` dependency ensures it re-runs when policies load
- Exception revocation (removing direct permissions): no `useRevokePermission` call is made for removed exceptions (out of scope for this plan — permissions are additive)

## References

- Brainstorm: `docs/brainstorms/2026-04-23-add-edit-member-dialog-rbac-fields-brainstorm.md`
- Prior plans (Apr 22): `docs/plans/2026-04-22-feat-add-member-modal-rbac-fields-plan.md`, `docs/plans/2026-04-22-feat-edit-member-modal-rbac-fields-plan.md`
- API enrichment: `apps/web-api/src/access-control-v2/controllers/admin-access-control-v2.controller.ts:21`
- API enrichment: `apps/web-api/src/access-control-v2/services/access-control-v2.service.ts:12`
- RbacSection: `apps/back-office/screens/members/components/MemberForm/RbacSection/RbacSection.tsx`
- MemberForm: `apps/back-office/screens/members/components/MemberForm/MemberForm.tsx`
- AddMember: `apps/back-office/screens/members/components/AddMember/AddMember.tsx:39`
- EditMember: `apps/back-office/screens/members/components/EditMember/EditMember.tsx:44`
- EditCell: `apps/back-office/screens/members/components/EditCell/EditCell.tsx`
