# Slider / Range

Figma page: `❖ Slider / Range`
Page ID: `1467:24998`
Canonical path: `Primitive Components / Slider` (page title in Figma: Slider / Range)
Status: **Verified** — Figma MCP `get_metadata`

---

## Basic Slider (`14816:4878`)

- **Control**: 25%, 50%, 75%, 100%
- **Weight**: Bold (10px tall track), Thin (4px tall track)

---

## Double Slider / range (`14805:4669`)

- **Left Control** / **Right Control**: Combined positions from 0%–25% through 75%–100% (full matrix in file)
- **Weight**: Bold, Thin

---

## _BaseSliderControl (`14778:46719`)

- **Color**: Color, Light
- **Icon**: True, False
- **Size**: Medium (24×24), Small (18×18)

---

## _BaseLineGraph (`14778:45136`)

Used as optional track / analytics context behind or near sliders.

- **Type**: Thin Line, Bold Line, Thin Line 02
- **Active**: true, false

---

## Rules

- Use Basic vs Double Slider symbols from Figma — do not build custom range inputs with two number fields only.
- Match **Weight** (Bold vs Thin) to the surrounding UI density.

---

## AI instruction

Instantiate from `Primitive Components / Slider` / `❖ Slider / Range` in the Figma library. If unavailable:

```
Missing canonical component: Slider
```
