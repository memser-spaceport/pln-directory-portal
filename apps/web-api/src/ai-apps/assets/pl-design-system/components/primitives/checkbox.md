# Checkbox Component

Figma page: `❖ Checkbox`
Page ID: `1048:18099`
Frame 1: `17215:16334` — "Checkbox" (the control)
Frame 2: `14308:16244` — "Checkbox Label" (selectable row)
Canonical path: `Primitive Components / Checkbox`
Status: **✅ Verified** — MCP inspection confirmed full variant matrix

---

## Purpose

Allow users to select one or multiple options. Also includes Radio button controls.

---

## Important: Radio buttons live here

The Checkbox page contains both **Checkbox** and **Radio** controls as a shared Type property. There is no separate "Radio Button" page.

---

## Sub-components

### Checkbox (control only)

The bare control without label.

**Variant** (check state):
- `Unchecked`
- `Checked`
- `Minus-Indeterminate` (partial group selection)

**Type** (shape):
- `Checkbox` — square/rounded-square control
- `Radio` — circular control

**State**:
- `Normal`
- `Hover`
- `Focus`
- `Disable`

**Size**:
| Value | Control size |
|---|---|
| Medium | 24×24px |
| Large | 28×28px |

---

### Checkbox Label (selectable row)

The control with an attached label. This is what appears in forms.

**Variant**: Unchecked, Checked, Minus-Indeterminate
**State**: Normal, Hover, Focus, Disable
**Size**:
| Value | Row height |
|---|---|
| Small | 62px |
| Medium | 74px |
| Large | 83px |

---

## Checkbox Group

See separate spec: [`checkbox-group.md`](./checkbox-group.md)
Figma page: `❖ Checkbox Group` (Page ID `2411:87285`)

---

## Usage Rules

1. Use `Checkbox Label` for form contexts — not the bare Checkbox control
2. Use `Radio` type for mutually exclusive choices; use `Checkbox` type for multi-select
3. Use `Minus-Indeterminate` for partial group selection (e.g., "select all" parent)
4. Never manually recreate checkbox or radio styling

---

## AI Instructions

- Always instantiate from Figma library: `Primitive Components / Checkbox`
- Use `Checkbox Label` rows in forms, not just the bare control
- Radio buttons are a `Type` variant of the Checkbox component — same Figma page
- Preserve focus states for accessibility
