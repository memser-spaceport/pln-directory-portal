# Sidebars & Drawers

Canonical Figma path: `Product Components / Sidebars & Bottom Sheets`
Status: TODO verify exact variant names via MCP

---

## Purpose

Filter panels and secondary navigation for directory, deals, demo day, and job board pages. On desktop these are persistent sidebars; on mobile they become bottom sheets (slide-up panels).

---

## Context variants

| Variant | Page | Filters |
|---|---|---|
| Directory filter | Members / Teams directory | Focus area, skills, location, availability |
| Demo Day filter | Demo Day | Cohort, category, stage |
| Deals filter | Deals | Stage, sector, region, amount |
| Job Board filter | Job Board | Role type, location, compensation, company |
| Founder Guides | Founder Guides | Category, topic, read time |

---

## Platform variants

| Platform | Component |
|---|---|
| Desktop | Persistent left sidebar |
| Mobile | Bottom sheet (swipe up to reveal) |

---

## Anatomy

- Section label (group header)
- Filter controls (Checkbox Group, Dropdown, Slider, Date Picker)
- Clear filters button
- Apply filters button (on mobile bottom sheet)
- Collapse/expand toggle (desktop)

---

## Rules

- Desktop: sidebar is persistent and visible alongside content
- Mobile: sidebar becomes a bottom sheet — use `Primitive Components / Drawer` (bottom position)
- Clear button uses `Style=Light` or `Style=Border` Button — not a destructive style
- Apply button uses `Style=Fill` Button
- Filter controls inside sidebars must use canonical Checkbox Group, Dropdown, and Slider components
- Do not compose a sidebar from raw `<aside>` + custom CSS layout

---

## AI instruction

Instantiate from `Product Components / Sidebars & Bottom Sheets` in the Figma library. If unavailable:
```
Missing canonical component: Sidebars & Bottom Sheets
```
