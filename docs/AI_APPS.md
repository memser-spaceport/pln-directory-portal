# AI Apps (PL Infra)

> Status: **POC / happy-path only.** Lives under the PL Infra navigation hub.

PLN members "vibe-code" a small web app locally with an AI assistant (Claude Code, Cursor, …) and have the agent deploy it to the PLN **sandbox runner**. The backend tracks every app and its deploy status so PL Infra users can browse and open the live apps from a dashboard (UI built later, in `pln-directory-portal-v2`).

## User flow

1. A member with `ai_apps.write` opens the AI Apps dashboard and downloads the **starter kit** ZIP. The kit carries **no token**.
2. They unzip it into their AI coding tool and describe what to build. The agent edits files under `app/`, reusing the bundled **PL Design System** (`pl-design-system/`) for on-brand UI instead of hand-rolling components.
3. When ready, the member says "deploy". Before the **first** deploy the agent proposes a human-friendly **name** and short **description** for the app and waits for the member to approve (or revise) them — kits ≥1.5, see "Editable metadata & one-pager PRD" below. The agent has no stored token, so it **starts a LabOS connect session**, gives the member a link + confirmation code to open and approve, then polls until it receives a **short-lived deploy token**.
4. The agent packages `app/` and POSTs to our deploy endpoint with that short-lived token. The backend proxies the deploy to the sandbox runner, stores the result, and the app shows up on the dashboard with its live URL. After the first successful deploy the agent offers an optional **one-pager PRD**; if the member wants one, the agent drafts it, gets approval, and saves it through the metadata endpoint — no redeploy.
5. **Apps that need runtime secrets** (API keys etc.) take a detour: instead of deploying, the agent registers a **draft** (same upload + the required env var *names*), then hands the member a LabOS link. The member enters the secret *values* there and clicks **Deploy** — see "Draft apps & runtime secrets" below.

## Architecture

The end-to-end flow, with the **auth credentials and their lifetimes** called out (kit = no token, connect session ≈ 10 min, deploy token ≈ 60 min):

```mermaid
sequenceDiagram
    autonumber
    actor M as Member (LabOS browser)
    participant AG as AI agent (local)
    participant API as web-api /v1/ai-apps
    participant S3 as S3 bucket
    participant RUN as Sandbox runner

    Note over AG,API: 1 — Download starter kit (carries NO token)
    AG->>API: GET /starter-kit/download (member JWT, ai_apps.write)
    API-->>AG: starter-kit.zip (instructions, design system, app/)

    Note over AG,API: 2 — Start connect session (no auth)
    AG->>API: POST /connect { clientName }
    API->>API: create AiAppConnectSession (PENDING)
    API-->>AG: sessionId, userCode, connectUrl, pollToken, expiresAt
    Note over API: PENDING session — TTL approx 10 min (the approval window)

    Note over M,API: 3 — Member approves in LabOS (member JWT)
    M->>API: GET /connect/:uid (display info, no secrets)
    M->>API: POST /connect/:uid/approve
    alt has ai_apps.write
        API->>API: mint deployToken (TTL approx 60 min), status APPROVED
        API-->>M: Connected — CONNECT_APPROVED audited
    else missing permission
        API->>API: status DENIED
        API-->>M: no access — CONNECT_DENIED audited
    end

    Note over AG,API: 4 — Agent collects the short-lived token
    loop every pollIntervalSec until decided or expiresAt
        AG->>API: POST /connect/poll { pollToken }
        API-->>AG: PENDING | APPROVED (+deployToken, deployTokenExpiresAt) | DENIED | EXPIRED
    end
    Note over AG: deployToken kept in agent memory only — never written to disk

    Note over AG,RUN: 5 — Deploy (deployToken in x-app-token header)
    AG->>API: POST /deploy + multipart app.zip (header x-app-token: deployToken)
    API->>API: AiAppTokenGuard checks token APPROVED and unexpired, then upsert AiApp (DEPLOYING)
    Note over API: url {appId}.{AI_APPS_APP_DOMAIN} computed and stored up front
    API->>S3: upload apps/{appId}/{deploymentId}/app.zip
    API->>RUN: POST /deploy { s3Key } (header x-runner-token: server secret)
    alt 200 OK
        RUN-->>API: { port }
        API->>API: status READY
    else 504 or no response (gateway timeout)
        API->>API: poll app URL approx 1 min → READY if reachable, else ERROR
    end
    API-->>AG: AiApp record (url, status)

    Note over AG,API: within the approx 60 min window the agent may redeploy reusing deployToken. On 401 (expired) it reconnects from step 2 to mint a fresh token
```

The agent only ever holds a **short-lived deploy token** it obtained through the connect flow — it ships the app ZIP to us and we handle the rest. **AWS credentials and the runner token both stay server-side**: the backend uploads the ZIP to S3 (reusing `AwsService`, the same uploader as member images) and calls the runner. The S3 key is derived as `apps/<appId>/<deploymentId>/app.zip`, and the app is served at `https://<appId>.<AI_APPS_APP_DOMAIN>` (e.g. `<appId>.dev.plnetwork.io` on Dev, `<appId>.prod.plnetwork.io` on Prod).

## Connect flow (deploy auth)

The starter kit no longer ships a long-lived token. When the agent needs to deploy, it runs a device-authorization–style handshake so the credential is short-lived and minted only after the member proves `ai_apps.write` in LabOS:

1. **Start** — the agent POSTs `/v1/ai-apps/connect` (no auth). The backend creates an `AiAppConnectSession` (`PENDING`, ~10 min TTL) and returns `sessionId`, a human-readable `userCode`, a `connectUrl` (the LabOS approval page), a secret `pollToken`, and `pollIntervalSec`.
2. **Approve** — the member opens `connectUrl` in LabOS (`/pl-infra/ai-apps/connect?session=<sessionId>`), signs in, confirms the `userCode` matches what the agent shows, and clicks **Approve**. The page calls `POST /v1/ai-apps/connect/:uid/approve`. The handler resolves the member and checks `ai_apps.write`: on success it mints a short-lived `deployToken` (~60 min) bound to the session (`APPROVED`); without the permission it marks the session `DENIED`. Both outcomes are written to the audit log (`CONNECT_APPROVED` / `CONNECT_DENIED`).
3. **Collect** — the agent polls `POST /v1/ai-apps/connect/poll` with its `pollToken`. While `PENDING` it keeps polling; on `APPROVED` it receives the `deployToken` (+ `deployTokenExpiresAt`); on `DENIED`/`EXPIRED` it stops.
4. **Deploy** — the agent uses the `deployToken` in `x-app-token` for `POST /v1/ai-apps/deploy`. It may redeploy until the token expires; afterwards it reconnects to mint a new one.

The `deployToken` is held in agent memory only and never written into the kit, so the starter-kit folder grants nothing on its own.

## Endpoints

| Method | Path                              | Auth                         | Permission        | Purpose |
|--------|-----------------------------------|------------------------------|-------------------|---------|
| GET    | `/v1/ai-apps`                     | `UserTokenCheckGuard`+`RbacGuard` | `ai_apps.read`/`write` | List apps with owner + status (excludes `DELETED`) |
| GET    | `/v1/ai-apps/events`             | `UserTokenCheckGuard`+`RbacGuard` | `ai_apps.read`/`write` | Event log (audit feed); `?appUid=` to scope, `?limit=` (default 100, max 500) |
| GET    | `/v1/ai-apps/me`                 | `UserAccessTokenValidateGuard`+`RbacGuard` (Bearer **or** `authToken` cookie) | `ai_apps.read`/`write` | Member context for deployed apps: the signed-in member's public identity (see below) |
| GET    | `/v1/ai-apps/:uid`               | `UserTokenCheckGuard`+`RbacGuard` | `ai_apps.read`/`write` | Single app detail |
| GET    | `/v1/ai-apps/:uid/events`        | `UserTokenCheckGuard`+`RbacGuard` | `ai_apps.read`/`write` | Full event/status history for one app (404 if app missing) |
| GET    | `/v1/ai-apps/:uid/live`          | `UserTokenCheckGuard`+`RbacGuard` | `ai_apps.read`/`write` | Liveness probe: one server-side reachability check of the app URL → `{ live }`; gateway timeouts AND 404 count as down (the ingress 404s until a first deploy's route is ready). The LabOS detail page polls it so the iframe never shows a raw gateway/404 error |
| PATCH  | `/v1/ai-apps/:uid`               | `UserTokenCheckGuard`+`RbacGuard` | `ai_apps.write`   | Edit display metadata (`name`/`description`/`prd`) without redeploying; JSON **or** multipart (`file` = Markdown/HTML PRD, stored in S3) |
| POST   | `/v1/ai-apps/:uid/prd`           | `UserTokenCheckGuard`+`RbacGuard` | `ai_apps.write`   | File-only PRD upload from the LabOS dashboard (multipart `file`, `.md`/`.html`) — no redeploy |
| PATCH  | `/v1/ai-apps/:uid/agent`         | `AiAppTokenGuard` (`x-app-token`) | — (token = member, **owner only**) | Agent metadata edit: JSON `{ name?, description?, prd? }`; how the starter kit saves approved names/descriptions and one-pager PRDs |
| GET    | `/v1/ai-apps/:uid/logs/build`    | `AiAppTokenGuard` (`x-app-token`) | — (token = member, **owner only**) | Build logs (Docker/Kaniko image build, latest successful build deployment), proxied from the runner's CloudWatch endpoint; `?limit=`, `?sinceMinutes=`, `?nextToken=` |
| GET    | `/v1/ai-apps/:uid/logs/runtime`  | `AiAppTokenGuard` (`x-app-token`) | — (token = member, **owner only**) | Runtime logs (running app pod stdout/stderr, latest successful runtime deployment), same query params |
| GET    | `/v1/ai-apps/:uid/build-logs`    | `UserTokenCheckGuard`+`RbacGuard` | `ai_apps.read`/`write` + creator/directory-admin (checked in service) | Dashboard build logs (member JWT): same runner logs as `/logs/build` for the app's creator OR a directory admin — debug any app from LabOS without a deploy token; same query params |
| GET    | `/v1/ai-apps/:uid/runtime-logs`  | `UserTokenCheckGuard`+`RbacGuard` | `ai_apps.read`/`write` + creator/directory-admin (checked in service) | Dashboard runtime logs (member JWT): same runner logs as `/logs/runtime` for the app's creator OR a directory admin; same query params |
| POST   | `/v1/ai-apps/:uid/feedback`      | `UserTokenCheckGuard`+`RbacGuard` | `ai_apps.read`/`write` | Submit free-text feedback on an app (multiple entries per member allowed) |
| GET    | `/v1/ai-apps/:uid/feedback`      | `UserTokenCheckGuard`+`RbacGuard` | `ai_apps.read`/`write` + creator/directory-admin (checked in service) | All feedback for one app, newest first, with submitter info |
| GET    | `/v1/ai-apps/starter-kit/download` | `UserTokenCheckGuard`+`RbacGuard` | `ai_apps.write`   | Stream the starter-kit ZIP (no token inside) |
| POST   | `/v1/ai-apps/connect`            | none (agent)                  | —                 | Start a connect session; returns `connectUrl`/`userCode`/`pollToken` |
| POST   | `/v1/ai-apps/connect/poll`       | none (agent, `pollToken` in body) | —             | Poll a session; returns the `deployToken` once `APPROVED` |
| GET    | `/v1/ai-apps/connect/:uid`       | `UserTokenCheckGuard`         | —                 | Connect-session display info for the LabOS page (no secrets) |
| POST   | `/v1/ai-apps/connect/:uid/approve` | `UserTokenCheckGuard`       | `ai_apps.write` (checked in service) | Approve → mint deploy token; else mark `DENIED` (both audited) |
| POST   | `/v1/ai-apps/deploy`              | `AiAppTokenGuard` (`x-app-token` = short-lived deploy token) | — (token = member) | Upload app ZIP → S3 → sandbox runner |
| POST   | `/v1/ai-apps/draft`               | `AiAppTokenGuard` (`x-app-token`) | — (token = member) | Register a DRAFT app that needs runtime secrets: upload ZIP → S3, store required env var names; nothing deployed yet |
| POST   | `/v1/ai-apps/:uid/deploy`         | `UserTokenCheckGuard`+`RbacGuard` | `ai_apps.write` + creator/directory-admin (checked in service) | Member-triggered deploy: save submitted secret values to the runner, validate required vars, deploy the stored bundle |
| DELETE | `/v1/ai-apps/:uid`               | `UserTokenCheckGuard`+`RbacGuard` | `ai_apps.write`   | Tear down on the runner → mark `DELETED` |

### Deploy request

`POST /v1/ai-apps/deploy` is `multipart/form-data` with the app ZIP plus metadata fields:

```bash
curl -X POST "$AI_APPS_DEPLOY_ENDPOINT" \
  -H "x-app-token: $DEPLOY_TOKEN" \
  -F "appId=my-leaderboard" \
  -F "name=My Leaderboard" \
  -F "description=A small leaderboard demo" \
  -F "deploymentId=deploy-1718900000" \
  -F "kitVersion=1.6" \
  -F 'database={"enabled":true,"type":"postgres"}' \
  -F "file=@app.zip;type=application/zip"
```

`database` is optional — see "Agent-driven database provisioning" below.

`name`/`description` are member-facing: kits ≥1.5 send values the member explicitly approved (and resend the same values on redeploys — see "Editable metadata & one-pager PRD").

`kitVersion` is optional (kits ≥1.4 send the value from their `pln-app.config.json`) and is stored on the app so we know which kit produced the last upload — older kits send nothing and the column goes/stays null. The same field exists on `POST /v1/ai-apps/draft`, and the `KIT_DOWNLOADED` audit event records the downloaded version in `message`.

Two more debugging columns describe the agent behind the last upload, both self-reported: `agentClient` is copied **server-side** from the connect session's `clientName` (the deploy token is bound to the session, so no extra field is needed — the kit now tells agents to send their real tool name instead of a hardcoded "Claude Code"), and `agentModel` is an optional free-form multipart field (e.g. `claude-sonnet-4-5`) the kit tells the agent to include when it knows its model. Like `kitVersion`, they reflect the LAST upload and are cleared when a client sends nothing.

The backend uploads the ZIP to `s3://<AI_APPS_S3_BUCKET>/apps/<appId>/<deploymentId>/app.zip`, then calls the runner with that `s3Key`. Response is the stored `AiApp` record (status `READY` with `url`/`host`/`port`, or `ERROR` with `notes`).

**Deterministic URL:** the sandbox host is always `<appId>.<AI_APPS_APP_DOMAIN>` (env-configurable: `dev.plnetwork.io` on Dev, `prod.plnetwork.io` on Prod), so `url`/`httpUrl`/`host` are computed from `appId` and stored on the record **at deploy start** (status `DEPLOYING`) — the link exists before the runner finishes. For `appId` `test-hello-01` on Prod the URL is `https://test-hello-01.prod.plnetwork.io`.

**No concurrent deploys:** while a **fresh** (non-stuck) deploy is in flight for an app, every deploy entry point rejects a second one with `409` (`"A deploy is already in progress for this app — wait for it to finish, then try again."`): the agent `POST /v1/ai-apps/deploy` and `POST /v1/ai-apps/draft` (checked before the S3 upload / upsert, so the in-flight deploy's bundle and status are never clobbered), and the member `POST /v1/ai-apps/:uid/deploy`. Once the deploy settles to `READY`/`ERROR` — or ages past the stuck window (see below), which makes it retryable — a new deploy is allowed again. The LabOS UI mirrors this: the detail page shows the in-progress status card (not the deploy panel) and Deployment settings disables its Redeploy button with "A deploy is already in progress for this app" while another deploy runs.

**Timeout handling:** the runner build can exceed the edge (Cloudflare) timeout and return `504`/`524` even though the deploy actually completes. On a gateway timeout (or no response), the backend does **not** fail blindly — it polls the app URL (`buildAppUrl(appId)`) for ~6 min by default (`AI_APPS_VERIFY_ATTEMPTS` × `AI_APPS_VERIFY_INTERVAL_MS`, default 24 × 8s, env-overridable; sized to cover the pod-up → domain-registration gap observed at 1–5 min) and marks the app `READY` if it becomes reachable (any non-gateway HTTP status counts, including `404` from the app; Cloudflare's `530` origin-DNS error counts as not-yet-reachable). Only if it stays unreachable — or the runner returns a non-timeout error (e.g. `400`/auth) — is it marked `ERROR` / `DEPLOY_FAILED`. This prevents false failures for slow-but-successful deploys.

**Helm-lock retry (secrets apps):** when a build survives such a timeout, its Helm upgrade is often still running when the follow-up secrets-injection deployment fires, and the runner answers `409` with `error: "helm_release_locked"` ("release is already being modified"). The backend treats that specific 409 as transient and retries the injection (`AI_APPS_HELM_LOCK_RETRIES` × `AI_APPS_HELM_LOCK_RETRY_INTERVAL_MS`, default 8 × 15s ≈ 2 min, env-overridable) until the lock clears; only after the budget is exhausted (or on any other injection error) is the app marked `ERROR`.

**Stuck deploys & manual retry:** deploys run synchronously inside the API process, so a legitimate one settles to `READY`/`ERROR` within minutes. An app still `DEPLOYING` after `AI_APPS_DEPLOY_STUCK_MINUTES` (default 15, env-overridable) is **stuck** — the API died mid-deploy or the runner hung — and is settled lazily on read: `GET /v1/ai-apps` and `GET /v1/ai-apps/:uid` flip such rows to `ERROR` with an explanatory `notes` and a `DEPLOY_FAILED` event (the update is conditioned on the row still being `DEPLOYING`, so a concurrently-settling deploy wins). The owner or a directory admin can then **retry** via the member deploy endpoint (`POST /v1/ai-apps/:uid/deploy`, empty body for apps without secrets) — it redeploys the bundle stored at `s3Key`, so it recovers from runner/backend outages without the agent re-uploading; if the app *itself* is broken the retry fails again with the runner error in `notes`, and the fix is to redeploy from the agent. While a **fresh** (non-stuck) deploy is in flight the endpoint returns `409` to prevent concurrent deploys. The LabOS detail page shows a status card for `ERROR` (error notes + Retry button for the creator/admin) and `DEPLOYING` (auto-refreshing progress), and the dashboard cards carry `Deploy failed` / `Deploying` badges.

## Agent-driven database provisioning

Non-technical builders often get stuck the moment their app needs a backend — they don't know what a database is, let alone how to provision one. Kits ≥1.6 let the agent offer a **PLN-provisioned database** as an alternative to bringing their own: the agent asks the member which they want, and if they want ours, it adds one extra field to the same deploy/draft call from "Deploy request" above:

```jsonc
"database": { "enabled": true, "type": "postgres" }
```

(As multipart, that's `-F 'database={"enabled":true,"type":"postgres"}'`.) The app never generates credentials or creates the database itself — the field just asks the sandbox runner (Deployment Orchestrator) to provision a dedicated Postgres database and non-admin user, and to inject the connection details into the app's runtime as environment variables: `DATABASE_URL`, `JDBC_DATABASE_URL`, and the individual parameters `DB_TYPE`/`DB_HOST`/`DB_PORT`/`DB_NAME`/`DB_USER`/`DB_PASSWORD`. The app reads them the same way it would read any other env var — no code changes to *request* a database, just to *use* one.

A member who already has their own database skips this field entirely and supplies their connection string as a regular runtime secret through the **draft flow** below (e.g. a required env var named `DATABASE_URL`) — provisioning is an opt-in convenience, never a requirement.

`postgres` is the only supported `type` today. The `AiApp.database` column — a single JSON blob shaped exactly like the response block below — reflects the **last** deploy/draft upload, the same "reflects the last upload" rule `kitVersion`/`agentModel` follow: a call that omits `database` sets the column to `NULL` (provisioning off) for that call, so kits persist the member's choice in `pln-app.config.json` and resend it on every redeploy (member-triggered redeploys from the LabOS Deployment settings modal reuse whatever was last stored, with no agent involved). Every app response carries the non-sensitive result in a `database` block:

```jsonc
"database": {
  "enabled": true,
  "type": "postgres",
  "host": "…", "port": 5432, "name": "db_demo", "user": "db_demo_user",
  "credentialsInjected": true
}
```

The password is never part of this contract — it only ever reaches the app's runtime environment, never our database or API responses. `enabled: false` (the default) means the app doesn't have — or hasn't asked for — a PLN-provisioned database; a bring-your-own database never sets this block, since it's just a secret.

**Connections require SSL (field-hit 2026-07-31):** none of the injected variables carry an `sslmode`/`ssl` flag, and the RDS instance rejects unencrypted connections outright (`no pg_hba.conf entry for host "…", … no encryption`) — that error means the app connected without SSL, not that the credentials are wrong. The app itself must turn SSL on (e.g. `pg` needs an explicit `ssl: { rejectUnauthorized: false }` client option — appending `sslmode=require` to the URL is a no-op for that driver; Prisma/psycopg2/JDBC do honor `sslmode=require` in the connection string). The kit's deploy skill now teaches this per-stack; nothing on the backend or orchestrator side changed.

**Runner routing (important):** the runner's legacy `/deploy` build endpoint never injects anything into the running pod — for secrets *or* a database — regardless of what's in the request body. Provisioning only actually happens through the same secret-aware endpoint the draft/secrets flow already uses, `POST <AI_APPS_RUNNER_URL>/v1/projects/<AI_APPS_RUNNER_PROJECT>/deployments` (see "Helm-lock retry" below). So `proxyDeploy` always builds via `/deploy` first, then — whenever `database.enabled` **or** the app has stored secrets — looks up the just-built image (`GET /apps`) and calls `/deployments` with `{ appId, environment, image, secretNames, database }`; that call's response is where the `database` metadata above actually comes from. This is the same call already made for secrets-only apps, just now also carrying `database` and returning it.

## Draft apps & runtime secrets

Apps that read secrets from the environment (`OPENAI_API_KEY`, credentialed URLs, …) must never ship the values in the ZIP, and the agent must never see them. The **draft flow** splits responsibilities: the agent declares which env var *names* the app needs; the member supplies the *values* in LabOS; the backend forwards the values straight to the sandbox runner's secret store (they are **never persisted in our DB** — only the names are tracked, in `requiredEnvVars` / `providedEnvVars`).

1. **Register (agent, deploy token)** — `POST /v1/ai-apps/draft`, same multipart shape as deploy plus `requiredEnvVars` (JSON array or comma-separated string; names must be `UPPER_SNAKE_CASE`):

```bash
curl -X POST "$AI_APPS_DRAFT_ENDPOINT" \
  -H "x-app-token: $DEPLOY_TOKEN" \
  -F "appId=my-ai-helper" \
  -F "name=My AI Helper" \
  -F "description=Chat helper that calls OpenAI" \
  -F "deploymentId=draft-1751900000" \
  -F 'requiredEnvVars=["OPENAI_API_KEY","SUPABASE_URL"]' \
  -F "file=@app.zip;type=application/zip"
```

The ZIP goes to S3 as usual, the app is upserted with status **`DRAFT`** (`s3Key` + `requiredEnvVars` stored, `DRAFT_CREATED` audited), and the response carries `appPageUrl` — the LabOS app detail page (`/pl-infra/ai-apps/<uid>`) — plus `missingEnvVars`. The agent gives `appPageUrl` to the member. Nothing runs yet; a draft is not live and not iframe-ready, and the dashboard shows it with the distinct `DRAFT` status.

2. **Deploy (member, LabOS)** — the member opens the page, enters the values, and clicks Deploy, which calls:

```bash
curl -X POST "https://api.plnetwork.io/v1/ai-apps/<uid>/deploy" \
  -H "Authorization: Bearer $MEMBER_JWT" \
  -H "Content-Type: application/json" \
  -d '{"secrets":{"OPENAI_API_KEY":"sk-…","SUPABASE_URL":"https://…"}}'
```

The backend (creator or directory admin only) first checks every name in `requiredEnvVars` has a value — stored earlier or submitted now — and otherwise rejects with a 400 naming the missing vars. It then saves the submitted values to the runner's secret store (`POST <AI_APPS_RUNNER_URL>/v1/projects/<AI_APPS_RUNNER_PROJECT>/secrets` with `{ appId, environment, secrets }` — merge/upsert semantics, `SECRETS_UPDATED` audited with names only) and redeploys the stored bundle through the normal runner `/deploy` proxy (status `DEPLOYING` → `READY`/`ERROR`).

3. **Update & redeploy** — the member can reopen the same page any time, change one or more values (`secrets` may be a subset — the runner merges), and Deploy again. `secrets` may also be omitted entirely to redeploy with the already-stored values. For a code update the agent re-registers the draft (same `appId`, fresh `deploymentId`); stored values stay valid.

### Delete request

`DELETE /v1/ai-apps/:uid` (member JWT, `ai_apps.write`). The backend looks up the app by `uid`, calls the runner to tear it down, then marks the record `DELETED`:

```
DELETE <AI_APPS_RUNNER_URL>/apps/<appId>
Header: x-runner-token: <server secret>
```

Flow: set status `DELETING` + log `DELETE_STARTED` → call the runner → on success clear hosting fields, set status `DELETED`, log `DELETE_SUCCEEDED`; on failure set status `ERROR` (with `notes`), log `DELETE_FAILED`, and return `502`. The `AiApp` row is **kept** (status flips to `DELETED`) so the audit trail and event history survive. Response is the updated `AiApp` record.

## Editable metadata & one-pager PRD

An app's display metadata — `name`, `description`, and an optional **one-pager PRD** (`prd`) — is editable **independently of deploys**: none of these endpoints upload a ZIP, invoke the sandbox runner, or change the app's status. Three routes (migration `20260715120000_ai_apps_editable_metadata` added the `prd` column):

- **`PATCH /v1/ai-apps/:uid`** (member JWT, `ai_apps.write`) — accepts `application/json` (`{ name?, description?, prd? }`) **or** `multipart/form-data` where an optional `file` carries a Markdown/HTML PRD (then `prd` must not also be sent in the body). Used by the LabOS edit UI.
- **`POST /v1/ai-apps/:uid/prd`** (member JWT, `ai_apps.write`) — file-only PRD upload for the dashboard.
- **`PATCH /v1/ai-apps/:uid/agent`** (`AiAppTokenGuard`, `x-app-token` deploy token) — JSON-only agent variant used by starter kits ≥1.5; unlike the member routes it is restricted to apps **owned by the connected member** (403 otherwise).

Validation: at least one field must be present; `name` 1–200 chars, `description` ≤4000 (nullable — `null` clears), `prd` ≤100,000 chars (nullable). PRD **files** must be `.md`/`.markdown`/`.html`/`.htm`, UTF-8 text (a NUL byte rejects), ≤1 MB (`AI_APPS_MAX_PRD_BYTES`). Both multipart routes are excluded from `ContentTypeMiddleware` in `app.module.ts`.

**PRD storage:** an uploaded PRD *file* goes to S3 under `ai-app-prds/<appId>/<uuid><.md|.html>` in `AI_APPS_PRD_S3_BUCKET` (defaults to `AI_APPS_S3_BUCKET`), and only the S3 key is stored in `AiApp.prd`. On every read, `withMember` maps a `prd` value starting with `ai-app-prds/` to its public URL (`AI_APPS_PRD_PUBLIC_BASE_URL` if set, else the standard S3 URL) — so the API contract is simply "`prd` holds a URL or inline content". Inline `prd` *text* (the agent route, or JSON PATCH without a file) is stored verbatim in the DB and returned as-is.

Agent example (name/description + inline Markdown one-pager):

```bash
curl -X PATCH "https://api.plnetwork.io/v1/ai-apps/<uid>/agent" \
  -H "x-app-token: $DEPLOY_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Team Availability Board","description":"See who on your team is free this week.","prd":"# Team Availability Board\n\n_See who is free this week._\n\n## Problem Statement\n…"}'
```

Dashboard PRD file upload (`.md` or `.html`):

```bash
curl -X POST "https://api.plnetwork.io/v1/ai-apps/<uid>/prd" \
  -H "Authorization: Bearer $MEMBER_JWT" \
  -F "file=@one-pager.md;type=text/markdown"
```

**Interplay with deploys:** every deploy/draft upload **overwrites** `name`/`description` with the multipart form values (the upsert has no "keep existing" path) — which is why kits ≥1.5 persist the member-approved values in `pln-app.config.json` and resend them verbatim on redeploys. Deploys never touch `prd`, so a one-pager survives any number of redeploys. Metadata edits are not audited (no `AiAppEvent` rows).

### Starter kit flow (kits ≥1.5)

The kit's `app-metadata` skill drives a propose → confirm → save workflow so the agent never publishes member-facing copy without approval:

1. **First deploy** (no `appName` saved in `pln-app.config.json`): the agent drafts a human-friendly name + 1–2 sentence description from what the app does, presents them, and waits for **explicit approval** (revising as asked). Approved values are saved to `appName`/`appDescription` in the config and sent as the deploy form's `name`/`description`.
2. **After the first successful deploy**: the agent asks once whether the member wants a one-pager PRD. If declined, nothing happens; if wanted, it synthesizes a concise Markdown one-page brief from the conversation (problem, solution, features, how to use, goals/OKR, success metrics, out of scope — see the kit's `app-metadata` skill), gets approval, and saves it via `PATCH …/:uid/agent` — no new ZIP, no redeploy. Dashboard uploads may still be `.md` or `.html`.
3. **Redeploys**: the saved `appName`/`appDescription` are resent verbatim and the propose flow is **not** re-run (it would otherwise revert approved metadata, since deploys overwrite it).
4. **Metadata changes on an existing app** (rename, description edit, PRD add/update/remove): same propose → confirm → save flow through the metadata endpoint, using the `appUid` the kit saved from the deploy/draft response (`metadataEndpoint` in the config is a template with a `{appUid}` placeholder). A metadata-only session still gets its short-lived token through the normal connect flow.

## Build & runtime logs (agent + dashboard debugging)

The deployment orchestrator (sandbox runner) keeps two CloudWatch-backed log
streams per app, and the backend proxies them both to the connected member's
agent (deploy token) and to a signed-in member on the LabOS dashboard (member
JWT) so failed deploys and runtime errors can be debugged from either place:

- **Build logs** — `GET /v1/ai-apps/:uid/logs/build` → runner
  `GET /v1/apps/<appId>/build/logs`: output of the image build (Kaniko / build
  preparation), taken from the **latest successful build deployment**.
- **Runtime logs** — `GET /v1/ai-apps/:uid/logs/runtime` → runner
  `GET /v1/apps/<appId>/runtime/logs`: stdout + stderr of the running app pod
  (plus the auth-check/auth-proxy sidecars), taken from the **latest successful
  runtime deployment**.

Auth is the short-lived deploy token (`AiAppTokenGuard`, `x-app-token`), and —
like the agent metadata route — the app must be **owned by the connected
member** (403 otherwise; 404 for unknown/`DELETED` apps). The runner token
stays server-side; the runner's response envelope is returned verbatim:

```bash
curl -sS "https://api.plnetwork.io/v1/ai-apps/<uid>/logs/runtime?limit=100&sinceMinutes=60" \
  -H "x-app-token: plndeploy_…"
# → { "appId", "deploymentId", "phase", "source": "cloudwatch", "logGroup",
#     "events": [{ "timestamp", "message" }, …], "nextToken" }
```

**Dashboard variants (member JWT, admin access):** the two agent routes above
require a deploy token, which a human debugging from LabOS doesn't hold. The
same runner logs are therefore also exposed for a signed-in member at
`GET /v1/ai-apps/:uid/build-logs` and `GET /v1/ai-apps/:uid/runtime-logs`
(`UserTokenCheckGuard` + `RbacGuard`, `ai_apps.read`). These are gated in the
service to the app's **creator OR a directory admin** (the same owner+admin
pattern as feedback listing and member deploy — `isCreatorOrDirectoryAdmin`),
so a directory admin can debug **any** app's logs from the dashboard without a
deploy token. Same query params and verbatim runner envelope; the two
`/logs/*` agent routes stay strict owner-only. Both paths share one private
`fetchRunnerLogs(app, phase, query)` proxy after their own access check.

```bash
curl -sS "https://api.plnetwork.io/v1/ai-apps/<uid>/runtime-logs?limit=100&sinceMinutes=60" \
  -H "Authorization: Bearer $MEMBER_JWT"
```

Query params (all optional, validated as positive integers where numeric):
`limit` (events per page), `sinceMinutes` (look-back window, e.g. 60 / 1440 /
10080), `nextToken` (CloudWatch pagination cursor). **CloudWatch may return an
empty `events` page that still carries a `nextToken`** — clients must follow
the cursor a few pages before concluding a window has no logs (the kit's
`app-logs` skill teaches the agent this). Availability is bounded by the
CloudWatch retention policy of the environment's log group (pre-prod
`/eks/preprod-pods`, prod `/eks/prod-pln/workloads`). Log reads are not
audited (no `AiAppEvent`).

The starter kit (≥1.5) ships `buildLogsEndpoint` / `runtimeLogsEndpoint` as
`{appUid}` templates in `pln-app.config.json` plus the `app-logs` skill; the
deploy skill points at it from its `ERROR`-status and timeout paths.

## Resource limits (build & runtime)

The `deployment-orchestrator` repo sets a fixed CPU/memory envelope on every
build and every deployed app — the caller (this backend, the agent, the
member) never chooses it. Sized from live prod usage across the sandbox
fleet (21 running app pods, 2026-08-06): median ~87Mi memory / 1m CPU
(near-idle), max observed 310Mi / 54m. Nodes are EC2 (`m6i.large`, not
Fargate) with `cluster-autoscaler` active, so **requests drive AWS cost**
(scheduling/scale-up) and are kept low, while **limits** are a free-standing
safety ceiling sized above the real max with margin.

**Runtime, per app pod** (`charts/app` in the orchestrator repo):

| Container | CPU request | CPU limit | Mem request | Mem limit |
|---|---|---|---|---|
| `app` (member's code) | 30m | 300m | 64Mi | 384Mi |
| `auth-check` (sidecar) | 10m | 100m | 32Mi | 96Mi |
| `auth-proxy` (sidecar) | 5m | 50m | 16Mi | 32Mi |

**Build, per Kaniko Job** (estimated — no measured data survives a completed
Job):

| Container | CPU request | CPU limit | Mem request | Mem limit |
|---|---|---|---|---|
| `prepare` | 25m | 150m | 32Mi | 128Mi |
| `kaniko` | 250m | 1000m | 512Mi | 2Gi |

**CPU limits throttle** (cgroups CFS throttling — the process just runs
slower). **Memory limits are hard**: exceeding one OOM-kills the container.
Two error codes make that failure mode explicit instead of a generic
timeout/crash message, both originating in the orchestrator and surfaced
verbatim into `AiApp.notes` (see `proxyDeploy`'s error handling in
`ai-apps.service.ts`, which prefers the runner's classified `message`/`error`
field over the raw JSON body):

- **Runtime**: `classifyKubernetesDiagnostics` (`src/k8s-diagnostics.ts`)
  returns `container_oom_killed` when a container's `terminated.reason` is
  `OOMKilled`, ahead of the generic `container_crash_loop` classification.
- **Build**: `buildAndPushImage` (`src/sandbox.ts`) inspects the failed
  build Job's pod for an `OOMKilled` container status and throws a message
  naming the container + its configured memory limit, ahead of the generic
  build-log error.

The starter kit (≥1.7) documents this budget in `AGENTS.md`/`CLAUDE.md`
("Resource limits" section — design guidance: avoid large in-memory
caches/datasets, stream over buffer, avoid extra worker
threads/processes, avoid heavy in-process ML/image/video work, keep the
build lean) and teaches the deploy/app-logs skills to recognize
`OOMKilled`/exceeded-limit messages and reduce memory footprint instead of
blindly retrying.

**Live metrics (no history)**: `GET /v1/ai-apps/:uid/metrics` — admin-only
(`isRequesterDirectoryAdmin`, capacity planning rather than member-facing
debugging), proxies the orchestrator's `GET /v1/apps/:appId/metrics`
(`kubectl top pod --containers` via metrics-server) with the server-side
runner token. Returns current per-container CPU/memory alongside the
configured limits — a live snapshot only, no polling or storage, so the
limits above can be sanity-checked against real apps over time.

```bash
curl -sS "https://api.plnetwork.io/v1/ai-apps/<uid>/metrics" \
  -H "Authorization: Bearer $ADMIN_JWT"
```

## Member context (signed-in user → deployed app)

Deployed apps can personalize for the member using them (greet by name, tag
feedback, adapt behavior). `GET /v1/ai-apps/me` returns the signed-in member's
**public** directory identity:

```json
{
  "member": {
    "uid": "…", "name": "Ada Lovelace", "image": "https://…/ada.png",
    "location": { "city": "London", "country": "United Kingdom", "continent": "Europe" },
    "skills": ["Engineering"],
    "teams": [{ "uid": "…", "name": "Protocol Labs", "role": "Engineer", "mainTeam": true, "teamLead": false }]
  }
}
```

The payload deliberately carries **no contact info** — no `email` and no `officeHours` link. Apps get an identity to personalize with, never a channel to reach the member.

How it works — no app-side login and no new token flow:

- LabOS writes the login cookies (`authToken` etc.) with `domain=COOKIE_DOMAIN`,
  a shared parent domain (on Dev: `.dev.plnetwork.io`), so a deployed app at
  `<appId>.<AI_APPS_APP_DOMAIN>` receives the cookie on its **own** origin. The
  kit's snippet reads it from `document.cookie` (URL-decode + strip the JSON
  quotes) and sends it to `/me` as `Authorization: Bearer`.
- ⚠️ `credentials: 'include'` alone is NOT reliable: the cookie domain covers the
  app hosts but not necessarily the API host (on Dev the API lives at
  `dev-directory.plnetwork.io`, a **sibling** of `dev.plnetwork.io`, so the
  browser never attaches the cookie → guaranteed 401 with only PostHog cookies
  in the request). Bearer-from-cookie only requires the cookie to reach the app
  host, which is exactly what `COOKIE_DOMAIN` guarantees.
- Unlike the other dashboard endpoints, `/me` uses `UserAccessTokenValidateGuard`,
  which accepts the token from the `Authorization: Bearer` header **or** the
  `authToken` cookie (`extractTokenFromRequest`), then introspects it against the
  auth service. `RbacGuard` enforces `ai_apps.read`.
- Access outcomes: guest/signed-out → `401` (no token); signed-in member without
  AI Apps access → `403`; otherwise the curated profile above. The kit instructs
  apps to treat any non-200 as "not signed in" and keep working un-personalized.
- CORS already covers app origins with credentials (the dev list matches
  `*.dev.plnetwork.io`, the prod list `*.plnetwork.io`).
- The response is assembled in `AiAppsService.getMemberContext` from curated
  public fields only — extend **there** if apps may read more PLN data later
  (the "light MCP" extension point); never point apps at internal endpoints.
- The kit's `pln-app.config.json` carries the URL as `memberContextEndpoint`,
  and `.claude/skills/pln-member-context/SKILL.md` tells the agent how to use it
  (client-side fetch, handle 401/403/local-dev gracefully, personalization only —
  never auth for sensitive actions, never store/log tokens).

## Data model

```prisma
enum AiAppStatus { IN_DEVELOPMENT  DRAFT  DEPLOYING  READY  ERROR  DELETING  DELETED }

model AiApp {
  uid          String  @unique
  memberUid    String          // owner (no FK relation; resolved in service)
  appId        String          // business key, unique per owner
  name         String
  description  String?
  prd          String?         // one-pager PRD: inline Markdown/HTML, or an S3 key (ai-app-prds/…) returned as a public URL
  status       AiAppStatus @default(IN_DEVELOPMENT)
  notes        String?         // error detail on failed deploys
  url / httpUrl / host / port  // hosting details from the runner
  deploymentId String?
  s3Key        String?         // last uploaded bundle (lets a member redeploy a draft)
  requiredEnvVars String[]     // env var NAMES the agent declared (draft flow)
  providedEnvVars String[]     // NAMES the member gave values for — values live only on the runner
  kitVersion   String?         // starter-kit version behind the last agent upload (null = pre-1.4 kit)
  agentClient  String?         // AI tool from the connect session's clientName (e.g. "Claude Code")
  agentModel   String?         // model the agent reported for the last upload (self-reported)
  lastDeployedAt DateTime?     // last SUCCESSFUL ship (written only by markReady; null = never shipped)
  failureStream  String?       // 'build' | 'runtime' — which log stream holds the LATEST deploy failure (null = unknown)
  database        Json?         // { enabled, type, host?, port?, name?, user?, credentialsInjected? } — one JSON blob,
                                 // reflects the LAST deploy/draft upload (kitVersion-style); null = not requested.
                                 // Non-sensitive connection metadata only — the password is never stored.
  @@unique([memberUid, appId])
}

enum AiAppConnectStatus { PENDING  APPROVED  DENIED  EXPIRED }

model AiAppConnectSession {     // short-lived connect handshake (replaces AiAppToken)
  uid                  String  @unique   // sessionId in the connect URL
  userCode             String  @unique   // human-readable confirmation code
  clientName           String?           // e.g. "Claude Code" (shown on the page)
  pollToken            String  @unique   // agent's secret to poll/collect the token
  status               AiAppConnectStatus @default(PENDING)
  memberUid            String?           // bound on approval
  deployToken          String? @unique   // short-lived token minted on approval (x-app-token)
  deployTokenExpiresAt DateTime?
  expiresAt            DateTime          // PENDING window (login deadline)
  approvedAt           DateTime?
  lastUsedAt           DateTime?         // last deploy with the token
}

enum AiAppEventType {
  KIT_DOWNLOADED  CONNECT_APPROVED  CONNECT_DENIED
  DRAFT_CREATED   SECRETS_UPDATED
  DEPLOY_STARTED  DEPLOY_SUCCEEDED  DEPLOY_FAILED
  DELETE_STARTED  DELETE_SUCCEEDED  DELETE_FAILED
}

model AiAppFeedback {         // free-text feedback from the app detail page
  uid       String @unique
  appUid    String             // AiApp.uid (no FK relation, matching the other POC tables)
  memberUid String             // submitter; may submit multiple entries per app
  text      String
  createdAt DateTime @default(now())
}

model AiAppEvent {            // append-only audit log — one row per event, never updated
  uid          String @unique
  memberUid    String         // who triggered it
  type         AiAppEventType
  appUid       String?        // set for deploy events (null for KIT_DOWNLOADED)
  appId        String?
  deploymentId String?
  message      String?        // e.g. error detail on DEPLOY_FAILED, url on success
  createdAt    DateTime @default(now())
}
```

Apps are **lazy-created on first deploy** — there is no registration form. (A draft registration counts: it upserts the same record with status `DRAFT`.)

**Response shape:** every AI Apps endpoint (`list`, detail, `events`, and the `deploy` result) returns the owner as `member: { uid, name, image }` and omits the raw `memberUid` (the uid lives in `member.uid`, so it isn't duplicated). `memberUid` remains a column on the DB models above. The detail endpoint additionally returns `canManage` — whether the requesting member is the creator or a directory admin — computed server-side so the UI never compares member uids from a possibly stale login cookie.

**Deployment block & failure-detail gating:** every app response (list, detail, deploy/metadata/delete results) replaces the raw `failureStream` column with a `deployment` object:

```jsonc
"deployment": {
  "serving": "latest" | "previous" | "none",  // everyone: what actually serves traffic
  "failureReason": "…",                        // managers only — equals `notes` (runner failure text)
  "failureStream": "build" | "runtime"        // managers only — which log tab holds the failure
}
```

`serving` is derived, never stored: `READY` → `latest`; otherwise `lastDeployedAt` set → `previous` (the app shipped before, and the runner keeps the old release serving through a failed rollout), else `none` (never shipped — strict, since `markReady` is `lastDeployedAt`'s only writer, and a failed deploy never touches it). "Manager" = the app's creator or a directory admin; the list endpoint resolves the requester (like detail) and gates per row with a single admin lookup. Non-managers also get `notes: null` — the runner's failure text can carry stack fragments, image names, and internal hostnames, and the dashboard deliberately shows visitors a completely normal card for failed apps. `failureStream` is classified at failure time from the deploy control flow (S3/bundle and hard runner errors → `build`; secrets-injection failures → `runtime`; timeouts where the app never came up and stuck-deploy settles → `null`), because the runner's log endpoints only cover the latest *successful* phase. A runner 2xx whose body carries `status: "failed"` is treated as a deploy failure (it used to be silently treated as success).

`AiApp.status` is the current-state snapshot for the dashboard; `AiAppEvent` is the immutable event flow. A row is appended on kit download (`KIT_DOWNLOADED`), on each connect approval/denial (`CONNECT_APPROVED` / `CONNECT_DENIED` — the `userCode` is recorded in `message`), at the start of every deploy (`DEPLOY_STARTED`) and its outcome (`DEPLOY_SUCCEEDED` / `DEPLOY_FAILED`), and likewise for deletes (`DELETE_STARTED` → `DELETE_SUCCEEDED` / `DELETE_FAILED`). Event logging never throws — a logging failure won't break a download, connect, deploy, or delete.

## RBAC

- `ai_apps.read` — view the dashboard (list/detail) and submit feedback on an app.
- `ai_apps.write` — download the starter kit and deploy.

Reading an app's feedback list additionally requires being the app's creator or a
directory admin (`isDirectoryAdmin`) — enforced in `AiAppsService.listFeedback`,
not by a separate permission.

Both are seeded in migration `20260623120000_ai_apps` and attached to the **PL Infra Team** policy (`pl_infra_team_pl_internal`), and registered in `access-control-v2.constants.ts` + `access-control-v2.seed.ts`.

## Starter kit ZIP

Built by `AiAppsStarterKitService` — text files are generated in-memory; the PL
Design System is embedded as a curated folder (see below):

```
README.md                                      human quick-start
CLAUDE.md / AGENTS.md                          agent build + deploy instructions
.claude/skills/deploy-to-labs/SKILL.md         deploy skill (incl. connect flow, secrets, database provisioning ≥1.6)
.claude/skills/app-metadata/SKILL.md           propose → approve name/description + optional one-pager PRD (kits ≥1.5)
.claude/skills/app-logs/SKILL.md               fetch build/runtime logs to debug failed deploys + runtime errors (kits ≥1.5)
.claude/skills/pl-design-system/SKILL.md       single UI skill (components + tokens)
.claude/skills/pln-member-context/SKILL.md     how the app gets the signed-in member's identity
pln-app.config.json                            connect/deploy/draft/metadata/logs/member-context endpoints
                                               (+ appId, appUid, approved appName/appDescription,
                                                database provisioning choice ≥1.6) — NO token
pl-design-system/                              curated PL Design System (files, not a nested zip)
styles/pln-theme.css                           minimal CSS-variable fallback (plain-HTML apps)
styles/FONTS.md                                Inter font guidance
app/                                           minimal runnable Node/Express scaffold
```

The kit deliberately exposes **no internal PLN APIs** — only the connect, deploy, draft, metadata, logs, and member-context endpoints — and **no token**.

### Bundled PL Design System

Members no longer hand-roll UI. The kit ships the curated **PL Design System** as
a ready-to-use `pl-design-system/` folder (no nested zip for the agent to unpack).
Source is a slimmed copy of `pl-network-design-system` (`@plnetwork/design-system`):
React + Tailwind v4, semantic tokens only.

```
pl-design-system/
  USAGE.md                 how to consume in a Next.js + Tailwind v4 app
  guidelines.md            design rules (semantic tokens, page recipes, do/don't)
  README.md                foundations + full page-recipe snippets
  components/              React components (.tsx) + public barrel index.ts
                           (Button, EntityCard, PageShell, Tag, Badge, Table,
                           Tabs, FilterPanel, Modal, Drawer, MemberCard, …)
  tokens/                  tokens.css + tailwind-theme.css + tokens.ts
  lib/cn.ts                tailwind-merge class joiner
```

Agents copy the folder into `app/pl-design-system/`, wire Tailwind with
`@source "../pl-design-system/components"`, and import components relatively.
No font files are bundled — Inter is loaded via `next/font` or CDN.

The curated tree lives at `apps/web-api/src/ai-apps/assets/pl-design-system/`
(kit overlays: `USAGE.md`, `guidelines.kit.md`). It is registered as a build
asset in `apps/web-api/project.json`, so `nx build` copies it to
`dist/apps/web-api/ai-apps/assets/pl-design-system/`. At download time
`AiAppsStarterKitService` walks that folder into the kit ZIP. If the asset is
ever missing at runtime, the kit still downloads — just without the design
system (a warning is logged).

Excluded from the kit: Storybook, foundations/pages stories, GAP/AUDIT docs,
and the DS package.json. The agent loads `.claude/skills/pl-design-system` for
UI work and follows `AGENTS.md` / `CLAUDE.md` for deploy, secrets, and iframe rules.

## Configuration (env)

| Var | Default | Notes |
|-----|---------|-------|
| `AI_APPS_RUNNER_URL` | `https://sandbox-runner.plnetwork.io` | Sandbox runner base URL |
| `AI_APPS_RUNNER_TOKEN` | _(empty)_ | **Required** for real deploys; `x-runner-token` to the runner |
| `AI_APPS_S3_BUCKET` | _(empty)_ | **Required** for real deploys; bucket the runner reads app bundles from (e.g. `sandbox-apps-pln-dev-013228333448`) |
| `AI_APPS_APP_DOMAIN` | `prod.plnetwork.io` | Base domain deployed apps are served under (app URL = `https://<appId>.<domain>`); set `dev.plnetwork.io` on Dev, `prod.plnetwork.io` on Prod |
| `AI_APPS_BASE_URL` | `https://api.plnetwork.io` | Public base URL of this API; the agent-facing endpoint URLs written into the kit (deploy/connect/draft/member context) are derived from it as `<base>/v1/ai-apps/<endpoint>` |
| `AI_APPS_DEPLOY_ENDPOINT` / `AI_APPS_CONNECT_ENDPOINT` / `AI_APPS_DRAFT_ENDPOINT` / `AI_APPS_ME_ENDPOINT` / `AI_APPS_METADATA_ENDPOINT` / `AI_APPS_BUILD_LOGS_ENDPOINT` / `AI_APPS_RUNTIME_LOGS_ENDPOINT` | _derived from `AI_APPS_BASE_URL`_ | Optional per-endpoint overrides; rarely needed. The metadata and logs endpoints are templates with a literal `{appUid}` placeholder the agent substitutes |
| `AI_APPS_PRD_S3_BUCKET` | _`AI_APPS_S3_BUCKET`_ | Bucket for uploaded PRD files (`ai-app-prds/<appId>/<uuid>.<ext>`); defaults to the app-bundle bucket so no extra IAM is needed |
| `AI_APPS_PRD_PUBLIC_BASE_URL` | _(empty)_ | Optional CDN/public base URL used when turning a stored PRD key into the URL returned in `prd`; falls back to the standard S3 URL |
| `AI_APPS_PORTAL_URL` | `https://directory.plnetwork.io` | Base URL of the LabOS portal hosting the connect/approval page (used to build `connectUrl` and `appPageUrl`) |
| `AI_APPS_RUNNER_PROJECT` | `default` | Project scope of the runner's secrets API (`/v1/projects/<project>/secrets`) |
| `AI_APPS_RUNNER_ENVIRONMENT` | `prod` | Environment label for the runner secrets/deployments API. **Must match the environment the runner's `/deploy` build registers under** (its helm release is `<environment>-<appId>`; the legacy-compat build path registers as `sandbox`) — a mismatch makes the secrets-injection deploy collide with the build's release |
| `AI_APPS_HELM_LOCK_RETRIES` / `AI_APPS_HELM_LOCK_RETRY_INTERVAL_MS` | `8` / `15000` | Retry budget when the secrets-injection deployment hits `409 helm_release_locked` (the build's own Helm upgrade still finishing after an edge timeout) — see "Helm-lock retry" above |

S3 uploads reuse the shared `AwsService`, so the standard `AWS_REGION` / `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` credentials must also be present.

## Code map

- `apps/web-api/src/ai-apps/` — module, controller, services (incl. `ai-apps-connect.service.ts`), guard, DTOs, constants.
- `apps/web-api/prisma/schema.prisma` — `AiApp`, `AiAppConnectSession`, `AiAppEvent`, enums `AiAppStatus`/`AiAppConnectStatus`/`AiAppEventType`.
- `apps/web-api/prisma/migrations/20260623120000_ai_apps/` — tables + permission seed.
- `apps/web-api/prisma/migrations/20260623150000_ai_app_events/` — event log table.
- `apps/web-api/prisma/migrations/20260625120000_ai_apps_delete/` — `DELETING`/`DELETED` + delete event enum values.
- `apps/web-api/prisma/migrations/20260630120000_ai_apps_connect/` — connect session table + connect event values; drops `AiAppToken`.
- `apps/web-api/prisma/migrations/20260707120000_ai_apps_draft_secrets/` — `DRAFT` status, `s3Key`/`requiredEnvVars`/`providedEnvVars`, draft/secrets event values.
- `apps/web-api/prisma/migrations/20260714120000_ai_apps_upload_meta/` — `kitVersion`/`agentClient`/`agentModel` columns (self-reported metadata about the last agent upload).
- `apps/web-api/prisma/migrations/20260715120000_ai_apps_editable_metadata/` — `prd` column (one-pager PRD).
- `apps/web-api/prisma/migrations/20260730120000_ai_apps_database_provisioning/` — single `database` JSON column: provisioning request + non-sensitive connection metadata (agent-driven database provisioning).
- LabOS UI (`pln-directory-portal-v2`): `app/pl-infra/ai-apps/connect/page.tsx` + `components/page/ai-apps/AiAppsConnectPage/` — the approval page; connect calls in `services/ai-apps/ai-apps.service.ts`.
- `.claude/skills/ai-apps/SKILL.md` — agent guidance for working on this feature.

## Out of scope (POC)

- The dashboard UI (built later in `pln-directory-portal-v2`).
- Connectors, per-app collaborators, build logs streaming.
- Reusable/long-lived deploy tokens — replaced by the short-lived connect flow.
