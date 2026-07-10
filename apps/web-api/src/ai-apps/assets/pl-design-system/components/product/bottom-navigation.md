# Bottom Navigation

Canonical Figma path: `Product Components / Bottom Navigation`
Status: TODO verify exact variant names via MCP

---

## Purpose

Mobile-only navigation bar fixed to the bottom of the viewport. Provides quick access to the main sections of PL Network.

---

## Tabs

| Tab | Icon | Destination |
|---|---|---|
| Directory | People icon | Member/Team directory |
| Events | Calendar icon | Events listing |
| Demo Day | Star or rocket icon | Demo Day section |
| More | Grid or menu icon | Overflow menu / all sections |

---

## States

| State | Description |
|---|---|
| Default | All tabs unselected |
| Active | Current section tab highlighted |
| Expanded "More" | Opens a secondary menu or sheet |

---

## Rules

- Mobile only — do not render Bottom Navigation on desktop
- Desktop uses Header & Nav instead
- Do not add tabs not present in the canonical component
- Do not use Bottom Navigation for contextual actions — use it for primary section navigation only
- Active tab must use canonical active treatment

---

## AI instruction

Instantiate from `Product Components / Bottom Navigation` in the Figma library. If unavailable:
```
Missing canonical component: Bottom Navigation
```
