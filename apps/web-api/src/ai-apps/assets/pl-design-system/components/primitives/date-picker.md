# Date Picker

Figma page: `❖ Date Picker`
Page ID: `1467:24996`
Canonical path: `Primitive Components / Date Picker`
Status: **Verified** — Figma MCP `get_metadata`

---

## Main symbols & frames

| Frame | Role |
|---|---|
| `14400:35519` — Date Picker | Input-style trigger (400×76) |
| `14400:34671` — `_BaseDatePickerDropdown / Signle Month` | Single-month popover (Figma spelling: Signle) |
| `22995:6927` — `_BaseDatePickerDropdown / Range - Multiple Months` | Multi-month range popover |
| `22981:30337` — `_BaseDatePickerDropdown / Year & Month List` | Month/year pick lists |
| `22969:24366` — `_BaseDateSelector` | Header strip (prev/next, month label) |
| `1864:62830` — `_BaseCalendarDate` | Individual day cells |
| `5015:106879` — `_BaseCalendarMonth` | Month tile |
| `14387:9638` — `_BaseCalendarDay` | Weekday labels |
| `14387:11465` — `_BaseActiveDot` | Event/mark dots on days |
| `22981:38382` — dropdown button | Nav control in header |
| `22981:38567` — Period Range | Quick range chip |

---

## Date Picker (field)

- **State**: Default, Click, Active

---

## Dropdown: single month

- **Type**: Basic, Range
- **Size**: Medium, small

---

## Dropdown: range — multiple months

- **Size**: Large, small

---

## Year & month list

- **Type**: Months, Years

---

## Date selector (header)

- **Type**: Center, Left side
- **Size**: Medium (56px h), Small (36px h)
- **Dropdown - month**: true, false

---

## Calendar day cell (_BaseCalendarDate)

- **State**: Default, Hover, Active - Default Style, Active - Custom Style, Disable
- **Connection**: Default, Left Rounded ⬅️, Square 🟦, Right Rounded ➡️ (range spans)
- **Style**: Rounded, Circle
- **Size**: Small (36×36), Medium (48×48)

---

## Active dot

- **Color**: Blue, Green, Yellow, Red, Gray, White

---

## Period range chip

- **State**: Default, Hover, Active, Disabled

---

## Rules

- Instantiate calendar grids and dropdowns from this page — do not redraw cells or range highlights.
- Preserve Figma property spellings (`Signle`, emoji in Connection names) when documenting variants for handoff.

---

## AI instruction

Instantiate from `Primitive Components / Date Picker` in the Figma library. If unavailable:

```
Missing canonical component: Date Picker
```
