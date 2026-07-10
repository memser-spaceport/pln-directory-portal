# Steps

Figma page: `❖ Steps`
Page ID: `1467:25002`
Canonical path: `Primitive Components / Steps`
Status: **Verified** — Figma MCP `get_metadata`

---

## Step (`15139:58793`)

Composed stepper bars.

- **Amount**: 2, 3, 4, 5, 6 (number of steps)
- **Type**:
  - `Basic` — 20px height
  - `Basic-fill` — 32px height
  - `Horizontal` — labeled horizontal flow (110px row height)
  - `Vertical` — vertical stack (height scales by amount)

---

## _BaseIndicatorStep (`15130:56377`)

Step node with label/icon treatment.

- **State**: Incomplete, Current, **Complate** (exact Figma spelling)
- **Type**: Basic, Horizontal, Vertical

---

## _BaseStepLine (`15119:55100`)

Connectors between steps.

- **State**: Default, Selected, Ghost
- **Type**: Horizontal, Vertical

---

## _BaseBasicStep (`15139:58868`)

Minimal step segment symbol (32×20).

---

## Note on Figma documentation text

A text layer on this page incorrectly references **Tabs** — the page and components are **Steps**.

---

## Rules

- Use **Amount** to match the real number of wizard stages; do not truncate visually in code.
- Preserve **Complate** variant spelling when reporting Figma properties.

---

## AI instruction

Instantiate from `Primitive Components / Steps` in the Figma library. If unavailable:

```
Missing canonical component: Steps
```
