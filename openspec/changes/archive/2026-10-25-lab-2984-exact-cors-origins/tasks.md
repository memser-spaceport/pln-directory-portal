## 1. Exact origins

- [x] 1.1 Anchor every `ALLOWED_CORS_ORIGINS` entry to the full origin (`constants.ts`)
- [x] 1.2 Use that list for the HTTP API and the notifications WebSocket (`main.config.ts`, `websocket.gateway.ts`)
- [x] 1.3 Cover lookalikes, unlisted subdomains, and one allowed origin per environment (`cors-origins.spec.ts`)

## 2. Checks

- [x] 2.1 `yarn typecheck:api` passes. `cors-origins.spec.ts` passes (56 tests). Eslint on the changed files reports no new errors.
