# Alerts & Notifications

Canonical Figma path: `Primitive Components / Alerts & Notification`
Status: TODO verify exact variant names via MCP

---

## Types

| Type | Semantic use |
|---|---|
| Info | Neutral context, informational messages |
| Success | Positive outcome, completion confirmation |
| Warning | Caution, action required, potential issues |
| Error | Failure, validation error, destructive result |
| Neutral | Non-semantic, no color signal |

---

## Styles

| Style | Behavior |
|---|---|
| Alert (inline) | Embedded in page content, persistent |
| Banner | Full-width, appears at top of page or section |
| Toast | Transient, disappears after timeout |
| Notification Card | Persistent in notification panel or feed |
| Actionable Alert | Includes a button for next step |

---

## Rules

- Use `Info` for neutral context — not for success messages
- Do not use multiple alert types simultaneously in the same view
- Toasts are transient — do not pin them persistently
- Actionable alerts include one action button — do not add multiple CTAs
- Do not build a custom alert banner with raw div + icon + text

---

## AI instruction

Instantiate from `Primitive Components / Alerts & Notification` in the Figma library. If unavailable:
```
Missing canonical component: Alerts & Notification
```
