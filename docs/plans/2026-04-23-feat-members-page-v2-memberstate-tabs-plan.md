---
title: "feat: Members page v2 with memberState-driven tabs"
type: feat
date: 2026-04-23
brainstorm: docs/brainstorms/2026-04-23-members-page-v2-brainstorm.md
---

# feat: Members page v2 with memberState-driven tabs

## Overview

New back-office members page at `/pages/members-v2/` — a clean redesign of the existing members view. Four tabs (Pending / Verified / Approved / Rejected) replace the access-level filter bar. A single API call fetches all members; client-side filtering by `memberState`, a shared search bar, and per-table TanStack pagination replace the current multi-group / URL-param approach.

The existing `/pages/members/` route is **untouched** during the v2 build.

---

## Prerequisite

**The refactor plan's Phase 1 must ship first:**
`docs/plans/2026-04-23-refactor-group-members-by-memberstate-plan.md`

That phase adds `memberState?: 'PENDING' | 'VERIFIED' | 'APPROVED' | 'REJECTED'` to the front-end `Member` type and adds the `withMemberState()` derivation mapper on every backend list endpoint.

Without it, `m.memberState` is `undefined` on every row and all tabs show zero members.

**Fallback (if Phase 1 is not yet merged):** derive `memberState` client-side in the page component using the same mapping (`L0 → PENDING`, `L1 → VERIFIED`, `L2–L6 → APPROVED`, `Rejected → REJECTED`) instead of relying on the API field.

---

## Data Flow

```mermaid
flowchart LR
  Page["members-v2/index.tsx"] -->|accessLevel=ALL_LEVELS| Hook["useMembersList(authToken, ALL_LEVELS)"]
  Hook -->|react-query cache| API["GET /v1/admin/members?accessLevel=L0,L1,...,Rejected"]
  API -->|Member[]| Hook
  Hook --> Page
  Page -->|useMemo| TabCounts["{ PENDING:N, VERIFIED:N, APPROVED:N, REJECTED:N }"]
  Page -->|useMemo + activeTab| Filtered["Member[] for active tab"]
  Filtered --> TableV2["MembersTableV2"]
  TableV2 --> PaginationControls
```

**Why all members in one call works:** `useMembersList` omits `page`/`limit` params, so the Prisma query has no `take`/`skip` — all matching rows are returned. Passing every access level (`L0,L1,L2,L3,L4,L5,L6,Rejected`) yields the full member list in one round-trip.

---

## Component Hierarchy

```
/pages/members-v2/index.tsx          ← page, all state lives here
  ApprovalLayout                     ← reused (Navbar + main)
    <div .root>
      <header>                       ← title + subtitle
      TableFilter                    ← reused tab bar with count badges
        <AddMember />                ← slotted as child (existing component)
      <input .searchInput>           ← shared search
      MembersTableV2                 ← NEW — 3-column table
        PaginationControls           ← reused
```

---

## Implementation Plan

### Phase 1 — Member type (`if not already done`)

**File:** `apps/back-office/screens/members/types/member.ts`

Add after the last existing field (line ~23):
```ts
memberState?: 'PENDING' | 'VERIFIED' | 'APPROVED' | 'REJECTED';
```

Skip if the refactor plan's Phase 1 is already merged.

---

### Phase 2 — `MembersTableV2` component

**New files:**
```
apps/back-office/screens/members/components/MembersTableV2/
  MembersTableV2.tsx
  MembersTableV2.module.scss
  index.ts
```

#### Props interface

```ts
// MembersTableV2.tsx
import { PaginationState, SortingState } from '@tanstack/react-table';
import { Dispatch, SetStateAction } from 'react';
import { Member } from '../../types/member';

interface Props {
  members: Member[];
  authToken: string;
  pagination: PaginationState;
  setPagination: Dispatch<SetStateAction<PaginationState>>;
  globalFilter: string;
  sorting: SortingState;
  setSorting: Dispatch<SetStateAction<SortingState>>;
}
```

#### Column definitions (3 columns)

| # | id | Header | Renderer | Width |
|---|---|---|---|---|
| 1 | `name` | `Member` | `<MemberCell member={row.original} />` | flexible (`size: 0`) |
| 2 | `teamProject` | `Team/Project` | `<TeamProjectCell member={row.original} />` | flexible (`size: 0`) |
| 3 | `actions` (display) | `Actions` | `<EditActionCell member={row.original} authToken={authToken} />` | `100px` fixed |

#### `TeamProjectCell` (inline sub-component, ~20 lines)

```tsx
function TeamProjectCell({ member }: { member: Member }) {
  const teams = member.teamMemberRoles?.map(r => r.team) ?? [];
  const projects = member.projectContributions?.map(c => c.project) ?? [];
  const items = [...teams, ...projects];
  if (items.length === 0) return <span>—</span>;
  return (
    <span>
      {items.map((item, i) => (
        <span key={item.uid}>
          {i > 0 && ', '}
          <span>{item.name}</span>
        </span>
      ))}
    </span>
  );
}
```

#### `EditActionCell` (inline sub-component, ~25 lines)

```tsx
function EditActionCell({ member, authToken }: { member: Member; authToken: string }) {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <>
      <button onClick={() => setIsOpen(true)}>✏ Edit</button>
      {isOpen && (
        <EditMember
          member={member}
          authToken={authToken}
          onClose={() => setIsOpen(false)}
        />
      )}
    </>
  );
}
```

#### Table config

```ts
const table = useReactTable({
  data: members,
  columns,
  state: { pagination, globalFilter, sorting },
  onPaginationChange: setPagination,
  onSortingChange: setSorting,
  getCoreRowModel: getCoreRowModel(),
  getFilteredRowModel: getFilteredRowModel(),
  getPaginationRowModel: getPaginationRowModel(),
  getSortedRowModel: getSortedRowModel(),
  globalFilterFn: (row, _, value) => {
    const m = row.original;
    const q = (value as string).toLowerCase();
    return (
      (m.name?.toLowerCase().includes(q) ?? false) ||
      (m.email?.toLowerCase().includes(q) ?? false) ||
      (m.projectContributions?.some(p =>
        p.project.name.toLowerCase().includes(q)
      ) ?? false)
    );
  },
  getRowId: row => row.uid,
});
```

#### Empty state

```tsx
{table.getRowModel().rows.length === 0 && (
  <tr>
    <td colSpan={columns.length} className={s.emptyState}>
      No members
    </td>
  </tr>
)}
```

#### `MembersTableV2.module.scss`

```scss
.root { border: 1px solid #ddd; border-radius: 10px 10px 0 0; }
.table { width: 100%; border-collapse: collapse; }
.headerRow { display: flex; border-bottom: 1px solid #eee; }
.headerCell { height: 52px; display: flex; align-items: center; font-size: 14px; font-weight: 500; padding: 0 12px; }
.bodyRow { display: flex; border-bottom: 1px solid #eee; background: #fff; }
.bodyCell { display: flex; align-items: center; font-size: 14px; padding: 12px; }
.fixed { flex: 0 0 auto; }
.flexible { flex: 1; min-width: 0; }
.emptyState { padding: 40px; text-align: center; color: #5E718D; font-size: 14px; }
```

---

### Phase 3 — Page component

**New files:**
```
apps/back-office/pages/members-v2/
  index.tsx
  styles.module.scss
```

#### Constants

```ts
// index.tsx (top of file, outside component)
const ALL_LEVELS = ['L0', 'L1', 'L2', 'L3', 'L4', 'L5', 'L6', 'Rejected'];

type MemberStateTab = 'PENDING' | 'VERIFIED' | 'APPROVED' | 'REJECTED';

const TABS: { id: MemberStateTab; label: string; activeColor: string }[] = [
  { id: 'PENDING',  label: 'Pending Members',  activeColor: '#D97706' },
  { id: 'VERIFIED', label: 'Verified Members', activeColor: '#1B4DFF' },
  { id: 'APPROVED', label: 'Approved Members', activeColor: '#0A9952' },
  { id: 'REJECTED', label: 'Rejected Members', activeColor: '#D21A0E' },
];
```

#### State (all managed in page component)

| Variable | Type | Initial | Purpose |
|---|---|---|---|
| `activeTab` | `MemberStateTab` | `'PENDING'` | Which tab is active |
| `globalFilter` | `string` | `''` | Search input |
| `pagination` | `PaginationState` | `{ pageIndex: 0, pageSize: 20 }` | Reset to 0 on tab or search change |
| `sorting` | `SortingState` | `[{ id: 'name', desc: false }]` | Default A→Z by name |

#### Derived values

```ts
const { data, isLoading, isError } = useMembersList({ authToken, accessLevel: ALL_LEVELS });
const members = data?.data ?? [];

const tabCounts = useMemo<Record<MemberStateTab, number>>(() => {
  const base = { PENDING: 0, VERIFIED: 0, APPROVED: 0, REJECTED: 0 };
  for (const m of members) {
    if (m.memberState && m.memberState in base) {
      base[m.memberState as MemberStateTab]++;
    }
  }
  return base;
}, [members]);

const filteredMembers = useMemo(
  () => members.filter(m => m.memberState === activeTab),
  [members, activeTab]
);
```

#### Handlers

```ts
const handleTabChange = (id: string) => {
  setActiveTab(id as MemberStateTab);
  setPagination(p => ({ ...p, pageIndex: 0 }));
};

const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
  setGlobalFilter(e.target.value);
  setPagination(p => ({ ...p, pageIndex: 0 }));
};
```

#### Auth guard (same as existing page)

```ts
const { data: session } = useSession();

useEffect(() => {
  if (session && !session.isDirectoryAdmin) {
    router.push('/demo-days');
  }
}, [session, router]);
```

#### Full JSX structure

```tsx
<ApprovalLayout>
  <div className={s.root}>
    <header className={s.header}>
      <h1 className={s.title}>Members</h1>
      <p className={s.subtitle}>Manage members and roles for LabOS.</p>
    </header>

    <TableFilter
      items={TABS.map(t => ({
        id: t.id,
        label: t.label,
        count: tabCounts[t.id],
        activeColor: t.activeColor,
        icon: null,
      }))}
      active={activeTab}
      onFilterClick={handleTabChange}
    >
      <AddMember authToken={authToken} className={s.addBtn} />
    </TableFilter>

    <div className={s.toolbar}>
      <input
        className={s.searchInput}
        placeholder="Search members"
        value={globalFilter}
        onChange={handleSearchChange}
      />
    </div>

    {isLoading && <div className={s.status}>Loading members…</div>}
    {isError  && <div className={s.status}>Failed to load members.</div>}

    {!isLoading && !isError && (
      <MembersTableV2
        members={filteredMembers}
        authToken={authToken}
        pagination={pagination}
        setPagination={setPagination}
        globalFilter={globalFilter}
        sorting={sorting}
        setSorting={setSorting}
      />
    )}
  </div>
</ApprovalLayout>
```

#### `styles.module.scss`

```scss
.root { max-width: 1343px; margin: 0 auto; padding: 24px 20px; display: flex; flex-direction: column; gap: 16px; }
.header { display: flex; flex-direction: column; gap: 4px; }
.title { font-size: 32px; font-weight: 600; color: #000; }
.subtitle { font-size: 14px; color: #5E718D; }
.toolbar { display: flex; align-items: center; gap: 12px; }
.searchInput { height: 48px; width: 100%; max-width: 560px; border: 1px solid #ddd; border-radius: 8px; padding: 0 12px 0 36px; font-size: 14px; background: url('/search-icon.svg') no-repeat 12px center; }
.addBtn { margin-left: auto; }
.status { padding: 40px; text-align: center; color: #5E718D; font-size: 14px; }
```

> **Note:** `TableFilter` accepts `icon: ReactNode` — pass `null` (the design shows no icons on tabs). If `TableFilter` renders `null` icons without issue (check `TableFilter.tsx`), no change needed. If it throws, pass `<></>`.

---

## SpecFlow Gaps — All Addressed

| Gap | Resolution |
|---|---|
| Loading state | `isLoading && <div>Loading members…</div>` |
| Error state | `isError && <div>Failed to load members.</div>` |
| Empty tab | `MembersTableV2` renders "No members" row when `rows.length === 0` |
| `null` / unknown `memberState` | Strict equality filter (`=== activeTab`) silently excludes them |
| Search resets pagination | `handleSearchChange` calls `setPagination(p => ({ ...p, pageIndex: 0 }))` |
| Tab switch resets pagination | `handleTabChange` same treatment |
| Search scope | Global (persists across tab switches) — one input, one filter |
| Count badge reflects full list | `tabCounts` derived from all `members`, not filtered set |
| Auth guard | `useEffect` redirect to `/demo-days` for non-admins |
| Post-add refresh | `AddMember` internally invalidates the members query key via `useAddMember` mutation `onSuccess` |

---

## Acceptance Criteria

### Functional

- [x] `/members-v2` is accessible; non-admin users are redirected to `/demo-days`
- [x] All members are loaded in a single network request on page mount
- [x] 4 tabs render with accurate count badges (counts sum to total member count)
- [x] Active tab shows only members whose `memberState` equals the tab id
- [x] Switching tabs resets the table to page 1
- [x] Search input filters by member name, email, or team/project name
- [x] Typing in search resets the table to page 1
- [x] Search value is preserved when switching tabs
- [x] A tab with 0 members shows "No members" (not a broken empty table)
- [x] Edit button opens the `EditMember` modal; changes are reflected after modal closes
- [x] Add Member button opens the `AddMember` modal; the list refetches after success
- [x] Member with no teams or projects shows `—` in the Team/Project column

### Non-Functional

- [x] `/pages/members/` route works identically to before (zero regressions)
- [x] `tsc` clean across `apps/back-office` after implementation (pre-existing RbacSection errors excluded)
- [x] No new npm dependencies introduced

---

## Files to Create / Modify

| Action | File |
|---|---|
| **Add** field (if not done) | `apps/back-office/screens/members/types/member.ts` |
| **Create** | `apps/back-office/screens/members/components/MembersTableV2/MembersTableV2.tsx` |
| **Create** | `apps/back-office/screens/members/components/MembersTableV2/MembersTableV2.module.scss` |
| **Create** | `apps/back-office/screens/members/components/MembersTableV2/index.ts` |
| **Create** | `apps/back-office/pages/members-v2/index.tsx` |
| **Create** | `apps/back-office/pages/members-v2/styles.module.scss` |

**No existing files are modified** (other than the optional `member.ts` type addition).

---

## Dependencies & Risks

| Risk | Mitigation |
|---|---|
| `memberState` missing (Phase 1 not merged) | Client-side derivation fallback from `accessLevel` |
| Large payload (3000+ approved members, multi-second load) | Loading spinner; acceptable per brainstorm decision |
| `TableFilter` rejects `icon: null` | Pass `<></>` instead of `null` |
| `EditMember` props contract has changed | Read `EditMember.tsx` before implementing `EditActionCell` |

---

## References

### Internal

- Brainstorm: `docs/brainstorms/2026-04-23-members-page-v2-brainstorm.md`
- Prerequisite plan: `docs/plans/2026-04-23-refactor-group-members-by-memberstate-plan.md`
- Existing members page (patterns to follow): `apps/back-office/pages/members/index.tsx`
- Member type: `apps/back-office/screens/members/types/member.ts`
- Data hook: `apps/back-office/hooks/members/useMembersList.ts`
- Table hook (reference): `apps/back-office/screens/members/hooks/useMembersTable.tsx`
- Reused — MemberCell: `apps/back-office/screens/members/components/MemberCell/`
- Reused — PaginationControls: `apps/back-office/screens/members/components/PaginationControls/`
- Reused — AddMember: `apps/back-office/screens/members/components/AddMember/`
- Reused — EditMember: `apps/back-office/screens/members/components/EditMember/`
- Reused — TableFilter: `apps/back-office/components/filters/TableFilter/`
- Reused — ApprovalLayout: `apps/back-office/layout/approval-layout.tsx`
- CSS pattern reference: `apps/back-office/pages/members/styles.module.scss`

### External

None — no new libraries required.
