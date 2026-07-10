# Checkbox Label

Canonical Figma path: `Primitive Components / Checkbox Label`
Status: TODO verify exact variant names via MCP

---

## Purpose

A selectable row/card that combines a checkbox with richer content. Used for filter lists, settings options, multi-select pricing selectors, and any scenario where a checkbox needs more than a plain text label.

---

## Content variants

| Variant | Content |
|---|---|
| Simple text | Label text only |
| Icon | Leading icon + label |
| Avatar | User avatar + name + optional subtitle |
| Image | Thumbnail image + label |
| Pricing | Price amount + label + optional description |

---

## States

| State | Description |
|---|---|
| Default | Unselected, normal |
| Selected | Checkbox checked, row highlighted |
| Disabled | Not interactive, reduced opacity |

---

## Rules

- Use for multi-select filter panels (skills, focus areas, locations)
- Use for settings option groups where each option needs context
- Do not build a custom selectable card with raw `div` + `Checkbox` manually composed
- Selected state must apply the correct canonical highlight treatment from Figma

---

## AI instruction

Instantiate from `Primitive Components / Checkbox Label` in the Figma library. If unavailable:
```
Missing canonical component: Checkbox Label
```
