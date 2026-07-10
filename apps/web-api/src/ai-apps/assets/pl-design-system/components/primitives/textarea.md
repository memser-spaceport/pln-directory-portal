# TextArea

Canonical Figma path: `Primitive Components / TextArea`
Status: TODO verify exact variant names via MCP

---

## Variants

- **Standard textarea** — plain multi-line text field
- **Rich text editor** — with formatting toolbar (bold, italic, link, lists, mention)
- **Comment field** — compact variant for comment composers

---

## Toolbar behavior (rich text variant)

The toolbar appears above or below the textarea depending on context. Do not remove the toolbar from the rich text variant. Toolbar actions include:
- Bold, Italic, Strikethrough
- Link insertion
- Ordered and unordered lists
- Mention (@user)
- Emoji (if applicable)

---

## States

| State | Description |
|---|---|
| Default | Empty, no focus |
| Focus | Active keyboard focus, border highlight |
| Error | Validation failure, error border + helper text |
| Disabled | Non-interactive, reduced opacity |
| Filled | Contains content |

---

## Anatomy

- Label (above)
- Textarea container (resizable or fixed height)
- Toolbar (rich text variant only)
- Helper / error text (below)
- Character count (optional)

---

## Rules

- Use standard textarea for bio, description, and freeform fields
- Use rich text variant for forum posts, comments, and long-form content
- Use comment field variant for inline comment composers
- Do not build a custom textarea from a raw `<textarea>` + CSS
- Do not remove the toolbar from the rich text variant

---

## AI instruction

Instantiate from `Primitive Components / TextArea` in the Figma library. If unavailable:
```
Missing canonical component: TextArea
```
