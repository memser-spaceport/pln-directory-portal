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
6. **[Backend | NestJS]** Add new backend features as Nest modules (`*.module.ts`) with clear controller/service/provider separation.
7. **[Backend | NestJS]** Keep controllers thin; put business logic in services and data access in Prisma/repository layers.
8. **[Backend | NestJS]** Validate inputs at boundaries using DTO/schema validation; never trust raw request payloads.
9. **[Backend | NestJS]** Standardize failures with Nest exceptions (`BadRequestException`, `NotFoundException`, etc.); never throw plain strings.
10. **[Backend | NestJS]** Reuse existing guards/interceptors/filters for auth, metrics, caching, and error logging before adding new global behavior.
11. **[Frontend | NextJS]** Use the Next Pages Router convention (`apps/back-office/pages/**`); do not create App Router files (`app/**`) in this project.
12. **[Frontend | NextJS]** Put page-level composition in `screens/**`, reusable UI in `components/**`, and data hooks in `hooks/**`.
13. **[Frontend | NextJS]** Route API calls through `utils/services/**` and React Query hooks; avoid inline fetch logic in page components.
14. **[Frontend | NextJS]** Keep naming consistent: React components `PascalCase`, hooks `useXxx`, and service/query key files grouped by feature.
15. **[Frontend | NextJS]** Handle API errors explicitly in hooks/services and surface user-safe messages in UI; do not silently swallow failures.
16. **[Shared]** Do not duplicate constants/enums; extend feature `*.constants.ts` files or shared contracts instead.
18. **[Backend | Prisma]** Any schema change in `schema.prisma` must include a migration and regenerated Prisma client artifacts.
19. **[Frontend | NextJS]** Keep server-only secrets out of browser code; expose only explicit `NEXT_PUBLIC_*` variables when needed.
