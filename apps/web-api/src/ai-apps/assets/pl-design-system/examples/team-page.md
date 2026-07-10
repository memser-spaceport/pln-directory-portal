# Team Page (Team Profile)

Layout composition: Detail / Single Focus
Figma reference: Page Templates / Team Page
Status: TODO verify exact Figma page path via MCP

---

## Purpose

A single team's profile page. Shows the team's identity, description, members, projects, and related context.

---

## Layout

```
Header & Nav (full width)
↓
Team hero (logo, name, tags, description, member count)
↓
Members section (avatar grid or member card row)
↓
About / Details (text + metadata)
↓
Related teams or focus areas (optional)
```

---

## Components used

| Element | Component |
|---|---|
| Header | `Header & Nav` |
| Team hero | `Team Cards` (hero variant) or TODO: verify if there's a separate Team Hero component |
| Member avatars | `Avatar` or `Directory Member Cards` (compact) |
| Tags | `Badges & Tags` |
| Related | `Team Cards` or `Focus Area Cards` |

---

## Rules

- Team profile uses Detail / Single Focus composition — not a grid
- Hero area uses canonical team component or verified Figma composition
- Do not compose the hero from raw HTML divs + team logo + CSS
