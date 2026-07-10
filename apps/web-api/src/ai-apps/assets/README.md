# AI Apps starter-kit assets

## `pl-design-system/`

A curated copy of the **PL Design System**, embedded as normal files inside the
AI Apps starter kit (`AiAppsStarterKitService` walks this folder into the kit
ZIP — no nested zip for the agent to unpack). It contains:

- `components/` — React components (`.tsx` + SCSS modules + types) and the
  per-component specs in `components/primitives/` and `components/product/`
- `tokens/`, `styles/` — SCSS design tokens, global styles, mixins
- `public/fonts/` — self-hosted Inter variable font (`InterVariable.woff2` only)
- `patterns/`, `examples/` — layout patterns and page-level reference compositions
- `guidelines.md` — kit-specific design rules for agents (code-first)
- `USAGE.md` — how to consume the system in a Next.js 14 app (PLN-specific)

Kit overlays that are copied into the bundle (or live beside it):

- `USAGE.md` — consumption guide (also present inside `pl-design-system/`)
- `guidelines.kit.md` — source for the kit's `guidelines.md`

Registered as a build asset in `apps/web-api/project.json` so `nx build` copies
it to `dist/apps/web-api/ai-apps/assets/pl-design-system/`. Excluded from the
web-api TypeScript project (`tsconfig*.json`) so React/TSX files are not compiled
by the API build.

Excluded from the bundle: showcase Next.js app (`src/`), `mockups/`, `figma/`,
`node_modules`, agent skill folders from the DS repo (the kit ships one lean
`.claude/skills/pl-design-system` skill instead), `package-lock.json`, and the
TTF font (woff2 only).
