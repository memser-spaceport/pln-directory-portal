---
title: "feat: Deals Management Back-Office Page"
type: feat
date: 2026-03-17
brainstorm: docs/brainstorms/2026-03-17-deals-page-back-office-brainstorm.md
figma: https://www.figma.com/design/US3xcMIkBWVuBmefw3Bh4k/Deals?node-id=57-9502
---

# feat: Deals Management Back-Office Page

## Overview

Implement the `/deals` admin page in the back-office Next.js app, following the established Members page pattern exactly. The page provides three tabs — **Deals Catalog**, **Submitted Deals**, and **Reported Issues** — with a fullscreen Create/Edit Deal form overlay.

All backend APIs (`/v1/admin/deals`, `/v1/admin/deals/submitted`, `/v1/admin/deals/reported-issues`) are already implemented.

---

## Problem Statement

Admins have no way to manage the deals catalog from the back-office. They need to:
- Browse, search, and filter all deals by category, audience, and status
- Create new deals and edit existing ones
- Activate/deactivate deals via inline actions
- Review and act on founder-submitted deals
- Triage user-reported issues on existing deals

---

## Proposed Solution

Mirror the Members page pattern precisely:
- **TanStack Table v8** for table rendering (`@tanstack/react-table`)
- **TanStack Query** for data fetching (`@tanstack/react-query`)
- **CSS Modules** (`.module.scss`) for styling
- **framer-motion** fullscreen overlay for the Create/Edit form
- **`getServerSideProps`** cookie guard (Teams page pattern — prevents auth flash)
- Tab state encoded in URL query param (`?tab=catalog|submitted|issues`)
- Client-side pagination with `getPaginationRowModel()`, `pageSize: 10`

---

## Technical Approach

### Architecture

```
apps/back-office/
  pages/deals/
    index.tsx                            ← Route, ApprovalLayout, tab state, table render
    styles.module.scss                   ← Page-level styles

  screens/deals/
    types/
      deal.ts                            ← Deal, SubmittedDeal, ReportedIssue, TDealForm
    hooks/
      useDealsTable.tsx                  ← TanStack Table v8 config for Deals Catalog
      useSubmittedDealsTable.tsx         ← TanStack Table v8 config for Submitted Deals
      useReportedIssuesTable.tsx         ← TanStack Table v8 config for Reported Issues
    components/
      VendorCell/
        VendorCell.tsx                   ← Vendor logo + name (mirrors MemberCell)
        VendorCell.module.scss
      StatusCell/
        StatusCell.tsx                   ← Draft/Active/Deactivated pill badge
        StatusCell.module.scss
      IssuesBadge/
        IssuesBadge.tsx                  ← "✓ No" or "⚠ N" submitted issues indicator
        IssuesBadge.module.scss
      ActionMenu/
        ActionMenu.tsx                   ← 3-dot dropdown: Edit / Activate / Deactivate
        ActionMenu.module.scss
      DealForm/
        DealForm.tsx                     ← framer-motion fullscreen overlay (create + edit)
        DealForm.module.scss
      SubmittedDealActionCell/
        SubmittedDealActionCell.tsx      ← Approve / Reject buttons
      ReportedIssueActionCell/
        ReportedIssueActionCell.tsx      ← Resolve / Dismiss buttons

  hooks/deals/
    constants/
      queryKeys.ts                       ← DealsQueryKeys enum
    useDealsList.ts                      ← GET /v1/admin/deals
    useSubmittedDealsList.ts             ← GET /v1/admin/deals/submitted
    useReportedIssuesList.ts             ← GET /v1/admin/deals/reported-issues
    useCreateDeal.ts                     ← POST /v1/admin/deals
    useUpdateDeal.ts                     ← PATCH /v1/admin/deals/:uid
    useDealCounts.ts                     ← GET /v1/admin/deals/counts (tab badges)

  utils/services/
    deal.ts                              ← Axios fetch helpers

  utils/constants.ts                     ← [MODIFY] add ADMIN_DEALS routes
  components/navbar/navbar.tsx           ← [MODIFY] add Deals nav link
  screens/members/components/
    PaginationControls/
      PaginationControls.tsx             ← [MODIFY] generalize Table<Member> → Table<T>
```

### Pre-requisite: Generalize PaginationControls

`PaginationControls` is currently typed to `Table<Member>`. Before building the Deals page, change the prop type to generic:

```typescript
// screens/members/components/PaginationControls/PaginationControls.tsx
// Before:
interface Props { table: Table<Member>; }

// After:
interface Props<T> { table: Table<T>; }
export function PaginationControls<T>({ table }: Props<T>) { ... }
```

No logic changes required — all methods used (`getPageCount`, `getState`, `setPageIndex`, etc.) exist on any `Table<T>`.

---

### Implementation Phases

#### Phase 1: Foundation (types + data layer)

**1.1 Add API route constants**

File: `apps/back-office/utils/constants.ts`

```typescript
// Add to API_ROUTE object:
ADMIN_DEALS: `${APP_CONSTANTS.V1}admin/deals`,
ADMIN_SUBMITTED_DEALS: `${APP_CONSTANTS.V1}admin/deals/submitted`,
ADMIN_REPORTED_ISSUES: `${APP_CONSTANTS.V1}admin/deals/reported-issues`,
ADMIN_DEALS_COUNTS: `${APP_CONSTANTS.V1}admin/deals/counts`,
```

**1.2 Define TypeScript types**

File: `apps/back-office/screens/deals/types/deal.ts`

```typescript
export type DealStatus = 'Draft' | 'Active' | 'Deactivated';
export type DealAudience = 'All Founders' | 'PL Funded Founders';

export type Deal = {
  uid: string;
  vendorName: string;
  vendorLogoUrl: string | null;
  category: string;
  audience: DealAudience;
  markedAsUsingCount: number | null;
  tappedHowToRedeemCount: number | null;
  submittedIssuesCount: number;
  status: DealStatus;
  updatedAt: string; // ISO date
};

export type SubmittedDeal = {
  uid: string;
  // Fields to be confirmed from Figma Submitted Deals tab design
  // and backend API response shape
};

export type ReportedIssue = {
  uid: string;
  // Fields to be confirmed from Figma Reported Issues tab design
  // and backend API response shape
};

// Write model for Create/Edit form
// Fields to be confirmed from Figma Create Deal form design
export type TDealForm = {
  vendorName: string;
  vendorLogo: File | null;
  category: string;
  audience: DealAudience;
  // ... additional fields from Figma
};
```

> ⚠️ `SubmittedDeal`, `ReportedIssue`, and `TDealForm` field lists must be confirmed by inspecting:
> - Figma Submitted Deals tab frame
> - Figma Reported Issues tab frame
> - Figma Create/Edit Deal form frame
> - Backend API response shapes (inspect web-api controllers or test the endpoints)

**1.3 Axios service helpers**

File: `apps/back-office/utils/services/deal.ts`

```typescript
import { api } from '../api';
import { API_ROUTE } from '../constants';

export const fetchDealsList = ({ authToken, category?, audience?, status?, search? }) =>
  api.get(API_ROUTE.ADMIN_DEALS, {
    headers: { authorization: `Bearer ${authToken}` },
    params: { category, audience, status, search },
  }).then(r => r.data);

export const fetchSubmittedDeals = ({ authToken }) =>
  api.get(API_ROUTE.ADMIN_SUBMITTED_DEALS, {
    headers: { authorization: `Bearer ${authToken}` },
  }).then(r => r.data);

export const fetchReportedIssues = ({ authToken }) =>
  api.get(API_ROUTE.ADMIN_REPORTED_ISSUES, {
    headers: { authorization: `Bearer ${authToken}` },
  }).then(r => r.data);

export const createDeal = ({ authToken, payload }) =>
  api.post(API_ROUTE.ADMIN_DEALS, payload, {
    headers: { authorization: `Bearer ${authToken}` },
  }).then(r => r.data);

export const updateDeal = ({ authToken, uid, payload }) =>
  api.patch(`${API_ROUTE.ADMIN_DEALS}/${uid}`, payload, {
    headers: { authorization: `Bearer ${authToken}` },
  }).then(r => r.data);
```

**1.4 TanStack Query hooks**

File: `apps/back-office/hooks/deals/constants/queryKeys.ts`

```typescript
export enum DealsQueryKeys {
  GET_DEALS_LIST = 'GET_DEALS_LIST',
  GET_SUBMITTED_DEALS_LIST = 'GET_SUBMITTED_DEALS_LIST',
  GET_REPORTED_ISSUES_LIST = 'GET_REPORTED_ISSUES_LIST',
  GET_DEALS_COUNTS = 'GET_DEALS_COUNTS',
}
```

Files: `hooks/deals/useDealsList.ts`, `useSubmittedDealsList.ts`, `useReportedIssuesList.ts`, `useCreateDeal.ts`, `useUpdateDeal.ts`

Pattern (mirror `hooks/members/useMembersList.ts`):
```typescript
// useDealsList.ts
export function useDealsList(params: { authToken: string; category?: string; audience?: string; status?: string }) {
  return useQuery({
    queryKey: [DealsQueryKeys.GET_DEALS_LIST, params.authToken, params.category, params.audience, params.status],
    queryFn: () => fetchDealsList(params),
    enabled: !!params.authToken,
  });
}

// useUpdateDeal.ts — handles Activate/Deactivate and general edits
export function useUpdateDeal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: updateDeal,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [DealsQueryKeys.GET_DEALS_LIST] });
      queryClient.invalidateQueries({ queryKey: [DealsQueryKeys.GET_DEALS_COUNTS] });
      toast.success('Deal updated successfully');
    },
    onError: () => toast.error('Failed to update deal'),
  });
}
```

---

#### Phase 2: Deals Catalog Tab

**2.1 Cell components**

File: `apps/back-office/screens/deals/components/VendorCell/VendorCell.tsx`

```typescript
// Logo (img or initials fallback) + vendor name
// Mirror of screens/members/components/MemberCell/MemberCell.tsx
export const VendorCell = ({ deal }: { deal: Deal }) => { ... }
```

File: `apps/back-office/screens/deals/components/StatusCell/StatusCell.tsx`

```typescript
// Pill badge: Draft (gray), Active (green), Deactivated (red)
// Similar to existing StatusCell in members but for DealStatus
export const StatusCell = ({ status }: { status: DealStatus }) => { ... }
```

File: `apps/back-office/screens/deals/components/IssuesBadge/IssuesBadge.tsx`

```typescript
// 0 issues → "✓ No" (green)
// N > 0 issues → "⚠ N" (orange with warning icon)
export const IssuesBadge = ({ count }: { count: number }) => { ... }
```

File: `apps/back-office/screens/deals/components/ActionMenu/ActionMenu.tsx`

```typescript
// 3-dot button → dropdown with conditional items:
// - "Edit" (always)
// - "Activate" (hidden if status === 'Active')
// - "Deactivate" (hidden if status === 'Deactivated')
// onEdit, onActivate, onDeactivate callbacks
export const ActionMenu = ({ deal, onEdit, onActivate, onDeactivate }) => { ... }
```

**2.2 Table hook**

File: `apps/back-office/screens/deals/hooks/useDealsTable.tsx`

```typescript
// Column definitions (mirroring useMembersTable.tsx pattern):
// 1. Vendor        — flexible width, VendorCell renderer
// 2. Category      — 200px, text
// 3. Audience      — 180px, text
// 4. Marked as Using — 140px, number or "-"
// 5. Tapped How to Redeem — 140px, number or "-"
// 6. Submitted Issues — 150px, IssuesBadge renderer
// 7. Status        — 130px, StatusCell renderer
// 8. Last Updated  — 170px, formatted date + time on second line
// 9. Action        — 88px, ActionMenu renderer

// useReactTable config:
//   getRowId: (row) => row.uid
//   globalFilterFn: custom filter on vendorName
//   sortingFn for Last Updated: sort by updatedAt DESC (default)
//   getPaginationRowModel(), getSortedRowModel(), getFilteredRowModel()
```

**2.3 Page component (Deals Catalog portion)**

File: `apps/back-office/pages/deals/index.tsx`

```typescript
// getServerSideProps: nookies cookie guard → redirect /?backlink=/deals
//
// Page state:
//   activeTab: 'catalog' | 'submitted' | 'issues'  ← from router.query.tab
//   sorting, pagination, globalFilter, columnFilters ← table state
//   categoryFilter, audienceFilter, statusFilter ← dropdown state
//   isFormOpen, editingDeal ← form overlay state
//
// Layout:
//   <ApprovalLayout>
//     <div className={styles.container}>
//       <TopSection />           ← "Deals Management" heading + subtitle
//       <TabsBar />              ← 3 tabs with badge counts
//       {activeTab === 'catalog' && <CatalogView />}
//       {activeTab === 'submitted' && <SubmittedDealsView />}
//       {activeTab === 'issues' && <ReportedIssuesView />}
//     </div>
//     <DealForm open={isFormOpen} deal={editingDeal} onClose={closeForm} />
//   </ApprovalLayout>
```

---

#### Phase 3: Submitted Deals Tab

> ⚠️ **Prerequisite:** Pull Figma frame for Submitted Deals tab to confirm columns and action design before implementing.

**3.1 Inspect backend API**

Before building, inspect `GET /v1/admin/deals/submitted` response shape and confirm:
- Exact field names and types
- Approval/rejection API endpoints
- Whether rejection requires a reason field

**3.2 Table hook**

File: `apps/back-office/screens/deals/hooks/useSubmittedDealsTable.tsx`

```typescript
// Columns to be defined after Figma inspection.
// Likely includes:
//   - Submitter (who submitted the deal)
//   - Vendor name
//   - Submitted date
//   - Action (Approve / Reject)
```

**3.3 Action cell**

File: `apps/back-office/screens/deals/components/SubmittedDealActionCell/SubmittedDealActionCell.tsx`

```typescript
// Approve button → POST /v1/admin/deals/submitted/:uid/approve
//   onSuccess: invalidate submitted deals list + deals catalog list
// Reject button → with ConfirmDialog (reason input?) → POST /v1/admin/deals/submitted/:uid/reject
//   onSuccess: invalidate submitted deals list
```

---

#### Phase 4: Reported Issues Tab

> ⚠️ **Prerequisite:** Pull Figma frame for Reported Issues tab to confirm columns and action design before implementing.

**4.1 Table hook**

File: `apps/back-office/screens/deals/hooks/useReportedIssuesTable.tsx`

```typescript
// Columns to be defined after Figma inspection.
// Likely includes:
//   - Deal name/vendor
//   - Reporter
//   - Issue description
//   - Reported date
//   - Action (Resolve / Dismiss)
```

---

#### Phase 5: Create/Edit Deal Form

> ⚠️ **Prerequisite:** Pull Figma frame for Create Deal form overlay to confirm all fields, validation, and layout.

File: `apps/back-office/screens/deals/components/DealForm/DealForm.tsx`

Pattern: Mirror `screens/members/components/MemberForm/MemberForm.tsx`.

```typescript
// framer-motion AnimatePresence + motion.div fullscreen overlay
// Props: open: boolean, deal: Deal | null (null = create mode), onClose: () => void
//
// On mount: if deal !== null, populate form with existing values
// On submit:
//   - create mode → useCreateDeal → toast success → close + refetch
//   - edit mode → useUpdateDeal → toast success → close + refetch
// On error: toast.error, keep overlay open
//
// Status state machine (conditional 3-dot menu in table):
//   Draft: can Activate (→ Active), cannot Deactivate
//   Active: can Deactivate (→ Deactivated), cannot Activate
//   Deactivated: can Re-activate (→ Active), cannot Deactivate again
```

**Fields** (to be confirmed from Figma — fill in during implementation):

```typescript
// TDealForm fields (confirm against Figma Create Deal form):
// - vendorName: string (required)
// - vendorLogo: File | null (image upload)
// - category: string (dropdown — confirm if enum or dynamic)
// - audience: DealAudience (dropdown)
// - dealDescription: string (rich text?)
// - dealUrl: string (URL)
// - howToRedeem: string
// - ... additional fields from Figma
```

---

#### Phase 6: Navigation & Final Wiring

**6.1 Add Deals to Navbar**

File: `apps/back-office/components/navbar/navbar.tsx`

Add Deals link matching the existing nav item pattern (icon + label).

**6.2 Tab counts**

If `GET /v1/admin/deals/counts` endpoint exists:
```typescript
// hooks/deals/useDealCounts.ts
// Returns: { catalog: number, submitted: number, issues: number }
// Displayed as badges on each tab
```

If no counts endpoint exists, derive from list response lengths (less optimal but workable).

---

## Loading & Empty States

Every table view needs three states:

| State | Behavior |
|---|---|
| Loading | Skeleton rows or spinner while TanStack Query is fetching |
| Empty (no data) | "No deals yet" with "Create new deal" CTA (Catalog); "No pending submissions" (Submitted); "No reported issues" (Reported Issues) |
| Empty (filtered) | "No deals match your filters" with "Clear filters" link |

Follow the Teams page pattern which has explicit loading states (`{loading && <div>Loading...</div>}`), unlike Members which has none.

---

## Error Handling

| Scenario | Behavior |
|---|---|
| GET list fails (500) | Show inline error banner with Retry button |
| PATCH status change fails | `toast.error(...)`, row reverts to original status |
| POST create fails | `toast.error(...)`, form stays open, submit button re-enables |
| 401 on any API call | Redirect to `/?backlink=/deals` (session expired) |

---

## Acceptance Criteria

### Functional Requirements

- [ ] `/deals` page exists and redirects unauthenticated users to `/?backlink=/deals` via `getServerSideProps`
- [ ] Non-`DIRECTORY_ADMIN` users are redirected to `/demo-days` client-side
- [ ] **Deals Catalog tab** shows table with all 9 columns matching Figma design
- [ ] Tab badge counts (12 / 2 / 3) come from the API and display on each tab
- [ ] Search input filters table by vendor name (client-side, debounced 300ms)
- [ ] Category, Audience, Status dropdowns filter the table data
- [ ] Active tab is reflected in URL query param (`?tab=catalog|submitted|issues`)
- [ ] Refreshing the page while on Submitted Deals tab returns to Submitted Deals tab
- [ ] Pagination controls show correct page count; Previous/Next and page number buttons work
- [ ] 3-dot Action menu shows **Edit** + contextual status actions:
  - Draft → shows "Activate"; does not show "Deactivate"
  - Active → shows "Deactivate"; does not show "Activate"
  - Deactivated → shows "Activate" (re-activate); does not show "Deactivate"
- [ ] Status badge colors: Draft (gray), Active (green), Deactivated (red)
- [ ] Submitted Issues column shows `✓ No` (green) for 0 issues, `⚠ N` (orange) for N > 0
- [ ] "Create new deal" button opens fullscreen form overlay
- [ ] Edit action populates form with existing deal data
- [ ] Successful create/edit closes overlay, shows success toast, refreshes table
- [ ] Failed create/edit shows error toast, keeps overlay open with button re-enabled
- [ ] Activate/Deactivate status change reflects immediately in the table row
- [ ] **Submitted Deals tab** shows correct columns (confirm from Figma) with Approve/Reject actions
- [ ] **Reported Issues tab** shows correct columns (confirm from Figma) with Resolve/Dismiss actions
- [ ] Deals link appears in the Navbar and is active when on `/deals`

### Non-Functional Requirements

- [ ] `PaginationControls` generalized to `Table<T>` (no `Table<Member>` type dependency)
- [ ] Loading state shown during initial data fetch (skeleton or spinner)
- [ ] Empty state shown when catalog has no deals
- [ ] Empty state shown when filters return zero results (with "Clear filters" CTA)
- [ ] All API calls include `authorization: Bearer <token>` header
- [ ] No `console.log` statements in committed code

---

## Dependencies & Prerequisites

**Before starting implementation:**

1. [ ] Pull Figma frame for **Submitted Deals** tab → confirm column definitions and action design
2. [ ] Pull Figma frame for **Reported Issues** tab → confirm column definitions and action design
3. [ ] Pull Figma frame for **Create/Edit Deal form** overlay → confirm all form fields and validation
4. [ ] Inspect backend endpoints to confirm:
   - Response shape for `GET /v1/admin/deals` (field names, pagination envelope)
   - Response shape for `GET /v1/admin/deals/submitted`
   - Response shape for `GET /v1/admin/deals/reported-issues`
   - Whether `GET /v1/admin/deals/counts` exists
   - Whether `GET /v1/admin/deals/:uid` exists (for fresh data on Edit open)
   - Approval/rejection endpoints for Submitted Deals
   - Resolve/dismiss endpoints for Reported Issues

---

## Risk Analysis

| Risk | Likelihood | Mitigation |
|---|---|---|
| Form fields differ from assumptions | High | Pull Figma form frame first; don't build form until fields are confirmed |
| Backend response shape doesn't match assumed types | Medium | Inspect web-api controller or test endpoints before building the data layer |
| Categories/Audiences are dynamic from API, not static | Medium | Check backend; if dynamic, add a `useDealFilterValues` hook and `GET /v1/admin/deals/filter-options` call |
| Submitted/Reported tabs have complex actions (reason input, notifications) | Medium | Pull Figma for those tabs before Phase 3/4 |

---

## Implementation Sequence (Recommended Build Order)

```
Phase 0 (Prerequisite):
  1. Generalize PaginationControls to Table<T>

Phase 1 (Data Layer):
  2. Add API_ROUTE constants
  3. Create screens/deals/types/deal.ts (catalog types only first)
  4. Create utils/services/deal.ts
  5. Create hooks/deals/ (useDealsList, useCreateDeal, useUpdateDeal, useDealCounts)

Phase 2 (Deals Catalog UI):
  6. Create cell components (VendorCell, StatusCell, IssuesBadge, ActionMenu)
  7. Create useDealsTable.tsx
  8. Create pages/deals/index.tsx (Deals Catalog tab only, stub other tabs)
  9. Create pages/deals/styles.module.scss

Phase 3 (Form Overlay):
  10. Create DealForm.tsx (create + edit modes)

Phase 4 (Submitted Deals + Reported Issues):
  11. Pull Figma frames for tabs 2 & 3
  12. Extend types (SubmittedDeal, ReportedIssue)
  13. Add hooks (useSubmittedDealsList, useReportedIssuesList)
  14. Create SubmittedDealActionCell, ReportedIssueActionCell
  15. Create useSubmittedDealsTable, useReportedIssuesTable
  16. Wire up tabs 2 & 3 in the page

Phase 5 (Navigation):
  17. Add Deals link to Navbar
```

---

## References

### Internal

- Brainstorm: `docs/brainstorms/2026-03-17-deals-page-back-office-brainstorm.md`
- Members page (primary pattern): `apps/back-office/pages/members/index.tsx`
- Members table hook: `apps/back-office/screens/members/hooks/useMembersTable.tsx`
- MemberCell (VendorCell pattern): `apps/back-office/screens/members/components/MemberCell/MemberCell.tsx`
- PaginationControls (to generalize): `apps/back-office/screens/members/components/PaginationControls/PaginationControls.tsx:7`
- Teams auth guard: `apps/back-office/pages/teams/index.tsx:571`
- Member service (service pattern): `apps/back-office/utils/services/member.ts`
- Query hooks (hook pattern): `apps/back-office/hooks/members/useMembersList.ts`
- API constants: `apps/back-office/utils/constants.ts:54`
- ApprovalLayout: `apps/back-office/layout/approval-layout.tsx`

### Figma

- Deals Catalog tab: https://www.figma.com/design/US3xcMIkBWVuBmefw3Bh4k/Deals?node-id=57-9502
- Tabs component: node-id 59:15769 (within file above)
- Submitted Deals tab: **node-id TBD** — open in Figma, click "Submitted Deals" tab, inspect node
- Reported Issues tab: **node-id TBD** — open in Figma, click "Reported Issues" tab, inspect node
- Create/Edit Deal form: **node-id TBD** — search for overlay/modal frame in same Figma file
