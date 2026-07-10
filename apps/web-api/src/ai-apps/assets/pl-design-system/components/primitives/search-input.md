# Regular Search Input Component

Figma page: `❖ Regular Search Input`
Page ID: `1333:24062`
Frame: `14549:147723` — "Search"
Canonical path: `Primitive Components / Regular Search Input`
Status: **✅ Verified** — MCP inspection confirmed full variant matrix

---

## Purpose

Search field for discovering members, teams, forum posts, deals, jobs, and guides. Use this component (not the main Input component) for all search patterns.

---

## Variants

### Slate (interaction state)
- `Default` — resting / not yet focused
- `Hover` — cursor over
- `Focus` — keyboard/click focused

### Type (visual style)
- `Underline` — minimal, underline only (lower visual weight)
- `Basic` — rounded border (standard search box)

### Size

| Value | Height |
|---|---|
| `xSmall` | 32px |
| `Small` | 40px |
| `Medium` | 48px |
| `Large` | 54px |

Width: 350px (can be stretched to fill container)

---

## Usage

Use Regular Search Input for:
- Global site search (header)
- Member directory search
- Forum search
- Jobs search
- Deals search
- Founder Guides search

---

## Rules

1. Never use the main `Input` component for search patterns — always use `Regular Search Input`
2. Use `Type=Basic` for prominent search bars (header, hero search)
3. Use `Type=Underline` for inline or sidebar search with lower emphasis
4. Use `Size=Medium` or `Large` for primary search contexts
5. Placeholder text should be lightweight: "Search members…" not "Enter your search query"

---

## AI Instructions

- Always instantiate from Figma library: `Primitive Components / Regular Search Input`
- Do not substitute the general `Input` component for search patterns
- Select the correct `Type` (Underline vs Basic) based on visual context
- Pair with `Empty` state (`Type=Search`) for no-results patterns
