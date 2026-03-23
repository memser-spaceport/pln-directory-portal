# Submitted Deals Tab — Brainstorm
**Date:** 2026-03-23
**Status:** Ready for planning

---

## What We're Building

Add a "Submitted Deals" tab to the Deals Management page (`/deals`) in the back-office app. The tab shows a list of deals submitted by community members for admin review, following the Figma design at node `65:8164`.

**Figma reference:** https://www.figma.com/design/US3xcMIkBWVuBmefw3Bh4k/Deals?node-id=65-8164

---

## Key Context: Most of This Already Exists

The tab was previously built and then **commented out**. All the building blocks are in place:

| What | Where | Status |
|------|-------|--------|
| `SubmittedDeal` type | `screens/deals/types/deal.ts` | ✅ exists |
| `useSubmittedDealsList` hook | `hooks/deals/useSubmittedDealsList.ts` | ✅ exists |
| `useSubmittedDealsTable` hook | `screens/deals/hooks/useSubmittedDealsTable.tsx` | ✅ exists (needs column updates) |
| Tab button in UI | `pages/deals/index.tsx` (lines 247–258) | 💬 commented out |
| State variables (sorting, pagination) | `pages/deals/index.tsx` (lines 66–71) | 💬 commented out |
| Tab content render | `pages/deals/index.tsx` (lines 332–337) | 💬 commented out |

The core work is: **uncomment the hidden code + update column definitions to match Figma design**.

---

## Figma Design Analysis

### Tab bar
Three tabs with count badges: **Deals Catalog (12)** | **Submitted Deals (2)** [active, blue underline] | **Reported Issues (3)**

### Action bar (same as Catalog tab)
- Search input ("Search deals")
- "All categories" dropdown
- "All statuses" dropdown
- "+ Create new deal" button (blue, primary)

### Table columns
| Column | Content | Sortable |
|--------|---------|---------|
| Vendor & Deal | vendor logo (40×40 rounded) + vendor name + short description (truncated) | No |
| Submitted By | circular avatar + full name + email | No |
| Submission Date | date ("Mar 10, 2026") + time ("06:45 pm") | Yes (↑↓ icon) |
| Action | "Review Deal" secondary button | — |

---

## Gaps Between Existing Code and Figma

### 1. Column structure mismatch
Current `useSubmittedDealsTable` columns: `vendorName` | `submittedBy+email` | `category` | `description` | `submittedAt`

Figma columns: `Vendor & Deal` (logo+name+desc) | `Submitted By` (avatar+name+email) | `Submission Date` (date+time) | `Action`

**Changes needed:**
- Combine `vendorName` + `description` into a "Vendor & Deal" cell with logo
- Remove standalone `category` and `description` columns
- Format `submittedAt` to show date + time separately
- Add an "Action" column with "Review Deal" button

### 2. Missing `logoUrl` on `SubmittedDeal` type
The `SubmittedDeal` type doesn't have `logoUrl`. The Figma shows vendor logos.

**Options:**
- A) Add `logoUrl` to `SubmittedDeal` type + update API response
- B) Show a placeholder/initials avatar when no logo is available (use existing `VendorCell` component which handles missing logos gracefully)

### 3. "Review Deal" action behavior
**Decision:** Open the existing `DealForm` modal in edit/review mode — no new components needed.

### 4. Action bar filters
**Decision:** Show category + status dropdowns on the Submitted Deals tab (matches Figma). Wire separate filter state for this tab, same pattern as the catalog tab.

---

## Open Questions

1. **Does the API already return `logoUrl` for submitted deals?** Check `fetchSubmittedDeals` in `utils/services/deal`.
2. **Are "Submitted Deals" deals where `status = SUBMITTED`**, or a separate model/table entirely?

---

## Recommended Approach

**Minimal, focused implementation:**

1. **Uncomment** the hidden tab code in `pages/deals/index.tsx`
2. **Update `useSubmittedDealsTable`** columns to match Figma: combine vendor+description, format date/time, add "Review Deal" button
3. **Handle missing logo**: use `VendorCell` component (already handles `null` logos), add `logoUrl` to `SubmittedDeal` type if the API provides it
4. **"Review Deal" action**: navigate to the deal detail or open the existing form — confirm with product
5. **Action bar**: reuse the same search + filters that the Catalog tab uses (wire `submittedFilter` state, or keep filters catalog-only if not needed for submitted)

This approach minimizes new code, reuses existing patterns, and only unblocks what was already built.

---

## Out of Scope (for this ticket)

- "Reported Issues" tab (also commented out — separate ticket)
- Backend API changes to the submitted deals endpoint
- Approve/reject workflow (unless "Review Deal" needs it)
