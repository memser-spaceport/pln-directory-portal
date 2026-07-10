# PL Design System — Guidelines for AI Apps

## Core rule

**Instantiate canonical React components from `components/`. Never recreate them.**

Before generating any UI element, check `components/component-catalog.md` and the
matching folder under `components/`. If it exists, import and use it.

## Forbidden

- Hand-rolling buttons, cards, inputs, badges, modals, tabs, tables, dropdowns, or sidebars with raw HTML/CSS
- Hardcoding colors, typography, spacing, radius, or shadows — use token CSS variables
- Inventing component variants that are not in the catalog
- Using page examples (`examples/`) as a source to redraw a component — they are layout reference only
- Loud gradients, glow effects, heavy decorative shadows, or random accent colors

## Aesthetic

Structured · calm · technical · minimal. Researcher voice, not marketer. When in
doubt, choose the quieter option.

## Retrieval order

1. **Primitives** — `components/` + specs in `components/primitives/`
2. **Product / composites** — `components/` + specs in `components/product/`
3. **Layout patterns** — `patterns/`
4. **Page examples** — `examples/` (structure only)
5. **Tokens** — `tokens/` for layout glue only

## Missing component

If nothing in the inventory matches:

1. Prefer composing existing components + tokens.
2. If you still cannot build it without inventing a new primitive, stop and tell
   the member: `Missing canonical component: [name]`. Do not approximate a Button,
   Input, Badge, Table, Tabs, Dropdown, or card from scratch.

## Tokens

Components and custom layout must use Layer 3 CSS variables only, e.g.
`var(--foreground-neutral-primary)`, `var(--background-brand-default)`,
`var(--border-neutral-subtle)`, `var(--spacing-md)`, `var(--radius-md)`,
`var(--shadow-xs)`. Never `var(--global-color-*)` or raw hex in component styles.

## Surfaces

- **Cards** use elevation (`--shadow-xs` / `--shadow-sm`), not a border at rest.
- **Form controls** use `--border-*` tokens (and a focus ring on focus).
