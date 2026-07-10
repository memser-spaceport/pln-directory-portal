# Table Cells

Figma page: `❖ Table`
Page ID: `2411:87286`
Frame: `14938:8436` — "Table Cell"
Canonical path: `Primitive Components / Table` (cell primitives)
Status: **Verified** — Figma MCP `get_metadata`

---

## Variant dimensions

Each cell symbol combines:

- **Type** — content pattern (text, avatar+details, toggles, badges, progress, chart, flags, checkbox, actions, etc.)
- **Background** — `White`, `Light gray`
- **State** — `Default`, `Hover`, `Active`

Exact **Type** strings match Figma (including typos such as **signle** for single-button cells). Use the Figma component picker or `figma-source-map.md` for the exhaustive list.

---

## Rules

- Pick the **Type** that matches the data column — do not use `Regular text` when `Avatar + details` or `Status badge` exists.
- Row actions must use **signle** / **Double Button** cell types or canonical Icon Button / Context Menu embedded per Figma instances.

---

## AI instruction

Instantiate table cells from the `Table Cell` frame on page `2411:87286`. If unavailable:

```
Missing canonical component: Table Cell
```

For full tables, see [table.md](./table.md).
