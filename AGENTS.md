# AGENTS.md

## Tech Stack

- Runtime/package manager: Node.js, Yarn `1.22.22` (`packageManager` in `package.json`, `yarn.lock`), Nx `13.9.7`
- Node.js version: the `Dockerfile` (used by the dev, UAT and prod EKS deploy workflows and by `docker-compose.yml`) builds and runs on `node:20.19-bookworm`. `package.json` `engines` says `>=18.0.0`. `.nvmrc` says `18.19` and is out of date. CI (`ci-check-up.yml`) has no `setup-node` step, so it uses the default Node of the `ubuntu-24.04` runner image. Use Node 20.19 locally.
- Backend: NestJS `9.4.3` (`@nestjs/common`, `@nestjs/core`, `@nestjs/platform-express`)
- Frontend: Next.js `12.1.0` with React `17.0.2` (Pages Router, not App Router)
- Data layer: Prisma `4.4.0` + PostgreSQL, Redis (`cache-manager-redis-store`, Bull `4.x`); also MongoDB (`mongodb` driver) and OpenSearch (`@opensearch-project/opensearch`)
- Prisma schemas (two clients):
  - `apps/web-api/prisma/schema.prisma`: main Directory database (`DATABASE_URL`); client in `@prisma/client`; migrations in `apps/web-api/prisma/migrations`
  - `apps/web-api/prisma/oso-schema.prisma`: read-only models for the external OSO (Open Source Observer) metrics database (`OSO_DATABASE_URL`); client generated to `node_modules/.prisma/oso-client` and used by `OsoPrismaService` (`apps/web-api/src/shared/oso-prisma.service.ts`) and the `oso-metrics` module. It has no migrations in this repo.
  - Generate both clients after install or a schema change: `npx prisma generate --schema=apps/web-api/prisma/schema.prisma` and `npx prisma generate --schema=apps/web-api/prisma/oso-schema.prisma`. The `Dockerfile` and `heroku-postbuild` generate both; `ci-check-up.yml` generates only the main client.
- Language/testing: TypeScript `4.7.4` (locked; `^4.3.5` in `package.json`), Jest `27.2.3` with `ts-jest` `27.1.5`, `@types/node` `16.11.7`
- API/schema tooling: `@ts-rest/*` `3.19.3`, Zod `3.19.0`, `nestjs-zod`
- Observability/analytics: Sentry (`@sentry/nextjs`), OpenTelemetry, PostHog

## Directory Map

- `apps/web-api`: NestJS API service
- `apps/web-api/src`: domain modules (`members`, `teams`, `projects`, `deals`, etc.), controllers, services, guards, interceptors
- `apps/web-api/src/app.module.ts`: central Nest module composition and global middleware/interceptor/filter wiring
- `apps/web-api/prisma`: Prisma schemas (`schema.prisma`, `oso-schema.prisma`), migrations, seeds, fixtures
- `apps/web-api/src/scripts`: one-off `ts-node` scripts run through the `api:*` scripts in `package.json` (imports, seeds, backfills, exports)
- `apps/web-api/src/cli.ts`: `nest-commander` CLI entry (commands in `src/commands`; built by the `web-api:build-cli` target)
- `apps/web-api/docs`: API docs (data model, deployment guide, testing guidelines)
- `apps/web-api/cloudflare/workers`: Cloudflare Worker code (`web3-file-retrieval`)
- `apps/back-office`: Next.js admin app
- `apps/back-office/pages`: Next.js Pages Router routes (UI routes + `pages/api/*` endpoints)
- `apps/back-office/components`: shared UI components
- `apps/back-office/screens`: feature-level UI composition
- `apps/back-office/hooks`: React Query hooks and data access wrappers
- `apps/back-office/utils/services`: API client wrappers used by hooks/screens
- `apps/back-office-e2e`: Cypress end-to-end tests for back-office
- `libs/contracts`: shared contracts and schemas used across apps
- `libs/ui`: shared UI component library
- `libs/*/data-access`: shared typed data-access packages per domain (`funding-stages`, `industry-tags`, `locations`, `members`, `membership-sources`, `projects`, `shared`, `skills`, `teams`, `technologies`)
- `libs/airtable`: Airtable data models used by `web-api` (Airtable service and the `api:migrate-airtable-data` migration)
- `libs/storybook-host`: Storybook host project (`yarn build:storybook`)
- `docs/`: product and engineering docs (feature notes, deployment, guidelines, database schema)
- `lambda/`: AWS Lambda functions (`lambda-opensearch-sync`)
- `data-sync/`: SQL queries for the data sync tool
- `email-templates/`: email template JSON files
- `patches/`: `patch-package` patches applied on `postinstall`
- `tools/generators`: Nx workspace generators
- `workspace.json`: Nx project list (Nx 13 layout); each project has its own `project.json`

## Build, Lint, Test, Run

- Install: `yarn install`
- Start backend (dev): `yarn nx serve web-api`, or `yarn start:api` (same target with a larger Node stack and heap: `--stack-size=4000 --max-old-space-size=4096`). The API listens on `PORT` (default `3000`).
- Start frontend (dev): `yarn nx serve back-office`, or `yarn start:back-office` (port `4201`)
- Type-check backend: `yarn typecheck:api` (`tsc --noEmit` on `apps/web-api/tsconfig.build.json`)
- Lint backend: `yarn nx run web-api:lint`
- Lint frontend: `yarn nx run back-office:lint`
- Test backend: `yarn nx run web-api:test`
- Test frontend: `yarn nx run back-office:test`
- Build backend: `yarn nx build web-api`
- Build frontend: `yarn nx build back-office`
- Build (default project): `yarn build` runs `nx build` with a larger Node stack and heap; with no project name it builds `web-api` (`defaultProject` in `nx.json`). The `Dockerfile` uses this command.
- Sync local database to the main schema: `yarn api:prisma-sync` (`prisma generate` + `prisma db push` on `schema.prisma`; it does not create a migration file, so a schema change still needs a migration, see rule 14)
- Create a migration (dev): `yarn nx run web-api:migrate-dev` (`prisma migrate dev` on `schema.prisma`)
- Seed the database: `yarn nx run web-api:seed` (`apps/web-api/prisma/seed.ts`)
- Full local check: `yarn check:local` (`nx workspace-lint`, `nx format:check`, then `nx affected` lint, test with coverage, and build)
- Production start: `yarn start:prod` (runs `dist/apps/web-api/main`); `yarn start:migrate:prod` runs `prisma migrate deploy` first
- One-off scripts: `yarn api:<name>` (for example `api:seed-feed`, `api:backfill-ai-app-views`); see `package.json` for the full list

## Architecture Notes For Agents

- Prefer shared contracts/types from `libs/contracts` over redefining request/response shapes.
- Backend is modular by domain; keep new functionality inside an existing domain module or a new isolated module.
- Frontend data fetching should flow through `hooks/*` + `utils/services/*`, not directly in page components.
- Because this frontend is Next Pages Router, add routes under `pages/*` and API handlers under `pages/api/*`.

## Agent Rules

1. **[Shared]** Avoid `any` by default; allow `any` only for documented edge cases where a safe type is impractical or breaks required behavior.
2. **[Shared]** Keep domain boundaries intact: place code in the matching feature/module directory instead of cross-feature utility dumping.
3. **[Backend | NestJS]** Add new backend features as Nest modules (`*.module.ts`) with clear controller/service/provider separation.
4. **[Backend | NestJS]** Keep controllers thin; put business logic in services and data access in Prisma/repository layers.
5. **[Backend | NestJS]** Validate inputs at boundaries using DTO/schema validation; never trust raw request payloads.
6. **[Backend | NestJS]** Standardize failures with Nest exceptions (`BadRequestException`, `NotFoundException`, etc.); never throw plain strings.
7. **[Backend | NestJS]** Reuse existing guards/interceptors/filters for auth, metrics, caching, and error logging before adding new global behavior.
8. **[Frontend | NextJS]** Use the Next Pages Router convention (`apps/back-office/pages/**`); do not create App Router files (`app/**`) in this project.
9. **[Frontend | NextJS]** Put page-level composition in `screens/**`, reusable UI in `components/**`, and data hooks in `hooks/**`.
10. **[Frontend | NextJS]** Route API calls through `utils/services/**` and React Query hooks; avoid inline fetch logic in page components.
11. **[Frontend | NextJS]** Keep naming consistent: React components `PascalCase`, hooks `useXxx`, and service/query key files grouped by feature.
12. **[Frontend | NextJS]** Handle API errors explicitly in hooks/services and surface user-safe messages in UI; do not silently swallow failures.
13. **[Shared]** Do not duplicate constants/enums; extend feature `*.constants.ts` files or shared contracts instead.
14. **[Backend | Prisma]** Any schema change in `schema.prisma` must include a migration and regenerated Prisma client artifacts.
15. **[Frontend | NextJS]** Keep server-only secrets out of browser code; expose only explicit `NEXT_PUBLIC_*` variables when needed.
16. **[Backend | Domain naming]** Use module/entity names that match the persisted domain model. If the table/entity is `JobOpening`, use `job-openings` module/contracts/routes unless a migration/rename is explicitly in scope.
17. **[Backend | API routes]** Keep REST paths aligned with domain module names (for example, `/job-openings` for JobOpening resources). Avoid introducing parallel aliases unless backward compatibility is explicitly required.
18. **[Backend | API consistency]** Default list endpoints to `page` + `limit` query params and `{ page, limit, total, items }` responses. Use cursor pagination only when explicitly requested or when offset pagination is clearly unsuitable.
19. **[Backend | Grouped lists]** For grouped list endpoints, keep the same pagination envelope (`page`, `limit`, `total`) and use a domain-specific collection key (for example, `groups`) only when required by existing contracts.
20. **[Backend | Prisma/DB query design]** For joins, filtering, sorting, and pagination, evaluate DB-level execution first. Choose between Prisma relations/aggregations and application-layer processing per case, prioritizing correctness, readability, and scalability for expected data volume.
21. **[Backend | Prisma vs raw SQL]** Prefer Prisma query APIs over raw SQL. Use `queryRaw` only when Prisma cannot express the required query efficiently or clearly; if used, document why and keep SQL minimal and parameterized.
22. **[Backend | Prisma schema modeling]** When a feature depends on cross-entity filtering/sorting/grouping, consider explicit DB relations and indexes during design. If relation is intentionally omitted, document tradeoffs and expected scale limits in the PR description.

## Keep This File Current

When a PR changes the stack (runtime or framework versions, package manager, scripts, Prisma schemas, test or lint tooling, folder conventions), the same PR updates this file. The Horizon build agent follows this rule, and its review checks it. A weekly check compares this file with the code and opens a doc-only PR when they drift apart.
