# Comments

Canonical Figma path: `Product Components / Comments`
Status: TODO verify exact variant names via MCP

---

## Purpose

Comment composer and thread rendering for forum posts and discussion contexts.

---

## Variants

| Variant | Description |
|---|---|
| Comment composer | Input area for writing a new comment |
| Desktop comment thread | Full-width thread with avatar, name, body, reactions |
| Mobile comment thread | Compact thread layout |
| Nested reply | Indented sub-thread |

---

## Composer anatomy

- Author avatar (canonical Avatar component, `size=sm`)
- Rich text input (canonical TextArea — rich text variant)
- Toolbar: Bold, Italic, Link, Lists, Mention
- Mention suggestions dropdown (uses canonical Dropdown/List rendering with avatars)
- Submit button (canonical Button — `Style=Fill, Type=Default`)

---

## Thread anatomy

- Author avatar (canonical Avatar)
- Author name + handle
- Comment body text
- Timestamp
- Reaction row (emoji reactions with counts)
- Reply trigger
- Context menu (Edit, Delete — via canonical Context Menu)

---

## Rules

- Composer must use the rich text TextArea — not a plain textarea
- Mention suggestions must use canonical avatar + name rendering
- Nested replies are indented but use the same thread component
- Desktop and mobile use different layout variants — do not scale down desktop

---

## AI instruction

Instantiate from `Product Components / Comments` in the Figma library. If unavailable:
```
Missing canonical component: Comments
```
