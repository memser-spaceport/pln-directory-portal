# Members Page (Member Directory)

Layout composition: Sidebar + Grid
Figma reference: Page Templates / Members Page
Status: TODO verify exact Figma page path via MCP

---

## Purpose

Browse and filter all members of the PL Network. Supports filtering by focus area, skills, availability, and location.

---

## Layout

```
Header & Nav (full width)
↓
[Directory filter sidebar] | [Search bar + Member card grid]
                              [Pagination]
```

---

## Components used

| Element | Component |
|---|---|
| Header | `Header & Nav` |
| Sidebar | `Sidebars & Bottom Sheets` — Directory filter variant |
| Search | `Regular Search Input` |
| Member cards | `Directory Member Cards` (from `Product Components / Cards`) |
| Tags in cards | `Badges & Tags` |
| Pagination | `Pagination` |
| Empty state | `Empty` — No results variant |
| Mobile sidebar | `Sidebars & Bottom Sheets` — Bottom Sheet on mobile |

---

## Filter options (sidebar)

- Focus Area (Checkbox Group)
- Skills (Checkbox Group or Dropdown)
- Location (Dropdown)
- Availability (Checkbox Group)
- Clear / Apply (Button)

---

## Rules

- Sidebar uses canonical Directory filter variant
- Cards use canonical Directory Member Cards — do not compose from Avatar + text divs
- Mobile: sidebar becomes bottom sheet, grid becomes single column
