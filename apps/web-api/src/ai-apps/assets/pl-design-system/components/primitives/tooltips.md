# Tooltips Component

Figma page: `❖ Tooltips`
Page ID: `1161:20444`
Frame: `2002:65452` — "Tooltips"
Canonical path: `Primitive Components / Tooltips`
Status: **✅ Verified** — MCP inspection confirmed full variant matrix

---

## Purpose

Provide contextual information, keyboard shortcuts, and supplementary labels on hover or focus.

---

## Variants

### Size

| Value | Approx height | Use case |
|---|---|---|
| `Small` | 28–33px | Compact label tooltips |
| `Medium` | 36–42px | Standard tooltips with text |
| `Large` | 84–94px | Rich tooltips with longer descriptions |

### Theme

| Value | Description |
|---|---|
| `Light` | White/light background, subtle shadow |
| `Dark` | Dark background, high contrast |
| `Blue` | Brand blue, for emphasized hints |

### Arrow Position

The arrow can point from any of 8 positions:

| Group | Values |
|---|---|
| Bottom edge (tooltip above) | `Bottom Right`, `Bottom Center`, `Bottom Left` |
| Top edge (tooltip below) | `Top Right`, `Top Center`, `Top Left` |
| Side | `Left Side`, `Right Side` |

---

## Usage

Use Tooltips for:
- Icon button labels (hover hint)
- Keyboard shortcut indicators
- Truncated text expansion
- Complex field helper hints
- Feature discovery nudges

---

## Rules

1. Use `Theme=Dark` as the default — most legible in light UIs
2. Use `Theme=Blue` sparingly for feature highlights
3. Choose arrow position based on available screen space (prefer bottom-side tooltip appearing above the trigger)
4. Keep tooltip text to 1–2 lines for Small/Medium; use Large for multi-line descriptions
5. Do not use tooltips to hide critical information — it must be accessible without hover

---

## AI Instructions

- Always instantiate from Figma library: `Primitive Components / Tooltips`
- Select `Arrow` position based on trigger location on screen
- Never draw custom tooltip bubbles or arrows
- Preserve all size variants — do not scale non-matching sizes
