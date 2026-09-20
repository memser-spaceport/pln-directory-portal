# Integration keys — team-scoped server credentials

**Linear:** [LAB-2575 — Team-scoped integration keys](https://linear.app/plrs-labos/issue/LAB-2575/job-board-team-scoped-integration-keys), part of [LAB-2573 — PL ATS to job board](https://linear.app/plrs-labos/issue/LAB-2573/job-board-define-pl-ats-feature-scope).

**Scope of this document:** how a third-party server (for example a team's ATS) authenticates to the Directory with a key bound to one team, how admins issue and revoke those keys, and how a new integration route mounts under the guard. Companion to [JOB_BOARD_OWNERSHIP.md](./JOB_BOARD_OWNERSHIP.md), which describes what an `INTEGRATION`-managed job opening is.

The crawler is not an integration. It keeps using the shared `INTERNAL_SERVICE_SECRET` on `/v1/service` routes.

---

## The key

| Property | Value |
|----------|-------|
| Format | `labos_ik_` followed by 32 random bytes, base64url encoded (43 characters) |
| Stored | sha256 hex of the plaintext in `IntegrationKey.keyHash` (unique), plus the first 16 characters in `keyPrefix` for display |
| Shown | once, in the create response. Never retrievable afterwards |
| Bound to | one `Team` (`teamUid`) |
| Scopes | any of `jobs:write`, `candidates:read` (`INTEGRATION_KEY_SCOPES` in `libs/contracts/src/schema/integration-key.ts`) |
| Audit | `createdByUid` (admin member uid from the JWT, nullable), `createdAt`, `lastUsedAt` (rewritten at most once a minute), `revokedAt` |

Revocation is permanent and idempotent. The row is kept so the audit trail survives.

`JobOpening.integrationKeyUid` links a job opening to the key that owns it when `managedBy = INTEGRATION`. The integration job endpoints write it; see [JOB_BOARD_INTEGRATION_JOBS.md](./JOB_BOARD_INTEGRATION_JOBS.md).

## Admin routes

All under `AdminAuthGuard` (JWT with `directory.admin.full`), base path `/v1/admin/integration-keys`, not cached.

### Create

```
POST /v1/admin/integration-keys
{ "teamUid": "cldvnyxaf01ynu21k62uopjvg", "name": "PL ATS", "scopes": ["jobs:write", "candidates:read"] }
```

201:

```json
{
  "uid": "ckx…",
  "name": "PL ATS",
  "teamUid": "cldvnyxaf01ynu21k62uopjvg",
  "keyPrefix": "labos_ik_3fJk9Qz",
  "scopes": ["jobs:write", "candidates:read"],
  "createdByUid": "cl…",
  "createdAt": "2026-09-16T19:00:00.000Z",
  "lastUsedAt": null,
  "revokedAt": null,
  "key": "labos_ik_3fJk9QzX…"
}
```

`key` appears only here. 404 when the team does not exist. 422 when `scopes` is empty, contains an unknown value or a duplicate, or `name` is empty or longer than 100 characters (the validation status the API's Zod pipe uses everywhere).

### List

```
GET /v1/admin/integration-keys?teamUid=<uid>
```

200: array of the create response shape without `key`. Revoked keys are included with `revokedAt` set.

### Revoke

```
DELETE /v1/admin/integration-keys/:uid
```

200 with the key's list entry, `revokedAt` set. Calling it again returns the same entry unchanged. 404 for an unknown uid.

## Authenticating as an integration

Send the plaintext key as a bearer token:

```
Authorization: Bearer labos_ik_3fJk9QzX…
```

`IntegrationKeyGuard` (`apps/web-api/src/guards/integration-key.guard.ts`):

1. Reads the header. Missing header, non-`Bearer` scheme, unknown key and revoked key all return 401 with the same body, so a caller cannot tell whether a key ever existed. The shared service secret is not a key and gets the same 401.
2. Reads the scopes the route declared with `@RequireIntegrationScopes(...)`. A key lacking any of them returns 403. A route with no declaration accepts any active key.
3. Sets `req.integrationKey` to `{ uid, teamUid, scopes, name, keyPrefix }` (type `IntegrationKeyRequestContext`).
4. Logs one line: `integrationKey=<uid> <METHOD> <path>`. The key is never logged.

Requests under `/v1/integrations` are exempt from the member rate limiter: the controller carries `@SkipThrottle()`. The throttler bypass in `InternalServiceThrottlerGuard` matches only the `v1/service` prefix, so every new integrations controller must declare the exemption itself.

### Whoami

```
GET /v1/integrations/me
```

200: `{ uid, keyPrefix, name, teamUid, teamName, scopes }`. Requires no scope. Use it to confirm a configured key is valid and bound to the expected team.

## Adding an integration route

```ts
@Controller('v1/integrations')
@UseGuards(IntegrationKeyGuard)
@SkipThrottle()
export class SomeIntegrationController {
  constructor(private readonly integrationKeys: IntegrationKeysService) {}

  @Put('jobs/:externalId')
  @RequireIntegrationScopes('jobs:write')
  async upsert(@Req() req: { integrationKey: IntegrationKeyRequestContext }, ...) {
    // Resolve the team the request is about (body, path, or the job row), then:
    this.integrationKeys.assertKeyOwnsTeam(req.integrationKey, teamUid); // 403 on another team or null
    ...
  }
}
```

Rules every integration route follows:

- Mount under `IntegrationKeyGuard` and declare `@SkipThrottle()` on the controller.
- Declare the scope each handler needs with `@RequireIntegrationScopes`.
- Call `assertKeyOwnsTeam` with the team the request resolves to before reading or writing. A job opening with a null `teamUid` fails the check.
- Import `IntegrationKeysModule` into the feature module to get the guard and service.

## Where the code lives

| Piece | Location |
|-------|----------|
| Model and relations | `apps/web-api/prisma/schema.prisma` (`IntegrationKey`, `JobOpening.integrationKeyUid`) |
| Contracts | `libs/contracts/src/schema/integration-key.ts` |
| Service (issue, list, revoke, authenticate, team assertion, describe) | `apps/web-api/src/integration-keys/integration-keys.service.ts` |
| Guard | `apps/web-api/src/guards/integration-key.guard.ts` |
| Scope decorator | `apps/web-api/src/decorators/require-integration-scopes.decorator.ts` |
| Admin controller | `apps/web-api/src/integration-keys/admin-integration-keys.controller.ts` |
| Integrations controller (`me`) | `apps/web-api/src/integration-keys/integrations.controller.ts` |
| Module | `apps/web-api/src/integration-keys/integration-keys.module.ts` |
