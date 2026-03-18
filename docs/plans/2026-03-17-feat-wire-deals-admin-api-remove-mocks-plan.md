---
title: "feat: Wire deals admin API, remove mocks"
type: feat
date: 2026-03-17
---

# feat: Wire Deals Admin API — Remove Mocks

## Overview

Replace the mocked implementations in `apps/back-office/utils/services/deal.ts` with real Axios calls to the admin Deals API. The backend (Prisma model, NestJS controller, service) is already implemented on the `develop` branch — this task is purely frontend wiring.

**Scope:** Three service functions (`fetchDealsList`, `createDeal`, `updateDeal`) + one query hook guard (`useDealsList`).
**Out of scope:** `fetchSubmittedDeals`, `fetchReportedIssues`, `fetchDealCounts` (no backend endpoints yet — keep mocked).

---

## Problem Statement

All Deals back-office functionality uses in-memory mock data with a simulated `delay()`. The backend admin API (`/v1/admin/deals`) is live on `develop` but the frontend still reads from `MOCK_DEALS`. The back-office Deals page cannot be shipped without removing this coupling.

---

## Proposed Solution

1. Merge `develop` into the current branch to obtain the backend code
2. Import `api` and `API_ROUTE` into `deal.ts` (currently missing)
3. Replace bodies of `fetchDealsList`, `createDeal`, `updateDeal` with Axios calls following the `irlGatheringPushConfig.ts` Tier B pattern
4. Change `useDealsList` `enabled: true` → `enabled: !!params.authToken`
5. Remove `MOCK_DEALS` array (no longer needed after step 3); keep `MOCK_SUBMITTED_DEALS`, `MOCK_REPORTED_ISSUES`, and `delay` helper (still used by the three mocked functions)

---

## Technical Considerations

### Pattern to Follow (Tier B — explicit `authToken`)

Reference file: `apps/back-office/utils/services/irlGatheringPushConfig.ts`

```typescript
import api from '../api';
import { API_ROUTE } from '../constants';

export async function fetchDealsList(params: DealsListParams): Promise<{ data: Deal[] }> {
  const response = await api.get(API_ROUTE.ADMIN_DEALS, {
    headers: { authorization: `Bearer ${params.authToken}` },
    params: {
      ...(params.category && { category: params.category }),
      ...(params.audience && { audience: params.audience }),
      ...(params.status && { status: params.status }),
    },
  });
  return response.data;
}

export async function createDeal(params: { authToken: string | undefined; payload: TDealForm }): Promise<Deal> {
  const response = await api.post(API_ROUTE.ADMIN_DEALS, params.payload, {
    headers: { authorization: `Bearer ${params.authToken}` },
  });
  return response.data;
}

export async function updateDeal(params: {
  authToken: string | undefined;
  uid: string;
  payload: Partial<TDealForm & { status: string }>;
}): Promise<Deal> {
  const response = await api.patch(`${API_ROUTE.ADMIN_DEALS}/${params.uid}`, params.payload, {
    headers: { authorization: `Bearer ${params.authToken}` },
  });
  return response.data;
}
```

### Auth Token Flow (already established)

```
pages/deals/index.tsx
  const [authToken] = useCookie('plnadmin');
  ↓
useDealsList({ authToken, category, audience, status })
  ↓ enabled: !!params.authToken
fetchDealsList({ authToken, ... })
  ↓
api.get(..., { headers: { authorization: `Bearer ${authToken}` } })
```

The Axios interceptor in `api.ts` will also inject the cookie-based token as a fallback, but explicit header always takes precedence.

### Response Shape — Verify After Merge

The mock returns `{ data: Deal[] }`. Confirm the real controller returns the same envelope (check `apps/web-api/src/admin/deals.controller.ts` after merging develop). If the shape differs, update the return type accordingly.

### Query Params vs Body

`fetchDealsList` passes filters as Axios `params` (serialised to query string). Passing an object to `params` in Axios is safe and handles undefined values correctly — prefer this over manual `URLSearchParams` construction.

### What NOT to Remove Yet

| Array | Used by | Keep? |
|---|---|---|
| `MOCK_DEALS` | `fetchDealsList`, `createDeal`, `updateDeal` | ❌ Remove after wiring |
| `MOCK_SUBMITTED_DEALS` | `fetchSubmittedDeals`, `fetchDealCounts` | ✅ Keep (still mocked) |
| `MOCK_REPORTED_ISSUES` | `fetchReportedIssues`, `fetchDealCounts` | ✅ Keep (still mocked) |
| `delay` helper | `fetchSubmittedDeals`, `fetchReportedIssues`, `fetchDealCounts` | ✅ Keep (still used) |

---

## Acceptance Criteria

- [x] `git merge develop` completes without conflicts; `apps/web-api/src/admin/deals.controller.ts` exists
- [x] `deal.ts` imports `api` and `API_ROUTE`; `MOCK_DEALS` array is removed
- [x] `fetchDealsList` calls `GET /v1/admin/deals` with auth header and optional filter params
- [x] `createDeal` calls `POST /v1/admin/deals` with auth header and payload
- [x] `updateDeal` calls `PATCH /v1/admin/deals/:uid` with auth header and partial payload
- [x] `useDealsList` has `enabled: !!params.authToken` (no more `enabled: true`)
- [x] `fetchSubmittedDeals`, `fetchReportedIssues`, `fetchDealCounts` remain functional (still mocked)
- [ ] Local smoke test: list loads from API, create deal persists, status update persists
- [ ] Network tab: all admin deals requests include `Authorization: Bearer` header
- [x] No TypeScript errors (`tsc --noEmit`)

---

## Dependencies & Risks

- **Merge dependency:** Backend code must be merged from `develop` before testing. API may have different response shape than mock — verify `{ data: Deal[] }` envelope matches.
- **Auth token undefined:** `authToken` can be `undefined` on initial render. The `enabled: !!params.authToken` guard prevents premature API calls. The `authorization: Bearer undefined` header case won't occur because `queryFn` only runs when `enabled` is true.
- **Query invalidation side effect:** `useCreateDeal` and `useUpdateDeal` both invalidate `GET_DEALS_COUNTS` on success — this will trigger a request to `GET /v1/admin/deals/counts` which does not exist yet. The request will 404 silently (TanStack Query will mark it as error but `fetchDealCounts` is still mocked). Confirm this doesn't cause visible breakage.
- **Filter params:** The real controller may not accept `category`/`audience`/`status` query params yet. Check the controller implementation; if not supported, strip those from the initial call and add a TODO comment.

---

## Implementation Steps

### Step 1 — Merge develop

```bash
git fetch origin develop
git merge origin/develop
```

Resolve any conflicts. Verify these files exist after merge:
- `apps/web-api/src/admin/deals.controller.ts`
- `apps/web-api/src/deals/deals.service.ts` (or similar)
- Prisma schema has `Deal` model

### Step 2 — Wire `deal.ts`

**File:** `apps/back-office/utils/services/deal.ts`

1. Add imports at top:
   ```typescript
   import api from '../api';
   import { API_ROUTE } from '../constants';
   ```
2. Replace `fetchDealsList` body with real `api.get` call (see pattern above)
3. Replace `createDeal` body with real `api.post` call
4. Replace `updateDeal` body with real `api.patch` call
5. Delete the `MOCK_DEALS` array (lines 7–152)
6. Keep `MOCK_SUBMITTED_DEALS`, `MOCK_REPORTED_ISSUES`, `delay` helper, and the three mocked functions unchanged

### Step 3 — Update `useDealsList` hook

**File:** `apps/back-office/hooks/deals/useDealsList.ts`

```typescript
// Before:
enabled: true, // mocked — no auth needed yet; set to !!params.authToken when real API is wired

// After:
enabled: !!params.authToken,
```

### Step 4 — Verify response type alignment

After merging, inspect `deals.controller.ts` to confirm:
- List endpoint returns `{ data: Deal[] }` (or adjust `fetchDealsList` return type)
- Create endpoint returns a single `Deal` object
- Update endpoint returns the updated `Deal` object

Update `Deal` type in `apps/back-office/screens/deals/types/deal.ts` if field names differ from mock.

### Step 5 — Smoke test

```bash
# Start local dev
cd apps/back-office && pnpm dev

# Navigate to /deals, verify:
# 1. List loads from API (not 12 hardcoded mock items)
# 2. Create deal form submits and new deal appears in list
# 3. 3-dot menu status change persists on reload
# 4. Network tab shows Authorization header on all /admin/deals requests
```

---

## References

### Pattern Files
- `apps/back-office/utils/services/irlGatheringPushConfig.ts` — canonical Tier B service pattern
- `apps/back-office/hooks/members/useMembersList.ts` — `enabled: !!params.authToken` query hook pattern

### Deals Files (Modified)
- `apps/back-office/utils/services/deal.ts` — main change target
- `apps/back-office/hooks/deals/useDealsList.ts` — `enabled` guard update

### Deals Files (Read-only reference)
- `apps/back-office/hooks/deals/useCreateDeal.ts` — already correct, no changes needed
- `apps/back-office/hooks/deals/useUpdateDeal.ts` — already correct, no changes needed
- `apps/back-office/utils/constants.ts` — `ADMIN_DEALS` constant already defined at correct path
- `apps/back-office/utils/api.ts` — Axios instance with auth interceptor
- `docs/deals_api.json` — Postman collection with endpoint definitions
