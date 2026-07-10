# Badges & Tags Component

Figma page: `❖ Badges & Tags`
Page ID: `1079:21757`
Frame 1: `14216:28718` — "Badge"
Frame 2: `14216:28702` — "_BaseBadgeDot"
Canonical path: `Primitive Components / Badges & Tags`
Status: **✅ Verified** — MCP inspection confirmed full variant matrix

---

## Purpose

Badges communicate status, category, metadata, role, and lightweight system meaning. Badge Dots indicate presence, activity, or notification count.

---

## Sub-components

### Badge

| Property | Values |
|---|---|
| **Color** | Blue (Brand), Gray (Neutral), Green (Success), Yellow (Warning), Red (Error) |
| **Style** | Light, Outline, Fill |
| **Size** | Small (16px h), Medium (20px h), Large (24px h) |
| **Disable** | False, True |

> ⚠️ Figma uses color names (`Blue`, `Gray`, `Green`, `Yellow`, `Red`) not semantic labels. Map accordingly:
> - Blue → Brand/Primary
> - Gray → Neutral
> - Green → Success
> - Yellow → Warning
> - Red → Error/Danger

**Style guide:**
- `Light` — subtle fill, low visual weight; use for categories and metadata
- `Outline` — bordered, no fill; use for interactive filters and toggleable tags
- `Fill` — solid fill; use for critical status, active states, high-emphasis labels

---

### Badge Dot (_BaseBadgeDot)

| Property | Values |
|---|---|
| **Color** | Light, Light Secondary, Blue, Green, Yellow, Red |
| **Size** | Small (12px), Medium (16px), Large (16–24px) |

Use Badge Dots for presence indicators, online status, and notification indicators.

---

## Usage

Use badges for:
- Member roles and focus areas
- Content categories
- Availability status (e.g., "Available to connect", "Frequently Booked")
- Filter chips and active filter indicators
- Lightweight metadata on cards

---

## Rules

1. Use semantic colors — never custom colors
2. Limit to 1–3 badges per card or list item
3. Do not use oversized badges for primary content — they are metadata
4. Gray badges are for secondary/neutral states
5. "Disable=True" variant must be used for non-interactive disabled states

---

## AI Instructions

- Always instantiate from Figma library: `Primitive Components / Badges & Tags`
- Never draw custom pill or tag shapes
- Use the correct **Color** name (Blue, Gray, Green, Yellow, Red) from Figma
- Preserve Disable variants when rendering non-interactive badges
