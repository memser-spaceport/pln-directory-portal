---
title: "feat: Approved tab — Role, Group, Exceptions columns + filter dropdowns"
type: feat
date: 2026-04-23
---

# Approved Tab — Extra Columns & Filters

## Overview

When the active tab is "Approved Members", `MembersTableV2` gains three extra columns (Role, Group, Exceptions) and the toolbar gains two filter dropdowns (All groups / All roles). All data already comes from the existing members list API endpoint via `enrichMemberAccessData` — no new API calls needed.

## Problem Statement

The Approved Members tab currently shows the same 3-column layout as every other tab. The design requires three additional columns and two toolbar filter dropdowns that give admins visibility into each approved member's RBAC role, policy group, and direct permission exceptions.

## Data Mapping

`enrichMemberAccessData` (in `apps/web-api/src/admin/member.service.ts:124`) adds the following fields to every member in the list response:

| API field | Shape | Approved column |
|---|---|---|
| `roles[]` | `{ uid, code, name, description? }[]` | **Role** — display `name` |
| `policies[]` | `{ uid, code, name, description? }[]` | **Group** — display `name` as badge chip |
| `permissions[]` | `{ uid, code, description? }[]` | **Exceptions** — display `code` with ⚠️ |

The frontend `Member` type (`apps/back-office/screens/members/types/member.ts`) already has `roles?: string[]`, which is the wrong shape — the actual API returns objects. `policies` and `permissions` are not typed at all. These need to be fixed.

## Technical Approach

### Step 1 — Fix the `Member` type

**File:** `apps/back-office/screens/members/types/member.ts`

Replace the incorrect `roles?: string[]` with the full object shape, and add `policies` and `permissions`:

```ts
roles?: { uid: string; code: string; name: string; description?: string | null }[];
policies?: { uid: string; code: string; name: string; description?: string | null }[];
permissions?: { uid: string; code: string; description?: string | null }[];
```

### Step 2 — Add `activeTab` prop to `MembersTableV2`

**File:** `apps/back-office/screens/members/components/MembersTableV2/MembersTableV2.tsx`

Add `activeTab: string` to the `Props` interface. Compute the column list with `useMemo([authToken, activeTab])`. When `activeTab === 'APPROVED'`, append three extra columns after `teamProject` and before `actions`:

```
| Member | Team/Project | Role | Group | Exceptions | Actions |
```

Size the new columns similarly to `actions` (fixed width, e.g. `size: 160`).

#### Role cell

```tsx
columnHelper.display({
  id: 'role',
  header: 'Role',
  cell: (info) => {
    const roles = info.row.original.roles ?? [];
    if (!roles.length) return <span>—</span>;
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {roles.map((r) => <span key={r.code}>{r.name}</span>)}
      </div>
    );
  },
  size: 160,
})
```

#### Group cell

```tsx
columnHelper.display({
  id: 'group',
  header: 'Group',
  cell: (info) => {
    const policies = info.row.original.policies ?? [];
    if (!policies.length) return <span>—</span>;
    return (
      <div className={s.badgeRow}>
        {policies.map((p) => (
          <span key={p.code} className={s.groupBadge}>{p.name}</span>
        ))}
      </div>
    );
  },
  size: 180,
})
```

#### Exceptions cell

```tsx
columnHelper.display({
  id: 'exceptions',
  header: 'Exceptions',
  cell: (info) => {
    const perms = info.row.original.permissions ?? [];
    if (!perms.length) return <span>—</span>;
    return (
      <div className={s.badgeRow}>
        {perms.map((p) => (
          <span key={p.code} className={s.exceptionBadge}>⚠️ {p.code}</span>
        ))}
      </div>
    );
  },
  size: 200,
})
```

#### SCSS additions to `MembersTableV2.module.scss`

```scss
.badgeRow {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.groupBadge {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 12px;
  background: #f1f5f9;
  color: #374151;
  font-size: 12px;
  font-weight: 500;
  white-space: nowrap;
}

.exceptionBadge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border-radius: 12px;
  background: #fff7ed;
  color: #c2410c;
  font-size: 12px;
  font-weight: 500;
  white-space: nowrap;
}
```

### Step 3 — Add filter state and dropdowns to the page

**File:** `apps/back-office/pages/members-v2/index.tsx`

#### New state (at page level)

```ts
const [groupFilter, setGroupFilter] = useState('');
const [roleFilter, setRoleFilter] = useState('');
```

Reset both on tab change:

```ts
const handleTabChange = (id: MemberStateTab) => {
  setActiveTab(id);
  setPagination((p) => ({ ...p, pageIndex: 0 }));
  setGroupFilter('');
  setRoleFilter('');
};
```

#### Filter chain — replace existing `filteredMembers`

```ts
const approvedMembers = useMemo(
  () => members.filter((m) => m.memberState === 'APPROVED'),
  [members]
);

const filteredMembers = useMemo(() => {
  let list = members.filter((m) => m.memberState === activeTab);
  if (activeTab === 'APPROVED') {
    if (groupFilter) {
      list = list.filter((m) => m.policies?.some((p) => p.name === groupFilter));
    }
    if (roleFilter) {
      list = list.filter((m) => m.roles?.some((r) => r.name === roleFilter));
    }
  }
  return list;
}, [members, activeTab, groupFilter, roleFilter]);
```

#### Dropdown options — derived from full Approved member list

```ts
const groupOptions = useMemo(() => {
  const names = new Set<string>();
  for (const m of approvedMembers) {
    for (const p of m.policies ?? []) names.add(p.name);
  }
  return [{ label: 'All groups', value: '' }, ...[...names].sort().map((n) => ({ label: n, value: n }))];
}, [approvedMembers]);

const roleOptions = useMemo(() => {
  const names = new Set<string>();
  for (const m of approvedMembers) {
    for (const r of m.roles ?? []) names.add(r.name);
  }
  return [{ label: 'All roles', value: '' }, ...[...names].sort().map((n) => ({ label: n, value: n }))];
}, [approvedMembers]);
```

#### Toolbar JSX — show dropdowns only on Approved tab

```tsx
<div className={s.toolbar}>
  <div className={s.searchWrapper}>
    <span className={s.searchIcon}><SearchIcon /></span>
    <input className={s.searchInput} placeholder="Search members" value={globalFilter} onChange={handleSearchChange} />
  </div>
  {activeTab === 'APPROVED' && (
    <>
      <div className={s.filterDropdown}>
        <Select
          menuPortalTarget={document.body}
          options={groupOptions}
          value={groupOptions.find((o) => o.value === groupFilter) ?? groupOptions[0]}
          onChange={(val) => { setGroupFilter(val?.value ?? ''); setPagination((p) => ({ ...p, pageIndex: 0 })); }}
          isClearable={false}
          styles={selectStyles}
        />
      </div>
      <div className={s.filterDropdown}>
        <Select
          menuPortalTarget={document.body}
          options={roleOptions}
          value={roleOptions.find((o) => o.value === roleFilter) ?? roleOptions[0]}
          onChange={(val) => { setRoleFilter(val?.value ?? ''); setPagination((p) => ({ ...p, pageIndex: 0 })); }}
          isClearable={false}
          styles={selectStyles}
        />
      </div>
    </>
  )}
  <AddMember authToken={authToken} className={s.addBtn} />
</div>
```

#### `selectStyles` constant — matches `StatusFilter.tsx` pattern

Inline the same `styles` object used in `apps/back-office/screens/members/components/StatusFilter/StatusFilter.tsx:57` as a shared const `selectStyles` at the top of the page file, or extract to a shared module if reused in more places.

#### SCSS additions to `pages/members-v2/styles.module.scss`

```scss
.filterDropdown {
  min-width: 140px;
}
```

### Step 4 — Pass `activeTab` to `MembersTableV2`

In `pages/members-v2/index.tsx`:

```tsx
<MembersTableV2
  members={filteredMembers}
  authToken={authToken}
  activeTab={activeTab}
  pagination={pagination}
  setPagination={setPagination}
  globalFilter={globalFilter}
  sorting={sorting}
  setSorting={setSorting}
/>
```

## Acceptance Criteria

- [x] `Member` type has correct shapes for `roles`, `policies`, and `permissions`
- [x] Approved tab shows Role, Group, Exceptions columns; other tabs show 3 base columns
- [x] Role cell stacks role names vertically; shows `—` when empty
- [x] Group cell shows gray badge chips for each policy name; shows `—` when empty
- [x] Exceptions cell shows orange ⚠️ badges for each direct permission code; shows `—` when empty
- [x] Toolbar shows "All groups" and "All roles" dropdowns only when Approved tab is active
- [x] Selecting a group filters the Approved member list client-side
- [x] Selecting a role filters the Approved member list client-side
- [x] Both filters reset when switching tabs
- [x] Dropdown options are derived dynamically from Approved members (no hardcoded values)
- [x] TypeScript compiles without errors

## Files to Change

| File | Change |
|---|---|
| `apps/back-office/screens/members/types/member.ts` | Fix `roles` shape; add `policies`, `permissions` |
| `apps/back-office/screens/members/components/MembersTableV2/MembersTableV2.tsx` | Add `activeTab` prop; conditional columns |
| `apps/back-office/screens/members/components/MembersTableV2/MembersTableV2.module.scss` | Add `.badgeRow`, `.groupBadge`, `.exceptionBadge` |
| `apps/back-office/pages/members-v2/index.tsx` | Add filter state, filter chain, dropdowns, pass `activeTab` |
| `apps/back-office/pages/members-v2/styles.module.scss` | Add `.filterDropdown` |

## References

- API enrichment: `apps/web-api/src/admin/member.service.ts:124`
- Member type: `apps/back-office/screens/members/types/member.ts`
- MembersTableV2: `apps/back-office/screens/members/components/MembersTableV2/MembersTableV2.tsx`
- Members page: `apps/back-office/pages/members-v2/index.tsx`
- react-select pattern: `apps/back-office/screens/members/components/StatusFilter/StatusFilter.tsx:57`
- Brainstorm: `docs/brainstorms/2026-04-23-approved-tab-extra-columns-brainstorm.md`
