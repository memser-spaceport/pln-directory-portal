# Using the PL Design System

This folder is the **PL Design System** — canonical React components and design
tokens for Protocol Labs Network apps. Use it instead of hand-rolling UI.

- `components/` — React components (`.tsx` + SCSS modules + types). See
  `components/component-catalog.md`. Specs live in `components/primitives/` and
  `components/product/`.
- `tokens/` — SCSS → CSS custom properties (colors, type, spacing, radius, shadows).
- `styles/` — `globals.scss` (reset + tokens + `@font-face`), `media.scss`, `mixins.scss`.
- `public/fonts/` — self-hosted Inter variable font (`InterVariable.woff2`).
- `patterns/`, `examples/` — layout patterns and page-level reference compositions.
- `guidelines.md` — hard rules. Read before generating UI.

## Hard rules

- **Never recreate** buttons, cards, inputs, badges, tables, tabs, dropdowns, or
  sidebars — import from `components/`.
- **Never hardcode** colors, type, spacing, radius, or shadows — use tokens
  (`var(--background-brand-default)`, `var(--spacing-md)`, `var(--radius-md)`, …).
- Aesthetic: structured · calm · technical · minimal. Avoid gradients, glow, and
  heavy decorative shadows.

## Consuming it in your app (Next.js 14)

Only the contents of `app/` are deployed. Keep this folder **inside** the app:

1. **Copy this folder into the app**, e.g. `app/pl-design-system/` — keep the
   structure intact (SCSS uses relative `@use '../../styles/…'`). Exclude it from
   TypeScript checking:
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
3. **Load tokens + reset + font once.** In the App Router root layout:
   ```tsx
   import '../pl-design-system/styles/globals.scss';
   ```
   Copy `pl-design-system/public/fonts` to the app's `public/fonts` so Inter resolves.
4. **Import components** from their folder (the barrel re-exports only a subset):
   ```tsx
   import { MemberCard } from '../pl-design-system/components/MemberCard';
   import { PageHeader } from '../pl-design-system/components/PageHeader';
   import { Button } from '../pl-design-system/components/Button';
   ```
5. **Layout glue** uses tokens directly, e.g. `padding: var(--spacing-xl)`.

## Deploy contract reminders

Bind `0.0.0.0`, listen on `$PORT`, serve `GET /health` (200), stay iframe-embeddable
from `*.plnetwork.io`. For Next.js:

```json
"start": "next start -p ${PORT:-3000} -H 0.0.0.0"
```

Add `GET /health` (e.g. `app/health/route.ts`). Do not send `X-Frame-Options`.
