# Component Catalog

All Figma Design System components for PL Network / LabOS, grouped by category.
All entries below are **✅ Verified** via MCP inspection unless marked `TODO`.

Figma file: `Design-System-Full | Protocol Labs`
File URL: https://www.figma.com/design/0fFjyzEincRez6m3D80vLg/Design-System-Full-%7C-Protocol-Labs

---

## Primitive Components

| Component | Figma Page ID | Figma Page Name | Status | Spec |
|---|---|---|---|---|
| Button | `802:20272` | ❖ Button | ✅ Verified | [buttons.md](./primitives/buttons.md) |
| Input | `13802:14570` | ❖ Input | ✅ Verified | [inputs.md](./primitives/inputs.md) |
| TextArea | `15774:38577` | ❖ TextArea | ✅ Verified | [textarea.md](./primitives/textarea.md) |
| Checkbox + Radio | `1048:18099` | ❖ Checkbox | ✅ Verified | [checkbox.md](./primitives/checkbox.md) |
| Checkbox Group | `2411:87285` | ❖ Checkbox Group | ✅ Verified | [checkbox-group.md](./primitives/checkbox-group.md) |
| Badges & Tags | `1079:21757` | ❖ Badges & Tags | ✅ Verified | [badges-tags.md](./primitives/badges-tags.md) |
| Accordion | `1333:24055` | ❖ Accordion | ✅ Verified | [accordion.md](./primitives/accordion.md) |
| Dropdown | `1158:20441` | ❖ Dropdown | ✅ Verified | [dropdown.md](./primitives/dropdown.md) |
| Empty States | `2411:87283` | ❖ Empty | ✅ Verified | [empty-states.md](./primitives/empty-states.md) |
| Pagination | `1333:24057` | ❖ Pagination | ✅ Verified | [pagination.md](./primitives/pagination.md) |
| Progress | `1161:20445` | ❖ Progress | ✅ Verified | [progress.md](./primitives/progress.md) |
| Regular Search Input | `1333:24062` | ❖ Regular Search Input | ✅ Verified | [search-input.md](./primitives/search-input.md) |
| Switch & Toggle | `1050:18030` | ❖ Switch & Toggle | ✅ Verified | [switch-toggle.md](./primitives/switch-toggle.md) |
| Tabs | `1333:24058` | ❖ Tabs | ✅ Verified | [tabs.md](./primitives/tabs.md) |
| Tooltips | `1161:20444` | ❖ Tooltips | ✅ Verified | [tooltips.md](./primitives/tooltips.md) |
| Context Menu | `17368:2110` | ❖ Context Menu | ✅ Verified | [context-menu.md](./primitives/context-menu.md) |
| Date Picker | `1467:24996` | ❖ Date Picker | ✅ Verified | [date-picker.md](./primitives/date-picker.md) |
| Slider / Range | `1467:24998` | ❖ Slider / Range | ✅ Verified | [slider.md](./primitives/slider.md) |
| Steps | `1467:25002` | ❖ Steps | ✅ Verified | [steps.md](./primitives/steps.md) |
| Carousel | `2411:87282` | ❖ Carousel | ✅ Verified | [carousel.md](./primitives/carousel.md) |
| Table | `2411:87286` | ❖ Table | ✅ Verified | [table.md](./primitives/table.md) |

---

## Composite Components

| Component | Figma Page ID | Figma Page Name | Status | Spec |
|---|---|---|---|---|
| Header & Nav | `24084:58112` | ❖ Header & Nav | ✅ Verified | [header-navigation.md](./product/header-navigation.md) |
| Bottom Navigation | `24084:58112` | ❖ Header & Nav (same page) | ✅ Verified | [header-navigation.md](./product/header-navigation.md) |
| Sidebars & Bottom Sheets | `25861:2872` | ❖ Sidebars & Bottom Sheets | ✅ Verified | [sidebars.md](./product/sidebars.md) |
| Cards (all types) | `25865:10547` | ❖ Cards | ✅ Verified | [cards.md](./product/cards.md) |
| Modals | `27043:54960` | ❖ Modals | ✅ Verified | [modals.md](./product/modals.md) |
| Drawer | `17368:2111` | ❖ Drawer | ✅ Verified | [drawer.md](./product/drawer.md) |
| Alerts & Notification | `1158:20439` | ❖ Alerts & Notification | ✅ Verified | [alerts.md](./product/alerts.md) |
| Upload | `1333:24059` | ❖ Upload | ✅ Verified | [file-upload.md](./primitives/file-upload.md) |

---

## Key Organization Notes

> These clarifications correct common misunderstandings about the file structure.

1. **Bottom Navigation is on the Header & Nav page** — Page ID `24084:58112`, Frame `25857:8274`. There is no separate "Bottom Navigation" page.

2. **Comments are inside the Cards page** — Frame `27033:87590` (Desktop) and `27033:87756` (Mobile). Not a standalone component page.

3. **Checkbox includes Radio buttons** — `Type=Radio` is a variant of the Checkbox component (Page ID `1048:18099`).

4. **Alerts & Notification is Composite** — Page ID `1158:20439` is listed under Composite Components in Figma, not Primitives.

5. **Upload page** — Page ID `1333:24059` is grouped under Composite Components in the Figma sidebar, but it contains canonical upload primitives (`File Upload Area`, `Image Upload`, `File Upload Status`). Spec: [file-upload.md](./primitives/file-upload.md).

6. **Drawer is Composite** — Page ID `17368:2111` contains domain-specific Drawer compositions (event creation, editor, keyboard shortcuts), not a generic primitive.

7. **Regular Search Input is separate from Input** — For search patterns always use Page ID `1333:24062`. The main `Input` component does not have a search variant.

8. **Input styles are Rounded and Fill** — not "Default", "Underline", or "Filled".

9. **Badge colors are Blue/Gray/Green/Yellow/Red** — Figma uses these color names, not semantic names like Brand/Neutral/Success/Warning/Error.

---

## Foundations (Non-component Pages)

| Foundation | Figma Page ID | Description |
|---|---|---|
| Colors | `0:1` | Color palette display |
| Color Variables-Token | `13610:4349` | Design token variables |
| Typography | `802:20273` | Type scale and styles |
| Effects | `1158:20442` | Shadows, blurs, elevation |

---

## Layout & Patterns

| Page | Figma Page ID |
|---|---|
| Layout Patterns & Compositions | `25861:2795` |
| Page Examples | `27043:33169` |
| Miscellaneous | `2411:87291` |
