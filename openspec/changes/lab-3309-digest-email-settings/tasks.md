## 1. Contract

- [ ] 1.1 `libs/contracts/src/schema/team-news.ts`: request and response schemas for the read, the change and the one-click unsubscribe

## 2. Service and endpoints

- [ ] 2.1 `labos-digest-email-settings.service.ts`: read and change through `NotificationServiceClient`, off / daily / weekly mapping, defaults when no row, `memberExternalId` on upsert
- [ ] 2.2 `LabosDigestPublicController`: `email-settings/read`, `email-settings`, `unsubscribe` (POST only; form or empty body), with `withLinkErrors`
- [ ] 2.3 Module wiring: `NotificationsModule` export into the team-news module

## 3. Check

- [ ] 3.1 Unit tests: read, unsubscribe and undo, switch, no-row defaults, empty change 400, expired 401, bad signature 401, no secret 503, one-click with and without the form body
- [ ] 3.2 `tsc` (5.6, `tsconfig.build.json`) and the digest specs pass
