# Layout Compositions

Layout compositions combine primitive layout patterns to create full-page structures. They describe how patterns fit together — not the components inside them.

**Rule:** Layout compositions define structure only. Instantiate canonical components inside each zone — do not create new visual components from scratch.

---

## Sidebar + Grid

**Purpose:** Filter sidebar on the left, card grid on the right.

**Use for:**
- Members directory (filter by focus area, skills, location)
- Teams directory
- Deals page
- Demo Day page
- Job Board

**Structure:**
```
[Header & Nav]
[Sidebar | Grid of cards]
[Pagination]
```

**Zones:**
- Header: canonical `Header & Nav`
- Sidebar: canonical `Sidebars & Bottom Sheets`
- Grid: canonical Card grid (Member Cards, Deals Cards, etc.)
- Pagination: canonical `Pagination`

**Mobile behavior:**
- Sidebar → bottom sheet (tap "Filters" button to open)
- Grid → single-column stack

---

## Sidebar + List

**Purpose:** Filter sidebar on the left, vertical list of items on the right.

**Use for:**
- Forum thread list
- Founder Guides article list
- Notifications list

**Structure:**
```
[Header & Nav]
[Sidebar | Vertical list of items]
[Pagination or load more]
```

**Zones:**
- Header: canonical `Header & Nav`
- Sidebar: canonical `Sidebars & Bottom Sheets`
- List items: canonical Card components in stack layout
- Pagination: canonical `Pagination`

---

## Centered Content

**Purpose:** Narrow centered content column. Used for articles, forms, and focused single-task views.

**Use for:**
- Founder Guide article reading view
- Forum post detail
- Onboarding flows
- Settings forms

**Structure:**
```
[Header & Nav]
[Centered container, max-width ~720–800px]
  Content
[Footer actions]
```

**Rules:**
- Max-width is set via layout token or CSS variable — not hardcoded `px`
- Do not extend centered content to full width

---

## Full Width

**Purpose:** Full-bleed content area. Used for home page, landing sections, and data dashboards.

**Use for:**
- Home page with featured sections
- Demo Day featured cohort
- Full-width data tables

**Structure:**
```
[Header & Nav]
[Full-width content sections]
```

**Rules:**
- Full-width sections can contain constrained inner content columns
- Do not use full-width for reading/detail views

---

## Split Content

**Purpose:** Two equal or proportional columns side by side.

**Use for:**
- Settings page (nav column + content column)
- Profile page (profile info + activity feed)
- Onboarding (instructions + form)

**Structure:**
```
[Left column] | [Right column]
```

**Rules:**
- Column widths use CSS Grid with `--spacing-*` gap tokens
- On mobile, split becomes stacked (top + bottom)
- Do not use Split for card grids — use the Grid pattern instead
