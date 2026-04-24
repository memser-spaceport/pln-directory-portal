---
date: 2026-04-24
topic: single-policy-dropdown
---

# Single Policy Dropdown in RbacSection

## What We're Building

Replace the two dropdowns in `RbacSection` (Roles + Groups) with a **single Policy multi-select** that lists one row per policy, grouped by role, with in-dropdown search and staged Cancel/Select action buttons. The Permissions Exceptions field stays unchanged. The new control follows the design in the attached screenshots: a trigger that shows selected policies as removable chips, opening into a headless popover with a search input, grouped checkbox rows (role names as group headers), and a footer with Cancel / Select.

Form state `TMemberForm` is migrated: `rbacRoles` and `rbacGroups` are removed and replaced with a single `rbacPolicies: SelectOption[]` where `value = policy.code` and `label` is the human-readable policy name (e.g. `Demo Day Admin (PL Internal)`). `AddMember` and `EditMember` derive the submit payload directly: `policyCodes` = selected codes, `roleCodes` = unique `policy.role` values mapped to codes via `useRbacRoles`.

## Why This Approach

Three options were weighed:

- **Single `rbacPolicies` field** (chosen). Cleanest mental model: what the user selects maps 1:1 to what the backend receives (`policyCodes`). Eliminates the role×group cross-join logic, the "removed group" warning, and dual-source-of-truth risk in `EditMember` prepopulation.
- **Keep `rbacRoles` + `rbacGroups`, derive a virtual policy view.** Preserves the existing TMemberForm shape but retains the awkward filtering cascade and warning side effects — the very thing we're removing.
- **Hybrid** (single `rbacPolicies` + auto-maintained `rbacRoles`). Minimal migration, but two state fields tracking related data invites drift.

For the UI primitive, we're using `@headlessui/react` Popover (already in deps) with a small custom component rather than customizing `react-select`, because the staged Cancel/Select pattern fights react-select's live-apply event model.

## Key Decisions

- **Form state**: single `rbacPolicies: SelectOption[]`, value = policy code, label = policy name. Drop `rbacRoles` and `rbacGroups` from `TMemberForm`.
- **Options shape**: grouped by role — `{ label: role, options: [{ label: policy.name, value: policy.code, role, icon }, ...] }`, sorted by role then by policy name.
- **Selected display (closed state)**: chips with × remove, matching existing `multiSelectStyles` visual language.
- **Search**: substring match across `name`, `role`, and `group` (case-insensitive).
- **Staged selection**: local pending state inside the popover; Cancel reverts, Select commits to form state.
- **Status gating**: policy field stays disabled unless `memberStateStatus === 'Approved'`; clearing approval clears `rbacPolicies` and `rbacExceptions` (same behavior as today).
- **Payload derivation** (AddMember, EditMember):
  - `policyCodes = formData.rbacPolicies.map(p => p.value)`
  - `roleCodes` = unique roles across selected policies, mapped to codes via `useRbacRoles` name→code lookup
  - `permissionCodes = formData.rbacExceptions.map(e => e.value)` (unchanged)
- **EditMember prepopulation**: map `member.policies` directly to `rbacPolicies` SelectOption[] by joining against `policiesData` to pick up the display name. No more splitting into role+group sets.
- **Icons**: include per-policy icons driven by a role→icon map, sourced from the screenshots (shield/check for Directory Admin, circle/check for Infra Team, calendar-star for Demo Day roles, rocket for Founder, trend-line for Investor, loader for Unassigned, outline star for Advisor). Fallback icon for unknown roles.
- **Removed logic**: group-filter-by-selected-roles cascade, `removedGroupWarnings` state, the `Groups` label/hint. Hint text under the Policy field becomes "Search and select one or more policies. Policies are grouped by role."

## Open Questions

- Exact SVG glyphs for the role icons — pin down during the plan phase by cross-referencing the screenshots against any existing icon component in `apps/back-office`. Confirm fallback icon.
- Does `member.policies` payload always include enough info to reconstruct the display label on edit, or do we rely solely on `policiesData` join? (Probably join — same as today.)
- Keyboard affordance: does Select button commit on Enter inside the search box, or only on explicit click?

## Next Steps

→ `/workflows:plan` for implementation details (component file layout, exact icon mapping, migration of `TMemberForm` type + schema, AddMember/EditMember payload refactor, EditMember prepopulation rewrite).
