# Deals Management Page — Back-Office

**Date:** 2026-03-17
**Status:** Brainstorm
**Figma:** https://www.figma.com/design/US3xcMIkBWVuBmefw3Bh4k/Deals?node-id=57-9502

---

## What We're Building

A **Deals Management** admin page in the back-office (`/deals`) that lets admins view, filter, create, and moderate deal catalog entries. The page has three tabs:

1. **Deals Catalog** — the primary view: paginated table of all deal vendors with filtering by category, audience, and status.
2. **Submitted Deals** — deals submitted by founders/vendors for review.
3. **Reported Issues** — user-reported problems on existing deals.

The page follows the exact same pattern as the existing Members page.

---

## Why This Approach

### Approach: Mirror the Members Page Pattern (Recommended)

Replicate the exact layering and patterns used by the Members page:

```
pages/deals/index.tsx              ← Next.js page + ApprovalLayout
screens/deals/
  hooks/useDealsTable.tsx          ← TanStack Table v8 column definitions
  hooks/useSubmittedDealsTable.tsx
  hooks/useReportedIssuesTable.tsx
  components/                      ← Cell renderers, VendorCell, StatusCell, etc.
  components/DealForm/             ← Create/edit fullscreen overlay
  types/deal.ts                    ← Deal, SubmittedDeal, ReportedIssue types
hooks/deals/
  useDeals.ts                      ← TanStack Query: GET /v1/admin/deals
  useSubmittedDeals.ts
  useReportedIssues.ts
  constants/queryKeys.ts
utils/services/deal.ts             ← Axios fetch helpers
```

**Why not deviate from this pattern?** Every other entity in the back-office uses this structure. Consistency means any engineer familiar with Members can work on Deals immediately.

---

## Key Decisions

### 1. Tab Routing — Query Param (same as Members)

Use `router.replace({ query: { tab: 'catalog' | 'submitted' | 'issues' } })` to drive which tab is active. This is consistent with the Members `filter` query param pattern and preserves browser history/bookmarking.

### 2. Deals Catalog Table Columns

| Column | Width | Notes |
|--------|-------|-------|
| Vendor | flexible | Avatar + name (like MemberCell) |
| Category | 200px | text |
| Audience | 180px | text (All Founders / PL Funded Founders) |
| Marked as Using | 140px | number or `-` |
| Tapped How to Redeem | 140px | number or `-` |
| Submitted Issues | 150px | warning badge (count) or `✓ No` |
| Status | 130px | pill badge: Draft / Active / Deactivated |
| Last Updated | 170px | date + time |
| Action | 88px | 3-dot context menu |

### 3. Filters

Four controls in the Action Area (above the table):
- **Search** — client-side global filter on vendor name
- **All categories** — dropdown (multi-select or single-select, TBD from API shape)
- **All audiences** — dropdown
- **All statuses** — dropdown: Draft / Active / Deactivated

These drive server-side query params to `GET /v1/admin/deals`.

### 4. Pagination

Client-side via TanStack `getPaginationRowModel()` with `pageSize: 10`, reusing `PaginationControls`. This matches Members. If deal volume grows large, server-side pagination can be layered in later without restructuring.

> **Note:** `PaginationControls` is currently typed to `Table<Member>` — it needs to be generalized to `Table<unknown>` or refactored to use a generic. This is a small prerequisite.

### 5. Create / Edit Deal — Fullscreen Overlay

Matches the `MemberForm` pattern: a `framer-motion` fullscreen overlay opened from `EditCell` (3-dot menu → Edit) and the `+ Create new deal` button. The form populates from the existing Figma design.

### 6. Status Update via 3-dot Menu

The Action column's 3-dot menu allows: Edit, Activate, Deactivate. Status changes go via `PATCH /v1/admin/deals/:id`. Toast notifications on success/error via `react-toastify`.

### 7. Auth Guard

Use `getServerSideProps` cookie check (Teams page pattern) rather than client-side `useEffect` redirect (Members page pattern) — avoids the flash-before-redirect issue.

### 8. API Constants

Add to `utils/constants.ts`:
```typescript
ADMIN_DEALS: '/v1/admin/deals',
ADMIN_SUBMITTED_DEALS: '/v1/admin/deals/submitted',
ADMIN_REPORTED_ISSUES: '/v1/admin/deals/reported-issues',
```

---

## Open Questions

1. **Submitted Deals tab columns** — What columns does this table show? Need to pull the Figma sub-frame for that tab during planning.
2. **Reported Issues tab columns** — Same question.
3. **Category / Audience values** — Are these enums from the backend or dynamic from a lookup endpoint?
4. **3-dot menu actions** — Does "Submitted Deals" tab have approve/reject actions? Need Figma for that tab.
5. **`PaginationControls` generalization** — Confirm whether to refactor the component to `Table<T>` or create a `DealsPage`-specific copy.
6. **Tab counts** — Are the badge counts (12 / 2 / 3) from the same endpoint or separate calls?

---

## Out of Scope

- Bulk edit / multi-select (no checkbox column visible in Figma for Deals Catalog)
- Server-side pagination (client-side is sufficient for now)
- Email notifications on status change

---

## Implementation Sequence

1. Generalize `PaginationControls` to `Table<T>` (small prerequisite)
2. Add API constants + axios service (`utils/services/deal.ts`)
3. Add TanStack Query hooks (`hooks/deals/`)
4. Build `screens/deals/` — types, cell components, table hooks
5. Build `DealForm` overlay (create + edit)
6. Build `pages/deals/index.tsx` — wire everything together
7. Add Deals nav link to `Navbar`
