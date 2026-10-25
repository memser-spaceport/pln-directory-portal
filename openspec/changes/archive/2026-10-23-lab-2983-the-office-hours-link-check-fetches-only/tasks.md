## 1. Link check

- [x] 1.1 Check scheme, port, host form and DNS before each request; pin the request to the checked address (`office-hours.service.spec.ts`)
- [x] 1.2 Follow redirects by hand, at most 5, with the same check on each hop (`office-hours.service.spec.ts`)
- [x] 1.3 Extend the shared non-public address list (`og-image.spec.ts`)

## 2. Checks

- [x] 2.1 `yarn typecheck:api`, `yarn nx run web-api:lint`, `yarn nx run web-api:test`, `yarn build web-api`
- [x] 2.2 `openspec validate lab-2983-the-office-hours-link-check-fetches-only --strict`
