# Layout Patterns

Layout patterns define structural arrangements for content. They are not components — they are containers that hold canonical components.

**Rule:** Layout patterns define structure only. Always instantiate canonical components inside patterns — do not invent new visual components within a layout pattern.

---

## Stack / Vertical Flow

**Purpose:** Linear vertical arrangement of elements. The default single-column layout.

**Use for:**
- Article/post content
- Profile detail sections
- Settings pages
- Notification feeds
- Any sequential, top-to-bottom content

**Structure:**
```
Header
↓
Content block
↓
Content block
↓
Footer / Actions
```

**Rules:**
- Spacing between stack items uses `--spacing-*` tokens — never hardcoded margin
- Stack is the fallback layout when no other pattern applies
- Do not add decorative dividers between stack items unless Figma confirms it

---

## Grid

**Purpose:** Multi-column arrangement of card or item components.

**Use for:**
- Member directory listings
- Team directory listings
- Deals page
- Demo Day page
- Job Board

**Structure:**
- Desktop: typically 3–4 columns
- Tablet: 2 columns
- Mobile: 1 column (single stack)

**Rules:**
- Grid column count uses CSS Grid or Flexbox with `--spacing-*` gap tokens
- Grid items are canonical Card components — do not compose raw card-like divs
- Column breakpoints use `$breakpoints` from the token system (`styles/media.scss`)

---

## Sidebar

**Purpose:** Fixed left side panel (filter/navigation) + main content area.

**Use for:**
- Directory with filters (Members, Teams)
- Deals with filters
- Job Board with filters
- Demo Day with filters
- Founder Guides with category navigation

**Structure:**
```
[Sidebar (fixed width)] | [Main content area (flex-grow)]
```

**Rules:**
- Sidebar content uses the canonical `Sidebars & Bottom Sheets` product component
- Main content can be Grid or Stack
- On mobile, sidebar collapses and becomes a bottom sheet overlay
- Do not use generic `<aside>` + custom CSS — use the canonical sidebar component

---

## Detail / Single Focus

**Purpose:** Centered, single-item detail view. Used for profile pages, single post views, article pages.

**Use for:**
- Member profile page
- Team profile page
- Forum post detail
- Job listing detail
- Founder Guide article

**Structure:**
```
[Centered content container, constrained max-width]
  Hero section
  Content sections
  Related / recommendations (optional)
```

**Rules:**
- Max-width of content container uses `--spacing-*` or layout tokens
- Hero section uses canonical components (MemberProfileCard, TeamCard hero, etc.)
- Related content at bottom uses canonical card grid
