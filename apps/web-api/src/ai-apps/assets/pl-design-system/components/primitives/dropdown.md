# Dropdown Component

Figma page: `❖ Dropdown`
Page ID: `1158:20441`
Frames:
- `14587:127686` — "Dropdown" (trigger display)
- `23042:245240` — "_dropdown input" (text field portion)
- `14545:73352` — "_BaseDropdownListItem" (menu item)
- `14930:38486` — "Divider" (menu separator)
- `14545:74014` — "Keyboard Shortcut"
Canonical path: `Primitive Components / Dropdown`
Status: **✅ Verified** — MCP inspection confirmed full variant matrix

---

## Purpose

Dropdowns allow users to select options, filter content, switch contexts, and access role/workspace selection.

---

## Sub-components

### Dropdown (trigger row)

The full trigger control (label + icon or avatar).

**Variants:**
| Value | Use case |
|---|---|
| `Basic` | Simple text select |
| `Select team` | Team with logo avatar |
| `Multiple Team Selection` | Multi-select with team logos |
| `Select Company` | Company with logo |
| `Payment Method` | Payment icon + label |
| `Country` | Flag + country name |
| `Action` | Icon-only action trigger (40×40px) |
| `Profile` | Avatar-based user menu trigger (56–60px) |

**State**: Default, Open, Filled

---

### _dropdown input (text field)

The text input variant with dropdown affordance.

**Type:**
- `Icon` — prefixed icon
- `Avatar` — prefixed avatar
- `Payment` — payment method icon
- `Tag` — multi-value tag chips

**Size**: Large (76px h), Medium (68px h), Small (64px h)
**State**: Default, Hover, Focus, Filled

---

### _BaseDropdownListItem (menu row)

Individual selectable option inside the dropdown panel.

**Type**: Basic, With Helper Text
**State**: Default, Hover, Disable

---

### Divider (menu separator)

Use inside dropdown menus to group actions.

**Type**: Line, Dash Line, Line with Text on Middle, Line with button, Line with Text on Left, Text divider, Text Divider with Background

---

## Usage

Use Dropdown for:
- Role selection
- Workspace / team switching
- Country / payment selection
- Context menus (use Context Menu component for right-click patterns)
- Navigation overflow menus

---

## Rules

1. Use the correct Dropdown Variant that matches the content type (e.g., `Select Company` for organization pickers)
2. Group related actions with Dividers
3. Use `With Helper Text` list items when extra description is needed
4. Keep menus compact — avoid more than 8–10 items without search
5. For large lists, support search within the dropdown

---

## AI Instructions

- Always instantiate from Figma library: `Primitive Components / Dropdown`
- Use `_dropdown input` for the text field portion
- Use `_BaseDropdownListItem` for menu items
- Use Divider sub-component for separators — never draw custom lines
- Never create custom dropdown styling
