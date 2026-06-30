# AI Apps (PL Infra)

> Status: **POC / happy-path only.** Lives under the PL Infra navigation hub.

PLN members "vibe-code" a small web app locally with an AI assistant (Claude Code, Cursor, …) and have the agent deploy it to the PLN **sandbox runner**. The backend tracks every app and its deploy status so PL Infra users can browse and open the live apps from a dashboard (UI built later, in `pln-directory-portal-v2`).

## User flow

1. A member with `ai_apps.write` opens the AI Apps dashboard and downloads the **starter kit** ZIP. The kit carries **no token**.
2. They unzip it into their AI coding tool and describe what to build. The agent edits files under `app/`, reusing the bundled **PL Design System** (`pl-design-system/`) for on-brand UI instead of hand-rolling components.
3. When ready, the member says "deploy". The agent has no stored token, so it **starts a LabOS connect session**, gives the member a link + confirmation code to open and approve, then polls until it receives a **short-lived deploy token**.
4. The agent packages `app/` and POSTs to our deploy endpoint with that short-lived token. The backend proxies the deploy to the sandbox runner, stores the result, and the app shows up on the dashboard with its live URL.

## Architecture

```
Member's AI agent                 web-api (/v1/ai-apps)                S3 + Sandbox runner
─────────────────                 ─────────────────────               ───────────────────
GET  /starter-kit/download  ──►  RBAC ai_apps.write
                            ◄──  ZIP (instructions, styles, pl-design-system.zip, app/ — NO token)

POST /connect               ──►  create AiAppConnectSession (PENDING)
                            ◄──  { sessionId, userCode, connectUrl, pollToken, expiresAt }
       ┌─ member opens connectUrl in LabOS, signs in, clicks Approve ─┐
       │  POST /connect/:uid/approve ──► RBAC ai_apps.write?           │
       │     yes → mint short-lived deployToken, status=APPROVED       │
       │     no  → status=DENIED   (both audited)                      │
       └───────────────────────────────────────────────────────────────┘
POST /connect/poll          ──►  pollToken → PENDING | APPROVED(+deployToken) | DENIED | EXPIRED

POST /deploy (multipart)    ──►  AiAppTokenGuard (x-app-token = short-lived deployToken)
  x-app-token: <token>           upsert AiApp (status=DEPLOYING, url=sandbox-<appId>.plnetwork.io set up front)
  file=app.zip + metadata        upload app.zip ──────────────────►  s3://<bucket>/apps/<appId>/<deploymentId>/app.zip
                                 POST /deploy ────────────────────►  pull from S3, build + run
                                   x-runner-token: <server secret>
                                 200 → status=READY                ◄── { port } (or 504 timeout)
                                 504/timeout → poll app URL, READY if reachable
                            ◄──  AiApp record

GET  /            ──► RBAC ai_apps.read ── list all apps (dashboard)
GET  /:uid        ──► RBAC ai_apps.read ── single app
```

The agent only ever holds a **short-lived deploy token** it obtained through the connect flow — it ships the app ZIP to us and we handle the rest. **AWS credentials and the runner token both stay server-side**: the backend uploads the ZIP to S3 (reusing `AwsService`, the same uploader as member images) and calls the runner. The S3 key is derived as `apps/<appId>/<deploymentId>/app.zip`, and the app is served at `https://sandbox-<appId>.plnetwork.io`.

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
| GET    | `/v1/ai-apps/:uid`               | `UserTokenCheckGuard`+`RbacGuard` | `ai_apps.read`/`write` | Single app detail |
| GET    | `/v1/ai-apps/:uid/events`        | `UserTokenCheckGuard`+`RbacGuard` | `ai_apps.read`/`write` | Full event/status history for one app (404 if app missing) |
| GET    | `/v1/ai-apps/starter-kit/download` | `UserTokenCheckGuard`+`RbacGuard` | `ai_apps.write`   | Stream the starter-kit ZIP (no token inside) |
| POST   | `/v1/ai-apps/connect`            | none (agent)                  | —                 | Start a connect session; returns `connectUrl`/`userCode`/`pollToken` |
| POST   | `/v1/ai-apps/connect/poll`       | none (agent, `pollToken` in body) | —             | Poll a session; returns the `deployToken` once `APPROVED` |
| GET    | `/v1/ai-apps/connect/:uid`       | `UserTokenCheckGuard`         | —                 | Connect-session display info for the LabOS page (no secrets) |
| POST   | `/v1/ai-apps/connect/:uid/approve` | `UserTokenCheckGuard`       | `ai_apps.write` (checked in service) | Approve → mint deploy token; else mark `DENIED` (both audited) |
| POST   | `/v1/ai-apps/deploy`              | `AiAppTokenGuard` (`x-app-token` = short-lived deploy token) | — (token = member) | Upload app ZIP → S3 → sandbox runner |
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
  -F "file=@app.zip;type=application/zip"
```

The backend uploads the ZIP to `s3://<AI_APPS_S3_BUCKET>/apps/<appId>/<deploymentId>/app.zip`, then calls the runner with that `s3Key`. Response is the stored `AiApp` record (status `READY` with `url`/`host`/`port`, or `ERROR` with `notes`).

**Deterministic URL:** the sandbox host is always `sandbox-<appId>.plnetwork.io`, so `url`/`httpUrl`/`host` are computed from `appId` and stored on the record **at deploy start** (status `DEPLOYING`) — the link exists before the runner finishes. For `appId` `test-hello-01` the URL is `https://sandbox-test-hello-01.plnetwork.io`.

**Timeout handling:** the runner build can exceed the edge (Cloudflare) timeout and return `504`/`524` even though the deploy actually completes. On a gateway timeout (or no response), the backend does **not** fail blindly — it polls the app URL (`buildAppUrl(appId)`) for ~1 min and marks the app `READY` if it becomes reachable (any non-gateway HTTP status counts, including `404` from the app). Only if it stays unreachable — or the runner returns a non-timeout error (e.g. `400`/auth) — is it marked `ERROR` / `DEPLOY_FAILED`. This prevents false failures for slow-but-successful deploys.

### Delete request

`DELETE /v1/ai-apps/:uid` (member JWT, `ai_apps.write`). The backend looks up the app by `uid`, calls the runner to tear it down, then marks the record `DELETED`:

```
DELETE <AI_APPS_RUNNER_URL>/apps/<appId>
Header: x-runner-token: <server secret>
```

Flow: set status `DELETING` + log `DELETE_STARTED` → call the runner → on success clear hosting fields, set status `DELETED`, log `DELETE_SUCCEEDED`; on failure set status `ERROR` (with `notes`), log `DELETE_FAILED`, and return `502`. The `AiApp` row is **kept** (status flips to `DELETED`) so the audit trail and event history survive. Response is the updated `AiApp` record.

## Data model

```prisma
enum AiAppStatus { IN_DEVELOPMENT  DEPLOYING  READY  ERROR  DELETING  DELETED }

model AiApp {
  uid          String  @unique
  memberUid    String          // owner (no FK relation; resolved in service)
  appId        String          // business key, unique per owner
  name         String
  description  String?
  status       AiAppStatus @default(IN_DEVELOPMENT)
  notes        String?         // error detail on failed deploys
  url / httpUrl / host / port  // hosting details from the runner
  deploymentId String?
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
  DEPLOY_STARTED  DEPLOY_SUCCEEDED  DEPLOY_FAILED
  DELETE_STARTED  DELETE_SUCCEEDED  DELETE_FAILED
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

Apps are **lazy-created on first deploy** — there is no registration form.

**Response shape:** every AI Apps endpoint (`list`, detail, `events`, and the `deploy` result) returns the owner as `member: { uid, name }` and omits the raw `memberUid` (the uid lives in `member.uid`, so it isn't duplicated). `memberUid` remains a column on the DB models above.

`AiApp.status` is the current-state snapshot for the dashboard; `AiAppEvent` is the immutable event flow. A row is appended on kit download (`KIT_DOWNLOADED`), on each connect approval/denial (`CONNECT_APPROVED` / `CONNECT_DENIED` — the `userCode` is recorded in `message`), at the start of every deploy (`DEPLOY_STARTED`) and its outcome (`DEPLOY_SUCCEEDED` / `DEPLOY_FAILED`), and likewise for deletes (`DELETE_STARTED` → `DELETE_SUCCEEDED` / `DELETE_FAILED`). Event logging never throws — a logging failure won't break a download, connect, deploy, or delete.

## RBAC

- `ai_apps.read` — view the dashboard (list/detail).
- `ai_apps.write` — download the starter kit and deploy.

Both are seeded in migration `20260623120000_ai_apps` and attached to the **PL Infra Team** policy (`pl_infra_team_pl_internal`), and registered in `access-control-v2.constants.ts` + `access-control-v2.seed.ts`.

## Starter kit ZIP

Built by `AiAppsStarterKitService` — text files are generated in-memory; the PL
Design System is embedded as a prebuilt ZIP (see below):

```
README.md                                human quick-start
CLAUDE.md / AGENTS.md                    agent build + deploy instructions
.claude/skills/deploy-to-labs/SKILL.md   the deploy skill for the agent (incl. connect flow)
pln-app.config.json                      connect + deploy endpoints (+ appId slot) — NO token
pl-design-system.zip                     full PL Design System, prebuilt (see below)
styles/pln-theme.css                     minimal CSS-variable fallback (plain-HTML apps)
styles/FONTS.md                          Inter font guidance
app/                                     minimal runnable Node/Express scaffold
```

The kit deliberately exposes **no internal PLN APIs** — only the connect and deploy endpoints — and **no token**.

### Bundled PL Design System

Members no longer hand-roll UI. The kit ships the full **PL Design System** as
`pl-design-system.zip`; the agent unzips it once (`unzip pl-design-system.zip`)
to get a `pl-design-system/` folder so apps look on-brand out of the box:

```
pl-design-system/            (after unzipping pl-design-system.zip)
  USAGE.md                 how to consume the system in a Next.js 14 app
  guidelines.md            design rules (retrieval order, token usage, do/don't)
  components/              React components (.tsx + SCSS modules + types)
                           primitives (Button, Input, Badge, Tabs, Table,
                           Pagination, SearchInput, …) and product components
                           (MemberCard, TeamCard, PageHeader, Sidebar, NavBar, …)
                           plus per-component specs in primitives/ and product/
  tokens/                  SCSS design tokens → CSS custom properties
  styles/                  globals.scss (reset + tokens + @font-face), media, mixins
  public/fonts/            self-hosted Inter variable font
  patterns/ examples/      layout patterns + page-level reference compositions
```

The bundle is stored as a **single prebuilt ZIP** at
`apps/web-api/src/ai-apps/assets/pl-design-system.zip` (one binary instead of
hundreds of loose files — keeps Git clean; the editable `USAGE.md` source and a
regeneration guide sit next to it in `assets/`). It is registered as a build
asset in `apps/web-api/project.json`, so `nx build` copies it to
`dist/apps/web-api/ai-apps/assets/pl-design-system.zip`. At download time
`AiAppsStarterKitService` embeds that ZIP **verbatim** as a single entry
(`addFile` with the STORED method — no folder walk, no recompression, no temp
files), which is why the agent unzips it on its end. If the asset is ever missing
at runtime, the kit still downloads — just without the design system (a warning
is logged).

The agent instructions (`AGENTS.md` / `CLAUDE.md`) direct the member's AI tool to
reuse these components and tokens instead of recreating buttons, cards, inputs,
badges, tables, tabs, dropdowns, or sidebars from scratch.

## Configuration (env)

| Var | Default | Notes |
|-----|---------|-------|
| `AI_APPS_RUNNER_URL` | `https://sandbox-runner.plnetwork.io` | Sandbox runner base URL |
| `AI_APPS_RUNNER_TOKEN` | _(empty)_ | **Required** for real deploys; `x-runner-token` to the runner |
| `AI_APPS_S3_BUCKET` | _(empty)_ | **Required** for real deploys; bucket the runner reads app bundles from (e.g. `sandbox-apps-pln-dev-013228333448`) |
| `AI_APPS_DEPLOY_ENDPOINT` | `https://api.plnetwork.io/v1/ai-apps/deploy` | Written into the kit so the agent knows where to POST |
| `AI_APPS_CONNECT_ENDPOINT` | `https://api.plnetwork.io/v1/ai-apps/connect` | Written into the kit so the agent knows where to start a connect session |
| `AI_APPS_PORTAL_URL` | `https://directory.plnetwork.io` | Base URL of the LabOS portal hosting the connect/approval page (used to build `connectUrl`) |

S3 uploads reuse the shared `AwsService`, so the standard `AWS_REGION` / `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` credentials must also be present.

## Code map

- `apps/web-api/src/ai-apps/` — module, controller, services (incl. `ai-apps-connect.service.ts`), guard, DTOs, constants.
- `apps/web-api/prisma/schema.prisma` — `AiApp`, `AiAppConnectSession`, `AiAppEvent`, enums `AiAppStatus`/`AiAppConnectStatus`/`AiAppEventType`.
- `apps/web-api/prisma/migrations/20260623120000_ai_apps/` — tables + permission seed.
- `apps/web-api/prisma/migrations/20260623150000_ai_app_events/` — event log table.
- `apps/web-api/prisma/migrations/20260625120000_ai_apps_delete/` — `DELETING`/`DELETED` + delete event enum values.
- `apps/web-api/prisma/migrations/20260630120000_ai_apps_connect/` — connect session table + connect event values; drops `AiAppToken`.
- LabOS UI (`pln-directory-portal-v2`): `app/pl-infra/ai-apps/connect/page.tsx` + `components/page/ai-apps/AiAppsConnectPage/` — the approval page; connect calls in `services/ai-apps/ai-apps.service.ts`.
- `.claude/skills/ai-apps/SKILL.md` — agent guidance for working on this feature.

## Out of scope (POC)

- The dashboard UI (built later in `pln-directory-portal-v2`).
- Connectors, per-app collaborators, build logs streaming.
- Reusable/long-lived deploy tokens — replaced by the short-lived connect flow.
