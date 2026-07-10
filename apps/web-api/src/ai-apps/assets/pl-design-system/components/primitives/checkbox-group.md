# Checkbox Group

Canonical Figma path: `Primitive Components / Checkbox Group`
Status: TODO verify exact variant names via MCP

---

## Purpose

A grouped set of checkboxes for multi-select forms and filter panels. Manages group-level label, individual checkboxes, and validation messaging.

---

## Behavior

- Multi-select: any number of options can be selected simultaneously
- Group label appears above the checkbox list
- Validation error applies to the group, not individual items
- Select All / Deselect All behavior (if applicable) triggers indeterminate state on group checkbox

---

## Rules

- Use for filter panels, settings groups, multi-select forms
- Group-level error message uses canonical error style (not custom red text)
- Do not place more than ~8 items in a single Checkbox Group without adding scroll or pagination
- Group label is always visible

---

## Accessibility

- Group must be wrapped in `<fieldset>` with a `<legend>` for screen readers
- Each checkbox must have an associated label

---

## AI instruction

Instantiate from `Primitive Components / Checkbox Group` in the Figma library. If unavailable:
```
Missing canonical component: Checkbox Group
```
