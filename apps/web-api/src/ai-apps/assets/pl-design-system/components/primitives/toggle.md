# Switch & Toggle

Canonical Figma path: `Primitive Components / Switch & Toggle`
Status: TODO verify exact variant names via MCP

---

## Types

| Type | Description |
|---|---|
| Switch | Binary on/off toggle, pill-shaped |
| Toggle with label | Switch with visible label beside it |
| Segmented toggle | Light/Dark or mode switcher, two-option pill |

---

## States

| State | Description |
|---|---|
| Active / On | Enabled state, accent color |
| Inactive / Off | Disabled state, neutral color |
| Disabled | Non-interactive, reduced opacity |

---

## Rules

- Use **Switch** for boolean settings (notifications on/off, visibility, preferences)
- Use **Segmented** for theme/mode switching (Light/Dark), view type (Grid/List)
- Do not use Switch for primary page navigation
- Do not compose a custom toggle with divs + CSS transitions
- Always include an accessible label (not just a color change)

---

## AI instruction

Instantiate from `Primitive Components / Switch & Toggle` in the Figma library. If unavailable:
```
Missing canonical component: Switch & Toggle
```
