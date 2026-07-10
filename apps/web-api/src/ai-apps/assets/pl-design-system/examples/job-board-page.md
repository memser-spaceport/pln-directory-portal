# Job Board Page

Layout composition: Sidebar + Grid or Sidebar + List
Figma reference: Page Templates / Job Board
Status: TODO verify exact Figma page path via MCP

---

## Purpose

Browse and apply for jobs at PL network companies.

---

## Layout

```
Header & Nav (full width)
↓
[Job Board filter sidebar] | [Search bar + Job card grid/list]
                              [Pagination]
```

---

## Components used

| Element | Component |
|---|---|
| Header | `Header & Nav` |
| Sidebar | `Sidebars & Bottom Sheets` — Job Board filter variant |
| Search | `Regular Search Input` |
| Job cards | `Jobs Cards` |
| Tags | `Badges & Tags` |
| Apply button | `Button` (Fill, Brand) on card or detail |
| Pagination | `Pagination` |
| Empty state | `Empty` |

---

## Filter options

- Role type (Checkbox Group)
- Location (Dropdown)
- Compensation range (Slider / Range)
- Company (Dropdown or Search)
- Skills / tech stack (Checkbox Group)
