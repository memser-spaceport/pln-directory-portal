---
title: feat: Add Submitted Deals Tab
type: feat
date: 2026-03-23
brainstorm: docs/brainstorms/2026-03-23-submitted-deals-tab-brainstorm.md
figma: https://www.figma.com/design/US3xcMIkBWVuBmefw3Bh4k/Deals?node-id=65-8164
---

# feat: Add Submitted Deals Tab

## Overview

Enable the "Submitted Deals" tab on the Deals Management page (`/deals?tab=submitted`). The tab shows community-submitted deals in a table for admin review. Nearly all the code was already written and then commented out under the label `/* Hidden tabs - Submitted Deals and Reported Issues */`. The work is: **uncomment the hidden code + update column definitions to match the Figma design + wire filters**.

This is a frontend-only change. The `fetchSubmittedDeals` service is currently mocked and returns 2 hardcoded records. The tab will work against the mock until the backend API is wired (tracked separately in `docs/plans/2026-03-17-feat-wire-deals-admin-api-remove-mocks-plan.md`).

---

## Figma Design

![Submitted Deals Tab](https://www.figma.com/design/US3xcMIkBWVuBmefw3Bh4k/Deals?node-id=65-8164)

**Tabs:** Deals Catalog (12) | **Submitted Deals (2)** [active, blue underline] | Reported Issues (3)

**Control bar:** Search deals input | All categories dropdown | All statuses dropdown | + Create new deal button

**Table columns:**

| Column | Content | Sortable |
|--------|---------|---------|
| Vendor & Deal | 40×40 rounded logo (initials placeholder) + vendor name (medium) + description (small, truncated) | No |
| Submitted By | 40×40 circular avatar (initials) + full name (medium) + email (small) | No |
| Submission Date | Date line ("Mar 10, 2026") + time line ("06:45 pm") | Yes (↑↓ icon) |
| Action | "Review Deal" secondary button | — |

---

## Problem Statement

The Submitted Deals tab is commented out in `pages/deals/index.tsx`. Admins currently have no UI to review community-submitted deals. The mock API already provides the data. The feature just needs to be surfaced.

---

## Proposed Solution

### 1. Update `useSubmittedDealsTable` — Column Definitions

**File:** `apps/back-office/screens/deals/hooks/useSubmittedDealsTable.tsx`

Replace the current 5-column structure with a 4-column Figma-aligned structure:

```tsx
// Column 1: Vendor & Deal
columnHelper.display({
  id: 'vendorDeal',
  header: 'Vendor & Deal',
  size: 0, // flexible
  cell: (info) => (
    <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
      {/* 40×40 rounded square, initials placeholder */}
      <VendorAvatar name={info.row.original.vendorName} />
      <div>
        <div style={{ fontWeight: 500 }}>{info.row.original.vendorName}</div>
        <div style={{ fontSize: 12, color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 300 }}>
          {info.row.original.description}
        </div>
      </div>
    </div>
  ),
})

// Column 2: Submitted By
columnHelper.display({
  id: 'submittedBy',
  header: 'Submitted By',
  size: 272,
  enableSorting: false,
  cell: (info) => (
    <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
      {/* 40×40 circular avatar, initials */}
      <SubmitterAvatar name={info.row.original.submittedBy} />
      <div>
        <div style={{ fontWeight: 500 }}>{info.row.original.submittedBy}</div>
        <div style={{ fontSize: 12, color: '#64748b' }}>{info.row.original.submittedByEmail}</div>
      </div>
    </div>
  ),
})

// Column 3: Submission Date
columnHelper.accessor('submittedAt', {
  header: 'Submission Date',
  sortingFn: 'datetime',
  enableSorting: true,
  size: 140,
  cell: (info) => {
    const d = new Date(info.getValue());
    return (
      <div>
        <div style={{ fontWeight: 500 }}>{d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</div>
        <div style={{ fontSize: 12, color: '#64748b' }}>{d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }).toLowerCase()}</div>
      </div>
    );
  },
})

// Column 4: Action
columnHelper.display({
  id: 'action',
  header: 'Action',
  size: 140,
  meta: { align: 'center' },
  cell: (info) => (
    <button className={s.reviewBtn} onClick={() => info.table.options.meta?.onReview(info.row.original)}>
      Review Deal
    </button>
  ),
})
```

**Add to hook args:**
```ts
type UseSubmittedDealsTableArgs = {
  deals: SubmittedDeal[] | undefined;
  sorting: SortingState;
  setSorting: Dispatch<SetStateAction<SortingState>>;
  pagination: PaginationState;
  setPagination: Dispatch<SetStateAction<PaginationState>>;
  globalFilter: string;
  setGlobalFilter: Dispatch<SetStateAction<string>>;
  onReview: (deal: SubmittedDeal) => void;
};
```

**Add to `useReactTable` config:**
```ts
state: { sorting, pagination, globalFilter },
onGlobalFilterChange: setGlobalFilter,
meta: { onReview },
```

**Helper components** (inline in the same file or in a new `SubmittedDealCells.tsx` under `screens/deals/components/`):

- `VendorAvatar({ name })` — 40×40 rounded square (`border-radius: 8px`), light gray bg, first letter of `name` centered. Same visual as the Figma placeholder.
- `SubmitterAvatar({ name })` — 40×40 circle, light gray bg, first letter of `name` centered.

> **Note:** If `name` is an empty string, render a generic "?" character. Do not crash on `.charAt(0)`.

---

### 2. Uncomment Hidden Code in `pages/deals/index.tsx`

**File:** `apps/back-office/pages/deals/index.tsx`

#### 2a. Uncomment imports (lines 14–17, 26–29)

```tsx
import { useSubmittedDealsList } from '../../hooks/deals/useSubmittedDealsList';
import { useSubmittedDealsTable } from '../../screens/deals/hooks/useSubmittedDealsTable';
```

#### 2b. Uncomment + expand state (was lines 65–71)

```tsx
const [submittedSorting, setSubmittedSorting] = useState<SortingState>([]);
const [submittedPagination, setSubmittedPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 10 });
const [submittedFilter, setSubmittedFilter] = useState('');
const [submittedCategoryFilter, setSubmittedCategoryFilter] = useState('');
```

> **Status filter:** `SubmittedDeal` has no `status` field. Render the "All statuses" dropdown from the control bar but do not wire it to any filter state. It's visually present to match the Figma but functionally inert. Add an inline comment: `// status filter not applicable to submitted deals`.

#### 2c. Uncomment data fetch (was line 78)

```tsx
const { data: submittedData } = useSubmittedDealsList({ authToken });
```

#### 2d. Add `filteredSubmittedDeals` memo

```tsx
const filteredSubmittedDeals = useMemo(
  () =>
    (submittedData?.data ?? []).filter((deal) => {
      if (submittedCategoryFilter && deal.category !== submittedCategoryFilter) return false;
      return true;
    }),
  [submittedData?.data, submittedCategoryFilter]
);
```

#### 2e. Add pagination reset effect

```tsx
useEffect(() => {
  setSubmittedPagination((p) => ({ ...p, pageIndex: 0 }));
}, [submittedFilter, submittedCategoryFilter]);
```

#### 2f. Add `handleReview` function

Opens the existing `DealForm` pre-populated with submitted deal data. Since `SubmittedDeal` is structurally different from `Deal`, create an adapter:

```tsx
const handleReview = (submitted: SubmittedDeal) => {
  // Map SubmittedDeal → Deal for DealForm pre-population.
  // Fields absent from SubmittedDeal (audience, shortDescription, fullDescription,
  // redemptionInstructions) are left empty for the admin to fill in.
  const prefilled: Deal = {
    uid: submitted.uid,
    vendorName: submitted.vendorName,
    vendorTeamUid: null,
    logoUid: null,
    logoUrl: null,
    category: submitted.category,
    audience: '',
    shortDescription: submitted.description.slice(0, 100),
    fullDescription: submitted.description,
    redemptionInstructions: '',
    status: 'DRAFT',
    createdAt: submitted.submittedAt,
    updatedAt: submitted.submittedAt,
    tappedHowToRedeemCount: 0,
    markedAsUsingCount: 0,
  };
  setEditingDeal(prefilled);
  setFormOpen(true);
};
```

> **Important:** When the admin saves from this flow, `editingDeal` is set so `handleFormSubmit` calls `updateDeal`. But the UID is a `SubmittedDeal` uid, not a `Deal` uid. Two options:
> - **Option A (simpler, MVP):** Do not set `editingDeal` — instead pre-populate and call `createDeal`. The submitted record remains in the queue unchanged.
> - **Option B (correct):** Call a separate `approveSubmittedDeal` endpoint that creates the deal and removes the submitted entry atomically. This requires a new API route.
>
> **Decision for this ticket: Use Option A (MVP).** Clear comment in code: `// TODO: replace with approve endpoint — see docs/plans/2026-03-17-feat-wire-deals-admin-api-remove-mocks-plan.md`

Adjust `handleReview` to call `setEditingDeal(undefined)` so the form calls `createDeal`:

```tsx
const handleReview = (submitted: SubmittedDeal) => {
  const prefilled: Deal = { /* ... as above ... */ uid: '' }; // empty uid → createDeal path
  setEditingDeal(prefilled);
  setFormOpen(true);
};
```

Wait — `DealForm` checks `if (editingDeal)` to decide update vs create. Set `uid: ''` which is falsy if the form checks `editingDeal?.uid`. Verify how `DealForm` and `handleFormSubmit` make this decision and adjust accordingly.

#### 2g. Uncomment + update table initialization (was lines 132–140)

```tsx
const { table: submittedTable } = useSubmittedDealsTable({
  deals: filteredSubmittedDeals,
  sorting: submittedSorting,
  setSorting: setSubmittedSorting,
  pagination: submittedPagination,
  setPagination: setSubmittedPagination,
  globalFilter: submittedFilter,
  setGlobalFilter: setSubmittedFilter,
  onReview: handleReview,
});
```

#### 2h. Uncomment + update tab button (was lines 246–258)

Place the button between "Deals Catalog" and "Access Management":

```tsx
<button className={clsx(s.tab, { [s.active]: tab === 'submitted' })} onClick={() => setTab('submitted')}>
  Submitted Deals
  <span className={clsx(s.tabCount, { [s.active]: tab === 'submitted' })}>
    {counts?.submitted ?? submittedData?.data?.length ?? 0}
  </span>
</button>
```

#### 2i. Uncomment + update tab body (was lines 331–337)

Include the control bar + table + pagination, matching the catalog tab pattern:

```tsx
{tab === 'submitted' && (
  <>
    <div className={s.controlBar}>
      <input
        value={submittedFilter}
        onChange={(e) => setSubmittedFilter(e.target.value)}
        placeholder="Search deals"
        className={s.searchInput}
        onKeyDown={(e) => { if (e.key === 'Escape') setSubmittedFilter(''); }}
      />
      <select
        className={s.filterSelect}
        value={submittedCategoryFilter}
        onChange={(e) => setSubmittedCategoryFilter(e.target.value)}
      >
        <option value="">All categories</option>
        {DEAL_CATEGORIES.map((c) => (
          <option key={c} value={c}>{c}</option>
        ))}
      </select>
      {/* status filter not applicable to submitted deals — rendered for visual parity with Figma */}
      <select className={s.filterSelect} disabled>
        <option value="">All statuses</option>
      </select>
      <button
        className={s.addNewBtn}
        onClick={() => {
          setEditingDeal(undefined);
          setFormOpen(true);
        }}
      >
        + Create new deal
      </button>
    </div>
    {renderTable(submittedTable, true)}
    <PaginationControls table={submittedTable} />
  </>
)}
```

---

### 3. Add Styles for New Elements

**File:** `apps/back-office/pages/deals/styles.module.scss`

Add `.reviewBtn` for the "Review Deal" action button:

```scss
.reviewBtn {
  background: rgba(14, 15, 17, 0.04);
  border: 1px solid rgba(14, 15, 17, 0.02);
  border-radius: 8px;
  padding: 6px 14px;
  font-size: 14px;
  font-weight: 500;
  color: #455468;
  cursor: pointer;
  white-space: nowrap;

  &:hover {
    background: rgba(14, 15, 17, 0.08);
  }
}
```

Avatar placeholder styles can be inline or added to a component-scoped module if the helpers are extracted to their own files.

---

## Technical Considerations

### `DealForm` / `handleFormSubmit` edit detection

`handleFormSubmit` currently does:
```ts
if (editingDeal) {
  await updateDeal.mutateAsync(...);
} else {
  await createDeal.mutateAsync(...);
}
```

For the MVP "Review Deal" flow, we want the form to call `createDeal` (not `updateDeal`) even though `editingDeal` is set (for pre-population). Solutions:
- Set `uid: ''` on the prefilled deal and change the condition to `if (editingDeal?.uid)`
- Or add a separate `reviewingDeal` state that pre-populates the form without being treated as "editing"

**Recommended:** Change the condition to `if (editingDeal?.uid)` — simpler and semantically correct.

### Category filter mismatch

`DEAL_CATEGORIES` in `constants.ts` may not match the category strings in mock submitted deals (`'Cloud Computing'`, `'Finance & Legal'`). The dropdown will show canonical categories but the mock data will never match. This is acceptable for the MVP since real data will use canonical categories.

### `globalFilter` scope in TanStack Table

When `globalFilter` is set, TanStack Table v8 searches across all string-accessible column values by default. For the submitted table this means the search input will search against: `vendorName`, `submittedBy`, `submittedByEmail`, `category`, `description`, and `submittedAt`. This is fine for MVP.

### `fetchDealCounts` returns `submitted: 0`

The `counts?.submitted` path always returns `0`. The fallback `submittedData?.data?.length` will be used. This is acceptable while the data is mocked. Add a `// TODO: fetchDealCounts must return real submitted count after API wiring` comment.

---

## Acceptance Criteria

### Functional

- [x] Navigating to `/deals` shows three tabs: "Deals Catalog", "Submitted Deals", "Reported Issues" (in order, with count badges)
- [x] Clicking "Submitted Deals" updates the URL to `?tab=submitted` and renders the submitted deals table
- [x] Direct navigation to `/deals?tab=submitted` renders the correct tab without clicking
- [x] Table displays columns: Vendor & Deal | Submitted By | Submission Date | Action
- [x] "Vendor & Deal" shows a 40×40 rounded square avatar (first letter of vendor name), vendor name, and description (truncated)
- [x] "Submitted By" shows a 40×40 circular avatar (first letter of submitter name), full name, and email
- [x] "Submission Date" shows date ("Mar 10, 2026") and time ("06:45 pm") on separate lines
- [x] "Submission Date" column is sortable (↑↓ icon visible, clicking toggles asc/desc)
- [x] "Review Deal" button opens the DealForm modal pre-populated with vendorName, category, and description from the submitted deal
- [x] Form opened via "Review Deal" saves as a **new** catalog deal (create path, not update)
- [x] Search input filters the submitted deals table by vendor name / submitter info
- [x] Category dropdown filters submitted deals by category
- [x] Status dropdown renders but is disabled (no filter effect)
- [x] "+ Create new deal" button on the submitted tab opens the empty DealForm
- [x] Pressing Escape in the search input clears the filter
- [x] Count badge on "Submitted Deals" tab reflects the number of records (2 from mock)
- [x] Switching tabs preserves each tab's filter and sorting state independently
- [x] Pagination works (10 records per page, controls visible when > 10 records)

### Visual

- [x] Active "Submitted Deals" tab shows blue text and a blue bottom-border underline
- [x] Active tab's count badge is styled with blue background and text (matching "Deals Catalog" active state)
- [x] "Review Deal" button matches Figma secondary button style (gray bg, border, rounded)
- [x] Avatar placeholders show a single uppercase initial on a light gray background

### Edge Cases

- [x] Empty state ("No records found.") renders when the submitted list is empty or all filters yield no matches
- [x] `vendorName` or `submittedBy` empty string → avatar shows "?" rather than crashing
- [x] Unauthenticated users are redirected (existing guard — no regression)

---

## Dependencies & Risks

| Item | Status | Impact |
|------|--------|--------|
| `fetchSubmittedDeals` is mocked | Known — tracked in `2026-03-17-feat-wire-deals-admin-api-remove-mocks-plan.md` | Low risk for this ticket; mock returns valid shape |
| `fetchDealCounts` returns `submitted: 0` hardcoded | Known stub | Badge falls back to `submittedData?.data?.length` — acceptable |
| `DealForm` expects full `Deal`, not `SubmittedDeal` | Resolved by adapter function in `handleReview` | Medium — verify `editingDeal?.uid` condition change doesn't break catalog edit flow |
| Category strings in mock don't match `DEAL_CATEGORIES` | Known mismatch | Low — MVP acceptable; will self-correct with real API |
| Approve/reject workflow (remove submitted deal after review) | Out of scope | High — post-MVP, requires new API endpoint |

---

## Out of Scope

- **Reported Issues tab** — still commented out; separate ticket
- **Approve/reject API workflow** — no `DELETE /submitted-deals/:uid` or `POST /submitted-deals/:uid/approve` endpoint yet
- **Real-time count updates** — badge won't decrement when admin "approves" a deal (MVP limitation)
- **Loading/error states** — using existing pattern (no skeleton; blank table during load)
- **Submitter avatar from profile image** — initials only; `SubmittedDeal` has no `avatarUrl`
- **Backend API changes** to `SubmittedDeal` type (no `logoUrl` addition in this ticket)

---

## Files to Modify

| File | Change |
|------|--------|
| `apps/back-office/pages/deals/index.tsx` | Uncomment 5 code blocks + add filter state + `handleReview` + control bar JSX |
| `apps/back-office/screens/deals/hooks/useSubmittedDealsTable.tsx` | Replace column definitions, add `globalFilter` + `onReview` to args |
| `apps/back-office/pages/deals/styles.module.scss` | Add `.reviewBtn` style |

**New files (optional):**
- `apps/back-office/screens/deals/components/SubmittedDealCells/SubmittedDealCells.tsx` — `VendorAvatar` and `SubmitterAvatar` helpers (only if keeping them inline feels too heavy)

---

## References

- Figma design: https://www.figma.com/design/US3xcMIkBWVuBmefw3Bh4k/Deals?node-id=65-8164
- Brainstorm: `docs/brainstorms/2026-03-23-submitted-deals-tab-brainstorm.md`
- API wiring plan: `docs/plans/2026-03-17-feat-wire-deals-admin-api-remove-mocks-plan.md`
- Existing deals page: `apps/back-office/pages/deals/index.tsx`
- Submitted table hook: `apps/back-office/screens/deals/hooks/useSubmittedDealsTable.tsx`
- Deal types: `apps/back-office/screens/deals/types/deal.ts`
- Mock service: `apps/back-office/utils/services/deal.ts`
