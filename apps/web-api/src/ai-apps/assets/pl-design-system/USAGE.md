# Using the PL Design System

This folder is the **PL Design System** — React components and semantic design
tokens for Protocol Labs Network apps. Use it instead of hand-rolling UI.

- `components/` — React components (Tailwind utilities). Import from the barrel
  (`components/index.ts`) or a specific file.
- `tokens/` — CSS custom properties (`tokens.css`) + Tailwind v4 theme bridge
  (`tailwind-theme.css`) + typed JS mirror (`tokens.ts`).
- `lib/cn.ts` — class joiner (`tailwind-merge`).
- `guidelines.md` — hard rules. Read before generating UI.
- `README.md` — foundations, component table, and full page-recipe snippets.

## Hard rules

- **Never recreate** buttons, cards, inputs, badges, tables, tabs, menus, or
  page shells — import from `components/`.
- **Semantic tokens only.** Use classes like `bg-surface`, `text-secondary`,
  `border-border`, `shadow-card`. Never primitives (`bg-pl-slate-*`), raw hex,
  or Tailwind palette utilities (`slate-*`, `bg-white`).
- Prefer `EntityCard` for listings. Tag = category; Badge = fact about an entity.
- Aesthetic: structured · calm · technical · minimal.

## Consuming it in your app (Next.js + Tailwind v4)

Only the contents of `app/` are deployed. Keep this folder **inside** the app:

1. **Copy this folder into the app**, e.g. `app/pl-design-system/`.
2. **Install peer dependencies** in `app/`:
   ```bash
   npm install react react-dom next tailwindcss@^4 @tailwindcss/postcss tailwind-merge
   ```
3. **Wire PostCSS** (`postcss.config.mjs`):
   ```js
   export default { plugins: { '@tailwindcss/postcss': {} } };
   ```
4. **Load Tailwind + tokens once.** In the App Router root CSS (e.g. `app/globals.css`):
   ```css
   @import "tailwindcss";
   @source "../pl-design-system/components";
   @import "../pl-design-system/tokens/tokens.css";
   @import "../pl-design-system/tokens/tailwind-theme.css";
   ```
   `@source` is required so utilities used inside vendored components are generated.
5. **Load Inter** (the design system expects it; no font files are bundled):
   ```tsx
   // app/layout.tsx
   import { Inter } from 'next/font/google';
   const inter = Inter({ subsets: ['latin'] });
   // apply inter.className on <body>
   ```
6. **Import components** from the barrel (or a specific file):
   ```tsx
   import {
     Button,
     EntityCard,
     PageShell,
     PageHeader,
     ListGrid,
     TagList,
   } from '../pl-design-system/components';
   ```
7. **Layout glue** uses semantic utilities, e.g. `className="bg-canvas text-primary gap-4"`.

Page shapes: see `guidelines.md` and the recipes in `README.md` (list / detail / campaign).

## Deploy contract reminders

Bind `0.0.0.0`, listen on `$PORT`, serve `GET /health` (200), stay iframe-embeddable
from `*.plnetwork.io`. For Next.js:

```json
"start": "next start -p ${PORT:-3000} -H 0.0.0.0"
```

Add `GET /health` (e.g. `app/health/route.ts`). Do not send `X-Frame-Options`.
