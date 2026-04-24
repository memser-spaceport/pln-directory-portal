# Edit Member Modal — RBAC Fields

**Date:** 2026-04-22  
**Status:** Ready for planning

---

## What We're Building

Update the "Edit member" modal to show and manage RBAC assignments inline. Currently the modal only edits profile/status fields — admins must use the separate Access Control screen to change roles, groups, or direct permissions. The redesigned modal adds **Status, Roles, Groups, and Permissions exceptions** at the top (same structure as the Add Member modal), pre-populated from the member's current assignments, with live validation showing when groups become invalid after a role change.

---

## New Behavior vs. Add Member

| Behavior | Add Member | Edit Member |
|----------|------------|-------------|
| RBAC fields shown | Yes (top of modal) | Yes (same layout) |
| Pre-populated | Empty | Current member data |
| Orange warning | No | Yes — shown when a group is auto-removed |
| Save action | Create + assign | Update + diff-assign/revoke |
| Exceptions shown | Yes | Yes (same section) |

---

## Pre-Population

Existing assignments come from the member object (already fetched by `useMember(uid, open)`):

| Form Field | Source |
|------------|--------|
| `rbacRoles` | `member.rbacRoles?.map(r => ({ label: r.name, value: r.name }))` |
| `rbacGroups` | `member.memberPolicies` → deduplicate unique groups → `[{ label: g, value: g }]` |
| `rbacExceptions` | `member.effectivePermissions` filtered to `isDirect === true` → `[{ label: p.description \|\| p.code, value: p.code }]` — or empty if not available |

---

## Orange Warning Logic (Live Validation)

When the admin changes the Roles multi-select, the component re-computes which currently-selected groups still have a matching policy in the policies list:

```
validGroups = selectedGroups.filter(g =>
  policies.some(p => selectedRoles.includes(p.role) && p.group === g.value)
)
invalidGroups = selectedGroups.filter(g => !validGroups.includes(g))
```

**Auto-removal:** Invalid groups are silently removed from the `rbacGroups` form field.  
**Orange message:** For each auto-removed group, show: `"{group.label} group removed — not available for selected roles"` in orange beneath the Groups field.  
**Dismissed:** Warning disappears when roles are changed back or the groups field is manually updated.

---

## Save Sequence (Policy Diff)

On submit, compute the delta between old and new policy assignments:

```
Step 1: PUT/PATCH member profile (same as today — name, email, status, etc.)

Step 2 (if approved status + roles + groups changed):
  oldPolicyCodes = member.memberPolicies?.map(p => p.code) ?? []
  newMatchedPolicies = policies.filter(
    p => selectedRoles.includes(p.role) && selectedGroups.includes(p.group)
  )
  toAssign = newMatchedPolicies.filter(p => !oldPolicyCodes.includes(p.code))
  toRevoke = oldPolicyCodes.filter(code => !newMatchedPolicies.map(p => p.code).includes(code))

  Promise.allSettled([
    ...toAssign.map(p => assignPolicy({ memberUid, policyCode: p.code, authToken })),
    ...toRevoke.map(code => revokePolicy({ memberUid, policyCode: code, authToken })),
  ])

Step 3 (exceptions diff):
  oldExceptionCodes = member.effectivePermissions?.filter(p => p.isDirect).map(p => p.code) ?? []
  toGrantExceptions = newExceptions.filter(e => !oldExceptionCodes.includes(e.value))
  toRevokeExceptions = oldExceptionCodes.filter(c => !newExceptions.map(e => e.value).includes(c))

  Promise.allSettled([
    ...toGrantExceptions.map(e => grantPermission({ memberUid, permissionCode: e.value })),
    ...toRevokeExceptions.map(c => revokePermission({ memberUid, permissionCode: c })),
  ])
```

**Failure handling:** Same as Add Member — partial failure shows warning toast, modal still closes.

---

## New Hook Required

`useRevokePolicy` — `POST /v2/admin/access-control-v2/revoke-policy` (or equivalent endpoint).  
Pattern mirrors `useAssignPolicy` just added. If the endpoint doesn't exist yet, this is a backend prerequisite.

`useRevokePermission` already exists in `hooks/access-control/useRevokePermission.ts`.

---

## Key Decisions

1. **Auto-remove vs. warn-only for invalid groups**: Auto-remove (matches the design — the orange message says "removed", not "invalid").
2. **Diff vs. full reset for policies**: Diff (surgical — only change what actually changed, less risk of accidental full revoke).
3. **Exceptions in Edit modal**: Include — same section as Add Member, pre-populated from `effectivePermissions` where `isDirect: true`.
4. **Second "Roles *" in screenshot**: Design artifact — ignore, there is only one Roles field.

---

## Affected Files

| File | Change |
|------|--------|
| `hooks/access-control/useRevokePolicy.ts` | New hook — POST revoke-policy |
| `screens/members/components/EditMember/EditMember.tsx` | Pre-populate rbacRoles/Groups/Exceptions; multi-step save; pass authToken to MemberForm |
| `screens/members/components/MemberForm/RbacSection/RbacSection.tsx` | Add orange warning display for auto-removed groups |
| `screens/members/components/MemberForm/RbacSection/RbacSection.module.scss` | Orange warning style |

---

## Open Questions

1. **Does `/v2/admin/access-control-v2/revoke-policy` exist on the backend?** If not, the policy-removal step must be deferred or worked around.
2. **`effectivePermissions` vs. `directPermissions`**: The member type has `effectivePermissions` but the access-control types have `directPermissions`. Need to confirm which field holds direct-only (non-role-inherited) permissions for pre-populating Exceptions.
