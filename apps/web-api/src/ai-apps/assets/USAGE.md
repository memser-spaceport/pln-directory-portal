# Using the PL Design System

This folder is the **PL Design System** — the canonical React components and
design tokens for Protocol Labs Network apps. Use it instead of hand-rolling UI.
(It was shipped in the starter kit as `pl-design-system.zip`; you've unzipped it.)

- `components/` — React components (`.tsx` + SCSS modules + types). Primitives
  (Button, Input, Badge, Checkbox, Switch, Tabs, Tooltip, Dropdown, Pagination,
  Table, SearchInput, …) and product components (MemberCard, TeamCard, PageHeader,
  Sidebar, NavBar, EmptyState, …). See `components/component-catalog.md`.
- `components/primitives/*.md` and `components/product/*.md` — per-component specs.
- `tokens/` — SCSS files defining all design tokens as CSS custom properties.
- `styles/` — `globals.scss` (reset + token import + `@font-face`), `media.scss`
  (breakpoint mixins), `mixins.scss` (typography/layout helpers).
- `public/fonts/` — self-hosted Inter variable font.
- `patterns/`, `examples/` — layout patterns and page-level reference compositions.
- `guidelines.md` — **the rules** (retrieval order, token usage, what NOT to do).
  Read it before generating UI.

## Hard rules (from guidelines.md)
- **Never recreate** buttons, cards, inputs, badges, tables, tabs, dropdowns, or
  sidebars from raw HTML/CSS — import the component from `components/`.
- **Never hardcode** colors, typography, spacing, radius, or shadows — use the
  token CSS variables (`var(--background-brand-default)`, `var(--spacing-md)`,
  `var(--radius-md)`, etc.).
- The Protocol Labs aesthetic is structured · calm · technical · minimal. Avoid
  gradients, glow, heavy shadows, and random accent colors.

## Consuming it in your app (Next.js 14)
The components are React + SCSS CSS-modules built for Next.js 14. To ship them on
deploy (only the contents of `app/` are deployed), keep this folder **inside**
your app and import from it:

1. **Place this folder in your app**, e.g. `app/pl-design-system/` — keep the
   folder structure intact (component SCSS uses relative `@use '../../styles/…'`
   imports, so don't move individual files). These components are pre-validated;
   **exclude them from your app's TypeScript checking** so `next build` doesn't
   type-check vendored code — add the folder to `tsconfig.json`:
   ```jsonc
   { "exclude": ["node_modules", "pl-design-system"] }
   ```
2. **Install peer dependencies** in `app/`:
   ```bash
   npm install react react-dom next sass clsx @phosphor-icons/react framer-motion \
     @radix-ui/react-accordion @radix-ui/react-checkbox @radix-ui/react-dialog \
     @radix-ui/react-dropdown-menu @radix-ui/react-popover @radix-ui/react-select \
     @radix-ui/react-separator @radix-ui/react-slider @radix-ui/react-switch \
     @radix-ui/react-tabs @radix-ui/react-tooltip @radix-ui/react-progress \
     @radix-ui/react-context-menu @radix-ui/react-avatar
   ```
   (You only strictly need the Radix packages for the components you import, but
   installing all is simplest.)
3. **Load tokens + reset + font once, globally.** In your root layout
   (`app/app/layout.tsx` for the App Router) import the global stylesheet:
   ```tsx
   import '../pl-design-system/styles/globals.scss';
   ```
   This injects every token CSS variable, the base reset, and the Inter
   `@font-face`. Then copy `pl-design-system/public/fonts` to your app's
   `public/fonts` so the font resolves (it falls back to system fonts otherwise).
4. **Import components** from their folder (the barrel `components/index.ts` only
   re-exports a subset, so import from the component directory directly):
   ```tsx
   import { MemberCard } from '../pl-design-system/components/MemberCard';
   import { PageHeader } from '../pl-design-system/components/PageHeader';
   import { SearchInput } from '../pl-design-system/components/SearchInput';
   import { Table } from '../pl-design-system/components/Table';
   import { Pagination } from '../pl-design-system/components/Pagination';
   import { Tabs } from '../pl-design-system/components/Tabs';
   import { Badge } from '../pl-design-system/components/Badge';
   ```
   Interactive components already declare `"use client"` where needed.
5. **Use tokens for your own layout** (page padding, grid gaps): reference the
   CSS variables directly, e.g. `padding: var(--spacing-xl)`.

Remember the deploy contract from `AGENTS.md`: bind `0.0.0.0`, listen on `$PORT`,
serve `GET /health` (200), and stay iframe-embeddable from `*.plnetwork.io`.
The `next start` CLI does **not** read `$PORT` on its own — pass it explicitly in
your start script: `"start": "next start -p ${PORT:-3000} -H 0.0.0.0"` (a
standalone Docker build running `node server.js` does honor `PORT`/`HOSTNAME`).
Add a `GET /health` route (e.g. `app/health/route.ts`) and don't set
`X-Frame-Options`.
