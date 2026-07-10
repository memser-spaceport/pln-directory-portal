# Home Page

Layout composition: Full Width + Stack sections
Figma reference: Page Templates / Home Page
Status: TODO verify exact Figma page path via MCP

---

## Purpose

The home page is the main entry point for authenticated users. It provides a curated overview of activity across the PL Network: teams, updates, forum highlights, deals, and events.

---

## Layout

```
Header & Nav (full width)
↓
Hero / Welcome section (full width)
↓
Featured Focus Areas (grid)
↓
Recent Updates (carousel or grid)
↓
Featured Teams (grid)
↓
Recent Forum (list)
↓
Featured Deals (grid)
↓
Events / Office Hours (list or grid)
↓
Footer CTA
```

---

## Components used

| Section | Component |
|---|---|
| Header | `Header & Nav` (desktop) |
| Hero | TODO: verify if there's a canonical Hero component |
| Focus Areas | `Focus Area Cards` |
| Updates | `Updates Cards` |
| Teams | `Team Cards` |
| Forum | `Forum Cards` |
| Deals | `Deals Cards` |
| Events | TODO: verify events card type |
| CTA | `Button` (Fill, Brand) |

---

## Rules

- This is a reference layout — do not recreate components from this page screenshot
- All card types use their canonical Figma components
- Section headings use the token typography system
- Spacing between sections uses `--spacing-*` tokens
