# PL Network Directory — Design System

> **AI Apps kit note:** this folder is vendored into your app as
> `app/pl-design-system/`. Prefer `USAGE.md` + `guidelines.md` for wiring.
> Import relatively from `../pl-design-system/components` — not the npm package
> name. Storybook, AUDIT, and GAP docs are not shipped in the kit.

A token set and component library for building PL Network apps — React +
Tailwind v4, semantic tokens only.

```
tokens/tokens.css          canonical tokens — primitives + semantic roles
tokens/tailwind-theme.css  Tailwind v4 bridge + base layer fixes
tokens/tokens.ts           the same values, typed, for JS consumers
components/                the component library
lib/cn.ts                  class joiner with Tailwind conflict resolution
```

## Setup (vendor copy)

```css
/* app/globals.css */
@import "tailwindcss";
@source "../pl-design-system/components";
@import "../pl-design-system/tokens/tokens.css";
@import "../pl-design-system/tokens/tailwind-theme.css";
```

```tsx
import {
  PageShell,
  PageHeader,
  ListGrid,
  EntityCard,
  Tag,
} from '../pl-design-system/components';
```

## The one rule

**Components consume semantic tokens. Never primitives, never raw values.**

```tsx
<div className="bg-surface text-secondary border-border" />   // yes
<div className="bg-white text-[#475569] border-slate-300" />  // no
<div className="bg-pl-slate-100" />                           // no — primitives aren't exposed
```

Primitives (`--pl-blue-600`, `--pl-slate-300`) exist only so semantic tokens
have something to point at. They are deliberately absent from the Tailwind
theme, so the mistake is hard to make. If you need a colour that no semantic
token covers, that is a gap in the system — add the role, don't reach past it.

## Foundations

**Colour.** Light, slate-tinted UI. The page is `bg-canvas` (slate-100); cards
sit on it as `bg-surface` (white). Brand blue `#1B4DFF` is for primary actions;
`#156FF7` is the link/interactive blue. Slate is the only neutral ramp.

**Type.** Inter throughout. Body default is `text-base` (14px) — note that this
is 14px, not the Tailwind default of 16px, because the product is a dense
directory. Card titles are `text-lg` (18px) semibold. The product tightens
tracking at every size: `tracking-body` (-0.2px) on text, `tracking-title`
(-0.4px) on headings. Weights are 400/500/600 only.

**Space.** 4px grid. `gap-2` (8px) inside a component, `gap-4` (16px) between
cards, `gap-6` (24px) between page regions.

**Radius.** `rounded-md` (6px) controls, `rounded-lg` (8px) cards and inputs,
`rounded-pill` chips.

**Elevation.** Two shadows. `shadow-card` for resting cards, `shadow-raised` on
hover or for popovers. There is no third elevation — if you want one, you
probably want a border.

## Components

| Component | Use |
| --- | --- |
| `Button` | All actions. `primary` \| `secondary` \| `ghost` \| `danger`, `sm` \| `md` |
| `IconButton` | Icon-only actions. `label` is required and becomes the accessible name |
| `EntityCard` | The workhorse listing — teams, projects, members, jobs, demo-day entries |
| `Card` / `MetaRow` | Bare surface, and the dot-separated meta line |
| `Tag` / `TagList` | Category labels; `TagList` computes `+N` overflow |
| `Badge` / `StatusDot` | Counts and status. Badge states a fact; Tag is a category |
| `Avatar` / `AvatarStack` | Entity images, with initial fallback and `+N` remainder |
| `SearchInput` | Global and local search, with accessible clear |
| `PageShell` / `PageHeader` / `ListGrid` | The page frame, header, and responsive grid |
| `EmptyState` / `SkeletonCard` | No-results and loading |

**Tag vs Badge** is the distinction people get wrong: a Tag is a *category*
(often filterable, user-navigable); a Badge is a *fact about this entity*
(a count, a state). "DeSci" is a Tag. "4 updates" is a Badge.

## Page recipes

Every captured page is one of three shapes. Build new pages by picking one.

### 1. List view — `/teams`, `/jobs`, `/projects`

Filter rail on the left, searchable card grid on the right.

```tsx
<PageShell navbar={<Navbar />} sidebar={<FilterPanel />}>
  <PageHeader
    title="Teams"
    count={teams.length}
    actions={<Button variant="primary">Add team</Button>}
  />
  <SearchInput value={query} onChange={onChange} onClear={clear} containerClassName="mb-4" />

  {loading ? (
    <ListGrid>{Array.from({ length: 6 }, (_, i) => <SkeletonCard key={i} />)}</ListGrid>
  ) : teams.length === 0 ? (
    <EmptyState
      title="No teams match your filters"
      description="Try removing a filter or broadening your search."
      action={<Button onClick={reset}>Clear filters</Button>}
    />
  ) : (
    <ListGrid>
      {teams.map((team) => (
        <EntityCard
          key={team.id}
          title={team.name}
          href={`/teams/${team.id}`}
          description={team.shortDescription}
          logoSrc={team.logo}
          badge={team.updateCount ? `${team.updateCount} updates` : undefined}
          action={<Button size="sm" variant="ghost">Follow</Button>}
          tags={<TagList tags={team.focusAreas} max={2} />}
        />
      ))}
    </ListGrid>
  )}
</PageShell>
```

### 2. Detail view — `/teams/:id`, `/members/:id`, `/projects/:id`

Hero, then stacked sections.

```tsx
<PageShell navbar={<Navbar />}>
  <Card className="mb-6">
    <div className="flex items-start gap-4">
      <Avatar src={team.logo} name={team.name} size="lg" />
      <div className="min-w-0 flex-1">
        <h1 className="text-2xl font-semibold text-primary tracking-title">{team.name}</h1>
        <MetaRow items={[team.location, `${team.memberCount} members`, team.website]} />
        <TagList tags={team.focusAreas} max={6} className="mt-3" />
      </div>
      <Button variant="primary">Follow</Button>
    </div>
  </Card>

  <section className="mb-6">
    <PageHeader title="Members" count={members.length} />
    <ListGrid>{/* EntityCard per member */}</ListGrid>
  </section>
</PageShell>
```

### 3. Campaign view — `/demoday`, `/demoday/:event/completed`

Marketing-shaped: hero, feature grid, CTA, footer. Wider type scale
(`text-3xl` hero), centred layout, no sidebar. Use the same `EntityCard` for
participating teams — do not fork a second card component for it.

## Extending

1. **Adding a colour** — that is a gap; tell the member rather than inventing hex.
2. **Adding a component** — check `EntityCard` first. Variants beat new components.
3. **Adding a page** — start from a recipe. If your page fits none of the
   three, that is worth a conversation before it becomes a fourth shape.
