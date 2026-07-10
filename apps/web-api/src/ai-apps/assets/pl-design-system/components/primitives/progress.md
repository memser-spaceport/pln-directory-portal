# Progress

Canonical Figma path: `Primitive Components / Progress`
Status: TODO verify exact variant names via MCP

---

## Types

| Type | Description |
|---|---|
| Progress Bar | Horizontal linear indicator |
| Progress Circle | Circular/radial indicator |
| Loading | Indeterminate spinning indicator |

---

## States

| State | Description |
|---|---|
| Active | In progress |
| Complete | 100% complete |
| Disabled | Inactive, greyed out |

---

## Display options

- With/without percentage label
- With/without text label describing the step
- Determinate (known progress) vs indeterminate (loading)

---

## Rules

- Use Bar for multi-step flows, file uploads, form completion
- Use Circle for compact/inline progress in cards or summaries
- Use Loading (indeterminate) for unknown-duration async operations
- Always show completion state when progress reaches 100%
- Do not build custom progress from raw `<div>` width manipulation

---

## AI instruction

Instantiate from `Primitive Components / Progress` in the Figma library. If unavailable:
```
Missing canonical component: Progress
```
