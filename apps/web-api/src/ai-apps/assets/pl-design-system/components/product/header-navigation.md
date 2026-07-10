# Header & Navigation Component

Figma page: `❖ Header & Nav`
Page ID: `24084:58112`
Frames:
- `24084:70668` — "Header Desktop"
- `25855:3675` — "Header Mobile"
- `25857:8274` — "Bottom Nav" ← **Bottom Navigation lives on this same page**
Canonical path: `Composite Components / Header & Nav`
Status: **✅ Verified** — MCP inspection confirmed full variant matrix

---

## Purpose

Primary navigation surface for PL Network / LabOS. Includes the desktop header, mobile header, and mobile bottom navigation.

---

## Header Desktop

Width: 1440px | Height: 80px

**State variants:**
| State | Description |
|---|---|
| `Not logged in` | Anonymous visitor |
| `Not logged in More Open` | "More" menu expanded (logged out) |
| `Not logged in Notifications open` | Notification panel open (logged out) |
| `Logged in` | Authenticated user |
| `Dropdown Open` | User avatar dropdown expanded |
| `Directory open` | Directory mega-menu open |
| `Events open` | Events mega-menu open |
| `More Open` | "More" overflow menu expanded (logged in) |
| `Notifications Open` | Notification panel open (with content) |
| `Notifications Empty` | Notification panel open (empty state) |

**Color**: Light (dark variant TODO: verify)

---

## Header Mobile

Width: 400px | Height: 56px

**Variants:**
| Property 1 | Description |
|---|---|
| `Logged In` | Authenticated |
| `Logged In Dropdown Open` | User menu expanded |
| `Logged In Notif Open` | Notifications open |
| `Logged In Notif Empty` | Notifications empty |
| `Header Mobile Logged Out` | Anonymous |
| `Not Logged In` | Anonymous (alternate) |
| `Not Logged In Notif Open` | Notifications open (logged out) |

---

## Bottom Navigation

Width: 400px | Height: 93px
**This component lives on the Header & Nav page, not a separate page.**

**Variants (Property 1):**
| Value | Description |
|---|---|
| `Bottom Nav Default` | Home active |
| `Bottom Nav Directory` | Directory active |
| `Bottom Nav Demo Day` | Demo Day active |
| `Bottom Nav Events` | Events active |
| `Bottom Nav Logged In More` | More menu (logged in) |
| `Bottom Nav Not Logged In More` | More menu (not logged in) |

---

## Usage Rules

1. Use Header Desktop for breakpoints ≥ 1440px wide views
2. Use Header Mobile for breakpoints < 768px
3. Always pair Header Mobile with Bottom Nav on mobile experiences
4. Select the correct authentication State — do not show logged-in header for anonymous users
5. Do not recreate navigation items, logo, or icon buttons within the header

---

## AI Instructions

- Always instantiate from Figma library: `Composite Components / Header & Nav`
- Bottom Navigation is accessed from the same page (Page ID `24084:58112`, Frame `25857:8274`)
- Use the correct `State` or `Property 1` variant matching the authentication context
- Never manually recreate header layout, logo, or nav items
- Pair mobile Header with Bottom Nav on all mobile page examples
