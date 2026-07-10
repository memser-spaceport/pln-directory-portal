# Switch & Toggle Component

Figma page: `❖ Switch & Toggle`
Page ID: `1050:18030`
Frame 1: `14643:30883` — "Toggle" (bare control)
Frame 2: `14643:35651` — "Toggle with Label" (control + label)
Canonical path: `Primitive Components / Switch & Toggle`
Status: **✅ Verified** — MCP inspection confirmed full variant matrix

---

## Purpose

Allow users to switch between enabled and disabled states, or toggle settings and preferences.

---

## Sub-components

### Toggle (bare control)

| Property | Values |
|---|---|
| **Type** | `Dot`, `With Icon`, `Button` |
| **Pressed** | `True` (on/enabled), `False` (off/disabled) |
| **State** | Normal, Hover, Focus, Disable |

**Type descriptions:**
- `Dot` — standard iOS-style switch (36×20px)
- `With Icon` — switch with icon inside the thumb (36×20px)
- `Button` — segmented pill/button toggle (132×28px)

---

### Toggle with Label (control + label)

| Property | Values |
|---|---|
| **Type** | `Icon`, `Dot` |
| **Pressed** | `True`, `False` |
| **State** | Normal, Hover, Focus, Disable |
| **Label Position** | `Left`, `Right` |

Row size: 226×40px (Left) or 350×40px (Right)

---

## Usage

Use Toggle for:
- Notification preferences
- Feature enable/disable settings
- Filter toggles
- Dark/light mode switch
- Availability settings
- Permission toggles

---

## Rules

1. Labels must clearly describe the outcome (e.g., "Email notifications" not "Toggle")
2. Use `Label Position=Right` for standard form settings
3. Use `Label Position=Left` for density-constrained layouts
4. Preserve minimum touch target (40px height with label)
5. Do not use Toggle for navigation or mode-switching between more than 2 states — use Tabs instead

---

## AI Instructions

- Always instantiate from Figma library: `Primitive Components / Switch & Toggle`
- Use `Toggle with Label` for all form contexts — not the bare Toggle control alone
- The `Button` type is a segmented control variant (not a toggle switch)
- Preserve `Pressed=True/False` state to reflect current on/off status
- Never recreate switch track or thumb styling manually
