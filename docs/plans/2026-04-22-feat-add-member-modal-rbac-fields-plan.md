---
title: "feat: Add member modal — RBAC status, roles, groups, and exceptions fields"
type: feat
date: 2026-04-22
---

# feat: Add Member Modal — RBAC Fields at Creation Time

## Overview

The "Add new member" modal currently only sets a member's access level and profile info. After creation, admins must navigate to a separate page to assign RBAC policies and direct permissions. This plan adds **Status, Roles, Groups, and Permissions exceptions** fields at the top of the modal so a member can be fully provisioned in one flow.

The submit becomes a 3-step sequence: create member → assign matched policies (role × group cross-product) → grant exception permissions.

---

## Background

From the Figma design (Images 1–5):

- **Top of modal (new):** Status dropdown → "Roles and groups can only be assigned to Approved members." hint → Roles multi-select → Groups multi-select → Permissions exceptions section with "+ Add Exception" button
- **Then (existing):** profile photo, Name, Email, Join Date, Bio, location, skills, teams, social links
- **Groups dropdown options** (Image 4): PL Internal, PL Partner, PLC-PLVS, PLC-Crypto, PLC-Founder Forge, PLC-Neuro, PLN Close Contributor, PLC Other, PLN Other, PL — derived at runtime from the policies list's unique `group` values
- **Exceptions warning banner:** "Exceptions grant permissions outside of assigned policies. Use only for temporary or one-off cases."

---

## Role × Group = Policy

A **policy** in the RBAC v2 system is a pre-defined record with both `role` and `group` fields (e.g., policy `advisor_future` has `role: "Advisor"` and `group: "Future"`). When the admin selects `Roles: [R1, R2]` and `Groups: [G1, G2]`, the frontend:

1. Loads all policies from `usePoliciesList()`
2. Filters: `policies.filter(p => selectedRoles.includes(p.role) && selectedGroups.includes(p.group))`
3. Calls `POST /v2/admin/access-control-v2/assign-policy` for each matched policy

If a `(role, group)` combination has no matching policy, it is silently skipped.

---

## Data Sources

| Dropdown | API | Hook | Shape |
|----------|-----|------|-------|
| Roles | `GET /v1/admin/rbac/roles` | `useRbacRoles` (existing) | `{ label: r.name, value: r.name }` |
| Groups | `GET /v2/admin/access-control-v2/policies` | `usePoliciesList` (existing) | unique `p.group` values |
| Exceptions picker | `GET /v1/admin/rbac/permissions` | `useRbacPermissions` (existing) | `{ label: p.description \|\| p.code, value: p.code }` |

> **Note on Roles value:** Policy lookup uses `policy.role` (a display string like `"Advisor"`), so the roles dropdown stores `r.name` as both `label` and `value` — matching the `policy.role` field format.

---

## Submit Sequence

```
onSubmit(formData):

  Step 1: POST /v1/admin/members/create
          payload: { name, email, accessLevel: formData.accessLevel.value, ... }
          → memberUid
          
  if status is Approved (L2–L6) && roles.length && groups.length:
    matchedPolicies = allPolicies.filter(
      p => selectedRoles.includes(p.role) && selectedGroups.includes(p.group)
    )
    Step 2 (parallel): matchedPolicies.map(policy =>
      POST /v2/admin/access-control-v2/assign-policy
      { memberUid, policyCode: policy.code, assignedByUid: currentUser.uid }
    )

  if exceptions.length:
    Step 3 (parallel): exceptions.map(exc =>
      POST /v2/admin/access-control-v2/member-permissions
      { memberUid, permissionCode: exc.value, grantedByUid: currentUser.uid }
    )
```

**Failure handling:**  
- If Step 1 fails → show error toast, modal stays open (same as today)  
- If Step 1 succeeds but Step 2/3 fail → show warning toast: "Member created, but RBAC assignment failed. Please assign roles manually." Close modal (member exists — don't block admin).

**Loading state:** The Submit button shows "Processing..." and stays disabled until the entire sequence completes (Steps 1 + 2 + 3).

---

## Conditional Field Behavior

| Condition | Roles field | Groups field | Exceptions button |
|-----------|-------------|--------------|-------------------|
| Status = Approved (L2–L6) | enabled | enabled | enabled |
| Status = non-Approved (L0, L1, Rejected) | disabled + greyed | disabled + greyed | disabled + greyed |
| Status changes from Approved → non-Approved | cleared | cleared | cleared |
| Status changes between Approved levels | no change | no change | no change |

The Exceptions section is always visible; only the "+ Add Exception" button is conditionally disabled (not hidden).

---

## Exceptions Section UX

- **No exceptions:** Section shows only the header "Permissions exceptions" and the "+ Add Exception" button. Warning banner is hidden.
- **When "+ Add Exception" is clicked:** Opens a searchable multi-select dropdown (re-uses `FormMultiselectField` pattern) listing all available permissions with descriptions.
- **When 1+ exceptions selected:** Exception chips appear in the section. Warning banner appears: _"Exceptions grant permissions outside of assigned policies. Use only for temporary or one-off cases."_ (permanently visible while any exception is selected, not dismissable).
- **Each chip** has an × to remove it.

---

## Implementation Plan

### Phase 1 — Type & Schema Extensions

#### 1a. Extend `TMemberForm`
**File:** `apps/back-office/screens/members/types/member.ts`

Add to `TMemberForm` (after `investorProfile`):

```ts
export type TMemberForm = {
  // ... existing fields ...
  rbacRoles: { label: string; value: string }[];
  rbacGroups: { label: string; value: string }[];
  rbacExceptions: { label: string; value: string }[];
};
```

> Use `rbacRoles` / `rbacGroups` / `rbacExceptions` (not `roles`/`groups`) to avoid collisions with existing fields.

#### 1b. Extend Yup schema
**File:** `apps/back-office/screens/members/components/MemberForm/helpers.ts`

```ts
const rbacOptionSchema = yup.object({
  label: yup.string().required(),
  value: yup.string().required(),
});

// Add to memberFormSchema:
rbacRoles: yup.array().of(rbacOptionSchema).defined().default([]),
rbacGroups: yup.array().of(rbacOptionSchema).defined().default([]),
rbacExceptions: yup.array().of(rbacOptionSchema).defined().default([]),
```

No cross-field validation for v1 — empty roles+groups is allowed; mismatched cross-products are silently skipped.

---

### Phase 2 — New Mutation Hooks

#### 2a. Create `useAssignPolicy`
**New file:** `apps/back-office/hooks/access-control/useAssignPolicy.ts`

```ts
interface MutationParams {
  authToken: string | undefined;
  memberUid: string;
  policyCode: string;
  assignedByUid?: string;
}

export function useAssignPolicy() {
  return useMutation({
    mutationFn: async (params: MutationParams) => {
      const { data } = await api.post(
        '/v2/admin/access-control-v2/assign-policy',
        { memberUid: params.memberUid, policyCode: params.policyCode, assignedByUid: params.assignedByUid },
        { headers: { authorization: `Bearer ${params.authToken}` } }
      );
      return data;
    },
  });
}
```

No cache invalidation in the hook itself — invalidation is handled in `AddMember.tsx` after the whole sequence completes.

#### 2b. Create `useGrantDirectPermissionV2`
**New file:** `apps/back-office/hooks/access-control/useGrantDirectPermissionV2.ts`

```ts
interface MutationParams {
  authToken: string | undefined;
  memberUid: string;
  permissionCode: string;
  grantedByUid?: string;
}

export function useGrantDirectPermissionV2() {
  return useMutation({
    mutationFn: async (params: MutationParams) => {
      const { data } = await api.post(
        '/v2/admin/access-control-v2/member-permissions',
        { memberUid: params.memberUid, permissionCode: params.permissionCode, grantedByUid: params.grantedByUid },
        { headers: { authorization: `Bearer ${params.authToken}` } }
      );
      return data;
    },
  });
}
```

---

### Phase 3 — `RbacSection` Sub-Component

#### 3a. Create component
**New file:** `apps/back-office/screens/members/components/MemberForm/RbacSection/RbacSection.tsx`

This component renders the top block of the modal: Status (re-using `StatusSelector`), Roles, Groups, and Exceptions. It uses `useFormContext()` for form values and receives hooks data as props.

```tsx
interface RbacSectionProps {
  rolesOptions: { label: string; value: string }[];
  groupsOptions: { label: string; value: string }[];
  exceptionsOptions: { label: string; value: string }[];
  isLoadingOptions: boolean;
  isAddNew: boolean;
}

export const RbacSection = ({
  rolesOptions, groupsOptions, exceptionsOptions, isLoadingOptions, isAddNew
}: RbacSectionProps) => {
  const { watch, setValue } = useFormContext<TMemberForm>();
  const accessLevel = watch('accessLevel');
  const rbacExceptions = watch('rbacExceptions');

  const isApproved = APPROVED_ACCESS_LEVELS.includes(accessLevel?.value ?? '');

  const handleAccessLevelChange = (newValue: ...) => {
    setValue('accessLevel', newValue);
    const wasApproved = APPROVED_ACCESS_LEVELS.includes(accessLevel?.value ?? '');
    const willBeApproved = APPROVED_ACCESS_LEVELS.includes(newValue?.value ?? '');
    if (wasApproved && !willBeApproved) {
      setValue('rbacRoles', []);
      setValue('rbacGroups', []);
      setValue('rbacExceptions', []);
    }
  };

  return (
    <div className={s.rbacSection}>
      {/* Status — re-use StatusSelector but wire onChange through handleAccessLevelChange */}
      <StatusSelector isAddNew={isAddNew} onStatusChange={handleAccessLevelChange} />
      
      {/* Hint */}
      <p className={s.hint}>Roles and groups can only be assigned to Approved members.</p>
      
      {/* Roles */}
      <RbacMultiSelect
        name="rbacRoles"
        label="Roles"
        placeholder="Select roles"
        options={rolesOptions}
        isDisabled={!isApproved || isLoadingOptions}
        required
      />
      
      {/* Groups */}
      <RbacMultiSelect
        name="rbacGroups"
        label="Groups"
        placeholder="Select groups"
        options={groupsOptions}
        isDisabled={!isApproved || isLoadingOptions}
        required
      />
      
      {/* Exceptions */}
      <div className={s.exceptionsHeader}>
        <span className={s.exceptionsTitle}>Permissions exceptions</span>
        <RbacMultiSelect
          name="rbacExceptions"
          label=""
          placeholder="+ Add Exception"
          options={exceptionsOptions}
          isDisabled={!isApproved}
          triggerMode  // renders as a "+ Add" trigger rather than inline multi-select
        />
      </div>
      
      {rbacExceptions?.length > 0 && (
        <div className={s.exceptionsBanner}>
          <InfoIcon />
          <span>Exceptions grant permissions outside of assigned policies.<br/>
          Use only for temporary or one-off cases.</span>
        </div>
      )}
    </div>
  );
};
```

#### 3b. `RbacMultiSelect` inline component (in same file or separate)

Since `FormMultiselectField` doesn't support `isDisabled`, create a thin `RbacMultiSelect` that wraps `react-select` directly with `useFormContext()`. Mirror `FormMultiselectField` styles but add `isDisabled` prop.

```tsx
// RbacMultiSelect wraps react-select with RHF useFormContext + isDisabled support
// Stores values as { label, value }[] in form state (same as FormMultiselectField)
```

#### 3c. Create styles
**New file:** `apps/back-office/screens/members/components/MemberForm/RbacSection/RbacSection.module.scss`

```scss
.rbacSection {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 20px 0 24px;
  border-bottom: 1px solid #e2e8f0;
  margin-bottom: 24px;
}

.hint {
  font-size: 12px;
  color: #64748b;
  margin: -8px 0 0;  // tight to Status field
}

.exceptionsHeader {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.exceptionsTitle {
  font-size: 14px;
  font-weight: 500;
  color: #0f172a;
}

.exceptionsBanner {
  display: flex;
  gap: 10px;
  padding: 12px 16px;
  background: #fff7ed;
  border: 1px solid #fed7aa;
  border-radius: 8px;
  font-size: 13px;
  color: #92400e;
  line-height: 18px;
}
```

---

### Phase 4 — MemberForm Integration

#### 4a. Add `authToken` prop to `MemberForm`
**File:** `apps/back-office/screens/members/components/MemberForm/MemberForm.tsx`

```tsx
interface MemberFormProps {
  onClose: () => void;
  title: string;
  desc: string;
  onSubmit: (data: TMemberForm) => Promise<void>;
  initialData?: TMemberForm;
  existingImageUrl?: string;
  authToken?: string;  // NEW
}
```

#### 4b. Wire data hooks inside `MemberForm`
Call the three hooks at the top of `MemberForm` component body:

```tsx
const { data: rbacRoles, isLoading: loadingRoles } = useRbacRoles({ authToken });
const { data: policies, isLoading: loadingPolicies } = usePoliciesList({ authToken });
const { data: permissions, isLoading: loadingPermissions } = useRbacPermissions({ authToken });

const rolesOptions = useMemo(
  () => rbacRoles?.map(r => ({ label: r.name, value: r.name })) ?? [],
  [rbacRoles]
);
const groupsOptions = useMemo(
  () => [...new Set(policies?.map(p => p.group) ?? [])].filter(Boolean).sort()
      .map(g => ({ label: g, value: g })),
  [policies]
);
const exceptionsOptions = useMemo(
  () => permissions?.map(p => ({ label: p.description || p.code, value: p.code })) ?? [],
  [permissions]
);
const isLoadingOptions = loadingRoles || loadingPolicies || loadingPermissions;
```

#### 4c. Add `RbacSection` to form layout
In `MemberForm.tsx` JSX, place `<RbacSection>` immediately after the `<form>` tag opens, before `<ProfileDetails />`:

```tsx
<RbacSection
  rolesOptions={rolesOptions}
  groupsOptions={groupsOptions}
  exceptionsOptions={exceptionsOptions}
  isLoadingOptions={isLoadingOptions}
  isAddNew={!initialData}
/>
<ProfileDetails />
<ProfileLocationInput />
...
```

#### 4d. Add `rbacRoles`, `rbacGroups`, `rbacExceptions` to `defaultValues`
```tsx
const methods = useForm<TMemberForm>({
  defaultValues: {
    // ... existing ...
    rbacRoles: [],
    rbacGroups: [],
    rbacExceptions: [],
  },
  resolver: yupResolver(memberFormSchema),
});
```

#### 4e. Update `StatusSelector` to support external onChange
**File:** `apps/back-office/screens/members/components/MemberForm/StatusSelector/StatusSelector.tsx`

Add optional `onStatusChange?: (val: {...} | null) => void` prop. When provided, call it instead of (or in addition to) the existing `setValue('accessLevel', val)`. This lets `RbacSection` intercept the change to clear RBAC fields when status goes non-Approved.

---

### Phase 5 — `AddMember.tsx` Submit Orchestration

**File:** `apps/back-office/screens/members/components/AddMember/AddMember.tsx`

Full updated `onSubmit`:

```tsx
const { mutateAsync: addMember } = useAddMember();
const { mutateAsync: assignPolicy } = useAssignPolicy();
const { mutateAsync: grantPermission } = useGrantDirectPermissionV2();
const queryClient = useQueryClient();

const onSubmit = async (formData: TMemberForm) => {
  // Step 1: upload image + create member
  let imageUid: string | undefined;
  if (formData.image) {
    const img = await saveRegistrationImage(formData.image);
    imageUid = img?.uid;
  }
  
  let memberUid: string;
  try {
    const result = await addMember({
      payload: buildCreatePayload(formData, imageUid),
      authToken,
    });
    memberUid = result.uid;
  } catch {
    toast.error('Failed to create member.');
    return;  // stay open
  }

  // Step 2: assign policies (role × group cross-product)
  const isApproved = APPROVED_ACCESS_LEVELS.includes(formData.accessLevel?.value ?? '');
  if (isApproved && formData.rbacRoles.length && formData.rbacGroups.length) {
    const selectedRoles = formData.rbacRoles.map(r => r.value);
    const selectedGroups = formData.rbacGroups.map(g => g.value);
    const matchedPolicies = policies?.filter(
      p => selectedRoles.includes(p.role) && selectedGroups.includes(p.group)
    ) ?? [];

    const policyResults = await Promise.allSettled(
      matchedPolicies.map(policy =>
        assignPolicy({ authToken, memberUid, policyCode: policy.code })
      )
    );
    const policyFailures = policyResults.filter(r => r.status === 'rejected');
    if (policyFailures.length) {
      toast.warn(`Member created. ${policyFailures.length} policy assignment(s) failed — please assign manually.`);
    }
  }

  // Step 3: grant exception permissions
  if (formData.rbacExceptions.length) {
    const exceptionResults = await Promise.allSettled(
      formData.rbacExceptions.map(exc =>
        grantPermission({ authToken, memberUid, permissionCode: exc.value })
      )
    );
    const excFailures = exceptionResults.filter(r => r.status === 'rejected');
    if (excFailures.length) {
      toast.warn(`Member created. ${excFailures.length} permission exception(s) failed — please assign manually.`);
    }
  }

  // Invalidate caches
  queryClient.invalidateQueries({ queryKey: [MembersQueryKeys.GET_MEMBERS_LIST] });
  queryClient.invalidateQueries({ queryKey: [MembersQueryKeys.GET_MEMBERS_ACCESS_LEVEL_COUNTS] });
  queryClient.invalidateQueries({ queryKey: [RbacQueryKeys.MEMBERS_LIST] });

  toast.success('Member created successfully!');
  handleClose();
};
```

Pass `policies` to `AddMember` from the hook it already calls, or re-use the `usePoliciesList` result. Pass `authToken` as prop to `MemberForm`.

---

### Phase 6 — APPROVED_ACCESS_LEVELS Constant

Add to `utils/constants.ts` (or to `MemberForm/helpers.ts`):

```ts
export const APPROVED_ACCESS_LEVELS = ['L2', 'L3', 'L4', 'L5', 'L6'];
```

---

## Files Summary

### New files
| File | Purpose |
|------|---------|
| `hooks/access-control/useAssignPolicy.ts` | v2 mutation: POST assign-policy |
| `hooks/access-control/useGrantDirectPermissionV2.ts` | v2 mutation: POST member-permissions |
| `screens/members/components/MemberForm/RbacSection/RbacSection.tsx` | Status + Roles + Groups + Exceptions block |
| `screens/members/components/MemberForm/RbacSection/RbacSection.module.scss` | Styles for above |

### Modified files
| File | Change |
|------|--------|
| `screens/members/types/member.ts` | Add `rbacRoles`, `rbacGroups`, `rbacExceptions` to `TMemberForm` |
| `screens/members/components/MemberForm/helpers.ts` | Extend schema with new fields |
| `screens/members/components/MemberForm/MemberForm.tsx` | Add `authToken` prop, wire hooks, add `RbacSection`, update `defaultValues` |
| `screens/members/components/MemberForm/StatusSelector/StatusSelector.tsx` | Add optional `onStatusChange` callback prop |
| `screens/members/components/AddMember/AddMember.tsx` | Multi-step onSubmit: create → assign policies → grant exceptions |

---

## Acceptance Criteria

### Functional

- [x] Status, Roles, Groups, and Permissions exceptions fields appear at the top of the Add New Member modal
- [x] Roles and Groups dropdowns are disabled (greyed out) when Status is not L2–L6
- [x] Switching Status from Approved to non-Approved clears any selected Roles, Groups, and Exceptions
- [x] Switching between Approved levels (L2↔L3↔L4↔L5↔L6) does NOT clear Roles, Groups, Exceptions
- [x] Groups dropdown options are derived from unique `group` values across all policies (from `usePoliciesList`)
- [x] Roles dropdown options come from `useRbacRoles` (displaying role names)
- [x] "+ Add Exception" button opens a searchable permission picker (multi-select)
- [x] Warning banner appears only when at least one exception is selected
- [x] On submit with Approved status + roles + groups: policies matching the role×group cross-product are assigned after member creation
- [x] On submit with exceptions: each exception permission is granted after member creation
- [x] If member creation succeeds but RBAC assignments fail: warning toast shown, modal closes (member still created)
- [x] Submit button shows "Processing..." and is disabled for the entire 3-step sequence
- [x] Form reset on Cancel clears all RBAC fields (handled by RHF `reset()`)
- [x] Roles/Groups/Exceptions fields load while data is fetching (`isLoadingOptions` passes `isDisabled` state)

### Non-Functional

- [x] No TypeScript errors
- [x] `FormMultiselectField` or equivalent with `isDisabled` support
- [x] `APPROVED_ACCESS_LEVELS` constant is the single source of truth for the Approved check (used in both `RbacSection` and `AddMember.tsx`)

---

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| `(role, group)` pair has no matching policy | Silently skip — no UX error. The submit still succeeds for matched pairs. |
| Policies/roles/permissions lists are slow to load | Show dropdowns in loading state (`isLoadingOptions`). Submit still works for member creation even if these lists haven't loaded. |
| v1 vs v2 permission table mismatch | Both use `permissionCode` to identify the same `permission` table. If this fails in QA, switch the exceptions source to the v2 permissions endpoint. |
| `StatusSelector` intercept needs new prop | Add `onStatusChange?: (val) => void` to avoid forking the component. |
| `FormMultiselectField` missing `isDisabled` | Implement `RbacMultiSelect` inline in `RbacSection` rather than modifying shared component — safer, lower blast radius. |

---

## References

- Brainstorm: `docs/brainstorms/2026-04-22-add-member-modal-rbac-fields-brainstorm.md`
- Figma: Images 1–5 (Add new member modal)
- `screens/members/components/AddMember/AddMember.tsx` — current submit handler
- `screens/members/components/MemberForm/MemberForm.tsx:15` — Props interface
- `screens/members/components/MemberForm/helpers.ts:3` — Yup schema
- `components/FormMultiselectField/FormMultiselectField.tsx` — multi-select pattern
- `hooks/access-control/useAssignRole.ts` — mutation hook pattern to follow
- `hooks/access-control/useRbacRoles.ts` — roles data hook
- `hooks/access-control/usePoliciesList.ts` — policies/groups data hook
- `hooks/access-control/useRbacPermissions.ts` — permissions data hook
- RBAC v2 API: `docs/rbac-v2.md`
