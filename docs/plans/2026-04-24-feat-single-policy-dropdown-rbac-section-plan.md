---
title: Single Policy Dropdown in RbacSection
type: feat
date: 2026-04-24
---

# Single Policy Dropdown in RbacSection

## Overview

Collapse the two react-select dropdowns inside `RbacSection` (Roles and Groups) into a single grouped "Policy" multi-select, matching the new design: a trigger showing selected policies as removable chips, and a `@headlessui` Popover panel with search, role-grouped checkbox rows, per-role icons, and staged Cancel / Select footer buttons.

Form state (`TMemberForm`) migrates: `rbacRoles` and `rbacGroups` are removed; a single `rbacPolicies: { label: string; value: string }[]` is introduced (value = policy `code`, label = policy `name`). Submit-time payload derivation simplifies — `policyCodes` comes straight from selections and `roleCodes` is computed from unique `policy.role` values mapped through `useRbacRoles`. `EditMember` prepopulation maps `member.policies` directly to `rbacPolicies` via a `policiesData` join.

Scope is UI-only. Backend contract (`policyCodes` / `roleCodes` / `permissionCodes` on member create/update) is unchanged.

## Problem Statement / Motivation

The current RbacSection forces users to think in two dimensions (role × group) to select a policy, and silently mutates selected groups via a filtering cascade when roles change (surfaced via a "removed group" warning). This is a holdover from an earlier shape of the RBAC API. Since commit `25cdfa9d` the backend accepts `policyCodes` directly — roles and groups are now just the dimensions used to generate a policy list, not the selection unit. A single "Policy" picker:

- Matches the mental model: users select concrete policies, not coordinate pairs
- Removes the role→group filtering cascade and `removedGroupWarnings` side-effect
- Simplifies `AddMember`/`EditMember` payload derivation from an intersection join to a direct map
- Matches the updated design (attached screenshots) that groups policies by role with per-role iconography and a search-first interaction

## Proposed Solution

Add a new feature-scoped component `PolicyMultiSelect` under `screens/members/components/MemberForm/RbacSection/PolicyMultiSelect/`, built on `@headlessui/react` `Popover` (already a dependency at ^1.7.3, first consumer in the repo). Refactor `RbacSection`, `MemberForm`, `AddMember`, `EditMember`, `TMemberForm` type, and `memberFormSchema` yup schema in lockstep. Preserve existing scss-module styling conventions (`RbacSection.module.scss`), Tailwind utilities where natural, and hand-written inline SVG icons (consistent with the rest of `apps/back-office`).

### Implementation Phases

#### Phase 1 — Types, schema, and defaults ✅

Files:
- `apps/back-office/screens/members/types/member.ts` (L28–L60)
- `apps/back-office/screens/members/components/MemberForm/helpers.ts` (yup schema, L51–L53)
- `apps/back-office/screens/members/components/MemberForm/MemberForm.tsx` (defaults, L32–L34)

Actions:
- [x] Drop `rbacRoles?: { label; value }[]` and `rbacGroups?: { label; value }[]` from `TMemberForm`.
- [x] Add `rbacPolicies?: { label: string; value: string }[]` to `TMemberForm`.
- [x] Update yup schema: remove `rbacRoles` / `rbacGroups` validators; add `rbacPolicies: yup.array().of(yup.object({ label: yup.string().required(), value: yup.string().required() })).optional()` so a stray `{ label, value: undefined }` from a race cannot reach submit.
- [x] Update `emptyDefaults` in `MemberForm.tsx`: replace `rbacRoles: []` and `rbacGroups: []` with `rbacPolicies: []`.

Migration sweep — grep the repo for `rbacRoles` and `rbacGroups` string references and update all call sites. Expected hits (from research):
- `RbacSection.tsx` (10+ usages — fully rewritten in Phase 3)
- `AddMember.tsx` L56–L60, L102–L104
- `EditMember.tsx` L146–L153, L182–L196
- `MemberForm.tsx` L32–L34, L84–L90
- `helpers.ts` L51–L52
- `types/member.ts` L30–L31

Verify via `rg "rbacRoles|rbacGroups" apps/back-office` — this list should be exhaustive; the plan fails if any other consumer exists.

#### Phase 2 — Build `PolicyMultiSelect` ✅

New files:
- [x] `apps/back-office/screens/members/components/MemberForm/RbacSection/PolicyMultiSelect/PolicyMultiSelect.tsx`
- [x] `apps/back-office/screens/members/components/MemberForm/RbacSection/PolicyMultiSelect/PolicyMultiSelect.module.scss`
- [x] `apps/back-office/screens/members/components/MemberForm/RbacSection/PolicyMultiSelect/icons.tsx`
- [x] `apps/back-office/screens/members/components/MemberForm/RbacSection/PolicyMultiSelect/roleIconMap.ts`

Component API (`PolicyMultiSelect.tsx`):

```tsx
// PolicyMultiSelect.tsx
export interface PolicyOption {
  label: string;   // e.g. "Demo Day Admin (PL Internal)"
  value: string;   // policy.code
  role: string;    // policy.role — used for grouping + search
  group: string;   // policy.group — used for search
}

interface Props {
  options: PolicyOption[];
  value: { label: string; value: string }[];
  onChange: (next: { label: string; value: string }[]) => void;
  isLoading?: boolean;
  isDisabled?: boolean;
  placeholder?: string;
}
```

Structure (pseudocode):

```tsx
// PolicyMultiSelect.tsx
<Popover className={s.root}>
  {({ open, close }) => (
    <>
      <Popover.Button ref={triggerRef} as="div" className={s.trigger} disabled={isDisabled}>
        {isLoading
          ? <Spinner />
          : value.length === 0
            ? <span className={s.placeholder}>{placeholder}</span>
            : <ChipList value={value} onRemove={handleRemove} disabled={open} />}
        <ChevronIcon />
      </Popover.Button>

      <Popover.Panel className={s.panel} style={{ zIndex: 9999 }}>
        <PanelBody
          open={open}
          close={close}
          options={options}
          value={value}
          onChange={onChange}
          triggerRef={triggerRef}
        />
      </Popover.Panel>
    </>
  )}
</Popover>
```

`PanelBody` (inner component so the `open` render-prop can drive effects):

```tsx
// PolicyMultiSelect.tsx — inner PanelBody
function PanelBody({ open, close, options, value, onChange, triggerRef }) {
  const [pending, setPending] = useState(value);
  const [search, setSearch] = useState('');

  // Re-seed pending each time the panel opens
  useEffect(() => {
    if (open) { setPending(value); setSearch(''); }
  }, [open]); // intentionally not tracking value — re-seed only on open

  // Escape = Cancel (don't let it bubble to Dialog)
  const onKeyDown = (e) => {
    if (e.key === 'Escape') { e.stopPropagation(); close(); triggerRef.current?.focus(); }
  };

  const filtered = useMemo(() => filterPolicies(options, search), [options, search]);
  const grouped  = useMemo(() => groupByRole(filtered), [filtered]);

  const commit = () => { onChange(pending); close(); triggerRef.current?.focus(); };
  const cancel = () => { close(); triggerRef.current?.focus(); };

  return (
    <div onKeyDown={onKeyDown}>
      <SearchInput value={search} onChange={setSearch} />
      <GroupList grouped={grouped} pending={pending} onToggle={togglePending} />
      <Footer onCancel={cancel} onCommit={commit} />
    </div>
  );
}
```

Search helper (`filterPolicies`): NFD-normalize + lowercase both haystack and needle, split needle on whitespace, require every token to match in the concatenated `${name} ${role} ${group}`. Empty string returns full list. Empty result state renders "No matching policies".

Group helper (`groupByRole`): returns `Array<{ role: string; items: PolicyOption[] }>` sorted by role name then item label. Role order is alphabetical except `Unassigned` always sinks to the bottom (matches screenshot ordering).

Icons (`icons.tsx`): seven hand-written inline SVG components — `ShieldCheckIcon`, `CircleCheckIcon`, `CalendarStarIcon`, `RocketIcon`, `TrendUpIcon`, `LoaderIcon`, `OutlineStarIcon` — all accepting `{ className?: string }`. Visual reference: attached Figma screenshots. Color: inherits from Tailwind `text-blue-600` / scss `color: #2563eb` to match modal accent.

Role→icon map (`roleIconMap.ts`):

```ts
// roleIconMap.ts
export const ROLE_ICON_MAP: Record<string, React.FC<{ className?: string }>> = {
  'Directory Admin': ShieldCheckIcon,
  'Infra Team': CircleCheckIcon,
  'Demo Day Admin': CalendarStarIcon,
  'Demo Day Stakeholder': CalendarStarIcon,
  'Founder': RocketIcon,
  'Investor': TrendUpIcon,
  'Unassigned': LoaderIcon,
  'Advisor': OutlineStarIcon,
};

export const FALLBACK_ICON = ShieldCheckIcon;
```

Match is case-sensitive and exact — if the backend returns a role name not in the map we render `FALLBACK_ICON`. No normalization (roles are well-defined in `policiesData`).

SCSS (`PolicyMultiSelect.module.scss`): reuse color tokens from `RbacSection.module.scss` — border `1px solid rgba(203,213,225,0.50)`, hover border `#5E718D`, hover ring `0 0 0 4px rgba(27,56,96,0.12)`, radius 8, min-height 40, font-size 14. Chip style matches existing react-select multiValue: bg `#f1f5f9`, label `#334155`, close × hover bg `#e2e8f0`. Trigger uses `flex-wrap` with `max-height: 80px` and `overflow-y: auto` so 20+ chips scroll rather than blow out the modal. Chip label has `max-width: 180px` with ellipsis and a `title={label}` tooltip.

Accessibility contract:
- Trigger: `Popover.Button` already emits `aria-expanded`; also set `aria-haspopup="listbox"` and `aria-labelledby="policy-field-label"` bound to the `Policy` label.
- Search input: `role="searchbox"`, `aria-label="Search policies"`.
- Group headers: plain `<div role="presentation">` (decorative).
- Rows: wrap the checkbox + label in a `<label>` so clicking the row toggles the box, `<input type="checkbox" aria-labelledby="policy-row-{code}">`.
- Chip remove: `aria-label="Remove {label}"`.
- Empty state: `aria-live="polite"` so search-with-no-results announces.
- Focus restoration: explicit `triggerRef.current?.focus()` on Cancel, Select, and Escape so keyboard users land back on the trigger (headless Popover does this by default but we want it deterministic inside a Dialog).

Keyboard contract (v1):
- Tab moves through search → each checkbox → Cancel → Select.
- Space on a checkbox toggles pending.
- Enter on Cancel / Select activates the button.
- Escape = Cancel (stopPropagation to keep Dialog open).
- Arrow-key list navigation is **not** implemented for v1 (documented trade-off; revisit if UX demands it — would require switching to `Combobox` and re-doing the staged commit pattern).

#### Phase 3 — Refactor `RbacSection` ✅

File: `apps/back-office/screens/members/components/MemberForm/RbacSection/RbacSection.tsx`

Remove:
- `RbacMultiSelect` wiring for `rbacRoles` and `rbacGroups` (keep it for `rbacExceptions`)
- `groupedGroupOptions` memo
- `handleRolesChange` function
- `removedGroupWarnings` state + render block
- `selectedRoles` watcher

Add:
- Watcher for `rbacPolicies`
- `<PolicyMultiSelect>` render block between Status and Permissions Exceptions
- Label `Policy` with red asterisk when `isApproved`, hint text: "Search and select one or more policies. Policies are grouped by role."
- Update `handleMemberStateChange`: clear `rbacPolicies` and `rbacExceptions` when leaving Approved.

Props change:
- Drop `rolesOptions: SelectOption[]` and `policiesData?: Policy[]`.
- Add `policyOptions: PolicyOption[]` (pre-computed by parent).
- Keep `exceptionsOptions`, `isLoadingOptions`.

Remove the inline react-select style objects (`singleSelectStyles`, `multiSelectStyles`) that were only used by the old Roles/Groups selects. Keep the `singleSelectStyles` block since it's still used for the Status select.

Remove the `.groupRemovedWarning` class from `RbacSection.module.scss`.

#### Phase 4 — Refactor `MemberForm.tsx` ✅

File: `apps/back-office/screens/members/components/MemberForm/MemberForm.tsx`

Remove the `rolesOptions` memo (L84–L90). Add a `policyOptions` memo:

```tsx
// MemberForm.tsx
const policyOptions = useMemo<PolicyOption[]>(
  () =>
    (policiesData ?? [])
      .filter((p) => p.role && p.group)
      .map((p) => ({ label: p.name, value: p.code, role: p.role, group: p.group })),
  [policiesData]
);
```

Pass `policyOptions` to `RbacSection` instead of `rolesOptions` + `policiesData`.

#### Phase 5 — Refactor `AddMember.tsx` + `EditMember.tsx` payload derivation ✅

Files:
- `apps/back-office/screens/members/components/AddMember/AddMember.tsx` (L54–L104)
- `apps/back-office/screens/members/components/EditMember/EditMember.tsx` (L144–L153)

Replace the `roleValues` / `groupValues` / `matchedPolicies` intersection block with:

```ts
// AddMember.tsx / EditMember.tsx — shared shape
const isApproved = formData.memberStateStatus?.value === 'Approved';
const selectedPolicies = isApproved ? (formData.rbacPolicies ?? []) : [];

const policyByCode = new Map((policiesData ?? []).map((p) => [p.code, p]));
const roleNameToCode = new Map((rbacRolesData ?? []).map((r) => [r.name, r.code]));

const selectedRoleNames = new Set<string>();
for (const p of selectedPolicies) {
  const policy = policyByCode.get(p.value);
  if (policy?.role) selectedRoleNames.add(policy.role);
}

const roleCodes: string[] = [];
const unresolvedRoleNames: string[] = [];
for (const name of selectedRoleNames) {
  const code = roleNameToCode.get(name);
  if (code) roleCodes.push(code);
  else unresolvedRoleNames.push(name);
}
if (unresolvedRoleNames.length > 0) {
  // eslint-disable-next-line no-console
  console.warn('[RBAC] Could not resolve roleCodes for role names:', unresolvedRoleNames);
}

payload.roleCodes = roleCodes;
payload.policyCodes = selectedPolicies.map((p) => p.value);
payload.permissionCodes = isApproved ? (formData.rbacExceptions ?? []).map((e) => e.value) : [];
```

Guard against missing data at submit: if `!rbacRolesData || !policiesData`, the submit handler short-circuits with a `toast.error('RBAC options still loading — try again in a moment.')` instead of silently sending empty `roleCodes`. Apply the same guard in both AddMember and EditMember.

#### Phase 6 — EditMember prepopulation rewrite ✅

File: `apps/back-office/screens/members/components/EditMember/EditMember.tsx` (L182–L196)

Replace the role/group derivation block with a direct policy-code join plus a stale-code safety net:

```ts
// EditMember.tsx
const memberPolicyCodes = (member.policies ?? []).map((p) => p.code);
const assignedPolicies = (policiesData ?? []).filter((p) =>
  memberPolicyCodes.includes(p.code)
);
const knownCodes = new Set(assignedPolicies.map((p) => p.code));
const staleCodes = memberPolicyCodes.filter((c) => !knownCodes.has(c));

const rbacPolicies = [
  ...assignedPolicies.map((p) => ({ label: p.name, value: p.code })),
  ...staleCodes.map((code) => ({ label: `${code} (unknown)`, value: code })),
];
```

Stale codes are kept as chips labelled `<code> (unknown)` — a muted visual treatment in the trigger — so saving the form does not silently wipe policies the current `policiesData` fetch happens not to include. (The backend is still the source of truth; we want UX to be loss-safe when a policy is renamed or temporarily unavailable.)

Drop `rbacRoles` and `rbacGroups` from the returned `initialData` object.

## Technical Considerations

### Popover inside Dialog — focus, Escape, scroll
- The Add/Edit modal is a `@headlessui` Dialog at z-index 100. `Popover.Panel` needs `zIndex: 9999` (inline style) and must render *inside* the Dialog's DOM subtree so focus trap includes it. Do **not** use `<Portal>` — portaling outside Dialog breaks the focus trap and produces weird tab-out behaviour.
- Escape handler on Panel must `stopPropagation` to prevent Dialog's own Escape handler from closing the modal. Also call `close()` explicitly and refocus the trigger.
- Click-outside is handled by Popover by default (same as Cancel). Pending state is ephemeral — losing it is correct behaviour.
- Modal's form container (`.flex.w-full.flex-1.flex-col.gap-4.p-6`) may need `overflow: visible` if the panel spills; verify during dev. If clipping occurs, anchor the panel absolutely off the trigger with `position: absolute; top: 100%; inset-inline: 0`.

### Loading races
- `policiesData` and `rbacPermissionsData` may be `undefined` on first render. `PolicyMultiSelect` takes `isLoading` — when true, trigger renders a small spinner inline (not just disabled cursor) so the UI state is visible.
- Guard submit on both `policiesData` and `rbacRolesData` being loaded (see Phase 5). Without the guard, a fast-clicking user submits an empty `roleCodes` silently.

### Stale data on Edit
- If `member.policies` contains codes absent from `policiesData`, the chip label falls back to `<code> (unknown)` and the chip renders with muted styling (`opacity: 0.6`). Save preserves the code.
- `roleCodes` derivation still uses `policyByCode` — unknown codes contribute **no** role, which is acceptable (we never knew the role).

### `roleCodes` mapping fragility
- `rbacRolesData.name` must match `policy.role` exactly (same casing, same whitespace). If a role name drifts, `roleCodes` silently drops that role. We add a `console.warn` at submit time listing unresolved role names so the drift is visible in dev/staging.
- If the API exposes a `policy.roleCode` field in future, prefer that over the name lookup. Current `Policy` type does not carry it (see `usePoliciesList.ts` L4–L15).

### Chip overflow
- Trigger wraps chips with `flex-wrap`, caps at `max-height: 80px` (~2 rows), scrolls vertically beyond. Each chip has `max-width: 180px` with ellipsis label; `title={label}` gives hover tooltip.
- Chip × is visually hidden (not clickable) while the popover is open — prevents `pending` state from going stale mid-staging.

### Search behaviour
- Case-insensitive. NFD-normalize + strip diacritics on both sides. Split needle on whitespace; every token must match the concatenated `"{name} {role} {group}"` (AND semantics). Empty string returns full list.
- Debounce is **not** needed (list is ≤50 policies, filtering is in-memory).

### Accessibility
- See Phase 2 ARIA contract.
- Manual verification: run the modal through VoiceOver / NVDA, confirm trigger announces "Policy, combobox, expanded" and each row is reachable with descriptive announcement.

### Styling parity
- New SCSS module mirrors the existing `RbacSection.module.scss` visual tokens. No Tailwind utilities in the new component file (consistent with the surrounding MemberForm subtree, which is scss-module throughout). Row checkboxes use raw `<input type="checkbox">` + wrapper label (same pattern as `AddRoleModal.tsx:121`).

## Acceptance Criteria

### Functional
- [ ] `TMemberForm` no longer contains `rbacRoles` or `rbacGroups`; has `rbacPolicies?: { label: string; value: string }[]`.
- [ ] `memberFormSchema` validates `rbacPolicies` entries as objects with required `label` and `value` strings; remains optional at the array level.
- [ ] Opening the Add Member modal with status ≠ Approved renders a disabled Policy field. Selecting `Approved` enables the field and shows a required-asterisk.
- [ ] Clicking the Policy trigger opens a popover with a search input, role-grouped checkbox rows, per-role icons (fallback for unknown roles), and Cancel / Select footer.
- [ ] Checkbox toggles update pending state only — the trigger does not reflect changes until Select is clicked.
- [ ] Clicking Select commits pending → form state and closes the popover. Focus returns to the trigger.
- [ ] Clicking Cancel, Escape, or outside the popover closes it without committing. Focus returns to the trigger.
- [ ] Escape on the open popover does not close the parent Dialog.
- [ ] Search filter matches substrings across policy name, role, and group, case-insensitive, diacritic-insensitive, whitespace-split AND semantics. Empty results render "No matching policies" with `aria-live="polite"`.
- [ ] Removing a chip via × in the closed-state trigger updates `rbacPolicies` immediately. × is disabled while the popover is open.
- [ ] Switching status away from Approved clears `rbacPolicies` and `rbacExceptions`.
- [ ] Add Member submit sends `policyCodes` = selected codes, `roleCodes` = unique roles across selected policies mapped via `useRbacRoles`, `permissionCodes` = exception codes. Empty arrays when not Approved.
- [ ] Edit Member prepopulates `rbacPolicies` from `member.policies` joined against `policiesData`. Policy codes not in `policiesData` render as chips labelled `<code> (unknown)` with muted styling and are preserved on save.
- [ ] Edit Member submit uses the same derivation as Add.
- [ ] If `policiesData` or `rbacRolesData` is not yet loaded when the user clicks Submit, the form shows a `toast.error('RBAC options still loading — try again in a moment.')` and does not submit.

### Non-functional
- [ ] Chip list wraps at 2 rows (`max-height: 80px`, `overflow-y: auto`), chip label truncates at 180px with a title tooltip.
- [ ] Popover panel renders at `zIndex: 9999` and appears above the Dialog contents in all tested browsers.
- [ ] Keyboard navigation: Tab reaches search, each checkbox, Cancel, Select. Space toggles checkboxes. Enter activates Cancel / Select. Escape = Cancel.
- [ ] No `any` in new code (AGENTS.md rule 2).
- [ ] TypeScript build passes (`yarn tsc --noEmit` or equivalent).
- [ ] No ESLint violations on changed files.

### Quality gates
- [ ] Grep the repo for `rbacRoles` / `rbacGroups` post-refactor — zero hits outside the plan/brainstorm docs.
- [ ] Manual smoke test in dev server: add a new member with 0, 1, and 3 policies across different roles; edit a member, verify pre-populated chips match `member.policies`; edit a member with a stale policy code (simulate by editing `policiesData` response in devtools) and confirm the unknown chip survives save.
- [ ] Manual accessibility pass with VoiceOver / NVDA on trigger + panel.

## Dependencies & Risks

### Dependencies
- `@headlessui/react` 1.7.3 (existing). `Popover`, `Popover.Button`, `Popover.Panel` are the APIs used.
- `react-hook-form` 7.x (existing) — `useFormContext`, `watch`, `setValue`.
- `yup` (existing) via `@hookform/resolvers/yup`.
- `usePoliciesList`, `useRbacPermissions`, `useRbacRoles` hooks (existing, unchanged).

### Risks
- **Focus trap**: `@headlessui` `Dialog` + `Popover` interaction is not officially exercised in this codebase. Mitigation: render Panel inside Dialog DOM (no Portal), add explicit focus restoration, smoke-test keyboard.
- **roleCodes drift**: name-based lookup is fragile. Mitigation: `console.warn` on unresolved names; follow-up ticket if drift is observed to switch to a code-based field on Policy.
- **Stale policy codes on save**: mitigated via the `(unknown)` chip strategy.
- **UI regression on existing MemberForm flows**: `StatusSelector` path (non-RBAC) must continue to render when `showRbacSection={false}`. No change there, but smoke-test `/members` (legacy) alongside `/members-v2` (RBAC).
- **No tests in this area**: regressions will only be caught by manual QA. Mitigation: optional — add a lightweight unit test for `filterPolicies` and `groupByRole` helpers since they're pure; defer component-level tests.

## References

### Internal
- Brainstorm: `docs/brainstorms/2026-04-24-single-policy-dropdown-brainstorm.md`
- Current component: `apps/back-office/screens/members/components/MemberForm/RbacSection/RbacSection.tsx:1-267`
- Parent form: `apps/back-office/screens/members/components/MemberForm/MemberForm.tsx:80-125`
- Add flow: `apps/back-office/screens/members/components/AddMember/AddMember.tsx:54-104`
- Edit flow: `apps/back-office/screens/members/components/EditMember/EditMember.tsx:144-196`
- Types: `apps/back-office/screens/members/types/member.ts:28-60`
- Schema: `apps/back-office/screens/members/components/MemberForm/helpers.ts:51-53`
- Policies hook: `apps/back-office/hooks/access-control/usePoliciesList.ts:4-15`
- Roles hook: `apps/back-office/hooks/access-control/useRbacRoles.ts`
- Existing icon patterns: `apps/back-office/screens/members/components/icons.tsx`, `apps/back-office/screens/members/components/PoliciesTable/PoliciesTable.tsx:27` (ShieldIcon)
- Existing checkbox row pattern: `apps/back-office/screens/access-control/components/AddRoleModal.tsx:121`
- Existing Dialog pattern: `apps/back-office/components/modal/modal.tsx`
- Conventions: `AGENTS.md` (root) — rules 2, 10, 12, 14
- API shapes: `docs/members-api-updates-v3 (1).txt:419-421`, `docs/member-updates-rbac2.0.txt`
- Related recent work: commits `25cdfa9d`, `db33f245`, `3e6e175c`, `38195f69` (RBAC field introduction and payload inlining)

### External
- `@headlessui/react` Popover docs (v1.7): https://headlessui.com/v1/react/popover — `Popover.Button` render prop, `Popover.Panel` close function.
