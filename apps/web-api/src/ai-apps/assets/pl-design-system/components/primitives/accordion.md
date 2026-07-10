# Accordion Component

Figma page: `❖ Accordion`
Page ID: `1333:24055`
Frame: `14424:10186` — "Accordion"
Canonical path: `Primitive Components / Accordion`
Status: **✅ Verified** — MCP inspection confirmed full variant matrix

---

## Purpose

Accordions progressively disclose content while preserving compact layouts. Use for FAQs, filters, settings sections, expandable metadata, and dense information groups.

---

## Variants

### Type
| Value | Description |
|---|---|
| `Basic` | Default card-style row with border |
| `Light Gary` | Subtle grey-fill row (note: "Gary" is the exact Figma spelling) |
| `Underline` | Underline-only divider row, minimal chrome |

### Open
| Value | Closed height | Expanded height |
|---|---|---|
| `False` (collapsed) | 67px desktop / 64px mobile | — |
| `True` (expanded) | — | 107px desktop / 124px mobile |

### State
- `Normal`
- `Hover`
- `Focus`
- `Disable`

### Device
- `Desktop` (760px wide)
- `Mobile` (353px wide)

---

## Usage

Use Accordion for:
- FAQ sections
- Filter panels
- Expandable section headers
- Dense settings blocks
- Onboarding checklists

---

## Rules

1. Use concise labels (1 line)
2. Avoid nested accordions
3. Keep content scannable — do not put long scrollable content inside accordion items
4. Preserve touch-friendly hit areas on mobile
5. Use the correct Device variant: Desktop or Mobile

---

## AI Instructions

- Always instantiate from Figma library: `Primitive Components / Accordion`
- Use `Device=Mobile` for all mobile-width contexts
- Never recreate expand/collapse rows manually
- Preserve all state variants (Normal, Hover, Focus, Disable)
