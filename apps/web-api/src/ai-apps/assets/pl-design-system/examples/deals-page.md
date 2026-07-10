# Deals Main Page

Layout composition: Sidebar + Grid
Figma reference: Page Templates / Deals Main Page
Status: TODO verify exact Figma page path via MCP

---

## Purpose

Browse and filter investment deals in the PL ecosystem.

---

## Layout

```
Header & Nav (full width)
↓
[Deals filter sidebar] | [Search bar + Deals card grid]
                          [Pagination]
```

---

## Components used

| Element | Component |
|---|---|
| Header | `Header & Nav` |
| Sidebar | `Sidebars & Bottom Sheets` — Deals filter variant |
| Search | `Regular Search Input` |
| Deals cards | `Deals Cards` |
| Tags | `Badges & Tags` |
| Pagination | `Pagination` |
| Empty state | `Empty` |

---

## Filter options

- Stage (Checkbox Group)
- Sector / category (Checkbox Group or Dropdown)
- Region (Dropdown)
- Amount range (Slider / Range)
