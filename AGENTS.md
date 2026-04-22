# AGENTS.md

## Tech Stack

- Runtime/package manager: Node.js `>=18.0.0`, Yarn `1.22.22`, Nx `13.9.7`
- Backend: NestJS `9.4.3` (`@nestjs/common`, `@nestjs/core`, `@nestjs/platform-express`)
- Frontend: Next.js `12.1.0` with React `17.0.2` (Pages Router, not App Router)
- Data layer: Prisma `4.4.0` + PostgreSQL, Redis (`cache-manager-redis-store`, Bull `4.x`)
- API/schema tooling: `@ts-rest/*` `3.19.3`, Zod `3.19.0`, `nestjs-zod`
- Observability/analytics: Sentry (`@sentry/nextjs`), OpenTelemetry, PostHog

## Directory Map

- `apps/web-api`: NestJS API service
- `apps/web-api/src`: domain modules (`members`, `teams`, `projects`, `deals`, etc.), controllers, services, guards, interceptors
- `apps/web-api/src/app.module.ts`: central Nest module composition and global middleware/interceptor/filter wiring
- `apps/web-api/prisma`: Prisma schema, migrations, seeds, fixtures
- `apps/back-office`: Next.js admin app
- `apps/back-office/pages`: Next.js Pages Router routes (UI routes + `pages/api/*` endpoints)
- `apps/back-office/components`: shared UI components
- `apps/back-office/screens`: feature-level UI composition
- `apps/back-office/hooks`: React Query hooks and data access wrappers
- `apps/back-office/utils/services`: API client wrappers used by hooks/screens
- `libs/contracts`: shared contracts and schemas used across apps
- `libs/ui`: shared UI component library
- `libs/*/data-access`: shared typed data-access packages per domain

## Build, Lint, Test, Run

- Install: `yarn install`
- Start backend (dev): `yarn nx serve web-api`
- Start frontend (dev): `yarn nx serve back-office`
- Lint backend: `yarn nx run web-api:lint`
- Lint frontend: `yarn nx run back-office:lint`
- Test backend: `yarn nx run web-api:test`
- Test frontend: `yarn nx run back-office:test`
- Build backend: `yarn nx build web-api`
- Build frontend: `yarn nx build back-office`

## Architecture Notes For Agents

- Prefer shared contracts/types from `libs/contracts` over redefining request/response shapes.
- Backend is modular by domain; keep new functionality inside an existing domain module or a new isolated module.
- Frontend data fetching should flow through `hooks/*` + `utils/services/*`, not directly in page components.
- Because this frontend is Next Pages Router, add routes under `pages/*` and API handlers under `pages/api/*`.

## Agent Rules

2. **[Shared]** Avoid `any` by default; allow `any` only for documented edge cases where a safe type is impractical or breaks required behavior.
3. **[Shared]** Keep domain boundaries intact: place code in the matching feature/module directory instead of cross-feature utility dumping.
4. **[Backend | NestJS]** Add new backend features as Nest modules (`*.module.ts`) with clear controller/service/provider separation.
5. **[Backend | NestJS]** Keep controllers thin; put business logic in services and data access in Prisma/repository layers.
6. **[Backend | NestJS]** Validate inputs at boundaries using DTO/schema validation; never trust raw request payloads.
7. **[Backend | NestJS]** Standardize failures with Nest exceptions (`BadRequestException`, `NotFoundException`, etc.); never throw plain strings.
8. **[Backend | NestJS]** Reuse existing guards/interceptors/filters for auth, metrics, caching, and error logging before adding new global behavior.
9. **[Frontend | NextJS]** Use the Next Pages Router convention (`apps/back-office/pages/**`); do not create App Router files (`app/**`) in this project.
10. **[Frontend | NextJS]** Put page-level composition in `screens/**`, reusable UI in `components/**`, and data hooks in `hooks/**`.
11. **[Frontend | NextJS]** Route API calls through `utils/services/**` and React Query hooks; avoid inline fetch logic in page components.
12. **[Frontend | NextJS]** Keep naming consistent: React components `PascalCase`, hooks `useXxx`, and service/query key files grouped by feature.
13. **[Frontend | NextJS]** Handle API errors explicitly in hooks/services and surface user-safe messages in UI; do not silently swallow failures.
14. **[Shared]** Do not duplicate constants/enums; extend feature `*.constants.ts` files or shared contracts instead.
15. **[Backend | Prisma]** Any schema change in `schema.prisma` must include a migration and regenerated Prisma client artifacts.
16. **[Frontend | NextJS]** Keep server-only secrets out of browser code; expose only explicit `NEXT_PUBLIC_*` variables when needed.
17. **[Backend | Domain naming]** Use module/entity names that match the persisted domain model. If the table/entity is `JobOpening`, use `job-openings` module/contracts/routes unless a migration/rename is explicitly in scope.
18. **[Backend | API routes]** Keep REST paths aligned with domain module names (for example, `/job-openings` for JobOpening resources). Avoid introducing parallel aliases unless backward compatibility is explicitly required.
19. **[Backend | API consistency]** Default list endpoints to `page` + `limit` query params and `{ page, limit, total, items }` responses. Use cursor pagination only when explicitly requested or when offset pagination is clearly unsuitable.
20. **[Backend | Grouped lists]** For grouped list endpoints, keep the same pagination envelope (`page`, `limit`, `total`) and use a domain-specific collection key (for example, `groups`) only when required by existing contracts.
21. **[Backend | Prisma/DB query design]** For joins, filtering, sorting, and pagination, evaluate DB-level execution first. Choose between Prisma relations/aggregations and application-layer processing per case, prioritizing correctness, readability, and scalability for expected data volume.
22. **[Backend | Prisma vs raw SQL]** Prefer Prisma query APIs over raw SQL. Use `queryRaw` only when Prisma cannot express the required query efficiently or clearly; if used, document why and keep SQL minimal and parameterized.
23. **[Backend | Prisma schema modeling]** When a feature depends on cross-entity filtering/sorting/grouping, consider explicit DB relations and indexes during design. If relation is intentionally omitted, document tradeoffs and expected scale limits in the PR description.
