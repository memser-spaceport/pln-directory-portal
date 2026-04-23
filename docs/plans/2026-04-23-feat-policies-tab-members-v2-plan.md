---
title: "feat: Policies tab on Members V2 page"
type: feat
date: 2026-04-23
---

# feat: Policies Tab on Members V2 Page

## Overview

Add a "Policies" tab to the Members V2 page that lists all access-control policies in a searchable, filterable, paginated table. The tab sits between "Approved Members" and "Rejected Members" in the tab bar and reuses the existing `usePoliciesList` hook (React Query caches the result — no double-fetching).

---

## Design Reference

Design: Image #6 (shared in brainstorm)

Columns: **Policy** (icon + name) · **Role** · **Group** · **Description** · **Modules** (permissions chips + overflow) · **Members** (assignmentsCount) · **Action** (View — no-op)

Toolbar: search input + All roles dropdown + All groups dropdown

---

## Technical Approach

### Data flow

```
index.tsx
  usePoliciesList({ authToken })   ← React Query, shared cache with MemberForm
  filteredPolicies (useMemo)       ← search + role + group client-side filter
  policyRoleOptions / policyGroupOptions (useMemo)

  activeTab === 'POLICIES'
    → toolbar: search input + role Select + group Select
    → <PoliciesTable
          policies={filteredPolicies}
          pagination={policyPagination}
          setPagination={setPolicyPagination}
          globalFilter={policySearch}
       />
```

### PoliciesTable

Standalone TanStack Table component — does NOT extend `MembersTableV2` (which is member-specific). Mirrors its structure: `createColumnHelper<Policy>()` at module level, `useReactTable` with client-side row models, `<PaginationControls table={table} />`.

Column sizes:

| Column | Type | Size |
|--------|------|------|
| policy | display | 220px fixed |
| role | accessor | 160px fixed |
| group | display | 130px fixed |
| description | accessor | flexible |
| modules | display | 200px fixed |
| members | accessor | 90px fixed |
| action | display | 80px fixed |

---

## Implementation Plan

### Phase 1 — `PoliciesTable` component

**New file:** `apps/back-office/screens/members/components/PoliciesTable/PoliciesTable.tsx`

```tsx
// PoliciesTable.tsx
import { createColumnHelper, flexRender, getCoreRowModel,
  getPaginationRowModel, useReactTable, PaginationState } from '@tanstack/react-table';
import { Policy } from '../../../../hooks/access-control/usePoliciesList';
import { PaginationControls } from '../PaginationControls/PaginationControls';
import s from './PoliciesTable.module.scss';

const columnHelper = createColumnHelper<Policy>();

interface Props {
  policies: Policy[];
  pagination: PaginationState;
  setPagination: React.Dispatch<React.SetStateAction<PaginationState>>;
  globalFilter: string;
}

// Modules cell: first 2 chips + "+N more" overflow
const ModulesCell = ({ permissions }: { permissions: string[] }) => (
  <div className={s.badgeRow}>
    {permissions.slice(0, 2).map((p) => (
      <span key={p} className={s.moduleBadge}>{p}</span>
    ))}
    {permissions.length > 2 && (
      <span className={s.overflowBadge}>+{permissions.length - 2}</span>
    )}
  </div>
);

const columns = [
  columnHelper.display({
    id: 'policy',
    size: 220,
    header: () => 'Policy',
    cell: (info) => (
      <div className={s.policyCell}>
        <ShieldIcon className={s.policyIcon} />
        <span className={s.policyName}>{info.row.original.name}</span>
      </div>
    ),
  }),
  columnHelper.accessor('role', { size: 160, header: 'Role' }),
  columnHelper.display({
    id: 'group',
    size: 130,
    header: () => 'Group',
    cell: (info) => (
      <span className={s.groupBadge}>{info.row.original.group}</span>
    ),
  }),
  columnHelper.accessor('description', {
    size: 0,   // flexible
    header: 'Description',
    cell: (info) => info.getValue() ?? '—',
  }),
  columnHelper.display({
    id: 'modules',
    size: 200,
    header: () => 'Modules',
    cell: (info) => <ModulesCell permissions={info.row.original.permissions} />,
  }),
  columnHelper.accessor('assignmentsCount', {
    size: 90,
    header: 'Members',
  }),
  columnHelper.display({
    id: 'action',
    size: 80,
    header: () => 'Action',
    cell: () => (
      <button type="button" className={s.viewBtn}>
        <EyeIcon /> View
      </button>
    ),
  }),
];
```

`useReactTable` call:
```tsx
const table = useReactTable({
  data: policies,
  columns,
  state: { pagination, globalFilter },
  onPaginationChange: setPagination,
  getCoreRowModel: getCoreRowModel(),
  getFilteredRowModel: getFilteredRowModel(),
  getPaginationRowModel: getPaginationRowModel(),
  getRowId: (row) => row.uid,
  globalFilterFn: (row, _colId, filterValue: string) => {
    const q = filterValue.toLowerCase();
    return (
      row.original.name.toLowerCase().includes(q) ||
      (row.original.description ?? '').toLowerCase().includes(q)
    );
  },
  autoResetPageIndex: true,
});
```

Render structure (mirrors `MembersTableV2`):
```tsx
<div className={s.wrapper}>
  <div className={s.root}>
    <div className={s.headerRow}>{/* header cells */}</div>
    {rows.length === 0
      ? <div className={s.emptyState}>No policies found.</div>
      : rows.map(row => (
          <div key={row.id} className={s.bodyRow}>
            {row.getVisibleCells().map(cell => (...))}
          </div>
        ))}
  </div>
  <PaginationControls table={table} />
</div>
```

Fixed vs flexible cell logic: same as `MembersTableV2` — check `!!col.columnDef.size` to apply `s.fixed` (with inline `width`/`flexBasis`) or `s.flexible`.

**New file:** `apps/back-office/screens/members/components/PoliciesTable/PoliciesTable.module.scss`

Reuse class names from `MembersTableV2.module.scss` (same visual language):

```scss
// Copy .wrapper, .root, .headerRow, .headerCell, .bodyRow, .bodyCell,
// .fixed, .flexible, .emptyState, .badgeRow, .groupBadge from MembersTableV2.module.scss

.policyCell {
  display: flex;
  align-items: center;
  gap: 8px;
}

.policyIcon {
  flex-shrink: 0;
  width: 20px;
  height: 20px;
  color: #5e718d;
}

.policyName {
  font-weight: 500;
  color: #0f172a;
}

.moduleBadge {
  // same as .groupBadge — pill style
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 12px;
  background: #f1f5f9;
  color: #374151;
  font-size: 12px;
  white-space: nowrap;
}

.overflowBadge {
  // muted pill for "+N"
  @extend .moduleBadge;
  background: #e2e8f0;
  color: #64748b;
}

.viewBtn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
  color: #1b4dff;
  background: none;
  border: none;
  cursor: pointer;
  padding: 0;
  &:hover { text-decoration: underline; }
}
```

**Icons:** Add a minimal inline `ShieldIcon` and `EyeIcon` SVG in the same file or import from `../icons` if suitable icons exist there. Check `apps/back-office/screens/members/components/icons/` first.

---

### Phase 2 — Update `apps/back-office/pages/members-v2/index.tsx`

#### 2a. Extend tab type

```ts
// Before (line 17):
type MemberStateTab = 'PENDING' | 'VERIFIED' | 'APPROVED' | 'REJECTED';

// After:
type MemberStateTab = 'PENDING' | 'VERIFIED' | 'APPROVED' | 'REJECTED';
type ActiveTab = MemberStateTab | 'POLICIES';
```

Change `useState<MemberStateTab>('PENDING')` → `useState<ActiveTab>('PENDING')`.

Update the `TABS` array to add the new tab **between APPROVED and REJECTED**:
```ts
const MEMBER_STATE_TABS: { id: MemberStateTab; label: string }[] = [
  { id: 'PENDING',  label: 'Pending Members'  },
  { id: 'VERIFIED', label: 'Verified Members' },
  { id: 'APPROVED', label: 'Approved Members' },
  { id: 'REJECTED', label: 'Rejected Members' },
];
```

Render tabs with a special case for POLICIES:
```tsx
{/* Existing member state tabs */}
{MEMBER_STATE_TABS.map((tab) => (
  <button
    key={tab.id}
    className={clsx(s.tab, { [s.tabActive]: activeTab === tab.id })}
    onClick={() => handleTabChange(tab.id)}
  >
    {tab.label}
    <span className={clsx(s.tabCount, { [s.tabCountActive]: activeTab === tab.id })}>
      {tabCounts[tab.id]}
    </span>
  </button>
))}

{/* Policies tab — inserted between APPROVED and REJECTED */}
<button
  className={clsx(s.tab, { [s.tabActive]: activeTab === 'POLICIES' })}
  onClick={() => handleTabChange('POLICIES')}
>
  Policies
  <span className={clsx(s.tabCount, { [s.tabCountActive]: activeTab === 'POLICIES' })}>
    {policiesData?.length ?? 0}
  </span>
</button>
```

> **Note:** Render POLICIES button between the APPROVED and REJECTED buttons in JSX to match the design tab order.

#### 2b. Add policies state

```ts
// After existing filter state:
const [policySearch,      setPolicySearch]      = useState('');
const [policyRoleFilter,  setPolicyRoleFilter]  = useState('');
const [policyGroupFilter, setPolicyGroupFilter] = useState('');
const [policyPagination,  setPolicyPagination]  = useState<PaginationState>({
  pageIndex: 0,
  pageSize: 10,
});
```

#### 2c. Add `usePoliciesList` call

```ts
const { data: policiesData } = usePoliciesList({ authToken });
```

(React Query deduplicates — if MemberForm is open it shares the cache.)

#### 2d. Derived data for policies

```ts
const policyRoleOptions = useMemo(
  () => [
    { label: 'All roles', value: '' },
    ...[...new Set((policiesData ?? []).map((p) => p.role))].sort()
       .map((r) => ({ label: r, value: r })),
  ],
  [policiesData]
);

const policyGroupOptions = useMemo(
  () => [
    { label: 'All groups', value: '' },
    ...[...new Set((policiesData ?? []).map((p) => p.group))].sort()
       .map((g) => ({ label: g, value: g })),
  ],
  [policiesData]
);

const filteredPolicies = useMemo(() => {
  return (policiesData ?? [])
    .filter((p) => !policyRoleFilter  || p.role  === policyRoleFilter)
    .filter((p) => !policyGroupFilter || p.group === policyGroupFilter)
    .filter((p) => {
      if (!policySearch) return true;
      const q = policySearch.toLowerCase();
      return (
        p.name.toLowerCase().includes(q) ||
        (p.description ?? '').toLowerCase().includes(q)
      );
    });
}, [policiesData, policyRoleFilter, policyGroupFilter, policySearch]);
```

#### 2e. Reset policies filters on tab change

In the existing `handleTabChange`:
```ts
const handleTabChange = (tab: ActiveTab) => {
  setActiveTab(tab);
  setPagination((p) => ({ ...p, pageIndex: 0 }));
  setGroupFilter('');
  setRoleFilter('');
  // NEW:
  setPolicySearch('');
  setPolicyRoleFilter('');
  setPolicyGroupFilter('');
  setPolicyPagination((p) => ({ ...p, pageIndex: 0 }));
};
```

#### 2f. Toolbar — add policies toolbar branch

The existing toolbar already shows:
- search input (all tabs)
- group/role dropdowns (APPROVED only)

Add a branch for POLICIES:
```tsx
{/* Search — always visible */}
{activeTab !== 'POLICIES' && (
  <input
    className={s.searchInput}
    placeholder="Search members..."
    value={globalFilter}
    onChange={(e) => { setGlobalFilter(e.target.value); setPagination(p => ({ ...p, pageIndex: 0 })); }}
  />
)}

{activeTab === 'POLICIES' && (
  <input
    className={s.searchInput}
    placeholder="Search policies..."
    value={policySearch}
    onChange={(e) => { setPolicySearch(e.target.value); setPolicyPagination(p => ({ ...p, pageIndex: 0 })); }}
  />
)}

{activeTab === 'APPROVED' && (
  <>
    <Select ... {/* existing group/role dropdowns */} />
  </>
)}

{activeTab === 'POLICIES' && (
  <>
    <Select
      className={s.filterDropdown}
      options={policyRoleOptions}
      value={policyRoleOptions.find((o) => o.value === policyRoleFilter) ?? policyRoleOptions[0]}
      onChange={(opt) => { setPolicyRoleFilter(opt?.value ?? ''); setPolicyPagination(p => ({ ...p, pageIndex: 0 })); }}
      isSearchable={false}
      styles={selectStyles}
    />
    <Select
      className={s.filterDropdown}
      options={policyGroupOptions}
      value={policyGroupOptions.find((o) => o.value === policyGroupFilter) ?? policyGroupOptions[0]}
      onChange={(opt) => { setPolicyGroupFilter(opt?.value ?? ''); setPolicyPagination(p => ({ ...p, pageIndex: 0 })); }}
      isSearchable={false}
      styles={selectStyles}
    />
  </>
)}
```

#### 2g. Table area — conditional render

```tsx
{activeTab !== 'POLICIES' && (
  <MembersTableV2
    members={filteredMembers}
    authToken={authToken}
    activeTab={activeTab as MemberStateTab}
    pagination={pagination}
    setPagination={setPagination}
    globalFilter={globalFilter}
    sorting={sorting}
    setSorting={setSorting}
  />
)}

{activeTab === 'POLICIES' && (
  <PoliciesTable
    policies={filteredPolicies}
    pagination={policyPagination}
    setPagination={setPolicyPagination}
    globalFilter={policySearch}
  />
)}
```

---

## Files Summary

### New Files

| File | Purpose |
|------|---------|
| `screens/members/components/PoliciesTable/PoliciesTable.tsx` | Standalone TanStack Table for policies |
| `screens/members/components/PoliciesTable/PoliciesTable.module.scss` | Styles (reuses MembersTableV2 visual language) |

### Modified Files

| File | Change |
|------|--------|
| `pages/members-v2/index.tsx` | Add `POLICIES` tab, policies state, `usePoliciesList`, filter logic, conditional render |

---

## Acceptance Criteria

- [x] "Policies" tab appears between "Approved Members" and "Rejected Members" with a count badge showing total policy count
- [x] Clicking "Policies" tab renders the policies table, not the members table
- [x] Table shows 7 columns: Policy (icon + name), Role, Group, Description, Modules, Members, Action
- [x] Description column is flexible-width; all other columns are fixed
- [x] Modules column shows first 2 permission chips, then "+N" for overflow
- [x] Group column renders as a pill badge
- [x] Search input filters by policy name and description (case-insensitive)
- [x] "All roles" dropdown filters by `policy.role`
- [x] "All groups" dropdown filters by `policy.group`
- [x] All filters reset when switching away from the Policies tab
- [x] Pagination works (10 per page), Go to page input works
- [x] "View" button renders but performs no action
- [x] No TypeScript errors
- [x] `usePoliciesList` is only called once at page level (React Query deduplication handles MemberForm usage)

---

## References

- Brainstorm: `docs/brainstorms/2026-04-23-policies-tab-members-v2-brainstorm.md`
- Tab pattern: `apps/back-office/pages/members-v2/index.tsx:17-24` (TABS array)
- Table pattern: `apps/back-office/screens/members/components/MembersTableV2/MembersTableV2.tsx`
- Table styles to copy: `apps/back-office/screens/members/components/MembersTableV2/MembersTableV2.module.scss`
- Pagination component: `apps/back-office/screens/members/components/PaginationControls/PaginationControls.tsx`
- Filter pattern: `apps/back-office/pages/members-v2/index.tsx:103-130` (filteredMembers + dropdowns)
- Policy type: `apps/back-office/hooks/access-control/usePoliciesList.ts:4-15`
