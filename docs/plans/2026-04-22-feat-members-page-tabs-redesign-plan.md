---
title: "feat: Members page tabs with per-tab column configs and policies view"
type: feat
date: 2026-04-22
---

# feat: Members Page — Per-Tab Column Configs and Policies View

## Overview

The Members page has already been redesigned with a 5-tab layout and new styles. This plan completes the implementation by:

1. Switching from `accessLevel`-based per-tab fetches to a single all-members fetch filtered client-side by `memberState`
2. Adding Role, Group, and Exceptions columns to the **Approved Members** tab with filter dropdowns
3. Building the **Policies** tab backed by `GET /v2/admin/access-control-v2/policies` — a completely different table structure
4. Creating the new cell components these tabs require

---

## Background

The Members page redesign introduced tabs (Pending, Verified, Approved, Policies, Rejected) but still maps tabs to `accessLevel` values and shows a uniform 3-column table everywhere. The designs (Images 3–7) show:

- Pending / Verified / Rejected: 3-col table (Member, Team/Project, Actions)
- Approved: 6-col table with Role, Group, Exceptions + filter dropdowns
- Policies: 7-col table showing policy definitions from a different API endpoint

---

## Proposed Solution

### Data Strategy

Fetch all members in one call (passing all `accessLevel` values) and filter client-side by `memberState`. Tab counts are derived from the same dataset — no separate count API needed.

```
ALL_ACCESS_LEVELS = ['L0', 'L1', 'L2', 'L3', 'L4', 'L5', 'L6', 'Rejected']

const { data } = useMembersList({ authToken, accessLevel: ALL_ACCESS_LEVELS });

tabMembers = data.data.filter(m => m.memberState === TAB_STATE_MAP[activeFilter])
```

The Policies tab fetches independently from `GET /v2/admin/access-control-v2/policies`.

### Tab → Data Mapping

| Tab ID | `memberState` filter | Column Mode | Control Bar |
|--------|---------------------|-------------|-------------|
| `level0` — Pending Members | `PENDING` | simple | Search + Add Member |
| `level1` — Verified Members | `VERIFIED` | simple | Search + Add Member |
| `level2` — Approved Members | `APPROVED` | approved | Search + All Groups + All Roles + Add Member |
| `level56` — Policies | *(separate API)* | policies | Search Policies + All Roles + All Groups |
| `rejected` — Rejected Members | `REJECTED` | simple | Search only |

---

## Architecture

```
pages/members/index.tsx
│
├── useMembersList (ALL_ACCESS_LEVELS)
│   └── allMembers → filter by memberState → tabMembers
│
├── usePoliciesList
│   └── policiesData
│
├── Tab: Pending / Verified / Rejected  ──► useMembersTable (mode='members')
│                                            3 columns: Member, Team/Project, Actions
│
├── Tab: Approved ──────────────────────► useMembersTable (mode='approved')
│   ├── state: groupFilter, roleFilter       6 columns: +Role, Group, Exceptions
│   └── derived: uniqueGroups, uniqueRoles
│
└── Tab: Policies ──────────────────────► usePoliciesTable
    ├── state: roleFilter, groupFilter       7 columns: Policy, Role, Group, Desc,
    └── derived: uniqueRoles, uniqueGroups   Modules, Members, Action
```

---

## Implementation Phases

### Phase 1 — Data Layer

#### 1a. Update `Member` type
**File:** `apps/back-office/screens/members/types/member.ts`

Add fields from the live API response (confirmed via `docs/rbac-v2.md` and sample data):

```ts
// New type alias (replaces the old string[] roles field)
export type MemberRole = {
  uid: string;
  code: string;
  name: string;
  description: string;
};

export type MemberPolicy = {
  uid: string;
  code: string;
  name: string;
  role: string;
  group: string;
};

export type Member = {
  // ... existing fields ...
  memberState: 'PENDING' | 'VERIFIED' | 'APPROVED' | 'REJECTED' | string;  // NEW
  roles: MemberRole[];           // was: roles?: string[]
  policies: MemberPolicy[];      // NEW
  effectivePermissions: { uid: string; code: string; description: string }[];  // NEW
  effectivePermissionCodes: string[];  // NEW
  permissionCodes: string[];     // NEW (already in API response)
  policyCodes: string[];         // NEW (already in API response)
};
```

> ⚠️ **Risk**: `roles` was `string[]` — any existing consumers reading `role.name` on a string will break. Grep for `member.roles` usages before changing.

#### 1b. No hook changes needed for `useMembersList`

The existing hook already accepts `accessLevel: string[]`. Pass all levels from the page:

```ts
// pages/members/index.tsx
const ALL_ACCESS_LEVELS = ['L0', 'L1', 'L2', 'L3', 'L4', 'L5', 'L6', 'Rejected'];
const { data } = useMembersList({ authToken, accessLevel: ALL_ACCESS_LEVELS });
```

No change to `useMembersList.ts` itself — zero risk to other consumers.

#### 1c. Add `POLICIES_LIST` query key
**File:** `apps/back-office/hooks/access-control/constants/queryKeys.ts`

```ts
export const RbacQueryKeys = {
  // ... existing ...
  POLICIES_LIST: 'rbac-policies-list',
};
```

#### 1d. Create policies service + hook
**New file:** `apps/back-office/utils/services/policies.ts`

```ts
import { fetchWithToken } from './api';  // use existing fetch helper

export async function fetchPoliciesList(authToken: string): Promise<Policy[]> {
  const res = await fetchWithToken('/v2/admin/access-control-v2/policies', authToken);
  return res.json();
}
```

**New file:** `apps/back-office/hooks/access-control/usePoliciesList.ts`

```ts
import { useQuery } from '@tanstack/react-query';
import { RbacQueryKeys } from './constants/queryKeys';
import { fetchPoliciesList } from '../../utils/services/policies';

export type PolicyPermission = {
  uid: string;
  policyUid: string;
  permissionUid: string;
  permission: { uid: string; code: string; description: string };
};

export type Policy = {
  uid: string;
  code: string;
  name: string;
  description: string | null;
  role: string;
  group: string;
  isSystem: boolean;
  policyPermissions: PolicyPermission[];
};

export function usePoliciesList({ authToken }: { authToken: string | undefined }) {
  return useQuery({
    queryKey: [RbacQueryKeys.POLICIES_LIST, authToken],
    queryFn: () => fetchPoliciesList(authToken!),
    enabled: !!authToken,
  });
}
```

---

### Phase 2 — New Cell Components

All new components live under `apps/back-office/screens/members/components/`.

#### 2a. `RbacRolesCell` — role names stacked
**New files:** `RbacRolesCell/RbacRolesCell.tsx`, `RbacRolesCell/RbacRolesCell.module.scss`

Renders role names from `member.roles[]` as plain stacked text (not pill badges — the design shows them as regular text lines). Shows "–" when empty.

```tsx
export const RbacRolesCell = ({ member }: { member: Member }) => {
  if (!member.roles?.length) return <span className={s.empty}>–</span>;
  return (
    <div className={s.root}>
      {member.roles.map((role) => (
        <span key={role.uid} className={s.role}>{role.name}</span>
      ))}
    </div>
  );
};
```

> **Reuse note**: `RoleTagsCell` at `screens/access-control/components/RoleTagsCell.tsx` shows pill badges for `RoleBasic[]`. `RbacRolesCell` is for the Members page and shows stacked plain text — keep them separate to match the respective designs.

#### 2b. `GroupCell` — group badges
**New files:** `GroupCell/GroupCell.tsx`, `GroupCell/GroupCell.module.scss`

Renders unique groups from `member.policies[]` as grey pill badges. Shows "–" when empty.

```tsx
export const GroupCell = ({ member }: { member: Member }) => {
  const groups = [...new Set(member.policies?.map((p) => p.group) ?? [])];
  if (!groups.length) return <span className={s.empty}>–</span>;
  return (
    <div className={s.root}>
      {groups.map((g) => <span key={g} className={s.badge}>{g}</span>)}
    </div>
  );
};
```

Styles: light grey pill badge — `background: #f1f5f9`, `border-radius: 9999px`, `padding: 2px 8px`, `font-size: 12px`, `color: #334155`.

#### 2c. `ExceptionsCell` — out-of-policy permissions
**New files:** `ExceptionsCell/ExceptionsCell.tsx`, `ExceptionsCell/ExceptionsCell.module.scss`

Computes exceptions as `effectivePermissionCodes` that are NOT covered by any assigned policy. Shows "–" when none; shows orange warning badges when present.

```tsx
function deriveExceptions(member: Member): string[] {
  // Collect all permission codes covered by assigned policies
  // (This requires cross-referencing — for v1 use a simple approach:
  //  any effectivePermissionCode that doesn't appear in policyCodes context)
  //
  // Simplified v1: any effectivePermissionCodes when policies[] is empty = exceptions
  if (!member.policies?.length && member.effectivePermissionCodes?.length) {
    return member.effectivePermissionCodes;
  }
  return [];  // TODO: proper set-difference once policies are populated
}

export const ExceptionsCell = ({ member }: { member: Member }) => {
  const exceptions = deriveExceptions(member);
  if (!exceptions.length) return <span className={s.empty}>–</span>;
  return (
    <div className={s.root}>
      {exceptions.slice(0, 2).map((code) => (
        <span key={code} className={s.badge}>
          <WarningIcon className={s.icon} />
          {formatPermLabel(code)}
        </span>
      ))}
      {exceptions.length > 2 && (
        <span className={s.overflow}>+{exceptions.length - 2}</span>
      )}
    </div>
  );
};
```

Styles: amber badge — `background: #fff7ed`, `border: 1px solid #fed7aa`, `color: #c2410c`.

#### 2d. `PolicyNameCell` — policy icon + name (for Policies table)
**New files:** `PolicyNameCell/PolicyNameCell.tsx`, `PolicyNameCell/PolicyNameCell.module.scss`

```tsx
export const PolicyNameCell = ({ policy }: { policy: Policy }) => (
  <div className={s.root}>
    <ShieldIcon className={s.icon} />
    <span className={s.name}>{policy.name}</span>
  </div>
);
```

Use a simple shield SVG icon for v1 (role-type-specific icons can be added later).

#### 2e. `ModulesCell` — permission chips with overflow
**New files:** `ModulesCell/ModulesCell.tsx`, `ModulesCell/ModulesCell.module.scss`

Maps permission codes to short module labels and renders chips with `+N` overflow (same ResizeObserver pattern as `ProjectsCell`).

```ts
// Permission code prefix → module label
const MODULE_LABELS: Record<string, string> = {
  'oh': 'OH',
  'forum': 'Forum',
  'demo_day': 'Demo Day',
  'deals': 'Deals',
  'founder_guides': 'Founder Guides',
  'member': 'Members',
  'admin': 'Admin Tool',
};

function getModuleLabel(code: string): string {
  const prefix = code.split('.')[0];
  return MODULE_LABELS[prefix] ?? code;
}
```

Deduplicate modules before rendering (multiple permissions may share the same prefix/module).

---

### Phase 3 — Table Configurations

#### 3a. Update `useMembersTable` — add `approved` mode
**File:** `apps/back-office/screens/members/hooks/useMembersTable.tsx`

Add `mode = 'approved'` case with 6 columns. Remove `rowSelection`/`columnFilters` (already done in previous session).

```tsx
type UseMembersTableArgs = {
  members: Member[] | undefined;
  sorting: SortingState;
  setSorting: Dispatch<SetStateAction<SortingState>>;
  authToken: string | undefined;
  pagination: PaginationState;
  setPagination: Dispatch<SetStateAction<PaginationState>>;
  globalFilter: string;
  setGlobalFilter: Dispatch<SetStateAction<string>>;
  mode?: 'members' | 'roles' | 'approved';  // ← add 'approved'
};
```

Approved mode columns (fixed sizes for Role/Group/Exceptions to keep them compact):

```tsx
if (mode === 'approved') {
  return [
    columnHelper.accessor('name', {
      header: 'Member', sortingFn: 'alphanumeric',
      cell: (info) => <MemberCell member={info.row.original} />, size: 0,
    }),
    columnHelper.accessor('projectContributions', {
      header: 'Team/Project',
      cell: (info) => <ProjectsCell member={info.row.original} />, size: 0, enableSorting: false,
    }),
    columnHelper.display({
      id: 'role', header: 'Role',
      cell: (info) => <RbacRolesCell member={info.row.original} />, size: 180, enableSorting: false,
    }),
    columnHelper.display({
      id: 'group', header: 'Group',
      cell: (info) => <GroupCell member={info.row.original} />, size: 160, enableSorting: false,
    }),
    columnHelper.display({
      id: 'exceptions', header: 'Exceptions',
      cell: (info) => <ExceptionsCell member={info.row.original} />, size: 200, enableSorting: false,
    }),
    columnHelper.display({
      id: 'actions', header: 'Actions',
      cell: (props) => <EditCell member={props.row.original} authToken={authToken} />, size: 88,
    }),
  ];
}
```

#### 3b. Create `usePoliciesTable`
**New file:** `apps/back-office/screens/members/hooks/usePoliciesTable.tsx`

```tsx
import { Policy } from '../../../hooks/access-control/usePoliciesList';

type UsePoliciesTableArgs = {
  policies: Policy[] | undefined;
  pagination: PaginationState;
  setPagination: Dispatch<SetStateAction<PaginationState>>;
  globalFilter: string;
  setGlobalFilter: Dispatch<SetStateAction<string>>;
};

const columnHelper = createColumnHelper<Policy>();

export function usePoliciesTable({ policies, pagination, setPagination, globalFilter, setGlobalFilter }: UsePoliciesTableArgs) {
  const columns = useMemo(() => [
    columnHelper.accessor('name', {
      header: 'Policy', sortingFn: 'alphanumeric',
      cell: (info) => <PolicyNameCell policy={info.row.original} />, size: 0,
    }),
    columnHelper.accessor('role', {
      header: 'Role',
      cell: (info) => <span>{info.getValue()}</span>, size: 200,
    }),
    columnHelper.accessor('group', {
      header: 'Group',
      cell: (info) => <span className={s.groupBadge}>{info.getValue()}</span>, size: 160,
    }),
    columnHelper.accessor('description', {
      header: 'Description',
      cell: (info) => <span>{info.getValue() ?? '–'}</span>, size: 0, enableSorting: false,
    }),
    columnHelper.display({
      id: 'modules', header: 'Modules',
      cell: (info) => <ModulesCell policy={info.row.original} />, size: 220, enableSorting: false,
    }),
    columnHelper.display({
      id: 'members', header: 'Members',
      cell: () => <span>–</span>,  // TODO: add memberCount when API supports it
      size: 88,
    }),
    columnHelper.display({
      id: 'action', header: 'Action',
      cell: () => (
        <button className={s.viewBtn} disabled>
          <EyeIcon /> View
        </button>
      ),
      size: 88,
    }),
  ], []);

  const customFilterFn = (row: Row<Policy>, _columnId: string, filterValue: string) => {
    const v = filterValue?.toLowerCase() ?? '';
    if (!v) return true;
    return (
      row.original.name?.toLowerCase().includes(v) ||
      row.original.role?.toLowerCase().includes(v) ||
      row.original.group?.toLowerCase().includes(v)
    );
  };

  const table = useReactTable({
    data: policies ?? [],
    columns,
    state: { pagination, globalFilter },
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onPaginationChange: setPagination,
    onGlobalFilterChange: setGlobalFilter,
    globalFilterFn: customFilterFn,
    getRowId: (row) => row.uid,
  });

  return { table };
}
```

---

### Phase 4 — Page Updates

#### 4a. Rewrite `pages/members/index.tsx`

Full state inventory for the new page:

```tsx
// Data
const { data } = useMembersList({ authToken, accessLevel: ALL_ACCESS_LEVELS });
const { data: policiesData } = usePoliciesList({ authToken });
const allMembers = data?.data ?? [];

// Active tab (already implemented)
const activeFilter: FilterId = (filter as FilterId | undefined) ?? 'level0';

// Tab → memberState map
const TAB_STATE_MAP: Record<FilterId, string> = {
  level0: 'PENDING',
  level1: 'VERIFIED',
  level2: 'APPROVED',
  level56: '',       // Policies tab — no memberState filter
  rejected: 'REJECTED',
};

// Filtered members for member tabs
const tabMembers = useMemo(() => {
  const state = TAB_STATE_MAP[activeFilter];
  if (!state) return [];  // Policies tab
  return allMembers.filter((m) => m.memberState === state);
}, [allMembers, activeFilter]);

// Tab counts (replaces useAccessLevelCounts)
const tabCounts = useMemo(() => ({
  level0: allMembers.filter((m) => m.memberState === 'PENDING').length,
  level1: allMembers.filter((m) => m.memberState === 'VERIFIED').length,
  level2: allMembers.filter((m) => m.memberState === 'APPROVED').length,
  level56: policiesData?.length ?? 0,
  rejected: allMembers.filter((m) => m.memberState === 'REJECTED').length,
}), [allMembers, policiesData]);

// Per-tab sorting/pagination/search (already partially implemented)
const [sorting, setSorting] = useState<SortingState>([{ id: 'name', desc: false }]);
const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 10 });
const [globalFilter, setGlobalFilter] = useState('');

// Approved tab: group + role filter dropdowns
const [approvedGroupFilter, setApprovedGroupFilter] = useState('');
const [approvedRoleFilter, setApprovedRoleFilter] = useState('');

// Policies tab: own state
const [policiesPagination, setPoliciesPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 10 });
const [policiesSearch, setPoliciesSearch] = useState('');
const [policiesRoleFilter, setPoliciesRoleFilter] = useState('');
const [policiesGroupFilter, setPoliciesGroupFilter] = useState('');

// Reset pagination + filters on tab change
useEffect(() => {
  setPagination((p) => ({ ...p, pageIndex: 0 }));
  setGlobalFilter('');
  setApprovedGroupFilter('');
  setApprovedRoleFilter('');
  setPoliciesPagination((p) => ({ ...p, pageIndex: 0 }));
  setPoliciesSearch('');
}, [activeFilter]);

// Members table (mode depends on active tab)
const membersTableMode = activeFilter === 'level2' ? 'approved' : 'members';

// Filter approved members by dropdown selections
const filteredApprovedMembers = useMemo(() => {
  if (activeFilter !== 'level2') return tabMembers;
  return tabMembers.filter((m) => {
    const matchesGroup = !approvedGroupFilter || m.policies?.some((p) => p.group === approvedGroupFilter);
    const matchesRole = !approvedRoleFilter || m.roles?.some((r) => r.name === approvedRoleFilter);
    return matchesGroup && matchesRole;
  });
}, [tabMembers, approvedGroupFilter, approvedRoleFilter, activeFilter]);

const { table } = useMembersTable({
  members: activeFilter === 'level2' ? filteredApprovedMembers : tabMembers,
  sorting, setSorting,
  authToken,
  pagination, setPagination,
  globalFilter, setGlobalFilter,
  mode: membersTableMode,
});

// Derived dropdown options for Approved tab
const approvedGroups = useMemo(() => {
  const groups = new Set(tabMembers.flatMap((m) => m.policies?.map((p) => p.group) ?? []));
  return [...groups].sort();
}, [tabMembers]);

const approvedRoles = useMemo(() => {
  const roles = new Set(tabMembers.flatMap((m) => m.roles?.map((r) => r.name) ?? []));
  return [...roles].sort();
}, [tabMembers]);

// Filter policies by dropdown selections
const filteredPolicies = useMemo(() => {
  if (!policiesData) return [];
  return policiesData.filter((p) => {
    const matchesRole = !policiesRoleFilter || p.role === policiesRoleFilter;
    const matchesGroup = !policiesGroupFilter || p.group === policiesGroupFilter;
    const matchesSearch = !policiesSearch || 
      p.name.toLowerCase().includes(policiesSearch.toLowerCase()) ||
      p.role.toLowerCase().includes(policiesSearch.toLowerCase()) ||
      p.group.toLowerCase().includes(policiesSearch.toLowerCase());
    return matchesRole && matchesGroup && matchesSearch;
  });
}, [policiesData, policiesRoleFilter, policiesGroupFilter, policiesSearch]);

const { table: policiesTable } = usePoliciesTable({
  policies: filteredPolicies,
  pagination: policiesPagination,
  setPagination: setPoliciesPagination,
  globalFilter: policiesSearch,
  setGlobalFilter: setPoliciesSearch,
});

// Dropdown options for Policies tab
const policiesRoles = useMemo(() => [...new Set(policiesData?.map((p) => p.role) ?? [])].sort(), [policiesData]);
const policiesGroups = useMemo(() => [...new Set(policiesData?.map((p) => p.group) ?? [])].sort(), [policiesData]);
```

**JSX structure:**

```tsx
return (
  <ApprovalLayout>
    <div className={s.root}>
      <div className={s.header}>
        <span className={s.title}>Members</span>
        <p className={s.subtitle}>Manage members and roles for LabOS.</p>
      </div>

      <div className={s.tabs}>
        {tabs.map((tabItem) => (
          <button key={tabItem.id}
            className={clsx(s.tab, { [s.active]: activeFilter === tabItem.id })}
            onClick={() => setFilter(tabItem.id)}
          >
            {tabItem.label}
            <span className={s.tabCount}>{tabCounts[tabItem.id]}</span>
          </button>
        ))}
      </div>

      <div className={s.body}>
        {activeFilter === 'level56' ? (
          /* Policies tab */
          <>
            <div className={s.controlBar}>
              <input value={policiesSearch} onChange={...} placeholder="Search policies" className={s.searchInput} />
              <select className={s.filterSelect} value={policiesRoleFilter} onChange={...}>
                <option value="">All roles</option>
                {policiesRoles.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
              <select className={s.filterSelect} value={policiesGroupFilter} onChange={...}>
                <option value="">All groups</option>
                {policiesGroups.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>
            {renderTable(policiesTable, 'No policies found.')}
            <PaginationControls table={policiesTable} />
          </>
        ) : (
          /* Member tabs */
          <>
            <div className={s.controlBar}>
              <input value={globalFilter} onChange={...} placeholder="Search members" className={s.searchInput} />
              {activeFilter === 'level2' && (
                <>
                  <select className={s.filterSelect} value={approvedGroupFilter} onChange={...}>
                    <option value="">All groups</option>
                    {approvedGroups.map(g => <option key={g} value={g}>{g}</option>)}
                  </select>
                  <select className={s.filterSelect} value={approvedRoleFilter} onChange={...}>
                    <option value="">All roles</option>
                    {approvedRoles.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </>
              )}
              {activeFilter !== 'rejected' && (
                <AddMember className={s.addMemberBtn} authToken={authToken} />
              )}
            </div>
            {renderTable(table)}
            <PaginationControls table={table} />
          </>
        )}
      </div>
    </div>
  </ApprovalLayout>
);
```

#### 4b. Update `pages/members/styles.module.scss`

Add `.filterSelect` (copy from `pages/access-control/styles.module.scss`) and `.viewBtn`:

```scss
.filterSelect {
  height: 36px;
  padding: 0 32px 0 12px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  background: #fff url("...chevron svg...") no-repeat right 10px center;
  appearance: none;
  font-size: 14px;
  color: #0f172a;
  cursor: pointer;
  outline: none;
  white-space: nowrap;
  min-width: 160px;

  &:focus {
    border-color: #5e718d;
    box-shadow: 0 0 0 3px rgba(27, 56, 96, 0.08);
  }
}

.viewBtn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 12px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  background: #fff;
  font-size: 14px;
  font-weight: 500;
  color: #334155;
  cursor: pointer;

  &:hover:not(:disabled) {
    background: #f8fafc;
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}
```

---

## Edge Cases & Error States (from SpecFlow)

### Empty states per tab
Each tab shows: `<div className={s.emptyState}>No [pending members / verified members / approved members / policies / rejected members] found.</div>` when filtered data is empty.

### Loading state
Show `null` / skeleton until `data` is resolved. The existing pattern defers render until `authToken` is set.

### Member with no roles on Approved tab
- Role column: "–"
- Group column: "–"  
- Exceptions column: "–" (or exceptions if `effectivePermissionCodes` exist without any policy)

### Filter interactions (Approved tab)
- Filters are **AND** logic: a member must match the search AND the group filter AND the role filter
- Clearing a dropdown (selecting "All X") removes that filter dimension
- All filters reset to empty when switching tabs

### Policies API failure
If `usePoliciesList` returns an error, the Policies tab body shows `<div className={s.emptyState}>Failed to load policies.</div>`. The tab count badge shows 0.

---

## Acceptance Criteria

### Functional

- [ ] Clicking a tab shows only members matching that `memberState` value (Pending/Verified/Approved/Rejected)
- [ ] Policies tab shows policy definitions from `/v2/admin/access-control-v2/policies`
- [ ] Tab counts reflect client-side filtered data; all 5 counts visible simultaneously
- [ ] Pending/Verified/Rejected: 3-column table (Member, Team/Project, Actions)
- [ ] Approved tab: 6-column table with Role, Group, Exceptions columns
- [ ] Approved tab: "All groups" and "All roles" dropdowns filter the table (AND logic with search)
- [ ] Policies tab: search by name/role/group, "All roles" + "All groups" dropdowns
- [ ] Members with no roles show "–" in Role column; no roles with no policies show "–" in Group
- [ ] Add Member button hidden on Rejected Members and Policies tabs
- [ ] Filter dropdowns reset when switching tabs
- [ ] `?filter=level2` URL deep-links directly to Approved Members tab
- [ ] Pagination works independently per tab (switching tabs resets to page 1)

### Non-Functional

- [ ] No TypeScript errors
- [ ] `Member` type has `memberState`, `roles: MemberRole[]`, `policies: MemberPolicy[]`
- [ ] `usePoliciesList` hook exists and fetches correctly

---

## Dependencies & Risks

| Risk | Mitigation |
|------|-----------|
| `memberState` may not be in `GET /v1/admin/members` response | Test with the local API. If missing, map from `accessLevel` as fallback: L0→PENDING, L1→VERIFIED, L2-L6→APPROVED, Rejected→REJECTED |
| `policies[]` may always be empty on members | Show "–" in Group column for now; log a TODO for backend to populate it |
| Policies API member count missing | Show "–" in Members column as placeholder |
| `roles` type change (was `string[]`) | Grep all usages before changing; update any consumer that reads `role.name` on a string |
| 3000+ members in one API call | The `getPaginationRowModel()` caps renders at 10 rows — no performance issue expected. If the request itself is slow, add a loading spinner keyed on `isLoading`. |

---

## Files Summary

### New files
| File | Purpose |
|------|---------|
| `hooks/access-control/usePoliciesList.ts` | React Query hook for policies API |
| `utils/services/policies.ts` | Fetch function for `/v2/admin/access-control-v2/policies` |
| `screens/members/components/RbacRolesCell/RbacRolesCell.tsx` | Stacked role names display |
| `screens/members/components/RbacRolesCell/RbacRolesCell.module.scss` | — |
| `screens/members/components/GroupCell/GroupCell.tsx` | Group pill badges from policies[] |
| `screens/members/components/GroupCell/GroupCell.module.scss` | — |
| `screens/members/components/ExceptionsCell/ExceptionsCell.tsx` | Orange exception badges |
| `screens/members/components/ExceptionsCell/ExceptionsCell.module.scss` | — |
| `screens/members/components/PolicyNameCell/PolicyNameCell.tsx` | Policy icon + name |
| `screens/members/components/PolicyNameCell/PolicyNameCell.module.scss` | — |
| `screens/members/components/ModulesCell/ModulesCell.tsx` | Permission chips with overflow |
| `screens/members/components/ModulesCell/ModulesCell.module.scss` | — |
| `screens/members/hooks/usePoliciesTable.tsx` | TanStack config for Policies table |

### Modified files
| File | Change |
|------|--------|
| `screens/members/types/member.ts` | Add `memberState`, `MemberRole`, `MemberPolicy` types; update `roles` field |
| `hooks/access-control/constants/queryKeys.ts` | Add `POLICIES_LIST` key |
| `screens/members/hooks/useMembersTable.tsx` | Add `approved` mode (6 columns) |
| `pages/members/index.tsx` | Full rewrite: all-members fetch, memberState filtering, Policies tab |
| `pages/members/styles.module.scss` | Add `.filterSelect`, `.viewBtn` |

---

## References

- Brainstorm: `docs/brainstorms/2026-04-22-members-page-tabs-redesign-brainstorm.md`
- RBAC v2 API: `docs/rbac-v2.md`
- Approval flow: `docs/approval-flow.txt`
- Access-control page (tab + filterSelect patterns): `apps/back-office/pages/access-control/index.tsx`
- Access-control styles: `apps/back-office/pages/access-control/styles.module.scss`
- `ProjectsCell` (ResizeObserver overflow pattern): `apps/back-office/screens/members/components/ProjectsCell/ProjectsCell.tsx`
- `RoleTagsCell` (pill badge pattern, reusable): `apps/back-office/screens/access-control/components/RoleTagsCell.tsx`
- `useMembersList`: `apps/back-office/hooks/members/useMembersList.ts`
- Existing RBAC hooks directory: `apps/back-office/hooks/access-control/`
