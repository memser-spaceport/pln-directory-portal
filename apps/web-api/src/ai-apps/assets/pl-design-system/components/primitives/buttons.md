# Buttons

Canonical Figma path: `Primitive Components / Button`
Figma node: `802:20272` (verified via MCP)
Status: **Verified**

---

## Components in this group

- **Button** — standard text button with optional icon
- **Link Button** — text-only button styled as a link
- **Icon Button** — icon-only square/compact button
- **Round Icon Button** — circular icon-only button

---

## Button

### Variants (Figma-verified)

**Type** (semantic color):
- Default / Brand — primary brand color, used for primary CTAs
- Success — green, for confirmations and positive outcomes
- Warning — amber, for caution actions
- Error — red, for destructive or high-risk actions
- Neutral — grey, for secondary/tertiary actions
- Light / Ghost — no background, used for subtle or secondary actions

**Style**:
- Fill — solid background, highest visual weight
- Border — outlined with no fill, medium weight
- Light — near-transparent background tint, lowest weight

**Size**:
| Name | Height |
|---|---|
| Tiny | 24px |
| Extra Small | 32px |
| Small | 36px |
| Medium | 40px |
| Large | 48px |
| Extra Large | 56px |
| Big | 58px |

**State**:
- Normal
- Hover
- Focus
- Active
- Disabled

### Usage rules

- **Only one** `Fill + Default/Brand` button per section (single primary CTA rule)
- Use `Style=Fill` for primary actions
- Use `Style=Border` for secondary/complementary actions
- Use `Style=Light` for tertiary or contextual actions
- Use `Type=Error, Style=Fill` for destructive actions (delete, remove, leave)
- Match size to context: `Medium` or `Large` for forms, `Small` or `Tiny` for compact UI, tables, and dense lists

### Do

- Instantiate from the Figma library with correct Type, Style, Size, State
- Use descriptive button labels (not "Click here" or "Submit")
- Pair destructive actions with a confirmation step

### Do not

- Draw a custom button with raw CSS or JSX
- Use more than one primary (`Fill + Default`) button per section
- Invent new Type or Style variants
- Override internal button typography
- Use icon-heavy buttons as CTAs — keep labels prominent

### AI instruction

When generating UI, instantiate the Button component from `Primitive Components / Button` in the Figma library. Select the correct Type, Style, Size, and State. Do not recreate. If unavailable:
```
Missing canonical component: Button
```

---

## Link Button

Canonical Figma path: `Primitive Components / Link Button`
Status: TODO verify exact variant names via MCP

Purpose: Text-only interactive link. No background. Used for inline navigation and secondary text actions.

### Usage rules
- Use for navigation or low-emphasis actions within body text
- Do not use Link Button as a primary CTA
- Do not substitute a raw `<a>` tag styled as a button

### AI instruction
Instantiate from Figma. If unavailable: `Missing canonical component: Link Button`

---

## Icon Button

Canonical Figma path: `Primitive Components / Icon Button`
Status: TODO verify exact variant names via MCP

Purpose: Compact button containing only an icon. Used in toolbars, tables, inline controls.

### Usage rules
- Always pair with a tooltip to explain the action
- Do not use Icon Button as a primary CTA
- Do not substitute with a raw `<button>` + inline SVG

### AI instruction
Instantiate from Figma. If unavailable: `Missing canonical component: Icon Button`

---

## Round Icon Button

Canonical Figma path: `Primitive Components / Round Icon Button`
Status: TODO verify exact variant names via MCP

Purpose: Circular icon button. Used for floating action buttons, prominent single-action points.

### Usage rules
- Use sparingly — one per view or section
- Do not compose from a circle div + icon

### AI instruction
Instantiate from Figma. If unavailable: `Missing canonical component: Round Icon Button`
