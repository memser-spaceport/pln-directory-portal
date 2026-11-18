## Why

The digest email footer has Manage preferences, Switch to weekly / daily and Unsubscribe. All three open `/settings/email`, which needs sign-in, so a signed-out reader lands on the home page and waits for the sign-in dialog (LAB-3309, found testing LAB-3241). Unsubscribing should not need an account sign-in. The email already carries a signed link per reader (LAB-3263) that lets them press More / Less without signing in; the same link can read and change their digest email settings.

## What Changes

- New public endpoint `POST /v1/labos-digest/email-settings/read` `{ token }` returns `{ firstName, enabled, frequency }` for the link's member.
- New public endpoint `POST /v1/labos-digest/email-settings` `{ token, enabled?, frequency? }` saves the change in the notification service and returns the same shape. Undo is the same call with the previous values.
- New public endpoint `POST /v1/labos-digest/unsubscribe?t=<token>` for one-click unsubscribe (RFC 8058): mail clients POST `List-Unsubscribe=One-Click` to it and it turns the digest off.
- All three check the link the way the page read does: 401 with the reason for a bad or expired link, 503 without `DIGEST_LINK_SECRET`.

## Capabilities

### Modified Capabilities

- `labos-digest-page`: the signed link also reads and changes the member's digest email settings, and turns the digest off from a mail client's one-click unsubscribe.

## Impact

- `apps/web-api/src/team-news/labos-digest-public.controller.ts`, a new `labos-digest-email-settings.service.ts`, `libs/contracts/src/schema/team-news.ts` (request and response schemas).
- `NotificationServiceClient` (`getNotificationSetting`, `upsertNotificationSetting`): the same calls the signed-in settings page makes.
- No database change. Consumers: the frontend `/digest/email` page (LAB-3312) and the notification service footer links and `List-Unsubscribe` header (LAB-3311).
