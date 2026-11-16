# Proposal

## Why

LAB-3252: header Search results show no L0/L1 badge for admins. LAB-3180 added the badges on profiles and directory cards. The search API does not send the access level or member state, so the frontend cannot show the badges.

## What Changes

- `GET /v1/global-search/all` adds `accessLevel` to team results and `memberState` and `isJobAspirant` to member results.
- The API adds these fields only when the caller has `directory.admin.full`. Other callers get the same response as before.
- The contract `SearchResultItemSchema` adds the three fields as optional. The change is additive.

## Impact

- Code: `apps/web-api/src/search/search.controller.ts`, `apps/web-api/src/search/search.service.ts`, `libs/contracts/src/schema/global-search.ts`.
- Pair: frontend PR in `pln-directory-portal-v2` shows the badges. Merge order: backend first.
