# Context Menu

Canonical Figma path: `Primitive Components / Context Menu`
Status: TODO verify exact variant names via MCP

---

## Purpose

A floating list of contextual actions triggered by right-click or a trigger button (e.g., "..." ellipsis icon). Used for row actions in tables, card action menus, and inline content menus.

---

## Anatomy

- Menu container (floating)
- Menu items (text + optional icon)
- Separators (dividers between action groups)
- Nested submenu (optional)
- Destructive item (visually distinct, at end of list)

---

## Rules

- Destructive actions (Delete, Remove, Leave) must:
  - Be visually separated from other actions with a separator
  - Use destructive/error color treatment
  - Appear at the bottom of the menu
- Do not nest more than 2 levels of submenus
- Do not use context menus for primary navigation
- Trigger buttons for context menus must use the canonical Icon Button

---

## AI instruction

Instantiate from `Primitive Components / Context Menu` in the Figma library. If unavailable:
```
Missing canonical component: Context Menu
```
