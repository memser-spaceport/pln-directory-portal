---
title: "feat: Add Deal Requests table tab to Deals Management page"
type: feat
date: 2026-03-30
---

# feat: Add Deal Requests Table Tab to Deals Management Page

## Overview

Add a fifth "Deal Requests" tab to the back-office Deals Management page (`/deals`), matching the Figma design (node `696-19881`). The tab shows a read-only table of member deal requests with four columns: **Requested By**, **Requested Deal**, **Reason**, and **Date Submitted**. The backend API already exists; this is primarily a frontend task with one small backend fix.

## Problem Statement / Motivation

The `GET /v1/admin/deal-requests` endpoint is fully implemented with server-side search and pagination, but no back-office UI exists to surface it. Admins cannot currently see who has requested deals or why, which blocks triage of the deal catalog.

## Proposed Solution

Mirror the exact pattern of `useSubmittedDealsTable` and `useSubmittedDealsList` — add a data layer (type → constant → service → React Query hook) and a TanStack Table hook, then wire them into the existing `pages/deals/index.tsx` as a fifth tab.

## Pre-requisite: Backend Fix

The spec-flow analysis identified a **critical backend gap**: `DealRequestsService.adminList` selects `uid`, `name`, `email` from `requestedByUser` but omits the `image` relation. The Figma design requires a 40px circular member avatar. This must be fixed first.

**File:** `apps/web-api/src/deal-requests/deal-requests.service.ts`

In the `adminList` Prisma query, update the `requestedByUser` select to include `image`:

```typescript
// Before
requestedByUser: {
  select: { uid: true, name: true, email: true },
},

// After
requestedByUser: {
  select: {
    uid: true,
    name: true,
    email: true,
    image: { select: { uid: true, url: true } },
  },
},
```

Apply the same fix to `adminGetByUid` for consistency.

## Implementation Decisions

| Question | Decision | Rationale |
|---|---|---|
| Server-side vs client-side pagination? | Client-side (fetch all, `limit=1000`) | Matches every other tab; avoids diverging hook architecture |
| How to get badge count efficiently? | `limit=1` call in `fetchDealCounts`, read `total` from envelope | Avoids fetching all items just for a count |
| "Requested Deal" column content? | `deal.vendorName` — single line of plain text, no subtitle | Matches Figma column label and 144px width spec |
| Show "+ Create new deal" button on this tab? | No | Tab is read-only; Figma shows only search input |
| Wrapping text in "Reason" column? | Inline `whiteSpace: 'normal'` override on cell | `bodyCell` CSS has `white-space: nowrap`; only this column overrides |
| Tab URL param value? | `'requests'` | Consistent with `DealCounts.requests` field name |
| Default sort direction for Date Submitted? | Descending (`desc`) | Backend default; most recent requests shown first |
| Row click behavior? | None — fully read-only | No action column in Figma; no detail modal specified |
| Search scope? | Member name, email, deal name (vendorName) | Backend already filters these + description fields; frontend `globalFilterFn` mirrors this |
| Avatar fallback when no image? | Initials in 40px circle — same pattern as `SubmitterAvatar` in `useSubmittedDealsTable` | Already established pattern |

## Technical Considerations

- **Pagination**: Fetch all records (`limit=1000`) and let TanStack Table's `getPaginationRowModel` handle client-side paging at 10 rows per page, identical to all other tabs.
- **Response shape**: The API returns `{ page, limit, total, items: DealRequest[] }` — the service function unwraps `.items` so the hook returns a flat `DealRequest[]`, matching the shape of all other hooks.
- **Count badge**: `fetchDealCounts` makes a 4th parallel request with `limit=1` and reads `response.data.total` rather than counting array length, since the paginated envelope already exposes `total`.
- **`Tab` union type**: `'requests'` must be added to the `Tab` type in `pages/deals/index.tsx` before TypeScript will accept the new tab.

## Acceptance Criteria

- [ ] "Deal Requests" tab appears as the 5th tab on `/deals`, with a badge showing the total count
- [ ] Tab URL param is `?tab=requests`; deep-linking works on page load
- [ ] Table renders 4 columns: **Requested By** (avatar + name + email), **Requested Deal** (deal vendorName, 144px), **Reason** (`whatDealAreYouLookingFor`, wrapping), **Date Submitted** (formatted, sortable)
- [ ] Member avatar renders actual profile image when available; falls back to initials circle
- [ ] Search input filters rows by member name, member email, and deal vendorName (client-side `globalFilterFn`)
- [ ] Pagination shows 10 rows per page with `PaginationControls`
- [ ] Date Submitted column is sortable (click header toggles asc/desc, caret icon reflects direction)
- [ ] No action column; rows are non-interactive
- [ ] The "+ Create new deal" button is hidden on this tab
- [ ] Control bar shows only the search input (no category/status filter dropdowns)
- [ ] Empty state renders when no records exist or search returns nothing
- [ ] Badge count reflects unfiltered total (not affected by search input state)
- [ ] TypeScript compiles with no errors

## Files to Modify

### 1. Backend fix — `apps/web-api/src/deal-requests/deal-requests.service.ts`

Add `image: { select: { uid: true, url: true } }` to `requestedByUser` select in `adminList` and `adminGetByUid`.

### 2. Add `ADMIN_DEAL_REQUESTS` route constant — `apps/back-office/utils/constants.ts`

```typescript
ADMIN_DEAL_REQUESTS: `${APP_CONSTANTS.V1}admin/deal-requests`,
```

### 3. Add `DealRequest` type + extend `DealCounts` — `apps/back-office/screens/deals/types/deal.ts`

```typescript
export type DealRequest = {
  uid: string;
  dealUid: string;
  requestedByUserUid: string;
  description: string;
  whatDealAreYouLookingFor: string;
  howToReachOutToYou: string;
  createdAt: string;
  updatedAt: string;
  deal: {
    uid: string;
    vendorName: string;
    logo: { uid: string; url: string } | null;
  };
  requestedByUser: {
    uid: string;
    name: string;
    email: string;
    image: { uid: string; url: string } | null;
  };
};

// Extend existing DealCounts:
export type DealCounts = {
  catalog: number;
  submitted: number;
  issues: number;
  requests: number; // ← add this
};
```

### 4. Add query key — `apps/back-office/hooks/deals/constants/queryKeys.ts`

```typescript
export enum DealsQueryKeys {
  GET_DEALS_LIST = 'GET_DEALS_LIST',
  GET_SUBMITTED_DEALS_LIST = 'GET_SUBMITTED_DEALS_LIST',
  GET_REPORTED_ISSUES_LIST = 'GET_REPORTED_ISSUES_LIST',
  GET_DEAL_REQUESTS_LIST = 'GET_DEAL_REQUESTS_LIST', // ← add
  GET_DEALS_COUNTS = 'GET_DEALS_COUNTS',
  GET_DEALS_WHITELIST = 'GET_DEALS_WHITELIST',
}
```

### 5. Add service functions — `apps/back-office/utils/services/deal.ts`

Add `fetchDealRequestsList` and update `fetchDealCounts`:

```typescript
interface DealRequestsResponse {
  page: number;
  limit: number;
  total: number;
  items: DealRequest[];
}

export const fetchDealRequestsList = (params: {
  authToken: string | undefined;
}): Promise<DealRequest[]> =>
  api
    .get<DealRequestsResponse>(API_ROUTE.ADMIN_DEAL_REQUESTS, {
      headers: { authorization: `Bearer ${params.authToken}` },
      params: { limit: 1000 },
    })
    .then((r) => r.data.items);

// In fetchDealCounts — add 4th parallel request:
export async function fetchDealCounts(
  params: { authToken: string | undefined }
): Promise<DealCounts> {
  const headers = { authorization: `Bearer ${params.authToken}` };
  const [dealsRes, submissionsRes, issuesRes, requestsRes] = await Promise.all([
    api.get<Deal[]>(API_ROUTE.ADMIN_DEALS, { headers }),
    api.get<SubmittedDeal[]>(API_ROUTE.ADMIN_SUBMITTED_DEALS, {
      headers,
      params: { status: 'OPEN' },
    }),
    api.get<ReportedIssue[]>(API_ROUTE.ADMIN_REPORTED_ISSUES, { headers }),
    api.get<DealRequestsResponse>(API_ROUTE.ADMIN_DEAL_REQUESTS, {
      headers,
      params: { limit: 1 }, // reads total from envelope, avoids fetching all items
    }),
  ]);
  return {
    catalog: dealsRes.data.length,
    submitted: submissionsRes.data.length,
    issues: issuesRes.data.length,
    requests: requestsRes.data.total,
  };
}
```

## Files to Create

### 6. React Query hook — `apps/back-office/hooks/deals/useDealRequestsList.ts`

```typescript
import { useQuery } from '@tanstack/react-query';
import { DealsQueryKeys } from './constants/queryKeys';
import { fetchDealRequestsList } from '../../utils/services/deal';

export function useDealRequestsList(params: { authToken: string | undefined }) {
  return useQuery({
    queryKey: [DealsQueryKeys.GET_DEAL_REQUESTS_LIST, params.authToken],
    queryFn: () => fetchDealRequestsList(params),
    enabled: true,
  });
}
```

### 7. TanStack Table hook — `apps/back-office/screens/deals/hooks/useDealRequestsTable.tsx`

Mirror `useSubmittedDealsTable.tsx` exactly, replacing `SubmittedDeal` with `DealRequest`:

- **Column 1 — Requested By** (`id: 'requestedBy'`, `size: 272`): 40px circle avatar (`borderRadius: '50%'`) — real `requestedByUser.image.url` with `SubmitterAvatar` initials fallback. Name in `fontWeight: 500`, email in `fontSize: 12, color: '#64748b'`.
- **Column 2 — Requested Deal** (`id: 'requestedDeal'`, `size: 144`): plain text `deal.vendorName`, `fontWeight: 500, fontSize: 14, color: '#455468'`.
- **Column 3 — Reason** (`accessor: 'whatDealAreYouLookingFor'`, flexible size): render with `whiteSpace: 'normal', wordBreak: 'break-word'` to allow wrapping (overrides `.bodyCell` CSS).
- **Column 4 — Date Submitted** (`accessor: 'createdAt'`, `sortingFn: 'datetime'`, `enableSorting: true`, `size: 160`): identical date/time two-line format as `useSubmittedDealsTable`.

`globalFilterFn`: search `requestedByUser.name`, `requestedByUser.email`, `deal.vendorName`.

Initial sort: `[{ id: 'createdAt', desc: true }]` passed in from page.

No action column.

```typescript
// apps/back-office/screens/deals/hooks/useDealRequestsTable.tsx
import React, { Dispatch, SetStateAction, useMemo } from 'react';
import {
  createColumnHelper,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  PaginationState,
  SortingState,
  useReactTable,
} from '@tanstack/react-table';
import { DealRequest } from '../types/deal';

const columnHelper = createColumnHelper<DealRequest>();

function RequesterAvatar({ name, imageUrl }: { name: string; imageUrl?: string | null }) {
  if (imageUrl) {
    return (
      <img
        src={imageUrl}
        alt={name}
        style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
      />
    );
  }
  const initial = name?.charAt(0).toUpperCase() || '?';
  return (
    <div
      style={{
        width: 40, height: 40, borderRadius: '50%', background: '#f1f5f9',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 16, fontWeight: 600, color: '#455468', flexShrink: 0,
      }}
    >
      {initial}
    </div>
  );
}

type UseDealRequestsTableArgs = {
  requests: DealRequest[] | undefined;
  sorting: SortingState;
  setSorting: Dispatch<SetStateAction<SortingState>>;
  pagination: PaginationState;
  setPagination: Dispatch<SetStateAction<PaginationState>>;
  globalFilter: string;
  setGlobalFilter: Dispatch<SetStateAction<string>>;
};

export function useDealRequestsTable({
  requests,
  sorting,
  setSorting,
  pagination,
  setPagination,
  globalFilter,
  setGlobalFilter,
}: UseDealRequestsTableArgs) {
  const columns = useMemo(
    () => [
      columnHelper.display({
        id: 'requestedBy',
        header: 'Requested by',
        size: 272,
        cell: (info) => {
          const { name, email, image } = info.row.original.requestedByUser;
          return (
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <RequesterAvatar name={name} imageUrl={image?.url} />
              <div>
                <div style={{ fontWeight: 500, fontSize: 14, color: '#455468' }}>{name}</div>
                <div style={{ fontSize: 12, color: '#64748b' }}>{email}</div>
              </div>
            </div>
          );
        },
      }),
      columnHelper.display({
        id: 'requestedDeal',
        header: 'Requested Deal',
        size: 144,
        cell: (info) => (
          <div style={{ fontWeight: 500, fontSize: 14, color: '#455468' }}>
            {info.row.original.deal.vendorName}
          </div>
        ),
      }),
      columnHelper.accessor('whatDealAreYouLookingFor', {
        header: 'Reason',
        cell: (info) => (
          <div
            style={{
              fontSize: 14,
              color: '#455468',
              whiteSpace: 'normal',
              wordBreak: 'break-word',
            }}
          >
            {info.getValue()}
          </div>
        ),
      }),
      columnHelper.accessor('createdAt', {
        header: 'Date Submitted',
        sortingFn: 'datetime',
        enableSorting: true,
        size: 160,
        cell: (info) => {
          const d = new Date(info.getValue());
          return (
            <div>
              <div style={{ fontWeight: 500, fontSize: 14, color: '#455468' }}>
                {d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              </div>
              <div style={{ fontSize: 12, color: '#64748b' }}>
                {d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }).toLowerCase()}
              </div>
            </div>
          );
        },
      }),
    ],
    []
  );

  const data = useMemo(() => requests ?? [], [requests]);

  const table = useReactTable({
    data,
    columns,
    state: { sorting, pagination, globalFilter },
    globalFilterFn: (row, _columnId, filterValue) => {
      const search = String(filterValue).toLowerCase();
      const { requestedByUser, deal } = row.original;
      return (
        requestedByUser.name?.toLowerCase().includes(search) ||
        requestedByUser.email?.toLowerCase().includes(search) ||
        deal.vendorName?.toLowerCase().includes(search)
      );
    },
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onSortingChange: setSorting,
    onPaginationChange: setPagination,
    onGlobalFilterChange: setGlobalFilter,
    getRowId: (row) => row.uid,
  });

  return { table };
}
```

### 8. Update page — `apps/back-office/pages/deals/index.tsx`

**a) Extend `Tab` union type:**
```typescript
type Tab = 'catalog' | 'submitted' | 'issues' | 'access' | 'requests';
```

**b) Add state for Deal Requests table (near existing submitted/issues state):**
```typescript
const [requestsSorting, setRequestsSorting] = useState<SortingState>([
  { id: 'createdAt', desc: true },
]);
const [requestsPagination, setRequestsPagination] = useState<PaginationState>({
  pageIndex: 0,
  pageSize: 10,
});
const [requestsFilter, setRequestsFilter] = useState('');
```

**c) Fetch data:**
```typescript
const { data: requestsData } = useDealRequestsList({ authToken });
```

**d) Wire table hook:**
```typescript
const { table: requestsTable } = useDealRequestsTable({
  requests: requestsData,
  sorting: requestsSorting,
  setSorting: setRequestsSorting,
  pagination: requestsPagination,
  setPagination: setRequestsPagination,
  globalFilter: requestsFilter,
  setGlobalFilter: setRequestsFilter,
});
```

**e) Add tab button (after "Access Management" tab):**
```tsx
<button
  className={cx(s.tab, { [s.activeTab]: tab === 'requests' })}
  onClick={() => setTab('requests')}
>
  Deal Requests
  <span className={s.badge}>{counts?.requests ?? 0}</span>
</button>
```

**f) Add tab panel (inside the tab content switch/conditional):**
```tsx
{tab === 'requests' && (
  <>
    <div className={s.controls}>
      <input
        className={s.searchInput}
        placeholder="Search deals"
        value={requestsFilter}
        onChange={(e) => {
          setRequestsFilter(e.target.value);
          setRequestsPagination((p) => ({ ...p, pageIndex: 0 }));
        }}
      />
      {/* No "+ Create new deal" button on this tab */}
    </div>
    <DealTable table={requestsTable} />
    <PaginationControls table={requestsTable} />
  </>
)}
```

## Dependencies & Risks

| Risk | Mitigation |
|---|---|
| Backend fix not deployed before frontend | Plan includes backend change as step 1; both ship in the same PR |
| `DealCounts` type change breaks existing usages | Only adds an optional-compatible new field; existing destructuring `{ catalog, submitted, issues }` continues to work |
| `limit=1000` is too low for real data | Deal requests are per `(dealUid, requestedByUserUid)` unique — realistic volume is well under 1,000 |
| `Tab` union type narrowing breaks router coercion | Update the coercion guard at `pages/deals/index.tsx:55` to include `'requests'` |

## References

- Figma: `https://www.figma.com/design/US3xcMIkBWVuBmefw3Bh4k/Deals--|-Protocol-Labs?node-id=696-19881`
- Pattern reference: `apps/back-office/screens/deals/hooks/useSubmittedDealsTable.tsx`
- Pattern reference: `apps/back-office/hooks/deals/useSubmittedDealsList.ts`
- Pattern reference: `apps/back-office/utils/services/deal.ts` (fetchDealCounts)
- Backend controller: `apps/web-api/src/deal-requests/admin-deal-requests.controller.ts`
- Backend service: `apps/web-api/src/deal-requests/deal-requests.service.ts`
