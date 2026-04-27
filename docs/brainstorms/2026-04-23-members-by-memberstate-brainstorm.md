---
title: Group members by memberState instead of accessLevel
type: refactor
date: 2026-04-23
status: ready-for-planning
---

# Group members by `memberState` instead of `accessLevel`

## What We're Building

Stop using `accessLevel` (L0, L1, L2, L3, L4, L5, L6, Rejected) as the source of truth for "what state is this member in" in the back-office UI. Use the `memberState` field (already returned per member in the list response) to drive tabs, counts, row badges, and the update-status write path.

`memberState` values: `PENDING`, `VERIFIED`, `APPROVED`, `REJECTED` — the same four strings `apps/back-office/pages/members/index.tsx:72-76` already filters on (but against dead data because the list was previously not carrying the field through).

The L-codes remain inside the DB and RBAC/policy plumbing — admins just don't see or pick them anymore.

## Why This Approach

- `memberState` is **already present** in the members list response; no backend work is required for step 1.
- The current frontend already *tries* to filter by `memberState` in one place — it just never had real data. This change makes existing dead code live.
- Four human-readable states match the redesigned StatusSelector (Pending / Verified / Approved / Rejected) and the admin mental model. L3/L4/L5/L6 are internal RBAC tiers, not admin-facing concepts.
- Stepped rollout lets each layer ship and get validated independently. Commit 1 is pure frontend — zero risk to writers or other consumers.

## Key Decisions

- **Scope** — all four surfaces switch: list tabs, tab counts, row status column/badge, update-status write path.
- **Values** — `PENDING` / `VERIFIED` / `APPROVED` / `REJECTED` (uppercase, matching existing filter literals).
- **Rollout** — three commits:
  1. **Frontend reads.** Tabs, counts, row badge all read `memberState` from the list response. Delete `TAB_STATE_MAP` and `ALL_ACCESS_LEVELS`. Tab counts come from the already-loaded list (no separate fetch).
  2. **Backend counts endpoint.** Add `GET /admin/members/member-state-counts` returning `{ PENDING, VERIFIED, APPROVED, REJECTED }`. Swap `useAccessLevelCounts` → `useMemberStateCounts`.
  3. **Backend write path.** Extend or replace `PUT /admin/members/access-level` so admins can send `{ memberState: 'APPROVED' }`. Backend maps `APPROVED → L4` when writing to the `accessLevel` column. Update bulk approve/reject actions to send the new shape.
- **Write mapping** — `APPROVED → L4` on the server; `PENDING → L0`, `VERIFIED → L1`, `REJECTED → Rejected`. Matches the new 4-option StatusSelector.
- **`accessLevel` column stays** — still persisted, still drives RBAC policy lookups. Just not shown or chosen in the admin UI anymore.

## Open Questions

- **Counts consistency** — step 1 derives counts from the loaded list, step 2 from a dedicated endpoint. If the list is paginated, step-1 counts are "counts of the current page," not totals. Acceptable interim, or should step 1 keep calling the existing `access-level-counts` endpoint and map its result to the four states?
- **Existing L3 / L5 / L6 members** — after step 3, if an admin re-saves a current L3 member with status = `APPROVED`, backend writes L4 and the L3 distinction is lost. Is that acceptable (confirmed today for brand-new approvals, implicit for edits), or should the write path preserve the existing L-code when it already resolves to the same `memberState`?
- **Endpoint naming** — replace `PUT /admin/members/access-level` with `PUT /admin/members/state`, or extend the existing one to accept both shapes during transition?
- **Contracts/DTO** — the `AccessLevel` enum in `libs/contracts/src/schema/admin-member.ts` stays for server-side use; do we expose a `MemberState` enum in the same contract package for typed requests in step 3?

## References

- `apps/back-office/pages/members/index.tsx:18-28, 72-76, 117` — existing phantom filter logic
- `apps/back-office/screens/members/types/member.ts:23` — `memberState?: string`
- `apps/back-office/hooks/members/useMembersList.ts` — list hook (currently sends `accessLevel=<csv>`)
- `apps/back-office/hooks/members/useAccessLevelCounts.ts` — current counts endpoint
- `apps/back-office/hooks/members/useUpdateMembersStatus.ts` — current write hook
- `apps/back-office/screens/members/components/MemberForm/StatusSelector/StatusSelector.tsx` — already redesigned to 4 options
- `apps/web-api/src/admin/member.controller.ts`, `member.service.ts` — backend list + counts + update
- `libs/contracts/src/schema/admin-member.ts` — `AccessLevel` enum and DTOs
