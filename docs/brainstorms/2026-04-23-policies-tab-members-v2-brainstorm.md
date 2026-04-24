---
date: 2026-04-23
topic: policies-tab-members-v2
---

# Policies Tab on Members V2 Page

## What We're Building

A new "Policies" tab on the Members V2 page that lists all access-control policies in a paginated, filterable table. Data comes from the existing `usePoliciesList` hook. The tab sits between "Approved Members" and "Rejected Members" in the tab bar, with a count badge showing the total number of policies.

## Why This Approach

Data is already fetched by `usePoliciesList` (used in MemberForm), so no new API wiring is needed. The client-side filter + TanStack Table pagination pattern is already established in `MembersTableV2`, making this a direct pattern follow.

## Key Decisions

- **Data source:** `usePoliciesList({ authToken })` — returns full list, no server-side pagination needed
- **Tab position:** index 4, between Approved and Rejected (matches design)
- **Count badge:** `policiesData?.length ?? 0`
- **Table columns:** Policy (icon + name), Role, Group, Description, Modules (permissions chips w/ +N overflow), Members (`assignmentsCount`), Action ("View" button — no-op for now)
- **Toolbar:** text search (policy name/description), "All roles" dropdown, "All groups" dropdown — all client-side
- **Pagination:** client-side via TanStack Table `getPaginationRowModel()`, `pageSize: 10` (fits ~10 per page as shown in design)
- **View button:** renders visually, no action wired — placeholder for future detail page
- **Modules column:** render `policy.permissions` as short chips, show first 2 then `+N` for overflow (consistent with design)
- **Policy icon:** use a generic shield/lock SVG; match per-row icon style from design (role-based or static)

## Open Questions

- What are the exact icon variants per policy type in the design (shield checked, shield with clock, shield with X, rocket)? For now use a single generic shield icon and iterate later.
- Are `permissions[]` strings already human-readable module names, or raw codes? Implementation will render as-is and refine based on real API data.

## Next Steps

→ `/workflows:plan` for implementation details
