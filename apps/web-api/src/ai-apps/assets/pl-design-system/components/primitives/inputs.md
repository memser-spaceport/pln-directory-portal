# Input Component

Figma page: `❖ Input`
Page ID: `13802:14570`
Frame: `13797:14348`
Canonical path: `Primitive Components / Input`
Status: **✅ Verified** — MCP inspection confirmed full variant matrix

---

## Purpose

Text input for capturing single-line user data: names, search terms, form fields, tags.

---

## Sub-components

| Frame | Purpose |
|---|---|
| `13797:14348` — Input | Main component set |

---

## Variants

### Type
- `Normal` — standard text input
- `Tag` — input with inline tag chips (multi-value selection)

### Style
- `Rounded` — rounded border, default form style
- `Fill` — filled background, lower emphasis surface

> ⚠️ There is no "Underline" or "Default" style. Styles are exactly `Rounded` and `Fill`.

### Size
| Value | Height |
|---|---|
| Large | 76px |
| Medium | 68px |
| Small | 64px |

### State
| Value | Description |
|---|---|
| Placeholder | Empty, no focus |
| Hover | Mouse over |
| Typing | Active cursor, content being entered |
| Fill & Focus | Focused with content |
| Error | Validation failure |
| Disable | Non-interactive |

---

## Related Components

- **Regular Search Input** — separate component for global and inline search. Do NOT use Input for search patterns; use Regular Search Input.
- **Dropdown** — has its own `_dropdown input` frame that wraps Input with selection affordance
- **TextArea** — for multi-line content

---

## Usage Rules

1. Always select the correct `Type` first (Normal vs Tag)
2. Use `Style=Rounded` for standard forms; `Style=Fill` for lower-emphasis contexts or dark surfaces
3. Use `State=Error` with a helper text label when validation fails
4. Never recreate input styling manually

---

## AI Instructions

- Always instantiate from Figma library: `Primitive Components / Input`
- Never create a custom `<input>` visual component
- Do not use Input for password fields or avatar selection — check if there is a specific Figma variant for that pattern
- For search, use `Regular Search Input` instead
- Preserve all size and state variants; do not flatten or approximate
