# Pagination

Canonical Figma path: `Primitive Components / Pagination`
Status: TODO verify exact variant names via MCP

---

## Variants

| Variant | Description |
|---|---|
| Numeric | Page number buttons (1, 2, 3 … N) |
| Previous / Next | Arrow-only navigation |
| Compact | Minimal: prev, current indicator, next |
| Go-to input | Includes a text input for jumping to a specific page |
| Mobile | Simplified for small screens |

---

## Rules

- Match pagination style to viewport and content density:
  - Desktop data tables: Numeric or Go-to
  - Mobile: Mobile or Compact variant
- Current page state must use the canonical active treatment
- Do not build custom pagination from buttons + click handlers
- Always show total count context when using numeric pagination (e.g., "Page 3 of 12")

---

## AI instruction

Instantiate from `Primitive Components / Pagination` in the Figma library. If unavailable:
```
Missing canonical component: Pagination
```
