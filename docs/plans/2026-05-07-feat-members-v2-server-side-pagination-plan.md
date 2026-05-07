---
title: "feat: Members V2 server-side pagination, search, and filtering"
type: feat
date: 2026-05-07
---

# ✨ feat: Members V2 server-side pagination, search, and filtering

## Overview

The members-v2 page currently loads every member from the database in a single request (`memberState=['PENDING','VERIFIED','APPROVED','REJECTED']`) and handles all filtering, searching, counting, and pagination client-side. This works at small scale but degrades as the member count grows.

This feature migrates the four member tabs (PENDING, VERIFIED, APPROVED, REJECTED) to server-side pagination with server-side search and filter support. Tab counts remain always-accurate via a new `/counts` endpoint. The Policies tab stays client-side (out of scope).

## Problem Statement

- One massive request on page load fetches all members regardless of which tab is active
- Search and group/role filters run client-side over the full dataset
- `useMembersStateCounts` (used in sidebar menu too) also fetches all members just to count them
- No `search` param exists in the API — text search is entirely a frontend concern today

## Proposed Solution

**Backend:** Add `search` param to existing `GET /v1/admin/members` and a new `GET /v1/admin/members/counts` endpoint.

**Frontend:** Update `useMembersList` and `useMembersStateCounts` to use the new capabilities, update `MembersTableV2` to support manual pagination mode, and refactor `members-v2/index.tsx` to fetch only the active tab's data.

**Reference pattern:** `apps/back-office/pages/access-control/index.tsx` + `apps/back-office/hooks/access-control/useRbacMembers.ts` — identical shape.

---

## Technical Approach

### Architecture

```
Before:
  index.tsx
    └─ useMembersList(ALL_MEMBER_STATES)         ← fetches everything
         └─ tabCounts memo                        ← client-side count
         └─ filteredMembers memo                  ← client-side filter

After:
  index.tsx
    ├─ useMembersStateCounts()                   ← GET /v1/admin/members/counts
    └─ useMembersList(activeTab, page, limit, search, groupFilter, roleFilter)
         └─ data.data                            ← already filtered, paginated
         └─ data.pagination.pages                ← pageCount for table
```

### Implementation Phases

#### Phase 1: Backend — new `/counts` endpoint + `search` param

**Files to change:**

**`libs/contracts/src/schema/admin-member.ts`**
- Add `search` field to `RequestMembersSchema`:
  ```ts
  search: z.string().optional(),
  ```

**`apps/web-api/src/admin/member.service.ts`**
- In `findMembers()`, add `search` to the destructured params and apply to `where`:
  ```ts
  if (search) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { email: { contains: search, mode: 'insensitive' } },
    ];
  }
  ```
- Add new method `getMemberStateCounts()`:
  ```ts
  async getMemberStateCounts() {
    const [pending, verified, approved, rejected] = await Promise.all([
      this.prisma.member.count({ where: { memberApproval: { state: 'PENDING' } } }),
      this.prisma.member.count({ where: { memberApproval: { state: 'VERIFIED' } } }),
      this.prisma.member.count({ where: { memberApproval: { state: 'APPROVED' } } }),
      this.prisma.member.count({ where: { memberApproval: { state: 'REJECTED' } } }),
    ]);
    return { PENDING: pending, VERIFIED: verified, APPROVED: approved, REJECTED: rejected };
  }
  ```

**`apps/web-api/src/admin/member.controller.ts`**
- Add `GET /counts` handler **before** any parameterized routes to avoid NestJS matching `counts` as an ID:
  ```ts
  @Get('counts')
  @UseGuards(MemberContactsReadAuthGuard)
  @NoCache()
  async getMemberStateCounts() {
    return await this.memberService.getMemberStateCounts();
  }
  ```

---

#### Phase 2: Frontend — hook updates

**`apps/back-office/utils/constants.ts`** (line ~66)
- Add new route constant:
  ```ts
  ADMIN_MEMBERS_COUNTS: `${APP_CONSTANTS.V1}admin/members/counts`,
  ```

**`apps/back-office/hooks/members/constants/queryKeys.ts`**
- Add new key to `MembersQueryKeys` enum:
  ```ts
  GET_MEMBERS_STATE_COUNTS = 'GET_MEMBERS_STATE_COUNTS',
  ```

**`apps/back-office/hooks/members/useMembersList.ts`**
- Extend `QueryParams` with `page?: number`, `limit?: number`, `search?: string`
- Add to URL construction:
  ```ts
  if (params.page) search.set('page', String(params.page));
  if (params.limit) search.set('limit', String(params.limit));
  if (params.search) search.set('search', params.search);
  ```
- Add to `queryKey`: `[..., page, limit, search]`

**`apps/back-office/hooks/members/useMembersStateCounts.ts`**
- Replace the full-fetch + client-count implementation with a direct call to `/counts`:
  ```ts
  // Before: fetches all members and counts locally
  // After: calls GET /v1/admin/members/counts
  export function useMembersStateCounts({ authToken }) {
    return useQuery(
      [MembersQueryKeys.GET_MEMBERS_STATE_COUNTS, authToken],
      () => fetcher<Record<MemberStateTab, number>>(API_ROUTE.ADMIN_MEMBERS_COUNTS, { authToken }),
    );
  }
  ```
- This benefits both the sidebar `MembersV2Menu` and the page simultaneously.

**Mutation cache invalidation** — check all mutation hooks in `apps/back-office/hooks/members/` that call `queryClient.invalidateQueries(MembersQueryKeys.GET_MEMBERS_LIST)` and add a matching invalidation for `GET_MEMBERS_STATE_COUNTS`. Likely files to update:
- `useUpdateMembersStatus.ts`
- `useAddMember.ts`
- `useUpdateMember.ts`

---

#### Phase 3: Frontend — `MembersTableV2` manual pagination mode

**`apps/back-office/screens/members/components/MembersTableV2/MembersTableV2.tsx`**

Add `pageCount?: number` to the `Props` interface and wire into `useReactTable`:
```ts
// Props
pageCount?: number;

// useReactTable config — add these when pageCount is defined:
manualPagination: pageCount !== undefined,
pageCount: pageCount ?? -1,
// Keep getPaginationRowModel() — it becomes a passthrough in manual mode
```

When the parent passes `pageCount`, TanStack Table uses it for the pagination UI (page count, "go to last page" etc.) without internally slicing the data array.

**Note on `globalFilter`:** The parent will pass `globalFilter={''}` to the table when server-side search is active — the client-side row filter in the table becomes a no-op since search already happened on the server.

---

#### Phase 4: Frontend — `members-v2/index.tsx` refactor

This is the largest change. Key transformations:

**State additions:**
```ts
const [debouncedSearch, setDebouncedSearch] = useState('');
useEffect(() => {
  const t = setTimeout(() => setDebouncedSearch(globalFilter), 300);
  return () => clearTimeout(t);
}, [globalFilter]);
```

**Data fetching — replace one call with two:**
```ts
// Remove:
const { data, isLoading, isError } = useMembersList({
  authToken, memberState: [...ALL_MEMBER_STATES],
});

// Add:
const { data: countsData } = useMembersStateCounts({ authToken });

const { data, isLoading, isError } = useMembersList({
  authToken,
  memberState: activeTab !== 'POLICIES' ? [activeTab] : undefined,
  page: pagination.pageIndex + 1,
  limit: pagination.pageSize,
  search: debouncedSearch || undefined,
  policyGroups: groupFilter ? [groupFilter] : undefined,
  policyRoles: roleFilter ? [roleFilter] : undefined,
});
```

**Remove these memos** (replaced by server-side data):
- `tabCounts` (→ `countsData`)
- `filteredMembers` (→ `data?.data ?? []`)
- `approvedMembers` (→ no longer needed; filter options come from `policiesData`)
- `policyMap` (→ no longer needed for filtering; `MembersTableV2` uses `allPolicies` directly)

**Update filter options** (group/role dropdowns):
```ts
// Before: derived from approvedMembers + policyMap
// After: derived from policiesData directly
const groupOptions = useMemo(() => {
  const names = new Set<string>((policiesData ?? []).map(p => p.group).filter(Boolean));
  return [{ label: 'All groups', value: '' }, ...[...names].sort().map(n => ({ label: n, value: n }))];
}, [policiesData]);

const roleOptions = useMemo(() => {
  const names = new Set<string>((policiesData ?? []).map(p => p.role).filter(Boolean));
  return [{ label: 'All roles', value: '' }, ...[...names].sort().map(n => ({ label: n, value: n }))];
}, [policiesData]);
```

**Tab count references** — replace all `tabCounts[tab.id]` with `countsData?.[tab.id] ?? 0`.

**`MembersTableV2` call** — pass `pageCount` and suppress client-side filter:
```tsx
<MembersTableV2
  members={data?.data ?? []}
  pageCount={data?.pagination.pages}
  globalFilter={''}          // search handled server-side
  ...rest
/>
```

**Reset pagination on changes** — already exists in `handleTabChange`. Ensure it also resets when `debouncedSearch`, `groupFilter`, or `roleFilter` change:
```ts
useEffect(() => {
  setPagination(p => ({ ...p, pageIndex: 0 }));
}, [debouncedSearch, groupFilter, roleFilter]);
```

---

## Acceptance Criteria

### Functional

- [ ] Switching tabs triggers a new server request for only that tab's members
- [ ] Typing in the search box debounces (300ms) and sends `search` param to the API
- [ ] Group and role dropdowns on the APPROVED tab filter via API params, not client-side
- [ ] Tab count badges (PENDING, VERIFIED, APPROVED, REJECTED) remain accurate after any mutation
- [ ] Sidebar `MembersV2Menu` counts update correctly (via the updated `useMembersStateCounts`)
- [ ] Policies tab is unaffected
- [ ] Pagination controls (next/prev/page count) work correctly with server-provided `pageCount`
- [ ] Approving/rejecting a member invalidates both the list and the counts

### Non-Functional

- [ ] No full-member-list fetch on page load — network tab shows only the active tab's page
- [ ] TypeScript compilation passes with no new errors
- [ ] `GET /v1/admin/members/counts` is secured behind `MemberContactsReadAuthGuard`

---

## Dependencies & Risks

| Risk | Mitigation |
|---|---|
| `MembersTableV2` is used on other pages | Only add `pageCount` as an optional prop; existing callers omit it and table stays in client mode |
| `useMembersStateCounts` is used in sidebar | Updating the hook benefits both consumers simultaneously |
| NestJS route ordering (`counts` vs param routes) | Declare `@Get('counts')` before any `@Get(':id')` handler |
| Search + state filter combined Prisma `where` | Test that `OR` search and `memberApproval` filter compose correctly (AND semantics) |
| Mutations don't invalidate counts | Audit all member mutation hooks for missing `invalidateQueries` on `GET_MEMBERS_STATE_COUNTS` |

---

## References

### Internal

- Reference pattern (server-side pagination): `apps/back-office/pages/access-control/index.tsx`
- Reference hook: `apps/back-office/hooks/access-control/useRbacMembers.ts`
- API DTO: `libs/contracts/src/schema/admin-member.ts`
- Service: `apps/web-api/src/admin/member.service.ts` — `findMembers()` ~line 1490, returns `{ data, pagination: { total, page, limit, pages } }`
- Controller: `apps/web-api/src/admin/member.controller.ts`
- Route constants: `apps/back-office/utils/constants.ts:66`
- Query key enum: `apps/back-office/hooks/members/constants/queryKeys.ts`
- Table component: `apps/back-office/screens/members/components/MembersTableV2/MembersTableV2.tsx`
- Sidebar consumer of counts: `apps/back-office/components/menu/components/MembersV2Menu/MembersV2Menu.tsx`
- Brainstorm: `docs/brainstorms/2026-05-07-members-v2-server-side-pagination-brainstorm.md`
