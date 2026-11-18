## Context

Digest settings (`forumDigestEnabled`, `forumDigestFrequency`) live in the notification service. The backend reads and writes them through `NotificationServiceClient` for the signed-in `/v1/notification/settings/:memberUid/forum` endpoints, and the MCP `update_email_preferences` tool maps them to off / daily (1) / weekly (7). The public digest controller already verifies the signed link (`verifyDigestLinkToken`) and maps link errors to 401 / 503 (`withLinkErrors`).

## Decisions

- **Same controller, same link check.** The three endpoints sit in `LabosDigestPublicController` and reuse `withLinkErrors`, so a bad link behaves exactly as on the page. The token's own `f` is not used: the response always reflects what is stored now.
- **POST with the token in the body** for read and change, like `/page`, so the token stays out of access logs. The one-click endpoint takes the token in the query string because RFC 8058 sends only `List-Unsubscribe=One-Click` in the body; the URL comes from the email header.
- **No new store and no audit table.** The notification service is the single source; Undo is a second change call with the old values, which the page holds.
- **`memberExternalId`** is passed on upsert, as the signed-in endpoint does, so a first-time row is created complete.
- **Throttling:** the global throttler applies, as on `/page` and `/choices`.

## Risks

- A forwarded email lets its reader change the original recipient's digest settings. This is the usual trade-off for email unsubscribe links, and the link already allows More / Less.
- The notification service being down returns its error (5xx) and nothing changes; the page shows "couldn't save".
