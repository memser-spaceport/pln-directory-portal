# Deals API Integration — Remove Mocks, Wire Real API

**Date:** 2026-03-17
**Status:** Brainstorm
**Related:** `docs/deals_api.json`, `docs/brainstorms/2026-03-17-deals-page-back-office-brainstorm.md`

---

## What We're Building

Replace all mock data in the back-office Deals service with real HTTP calls to the admin Deals API. The backend (Prisma models, controllers, services) is already implemented on the `develop` branch — this task is purely frontend wiring.

---

## Why This Approach

The backend already exists on `develop`. The fastest and safest path is:

1. Merge `develop` into the current feature branch to get the backend code
2. Replace the mock bodies in `utils/services/deal.ts` with Axios calls matching `deals_api.json`
3. Adjust hook `enabled` guards that were hardcoded to `true` for mocking

No new architecture decisions needed — the API shape is defined, the service layer exists, and the `TODO: replace with api.get(...)` comments in the mock file point exactly to the calls to make.

---

## Key Decisions

### 1. Scope — Admin Back-Office Only

Only wiring the admin endpoints used by the back-office page:

| Mock function | Real API call |
|---|---|
| `fetchDealsList()` | `GET /v1/admin/deals` |
| `createDeal(data)` | `POST /v1/admin/deals` |
| `updateDeal(uid, data)` | `PATCH /v1/admin/deals/:uid` |

**Out of scope for now:** `fetchSubmittedDeals`, `fetchReportedIssues`, `fetchDealCounts` — these have no matching endpoints in `deals_api.json` and map to tabs/features not yet shipped.

### 2. Whitelist Endpoints

The API collection includes `GET/POST/DELETE /admin/deals/whitelist`. Whether the back-office page uses these depends on the UI design. If the current page doesn't have a whitelist UI, skip wiring these for now.

### 3. Auth Token

The API uses `Bearer {{adminToken}}`. The existing Axios instance (`api`) handles auth headers automatically via interceptors — no special handling needed in the service functions.

### 4. Constants

API route constants were already added to `utils/constants.ts` in a prior commit (`ADMIN_DEALS`, `ADMIN_SUBMITTED_DEALS`, etc.). Use `ADMIN_DEALS` for list and create, append `/:uid` for update.

### 5. Merge Strategy

Merge `develop` → current branch (`feat/deals-management-back-office-page`) before touching any frontend files. Verify the Prisma schema now has the `Deal` model and that the backend controllers are present in `apps/web-api/src/`.

---

## Open Questions

1. **Does the whitelist have any UI in the current back-office page?** If yes, wire `GET/POST/DELETE /admin/deals/whitelist` too.
2. **Are there query params for filtering?** `GET /admin/deals` may accept `status`, `category`, etc. — check the controller implementation after merging develop to know what filters to pass from the frontend.
3. **Pagination:** Does the list endpoint return paginated results (cursor/offset)? The current frontend uses client-side pagination — confirm if server-side pagination shape changes anything.

---

## Implementation Sequence

1. `git merge develop` (or rebase) into `feat/deals-management-back-office-page`
2. Verify backend is present: `apps/web-api/src/admin/deals.controller.ts`, Prisma `Deal` model
3. Open `apps/back-office/utils/services/deal.ts` — replace `fetchDealsList`, `createDeal`, `updateDeal` with Axios calls
4. Update `hooks/deals/useDealsList.ts` — change `enabled: true` to `enabled: !!authToken` (or equivalent)
5. Smoke test in local dev: create a deal, list deals, update status
6. Remove unused mock arrays (`MOCK_DEALS`, `MOCK_SUBMITTED_DEALS`, `MOCK_REPORTED_ISSUES`)

---

## Out of Scope

- User-facing endpoints (`GET /deals`, `POST /deals/:uid/redeem`, etc.)
- `fetchSubmittedDeals`, `fetchReportedIssues`, `fetchDealCounts` wiring (no backend endpoints exist)
- Any new backend code (it's all on develop)
