# Forum Main Page

Layout composition: Sidebar + List
Figma reference: Page Templates / Forum Main Page
Status: TODO verify exact Figma page path via MCP

---

## Purpose

The main forum listing page. Shows all discussion threads organized by category, with sorting, filtering, and pinned posts.

---

## Layout

```
Header & Nav (full width)
↓
[Category sidebar] | [Search + Create post button]
                     [Pinned posts list]
                     [Forum post list]
                     [Pagination]
```

---

## Components used

| Element | Component |
|---|---|
| Header | `Header & Nav` |
| Category nav | `Sidebars & Bottom Sheets` or `Tabs` |
| Search | `Regular Search Input` |
| Create post | `Button` (Fill, Brand) |
| Forum cards | `Forum Cards` |
| Pinned indicator | `Badges & Tags` (Pinned badge) |
| Pagination | `Pagination` |
| Empty state | `Empty` — No results variant |

---

## Rules

- Forum cards use canonical `Forum Cards` component
- Pinned post indicator uses a canonical badge — do not use a custom push-pin icon treatment
- Create post button is the only primary CTA on this view
