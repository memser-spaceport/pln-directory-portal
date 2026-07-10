# Tables (Product)

Canonical Figma path: `Product Components / Tables`
Status: TODO verify exact variant names via MCP

---

## Purpose

Domain-specific data tables for structured content display. Each table type is a distinct canonical component.

---

## Table types

| Table | Content | Use case |
|---|---|---|
| Member table | Avatar, name, role, team, status | Directory data views |
| Orders table | Order ID, item, amount, status, date | Transaction listings |
| Uploaded files table | Filename, size, uploader, date, status | File management |
| Transaction table | ID, type, amount, date, status | Financial records |
| Leaderboard | Rank, avatar, name, metric, change | Rankings and scoring |

---

## Table features

- **Sorting** — click column header to sort ascending/descending
- **Filtering** — inline filter or connected sidebar filters
- **Row actions** — via Action Cell (canonical Icon Button or Context Menu)
- **Selection** — checkbox column for multi-row select (uses canonical Checkbox)
- **Pagination** — below table using canonical Pagination component

---

## Rules

- Use product table components — do not compose from raw `<table>` HTML
- Column headers use canonical sorting treatment
- Row action buttons use canonical Icon Button and Context Menu
- Empty state in table uses canonical Empty component
- Pagination uses canonical Pagination component

---

## AI instruction

Instantiate from `Product Components / Tables` in the Figma library. If unavailable:
```
Missing canonical component: Tables
```
