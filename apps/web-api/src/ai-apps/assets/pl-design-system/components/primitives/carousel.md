# Carousel

Figma page: `❖ Carousel`
Page ID: `2411:87282`
Canonical path: `Primitive Components / Carousel`
Status: **Verified** — Figma MCP `get_metadata`

---

## Scope

This page defines **carousel pagination indicators** (dot/line strips), not a full slide container with images.

---

## Carousel (`2470:91119`)

Full strip of indicators.

- **Type**: Rounded, Line, Point with Border, Rounded with Border
- **Number of Carousel Item**: 2, 3, 4, 5
- **Style**: Horizontal, Vertical

---

## _BaseCarouselItem (`2470:89976`)

Single indicator instance.

- **Select**: false, true
- **Status**: Rounded, Line, Point with Border, Rounded with Border

Figma prefixes some status values with `🚫 Don't change` — preserve variant properties when swapping instances.

---

## Rules

- Pair these indicators with canonical content slides/frames defined elsewhere — do not draw custom dot rows.
- Match **Number of Carousel Item** to the real slide count.

---

## AI instruction

Instantiate from `Primitive Components / Carousel` in the Figma library. If unavailable:

```
Missing canonical component: Carousel
```
