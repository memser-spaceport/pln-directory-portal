# Search

Canonical Figma path: `Primitive Components / Regular Search Input`
Status: TODO verify exact variant names via MCP

---

## Variants

| Variant | Description |
|---|---|
| Regular Search Input | Standard search field with icon and clear |
| Global Search | Full-width header search with expanded results |
| Sidebar Search | Compact search inside filter sidebar |
| Search with Filters | Search + filter chips or dropdown combination |
| Autocomplete (if applicable) | Search with suggestion dropdown |

---

## Anatomy

- Magnifying glass icon (leading)
- Input text field
- Clear button (trailing, visible when input has content)
- Optional: filter trigger button (trailing)

---

## Rules

- Do not build a search field from a raw `<input>` + icon
- Clear button must appear when the field has content
- Search with Filters must use canonical Filter/Dropdown components — do not improvise
- Autocomplete suggestions use canonical dropdown/list item rendering

---

## AI instruction

Instantiate from `Primitive Components / Regular Search Input` in the Figma library. If unavailable:
```
Missing canonical component: Regular Search Input
```
