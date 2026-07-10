# Tabs Component

Figma page: `❖ Tabs`
Page ID: `1333:24058`
Frame 1: `14998:31094` — "Tabs" (assembled bar)
Frame 2: `14996:29795` — "_BaseTabitem" (individual tab)
Canonical path: `Primitive Components / Tabs`
Status: **✅ Verified** — MCP inspection confirmed full variant matrix

---

## Purpose

Tabs organize related content sections, feeds, categories, and navigation contexts within a single view.

---

## Sub-components

### Tabs (assembled tab bar)

Pre-assembled tab bars available as complete components:

| Type | Description |
|---|---|
| `Default` | Underline-style, 48px h — standard page tabs |
| `Fill` | Filled pill tabs, 48px h |
| `Fill-small` | Small filled pill tabs, 32px h |
| `Double Sided Border` | Bordered on two sides, 48px h |
| `Left Border` | Vertical sidebar tabs (503px h assembled) |

---

### _BaseTabitem (individual tab item)

Use this to build custom tab bars.

**Type:**
- `Default` — underline indicator
- `Fill` — filled pill (48px h)
- `Fill-small` — small filled pill (24px h)
- `Double Sided Border` — dual border indicator
- `Border Bottom` — single bottom border (use for horizontal tabs, 230px wide)
- `Border Left` — left border (use for vertical nav, 230px wide)

**State:**
- `Default` — not selected
- `Hover` — cursor over
- `Selected` — active tab
- `Disabled` — non-interactive

---

## Usage

Use Tabs for:
- Forum categories (All, Protocol, Storage, etc.)
- Member directory sections
- Profile page sections
- Dashboard feed switching
- Settings page navigation

---

## Rules

1. Keep tab labels short — 1–2 words
2. Use `Default` or `Fill` style, not mixed
3. `Left Border` type is for sidebar/vertical navigation only
4. Never recreate tab indicators or underlines manually

---

## AI Instructions

- Always instantiate from Figma library: `Primitive Components / Tabs`
- Use the assembled `Tabs` bar for standard contexts
- Use `_BaseTabitem` when building custom tab widths
- Preserve the `Selected` state for active tabs
- Never approximate tab styling with custom CSS
