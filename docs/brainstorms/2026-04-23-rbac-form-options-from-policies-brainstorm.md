---
date: 2026-04-23
topic: rbac-form-options-from-policies
---

# RBAC Form: Roles & Groups from usePoliciesList

## What We're Building

Replace the separate `useRbacRoles` call in `MemberForm` with role and group options both derived from `usePoliciesList`. In the Groups dropdown, options are rendered as **React-Select grouped options** — each group header is a role name, and its children are the groups that belong to that role. The Roles dropdown remains a flat list of unique role names extracted from policies.

## Current State

- `rolesOptions` — built from `useRbacRoles` (`r.name` as label, `r.code` as value)
- `groupsOptions` — flat list of unique `policy.group` strings from `usePoliciesList`
- Validation (`handleRolesChange`) checks `policiesData.some(p => newRoleValues.includes(p.role) && p.group === g.value)` — here `newRoleValues` are role **codes** but `p.role` is a role **name string**, making this comparison potentially broken unless the two happen to match

## Why This Approach

`usePoliciesList` is already fetched by `MemberForm` for group validation. Using it as the single source for roles too eliminates a redundant API call (`useRbacRoles`) and makes the form data model consistent with what the Members V2 table now displays. React-Select's grouped option format is the natural fit for "groups under a role" UX without a custom component.

## Key Decisions

- **Drop `useRbacRoles`**: Role options become `[...new Set(policies.map(p => p.role))].sort()` — one fewer network request
- **Role option value**: use `policy.role` string as both label and value (not a code); the submit handler must send whatever the API accepts — see open question below
- **Group options format**: `GroupedOption[]` where each group header is a role and children are the unique groups for that role:
  ```ts
  [
    { label: 'Directory Admin', options: [{ label: 'PL Internal', value: 'PL Internal' }] },
    { label: 'Unassigned',      options: [{ label: 'PLN Other',  value: 'PLN Other'  }] },
  ]
  ```
- **Dynamic group filtering**: when roles change, the available group options are already scoped by the selected roles — rebuild the grouped options filtered to selected roles only, replacing the current `handleRolesChange` validation logic
- **`isLoadingOptions`**: remove `rolesLoading` from the OR — only `policiesLoading` and `permsLoading` remain
- **Exceptions**: `useRbacPermissions` is unchanged

## Open Questions

1. **Role identifier for submit**: the API that receives `rbacRoles` — does it expect the `role` name string (e.g. `"Directory Admin"`) or a code (e.g. `"directory_admin"`)? If it expects codes, we either keep `useRbacRoles` for the value mapping or need a code derivation from the policy role name. **This must be checked before coding the submit path.**
2. **Null roles/groups**: the Policy type declares `role` and `group` as non-nullable strings; if any policy in production has null values, filter them out when building options.

## Next Steps

→ `/workflows:plan` for implementation details
