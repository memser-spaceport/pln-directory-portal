# PL Design System — Guidelines for AI Apps

## The one rule

**Components consume semantic tokens. Never primitives, never raw values.**

```tsx
<div className="bg-surface text-secondary border-border" />   // yes
<div className="bg-white text-[#475569] border-slate-300" />  // no
<div className="bg-pl-slate-100" />                           // no — primitives aren't for app code
```

If you need a colour no semantic token covers, that is a gap — compose with
existing roles or tell the member. Do not invent hex or reach for `--pl-*`
primitives in app styles.

## Core rule (components)

**Instantiate canonical React components from `components/`. Never recreate them.**

Before generating any UI element, check `components/index.ts` and the matching
file under `components/`. If it exists, import and use it.

Prefer `EntityCard` for directory-style listings (teams, members, jobs, projects).
Do not invent a second card component for a new page.

**Tag vs Badge:** a Tag is a *category* (often filterable); a Badge is a *fact
about this entity* (a count, a state). "DeSci" is a Tag. "4 updates" is a Badge.

## Forbidden

- Hand-rolling buttons, cards, inputs, badges, modals, tabs, tables, menus, or
  page shells with raw HTML/CSS
- Hardcoding colors, typography, spacing, radius, or shadows
- Using Tailwind palette utilities (`slate-*`, `gray-*`, `blue-*`) or raw hex
- Using `--pl-*` primitives in app/layout styles
- Inventing component variants that are not in the library
- Loud gradients, glow effects, heavy decorative shadows, or random accent colors

## Aesthetic

Structured · calm · technical · minimal. Researcher voice, not marketer. When in
doubt, choose the quieter option.

## Page recipes

Every directory-shaped page is one of three shapes. Pick one; do not invent a
fourth without asking the member. Full snippets live in `README.md`.

1. **List view** — filter rail + searchable card grid (`PageShell` + `FilterPanel`
   + `PageHeader` + `SearchInput` + `ListGrid` + `EntityCard` / `SkeletonCard` /
   `EmptyState`).
2. **Detail view** — hero card then stacked sections (`PageShell` + `Card` /
   `Avatar` / `MetaRow` / `TagList` + `PageHeader` + section grids).
3. **Campaign view** — marketing-shaped hero + feature grid + CTA; reuse
   `EntityCard` for participating entities (no forked card).

## Retrieval order

1. **Components** — `components/` (+ barrel `components/index.ts`)
2. **Page recipes** — `README.md`
3. **Tokens** — semantic Tailwind utilities from `tokens/tailwind-theme.css`
   (layout glue only)

## Missing component

If nothing in the inventory matches:

1. Prefer composing existing components + semantic tokens.
2. If you still cannot build it without inventing a new primitive, stop and tell
   the member: `Missing canonical component: [name]`. Do not approximate a Button,
   Input, Badge, Table, Tabs, Menu, or card from scratch.

## Foundations (quick)

- Canvas `bg-canvas`, cards `bg-surface`; brand action blue; link blue separate
- Inter; body `text-base` is **14px** (dense directory); weights 400/500/600
- 4px grid; `gap-2` in-component, `gap-4` between cards, `gap-6` between regions
- Radius: `rounded-md` controls, `rounded-lg` cards/inputs, `rounded-pill` chips
- Elevation: `shadow-card` resting, `shadow-raised` hover/popovers — no third elevation
