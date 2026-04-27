---
title: Group members by memberState instead of accessLevel
type: refactor
date: 2026-04-23
brainstorm: docs/brainstorms/2026-04-23-members-by-memberstate-brainstorm.md
---

# ♻️ Group members by `memberState` instead of `accessLevel`

## Overview

Stop exposing `accessLevel` (L0, L1, L2, L3, L4, L5, L6, Rejected) as the admin-facing "what state is this member in" concept. Use a derived `memberState` field with four values — `PENDING`, `VERIFIED`, `APPROVED`, `REJECTED` — to drive back-office tabs, counts, side-nav, and the bulk/inline status update write path.

`accessLevel` stays in the DB (it's the source of truth for RBAC plumbing). Nothing migrates. `memberState` is derived from `accessLevel` on the server:

| `accessLevel` | `memberState` |
| --- | --- |
| `L0` | `PENDING` |
| `L1` | `VERIFIED` |
| `L2`, `L3`, `L4`, `L5`, `L6` | `APPROVED` |
| `Rejected` | `REJECTED` |

## Problem Statement

Two concrete problems today:

1. **Phantom field.** `apps/back-office/pages/members/index.tsx:72-76, 117` already filters by `m.memberState === 'PENDING' | 'VERIFIED' | 'APPROVED' | 'REJECTED'`. But the backend never sets it — `findMemberByAccessLevels` at `apps/web-api/src/admin/member.service.ts:840-942` selects `accessLevel` and post-processes only to add `demoDayHosts`. Every call to `m.memberState === X` currently evaluates to `undefined === X → false`. **Tabs show zero members in production.**

2. **L-codes everywhere.** Admins see L0–L6 in inline status dropdowns (`StatusCell`), bulk controls (`MultieditControls`, currently dead), and side-nav counts (`MembersMenu`). The new 4-option `StatusSelector` in the Add/Edit form (shipped earlier this session) already hides L-codes behind human-readable labels. The rest of the back-office should follow.

## Proposed Solution

Server derives `memberState` per member (no migration) and exposes it on list + detail endpoints. Frontend switches reads, counts, and writes to `memberState` across three commits.

### Mapping logic (server helper)

```ts
// apps/web-api/src/admin/member.service.ts (new helper)
export type MemberState = 'PENDING' | 'VERIFIED' | 'APPROVED' | 'REJECTED';

export function accessLevelToMemberState(accessLevel: string | null | undefined): MemberState | null {
  if (!accessLevel) return null;
  if (accessLevel === 'L0') return 'PENDING';
  if (accessLevel === 'L1') return 'VERIFIED';
  if (accessLevel === 'Rejected') return 'REJECTED';
  if (['L2', 'L3', 'L4', 'L5', 'L6'].includes(accessLevel)) return 'APPROVED';
  return null;
}

export function memberStateToAccessLevel(state: MemberState): string {
  switch (state) {
    case 'PENDING': return 'L0';
    case 'VERIFIED': return 'L1';
    case 'APPROVED': return 'L4';   // canonical "approved" tier
    case 'REJECTED': return 'Rejected';
  }
}
```

## Technical Approach

### Implementation Phases

---

#### Phase 1 — Backend derivation + frontend reads (single commit)

**Why bundled:** Frontend reads depend on a field the backend isn't producing. Shipping them separately means either (a) landing frontend that still returns zero members (current broken state persists) or (b) landing backend-only code nothing consumes. One commit is safer and still small (~5 files).

**Files to modify:**

- [x] `apps/web-api/src/admin/member.service.ts`:
  - Add one helper: `accessLevelToMemberState(al)` at the top of the file. **Do NOT add `memberStateToAccessLevel` yet** — it's unused in Phase 1 (deferred to Phase 3, where it's first called by the write path).
  - Add a `withMemberState(m: Member): Member & { memberState }` mapper that spreads the input and adds the derived field. **One function, one source of truth.**
  - Apply `withMemberState` to the return value of EVERY controller method that returns a `Member` or `Member[]`, not just the list/detail. The full list of controller endpoints returning members (from `member.controller.ts`):
    - `GET /` → `findMemberByAccessLevels` (line 27) — already in the spread at line 923
    - `GET /:uid` → `findMemberByUid` (line 45)
    - `PUT /access-level` → `updateAccessLevel` (line 51) — returns `{ updatedCount }`, no member returned; skip
    - `POST /create` → `createMemberByAdmin` (line 59) — returns `Member`
    - `PATCH /edit/:uid` → `updateMemberByAdmin` (line 65) — returns `string`; skip
    - `POST /` → `verifyMembers` (line 77) — returns statuses array; skip
    - `PATCH /:uid` → `updateMemberFromParticipantsRequest` (line 91) — returns updated member
    - `PATCH /:uid/demo-day-hosts` → `updateDemoDayAdminHosts` (line 105) — returns `Member`
    - `PATCH /:uid/roles` → `updateMemberRolesByUid` (line 115) — returns updated member
    - `PATCH /:uid/roles-and-hosts` → `updateMemberRolesAndHosts` (line 125) — returns `Member`
  - Exhaustive, not "just the two read endpoints." Reviewer caught: without this, a write response is missing `memberState` until the next list refetch and the client's cached member object drifts.
- [x] `apps/back-office/screens/members/types/member.ts:23` — narrow `memberState?: string` → `memberState?: 'PENDING' | 'VERIFIED' | 'APPROVED' | 'REJECTED'`. Keep `?` (graceful degradation if any endpoint misses derivation).
- [x] `apps/back-office/pages/members/index.tsx`:
  - Delete `TAB_STATE_MAP` (lines 22-28) and `ALL_ACCESS_LEVELS` (line 20 — move inline to the `useMembersList` call).
  - Keep tab IDs as `level0|level1|level2|level56|rejected` — no URL breakage. Add `// TODO: rename in follow-up` comment. (See resolved Open Question #1.)
  - Rewrite `tabCounts` to filter `allMembers` by `memberState` directly (no map lookup).
  - Rewrite `tabMembers` to filter by `memberState` constant per tab.
  - Remove `console.log({ row })` at line 217.
- [x] `apps/back-office/pages/roles/index.tsx` — unchanged (roles page reads `m.accessLevel` via `StatusCell`; that moves in Phase 3).

**What NOT to touch in this commit:**

- `MemberState` enum in `libs/contracts` — defer to Phase 3 when the write DTO first needs Zod validation. Phase 1 only uses the TS string-literal union on the frontend type; no enum needed on the wire.
- `memberStateToAccessLevel` helper — defer to Phase 3.
- `useAccessLevelCounts` and its consumers (`MembersMenu`, `RecommendationsMenu`) — Phase 2.
- `useUpdateMembersStatus` and `StatusCell` — Phase 3.
- `useMembersList` query param shape — still sends `accessLevel=<csv>`.

**Acceptance criteria:**

- [x] API response for `GET /v1/admin/members?accessLevel=L0,L1,...` includes `memberState` on every member, matching the table above. _(Code path verified; live staging check still recommended.)_
- [ ] Members page tabs show non-zero counts for each of the four states (manual check on staging data).
- [ ] Clicking the Pending tab shows only members where `accessLevel='L0'`; Verified → L1; Approved → L2-L6; Rejected → Rejected.
- [x] `tsc` clean across `apps/back-office` and `apps/web-api` (admin module scope; pre-existing Prisma errors in unrelated modules excluded).
- [x] No other page/consumer breaks (the `Member` type still has the new field as optional with a narrowed union).

---

#### Phase 2 — Backend counts endpoint + side-nav switch

**Files to modify:**

- [x] `libs/contracts/src/schema/admin-member.ts` — add `export type MemberStateCounts = Record<MemberState, number>;`
- [x] `apps/web-api/src/admin/member.service.ts` — add `getMemberStateCounts()`:
  ```ts
  async getMemberStateCounts(): Promise<MemberStateCounts> {
    const counts = await this.prisma.member.groupBy({
      by: ['accessLevel'],
      _count: true,
    });
    const result: MemberStateCounts = { PENDING: 0, VERIFIED: 0, APPROVED: 0, REJECTED: 0 };
    for (const row of counts) {
      const state = accessLevelToMemberState(row.accessLevel);
      if (state) result[state] += row._count;
    }
    return result;
  }
  ```
- [x] `apps/web-api/src/admin/member.controller.ts` — add `@Get('member-state-counts')` endpoint paralleling existing `access-level-counts`.
- [x] `apps/back-office/hooks/members/useMemberStateCounts.ts` — new hook mirroring `useAccessLevelCounts`; add `GET_MEMBER_STATE_COUNTS` query key to `constants/queryKeys.ts`.
- [x] `apps/back-office/components/menu/components/MembersMenu/MembersMenu.tsx` — swap `useAccessLevelCounts` → `useMemberStateCounts`; consolidated to 4 items (Pending, Verified, Approved, Rejected).
- [x] `apps/back-office/components/menu/components/RecommendationsMenu/RecommendationsMenu.tsx` — had an unused counts import; removed.
- [x] **Deleted** `apps/back-office/hooks/members/useAccessLevelCounts.ts` (renamed to `useMemberStateCounts.ts` via git).
- [x] **Deleted** `GET /admin/members/access-level-counts` controller handler + `getAccessLevelCounts` service method + `AccessLevelCounts` type from contracts.
- [x] `apps/back-office/hooks/members/constants/queryKeys.ts` — `GET_MEMBERS_ACCESS_LEVEL_COUNTS` key removed in Phase 3 along with all 4 write-hook callers migrated to `GET_MEMBER_STATE_COUNTS`.
- [x] **Did NOT touch** `useUpdateMembersStatus.ts` — deferred to Phase 3 for atomic rename + invalidation update.

**Acceptance criteria:**

- [ ] `GET /v1/admin/members/member-state-counts` returns `{ PENDING, VERIFIED, APPROVED, REJECTED }` with correct numeric values.
- [ ] Side-nav count for "Approved" matches sum of (formerly) "2-4 Level" + "5-6 Level".
- [ ] Side-nav links route to the new tab ids (post Phase 1).
- [ ] React Query invalidates the new counts key after any status write.

---

#### Phase 3 — Backend write path + frontend write surfaces

**Files to modify:**

- [x] `libs/contracts/src/schema/admin-member.ts`:
  - Add `export enum MemberState { PENDING, VERIFIED, APPROVED, REJECTED }` (values match strings).
  - Add `export const UpdateMemberStateSchema = z.object({ memberUids: z.string().array().nonempty(), memberState: z.nativeEnum(MemberState), sendRejectEmail: z.boolean().optional() });`
  - Add `export class UpdateMemberStateDto extends createZodDto(UpdateMemberStateSchema) {}`.
  - Add `// @deprecated — remove after Phase 3 ships` JSDoc on `AccessLevel` (if we decide to delete later) OR leave the enum in place since RBAC server-side code uses it internally (keep per brainstorm decision).
- [x] `apps/web-api/src/admin/member.service.ts`:
  - Add the `memberStateToAccessLevel` helper (deferred from Phase 1) next to the existing `accessLevelToMemberState`.
  - Add `updateMemberState({ memberUids, memberState, sendRejectEmail })`: translate state → accessLevel, delegate to the existing `updateAccessLevel` logic so the first-time-approval email branch (lines 970+) still fires when transitioning from L0/L1/Rejected → L4.
- [x] `apps/web-api/src/admin/member.controller.ts`:
  - Add `@Put('member-state')` endpoint calling `updateMemberState`.
  - **Delete** the existing `@Put('access-level')` endpoint and its `updateAccessLevel` service method in the SAME commit (zero callers after the FE swap). No separate cleanup PR.
- [x] `apps/back-office/hooks/members/useUpdateMembersStatus.ts` — rename to `useUpdateMemberState.ts`, change param `accessLevel: string` → `memberState: MemberState`, POST to `/member-state`. Update the `onSuccess` invalidation list to include `GET_MEMBER_STATE_COUNTS`. Update 2 callers:
  - `apps/back-office/screens/members/components/StatusCell/StatusCell.tsx` — replace 8-option L-code list with 4-option memberState list (reuse the shape from the redesigned `StatusSelector`). Remove icon variants, Level0Icon/Level1Icon/Level2Icon imports, and the `s.orange|blue|green|purple|red` swatch classes. Rename `PendingAccessLevelChange` → `PendingMemberStateChange` (field rename: `accessLevel: string` → `memberState: MemberState`).
  - `apps/back-office/pages/roles/index.tsx` — rename `pendingAccessLevelChanges` → `pendingMemberStateChanges`, update `PendingAccessLevelChange` import, save call sends `memberState`. ConfirmSaveDrawer copy update if it mentions "access level".
- [x] **Deleted** `apps/back-office/screens/members/components/MultieditControls/` entirely (3 files — component + scss + index).
- [x] `apps/back-office/screens/members/components/EditMember/EditMember.tsx` — no change needed (accessLevel already removed earlier this session).

**No deferred deprecation.** Old endpoint + old hook + old query key + dead MultieditControls all removed in this same commit. Rollback path is `git revert`.

**Acceptance criteria:**

- [ ] `PUT /v1/admin/members/member-state` with `{ memberUids, memberState: 'APPROVED' }` sets `accessLevel=L4` on all members and triggers the first-time-approval email for members previously in L0/L1/Rejected.
- [ ] `PUT ... { memberState: 'REJECTED', sendRejectEmail: true }` sets `accessLevel='Rejected'` and sends the rejection email.
- [ ] StatusCell on the Roles page shows exactly 4 options: Pending, Verified, Approved, Rejected.
- [ ] Roles page save flow (batch pending changes → ConfirmSaveDrawer → save) works end-to-end with the new endpoint.
- [x] No remaining imports of the old `useUpdateMembersStatus` symbol name (grep-verified after commit).

---

### Data flow

```mermaid
flowchart LR
  DB[(Member.accessLevel\n'L0' | 'L1' | 'L2' | ... | 'Rejected')] --> Server
  Server[member.service.ts\naccessLevelToMemberState] -->|list response| API_LIST[GET /members\nmember.memberState]
  Server -->|count response| API_COUNTS[GET /member-state-counts]
  API_LIST --> FE_Tabs[Tabs & tabMembers]
  API_LIST --> FE_Row[StatusCell display]
  API_COUNTS --> FE_Nav[Side-nav counts]
  FE_Write[StatusCell write\nMultieditControls] -->|PUT /member-state| Server_W
  Server_W[updateMemberState\n→ memberStateToAccessLevel] --> DB
```

## Alternative Approaches Considered

- **Real `memberState` enum column + migration + backfill.** Rejected: RBAC policies still key off `accessLevel` (L3/L5/L6 granularity matters internally), so both fields would coexist. No UX win over derivation, extra migration risk.
- **Derive on the frontend only (in `useMembersList` hook).** Rejected: mapping would live in 2+ places once other consumers (sidenav, future mobile) need it. Server-side derivation is single-source.
- **Single cutover PR.** Rejected during brainstorm: blast radius and rollback cost too high; stepped commits let each layer bake.
- **Keep `access-level` write endpoint, just retarget callers to send `{ accessLevel: 'L4' }` when admin picks "Approved".** Rejected: defeats the purpose — the intent is that admin-facing code stops knowing L-codes.

## Acceptance Criteria (whole plan)

### Functional

- [ ] Members page tabs (Pending/Verified/Approved/Rejected) show accurate counts and members.
- [ ] Side-nav counts reflect the 4-state bucketing.
- [ ] Admins can set any member's state via StatusCell dropdown with 4 options.
- [ ] Bulk status change (if `MultieditControls` is revived) works with 4 options.
- [ ] Roles page batch save sends `memberState`, not `accessLevel`.
- [ ] First-time-approval email still fires when a pending/verified member is approved.
- [ ] Rejection email (via `sendRejectEmail: true`) still works.

### Non-Functional

- [x] No Prisma migration.
- [x] No data backfill.
- [x] `tsc` clean in `apps/back-office` + `apps/web-api` admin scope after each phase (pre-existing Prisma schema errors in unrelated modules unchanged).
- [x] Each of the three commits is independently revertable (stash dance used in Phases 1 and 3 to keep unrelated RBAC work out of the diff).

### Quality Gates

- [ ] Each phase validated on staging before the next ships.
- [ ] Phase 3 cannot land before Phase 2 (counts would drift after a write).

## Dependencies & Risks

- **L-code granularity preservation on edit.** When an admin re-saves an L3 member as "Approved" in Phase 3, the server writes L4, losing the L3 distinction. **Acceptable per brainstorm decision (APPROVED → L4);** note in the PR description.
- **RBAC coupling.** `memberStateToAccessLevel` must choose an L-code that keeps RBAC policy lookups working. L4 is the safest default (per the existing Add Member flow). L3/L5/L6 remain reachable only through direct DB edit or restoration of the old endpoint.
- **Side-nav semantics change.** Phase 2 collapses "2-4 Level" + "5-6 Level" → "Approved". Users who navigate by investor tier lose that shortcut; investor filtering moves to the Approved tab's group/role dropdowns (already present per `pages/members/index.tsx:321-347`).
- **Tab URL contract.** If we rename `level0|level1|level2|level56|rejected` → `pending|verified|approved|policies|rejected`, bookmarked URLs break. Keep the old IDs as-is, or add a `router.replace` redirect, or just break them. **Decision needed — see Open Questions.**
- **Stale browser tabs mid-deploy.** An old browser tab posting to `PUT /access-level` after the server-side removal would 404. Keep the old endpoint alive through Phase 3 as planned.

## Open Questions (post-review)

1. ✅ **Tab ID rename — RESOLVED: keep existing IDs** (`level0|level1|level2|level56|rejected`) in Phase 1. Cosmetic URL rename is a follow-up PR with `router.replace` shim, not this refactor.
2. **Side-nav consolidation?** Collapse "2-4 Level" + "5-6 Level" into a single "Approved" item (4-state model) in Phase 2. Loses investor-tier shortcut from the nav; users filter investors via the Approved tab's group/role dropdowns. **Confirm with product before Phase 2 ships.**
3. ✅ **`MultieditControls` — RESOLVED: delete** in Phase 3. Dead code (zero render sites). Not maintained.
4. ✅ **Preserve L-code on "no-op" approves — RESOLVED: no.** Writing `memberState: APPROVED` for an L3 member overwrites to L4. L-code granularity is lost only on edit; never on read. Document in Phase 3 PR description.
5. ✅ **Endpoint naming — RESOLVED: new endpoint** (`PUT /member-state`). Confirmed by Google AIP-180 (rename = add + remove), Stripe/Azure versioning guidance. No Zod discriminated-union. Old endpoint deleted in the same Phase 3 commit (internal admin tool, one known caller, trivial rollback).
6. **FE Zod parser mode.** Best-practices review flags: if any frontend Zod schema uses `.strict()`, the new `memberState` field in the list response will throw. Default `.strip()` is safe. **Grep before Phase 1 merge** — if `.strict()` appears in any Member-shaped schema, relax it or add `memberState` to the schema explicitly.

## References

### Internal

- Brainstorm: [docs/brainstorms/2026-04-23-members-by-memberstate-brainstorm.md](../brainstorms/2026-04-23-members-by-memberstate-brainstorm.md)
- Members page: `apps/back-office/pages/members/index.tsx:18-28, 65-79, 114-118`
- Roles page: `apps/back-office/pages/roles/index.tsx:24, 33, 52-54`
- Inline status: `apps/back-office/screens/members/components/StatusCell/StatusCell.tsx:12-99, 134-170`
- Bulk status (dead): `apps/back-office/screens/members/components/MultieditControls/MultieditControls.tsx:18-99`
- Side-nav: `apps/back-office/components/menu/components/MembersMenu/MembersMenu.tsx:16, 32-73`
- Hooks:
  - `apps/back-office/hooks/members/useMembersList.ts`
  - `apps/back-office/hooks/members/useAccessLevelCounts.ts`
  - `apps/back-office/hooks/members/useUpdateMembersStatus.ts`
- Backend:
  - `apps/web-api/src/admin/member.controller.ts:22-53`
  - `apps/web-api/src/admin/member.service.ts:837-963, 965+`
- Contracts: `libs/contracts/src/schema/admin-member.ts:4-13, 131-142`
- Member type: `apps/back-office/screens/members/types/member.ts:23`

### External

- None (no new libraries, no external API dependencies).

### Related prior work (this session)

- StatusSelector redesigned to 4 options: `apps/back-office/screens/members/components/MemberForm/StatusSelector/StatusSelector.tsx`
- `accessLevel` removed from Add/Edit Member payload: `apps/back-office/screens/members/components/AddMember/AddMember.tsx`, `EditMember.tsx`, `useAddMember.ts`, `useUpdateMember.ts`
- RBAC fields decoupled from approval status: `apps/back-office/screens/members/components/MemberForm/RbacSection/RbacSection.tsx`

---

## Deepened Analysis (post-review, 2026-04-23)

Four independent reviewers pressure-tested the plan: **architecture**, **simplicity**, **performance**, **best practices**. Summary of what changed and why.

### Architecture review — findings applied

- **BLOCKER: missing derivation on write endpoints.** Plan originally only added `memberState` derivation to `findMemberByAccessLevels` and `findMemberByUid`. Reviewer caught 5 additional controller methods that return a `Member` (create, roles update, hosts update, roles-and-hosts update, participant-request update). Without derivation on these, the client's cached member after a mutation is missing `memberState` until a list refetch. **Fix in Phase 1:** introduce a `withMemberState(m)` mapper and apply it to every member-returning endpoint. Explicit list now enumerated in the Phase 1 "Files to modify" section.
- **HIGH: Phase 2 mutating `useUpdateMembersStatus.ts` breaks clean revert when Phase 3 renames the file.** Plan originally added the new query-key invalidation in Phase 2. **Fix:** moved the invalidation change to Phase 3 where the rename happens atomically.
- **MEDIUM: mixed-tab state during deprecation window.** An admin on an old browser tab posts to `PUT /access-level` with L3; a new-tab admin then re-saves as APPROVED and overwrites to L4 silently. DB converges but L-code history flattens. **Accepted risk** — the deprecation window is short (one deploy), and downgrade is documented in the Phase 3 PR description.
- **MEDIUM: side-nav vs. tab count drift.** Not material today — the list is unpaginated so `allMembers` equals the full DB. Becomes material only if server-side pagination lands before Phase 2. **Action:** see performance follow-up below.

### Simplicity review — findings applied

- **Remove `MemberState` enum from Phase 1.** TS string-literal union is sufficient on the frontend until the write DTO needs Zod validation in Phase 3. Deferred.
- **Remove `memberStateToAccessLevel` helper from Phase 1.** Dead code until Phase 3's write path. Deferred.
- **Delete `useAccessLevelCounts` + `GET /access-level-counts` at the END of Phase 2, not a follow-up PR.** Zero callers = delete. Git revert is the rollback.
- **Delete `PUT /access-level` in the same Phase 3 commit, not a later cleanup PR.** Zero callers, trivial revert. No "keep alive one release cycle for safety" theater.
- **Delete `MultieditControls` (dead code).** Resolved from an Open Question to a line item.
- **Three phases kept** (per brainstorm decision) despite reviewer suggesting Phase 1 + 2 could merge. Rationale: Phase 1 is a backend-code-only change that stages into a minimal read deploy; merging with Phase 2's nav consolidation creates a UX change paired with a non-UX fix.
- **Rejected: "extend `/access-level` instead of adding `/member-state`."** Best-practices review (Google AIP-180, Stripe, Azure) confirms add-new-and-delete-old is the industry norm. The overload-one-endpoint approach conflates payload shapes forever.

### Performance review — findings

- **No regressions introduced by this refactor.** The `.map(m => withMemberState(m))` is O(N) with a 4-branch string compare; sub-millisecond at N=10k. `getMemberStateCounts` uses the same `groupBy` as the existing counts method.
- **Pre-existing issue, out of scope:** `findMemberByAccessLevels` fetches all members with 7 relations, no pagination. At **N≈5k** this becomes a multi-second request with memory pressure (~50MB JSON held in-flight). Breaks around **N≈20k**. Today's member count is below this threshold.
- **Follow-up filed separately:** add server-side pagination + cursor-based list fetching once member count crosses 3-5k. At that point, revisit React Query invalidation (currently 3 full refetches per status write — acceptable today, amplifies with payload growth).

### Best-practices review — findings applied

- **New endpoint for rename is correct** (Google AIP-180, Stripe, Azure). See Open Question #5.
- **Derive vs. persist: derive is correct here** — pure function of `accessLevel`, no need to filter/index by `memberState`, no historical-snapshot requirement. Persisting would invite drift.
- **Skip `Deprecation` / `Sunset` HTTP headers** (RFC 9745 / RFC 8594). Headers are designed for public APIs with third-party clients. For this internal admin tool with one known frontend caller, JSDoc `@deprecated` + a tracking comment is sufficient.
- **Shared enum risk:** if a future backend adds a new `MemberState` value (e.g., `SUSPENDED`), the FE must degrade gracefully. **Action:** when Phase 3 adds the enum, ensure no FE `switch (state)` lacks a `default` branch. Add an ESLint rule for exhaustive-check-with-default if the team has one.
- **`.strip()` vs `.strict()` Zod schemas.** Adding the `memberState` field to GET responses is backwards-compatible only if frontend parsers don't reject unknown keys. **Action:** grep frontend Zod schemas around the Member type for `.strict()` before Phase 1 merges. See new Open Question #6.

### External references

- [Google AIP-180: Backwards compatibility](https://google.aip.dev/180) — rename = add + remove; both coexist within a major version.
- [RFC 9745: The Deprecation HTTP Response Header Field](https://datatracker.ietf.org/doc/html/rfc9745) — March 2025 Standards Track. Skipped for internal tool.
- [RFC 8594: The Sunset HTTP Header Field](https://datatracker.ietf.org/doc/html/rfc8594) — pairs with `Deprecation`. Skipped.
- [Azure REST API Guidelines](https://github.com/microsoft/api-guidelines/blob/vNext/azure/Guidelines.md) — additive changes, clients must ignore unknown fields.
- [Stripe API Versioning](https://docs.stripe.com/api/versioning) — pinned versions, additive field evolution.
- [Stripe: APIs as infrastructure](https://stripe.com/blog/api-versioning) — versioning philosophy.
