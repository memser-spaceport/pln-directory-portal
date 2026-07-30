# AI Apps starter-kit assets

## `pl-design-system/`

A curated copy of the **PL Design System** (from `pl-network-design-system` /
`@plnetwork/design-system`), embedded as normal files inside the AI Apps
starter kit (`AiAppsStarterKitService` walks this folder into the kit ZIP —
no nested zip for the agent to unpack). It contains:

- `components/` — React components (`.tsx`) using Tailwind semantic utilities,
  plus the public barrel `components/index.ts`
- `tokens/` — `tokens.css` (primitives + semantic roles), `tailwind-theme.css`
  (Tailwind v4 bridge), `tokens.ts` (typed JS mirror)
- `lib/cn.ts` — `tailwind-merge` class joiner
- `README.md` — designer foundations + page recipes
- `guidelines.md` — kit-specific design rules for agents (from `guidelines.kit.md`)
- `USAGE.md` — how to consume the system in a Next.js + Tailwind v4 app

Kit overlays that are copied into the bundle (or live beside it):

- `USAGE.md` — consumption guide (also present inside `pl-design-system/`)
- `guidelines.kit.md` — source for the kit's `guidelines.md`

Registered as a build asset in `apps/web-api/project.json` so `nx build` copies
it to `dist/apps/web-api/ai-apps/assets/pl-design-system/`. Excluded from the
web-api TypeScript project (`tsconfig*.json`) so React/TSX files are not compiled
by the API build.

Excluded from the bundle: Storybook (`.storybook/`, `foundations/`, `pages/`,
`*.stories.tsx`, `*.mdx`), `GAP-*.md`, `AUDIT.md`, `COVERAGE.md`, `package.json` /
lockfile, `vercel.json`, fixtures, and agent skill folders from the DS repo
(the kit ships one lean `.claude/skills/pl-design-system` skill instead).
No font files are bundled — agents load Inter via `next/font` or CDN.
