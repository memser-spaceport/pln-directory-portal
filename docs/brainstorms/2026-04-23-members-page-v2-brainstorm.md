---
date: 2026-04-23
topic: members-page-v2
---

# Members Page V2

## What We're Building

A new Members page at `/pages/members-v2/` that replaces the access-level-centric view with a `memberState`-driven tab layout. The page fetches all members in a single API call, then splits them across 4 tabs by `memberState`. Each tab renders an independent table with client-side pagination and a shared search bar. A count badge on each tab is derived from the in-memory filtered list.

The UI matches the design: page title + subtitle, tab bar, search input + "Add Member" button, table (Member, Team/Project, Actions columns), and paginated footer.

## Why This Approach

### Chosen: Single fetch + client-side filter + client-side pagination

Fetch all members once (no `page` query param), store in memory via react-query, derive filtered lists per tab client-side. Tab counts are always accurate because the full dataset is available upfront.

**Trade-off accepted**: Large initial payload for Approved Members (3000+ rows). This is acceptable for an admin tool where load time is a secondary concern and accurate counts across all tabs are more valuable than a fast first render.

### Considered but not chosen: Server-side filter per tab

Each tab would call `GET /admin/members?memberState=<state>&page=N`. More network-efficient for large datasets, but tab counts would require an extra `/admin/members/counts` call and inter-tab state would be harder to coordinate.

## Key Decisions

- **Route**: `/pages/members-v2/index.tsx` — new parallel route, existing page untouched during transition.
- **Tabs**: 4 tabs only (Pending, Verified, Approved, Rejected). Policies tab deferred.
- **memberState values**: `PENDING` | `VERIFIED` | `APPROVED` | `REJECTED` (uppercase enum from API).
- **Data fetch**: `useMembersList` (or a new `useMembersListV2` hook) called once without a state filter. react-query key stays stable so data isn't re-fetched on tab switch.
- **Filtering**: `members.filter(m => m.memberState === activeTab)` per tab.
- **Tab counts**: `useMemo` over the full list, one count per state value.
- **Pagination**: `@tanstack/react-table` v8 client-side pagination, reuse existing `PaginationControls` component.
- **Reused components**: `MemberCell`, `PaginationControls`, `AddMember` modal, `ApprovalLayout`, CSS module patterns from existing members screen.
- **New component**: `MembersTableV2` — a focused table component that accepts a filtered `Member[]` and renders the simplified 3-column layout (Member, Team/Project, Actions).

## Open Questions

- Does the existing `useMembersList` hook support fetching without a `page` param (i.e., return all records)? Or does the API require a large `limit` value (e.g., `limit=10000`)?
- What columns should the Team/Project cell show — same as current (teamMemberRoles + projectContributions) or a simplified subset?
- Should search filter across all tabs simultaneously (shared search state) or be per-tab?
- Is "Edit" the only action needed in the Actions column, or should Approve/Reject quick-actions appear on the Pending tab?

## Next Steps

→ `/workflows:plan` for implementation details
