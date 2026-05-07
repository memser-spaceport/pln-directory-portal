---
date: 2026-05-07
topic: members-v2-server-side-pagination
---

# Members V2 — Server-Side Pagination

## What We're Building

Migrate the 4 member tabs (PENDING, VERIFIED, APPROVED, REJECTED) in `apps/back-office/pages/members-v2/index.tsx` from a single "fetch everything" request to per-tab server-side pagination with server-side search and filters. Tab counts remain always-accurate via a new lightweight counts endpoint. The Policies tab is out of scope.

## Current State

- `useMembersList` sends one request with `memberState=['PENDING','VERIFIED','APPROVED','REJECTED']` — the API returns every member
- All filtering (search, group, role), sorting, tab counts, and pagination happen client-side
- The API (`GET /v1/admin/members`) already accepts `page` and `limit` but no `search` param
- Reference pattern: `access-control/index.tsx` + `useRbacMembers` hook — identical shape to what we need

## Why This Approach

The page fetches the full member dataset on every load. As the member count grows this becomes slow and wasteful. Server-side pagination solves this by fetching only the current page of the current tab. Tab counts need a separate lightweight call so the other tabs can still show accurate numbers without loading their full datasets.

## Key Decisions

- **Tab counts**: New `GET /v1/admin/members/counts` endpoint returning `{ PENDING, VERIFIED, APPROVED, REJECTED }`. Always accurate, cheap.
- **Filter options (group/role dropdowns)**: Continue deriving from `usePoliciesList` data — already loaded, no new endpoint needed.
- **Policies tab**: Out of scope — remains client-side filtered.
- **Search**: Add `search` query param to `GET /v1/admin/members` DTO and service (text match on name/email).
- **Approved tab filters** (`policyGroups`, `policyRoles`): Already supported by the API — just need to wire through `useMembersList`.
- **Reference pattern**: Mirror `access-control/index.tsx` — tab switch resets `pageIndex` to 0, search/filter changes reset pagination via state.

## Scope

### API changes (back-end)

1. `libs/contracts/src/schema/admin-member.ts` — add `search?: string` to `RequestMembersSchema`
2. `apps/web-api/src/admin/member.service.ts` — apply `search` as `name`/`email` contains filter in `findMembers`
3. New route: `GET /v1/admin/members/counts` → `{ PENDING: number, VERIFIED: number, APPROVED: number, REJECTED: number }`
   - New method in `member.service.ts`, new handler in `member.controller.ts`

### Frontend changes

1. `useMembersList` — add `page`, `limit`, `search` to `QueryParams` and wire into `URLSearchParams`; update `queryKey` to include them
2. New `useMembersCountsByState` hook — calls `GET /v1/admin/members/counts`
3. `members-v2/index.tsx`:
   - Replace "fetch all states" with "fetch active tab's state only, with page/limit/search"
   - Replace client-side `tabCounts` memo with `useMembersCountsByState`
   - Replace client-side `filteredMembers` memo with the paginated API response
   - Wire `groupFilter`/`roleFilter` as server params (already supported by API)
   - Reset `pageIndex` to 0 on tab change, search change, or filter change
   - Derive `pageCount` from API pagination response

## Open Questions

- Should `search` match on `name` only, or `name + email`? (Likely name + email to match existing UX expectations)
- Should tab counts be affected by the current search/filter, or always show unfiltered totals? (Likely unfiltered totals — simpler and more informative)
- Does `MembersTableV2` need any changes to work with server-side page count, or does it already accept `pageCount` as a prop?

## Next Steps

→ `/workflows:plan` for implementation details
