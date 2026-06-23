# AI Apps (PL Infra)

> Status: **POC / happy-path only.** Lives under the PL Infra navigation hub.

PLN members "vibe-code" a small web app locally with an AI assistant (Claude Code, Cursor, …) and have the agent deploy it to the PLN **sandbox runner**. The backend tracks every app and its deploy status so PL Infra users can browse and open the live apps from a dashboard (UI built later, in `pln-directory-portal-v2`).

## User flow

1. A member with `ai_apps.write` opens the AI Apps dashboard and downloads the **starter kit** ZIP.
2. They unzip it into their AI coding tool and describe what to build. The agent edits files under `app/`.
3. When ready, the member says "deploy". The agent reads `pln-app.config.json`, packages `app/`, and POSTs to our deploy endpoint with the deploy token.
4. The backend proxies the deploy to the sandbox runner, stores the result, and the app shows up on the dashboard with its live URL.

## Architecture

```
Member's AI agent                 web-api (/v1/ai-apps)                S3 + Sandbox runner
─────────────────                 ─────────────────────               ───────────────────
GET  /starter-kit/download  ──►  RBAC ai_apps.write
                                 ensure AiAppToken (per member)
                            ◄──  ZIP (instructions, token, styles, app/)

POST /deploy (multipart)    ──►  AiAppTokenGuard (x-app-token)
  x-app-token: <token>           upsert AiApp (status=DEPLOYING)
  file=app.zip + metadata        upload app.zip ──────────────────►  s3://<bucket>/apps/<appId>/<deploymentId>/app.zip
                                 POST /deploy ────────────────────►  pull from S3, build + run
                                   x-runner-token: <server secret>
                                 store url/host/port (status=READY) ◄── { url, host, port }
                            ◄──  AiApp record

GET  /            ──► RBAC ai_apps.read ── list all apps (dashboard)
GET  /:uid        ──► RBAC ai_apps.read ── single app
```

The agent only ever holds its personal deploy token — it ships the app ZIP to us and we handle the rest. **AWS credentials and the runner token both stay server-side**: the backend uploads the ZIP to S3 (reusing `AwsService`, the same uploader as member images) and calls the runner. The S3 key is derived as `apps/<appId>/<deploymentId>/app.zip`, and the app is served at `https://sandbox-<appId>.plnetwork.io`.

## Endpoints

| Method | Path                              | Auth                         | Permission        | Purpose |
|--------|-----------------------------------|------------------------------|-------------------|---------|
| GET    | `/v1/ai-apps`                     | `UserTokenCheckGuard`+`RbacGuard` | `ai_apps.read`/`write` | List all apps with owner + status |
| GET    | `/v1/ai-apps/:uid`               | `UserTokenCheckGuard`+`RbacGuard` | `ai_apps.read`/`write` | Single app detail |
| GET    | `/v1/ai-apps/starter-kit/download` | `UserTokenCheckGuard`+`RbacGuard` | `ai_apps.write`   | Stream the starter-kit ZIP (creates token on first use) |
| POST   | `/v1/ai-apps/deploy`              | `AiAppTokenGuard` (`x-app-token`) | — (token = member) | Upload app ZIP → S3 → sandbox runner |

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

## Data model

```prisma
enum AiAppStatus { IN_DEVELOPMENT  DEPLOYING  READY  ERROR }

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

model AiAppToken {            // reusable per-member deploy token, bundled in the kit
  memberUid  String @unique
  token      String @unique
  lastUsedAt DateTime?
  revokedAt  DateTime?
}
```

Apps are **lazy-created on first deploy** — there is no registration form.

## RBAC

- `ai_apps.read` — view the dashboard (list/detail).
- `ai_apps.write` — download the starter kit and deploy.

Both are seeded in migration `20260623120000_ai_apps` and attached to the **PL Infra Team** policy (`pl_infra_team_pl_internal`), and registered in `access-control-v2.constants.ts` + `access-control-v2.seed.ts`.

## Starter kit ZIP

Built in-memory by `AiAppsStarterKitService`:

```
README.md                                human quick-start
CLAUDE.md / AGENTS.md                    agent build + deploy instructions
.claude/skills/deploy-to-labs/SKILL.md   the deploy skill for the agent
pln-app.config.json                      deploy token + endpoint (+ appId slot)
styles/pln-theme.css                     PLN design tokens (CSS variables)
styles/FONTS.md                          Inter font guidance
app/                                     minimal runnable Node/Express scaffold
```

The kit deliberately exposes **no internal PLN APIs** — only the deploy endpoint.

## Configuration (env)

| Var | Default | Notes |
|-----|---------|-------|
| `AI_APPS_RUNNER_URL` | `https://sandbox-runner.plnetwork.io` | Sandbox runner base URL |
| `AI_APPS_RUNNER_TOKEN` | _(empty)_ | **Required** for real deploys; `x-runner-token` to the runner |
| `AI_APPS_S3_BUCKET` | _(empty)_ | **Required** for real deploys; bucket the runner reads app bundles from (e.g. `sandbox-apps-pln-dev-013228333448`) |
| `AI_APPS_DEPLOY_ENDPOINT` | `https://api.plnetwork.io/v1/ai-apps/deploy` | Written into the kit so the agent knows where to POST |

S3 uploads reuse the shared `AwsService`, so the standard `AWS_REGION` / `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` credentials must also be present.

## Code map

- `apps/web-api/src/ai-apps/` — module, controller, services, guard, DTO, constants.
- `apps/web-api/prisma/schema.prisma` — `AiApp`, `AiAppToken`, `AiAppStatus`.
- `apps/web-api/prisma/migrations/20260623120000_ai_apps/` — tables + permission seed.
- `.claude/skills/ai-apps/SKILL.md` — agent guidance for working on this feature.

## Out of scope (POC)

- The dashboard UI (built later in `pln-directory-portal-v2`).
- Token rotation UI, connectors, per-app collaborators, build logs streaming.
