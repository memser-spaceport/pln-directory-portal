# Cards Component

Figma page: `❖ Cards`
Page ID: `25865:10547`
Canonical path: `Composite Components / Cards`
Status: **✅ Verified** — MCP inspection confirmed all card groups

---

## Purpose

All product card types for PL Network / LabOS are on this single Figma page. Comments are also embedded here.

---

## Card Groups on This Page

### Focus Area Cards

Frame: `27033:87144` — "Cards Focus Area"
**Variants (Property 1):** Card Focus Area 1–5

---

### Member Cards

- `Member Card Desktop` — 289×236px instance
- `Member Card Mobile` — 176×138px instance

---

### Team Cards

- `Team Card Desktop` — 289×269px instance
- `Team Card Mobile` — 176×186px instance

---

### Homepage Cards

Frame: `27033:87125` — "Homepage Cards"
**Variants (Property 1):** Card Investor, Card OH, Card Demo Day
Size: 390px wide, 88px h

---

### Updates / Notification Cards

Frame: `27033:86830` — "Updates Desktop"
**Variants (Property 1):**
- DD 1 Notification
- DD 2 Notification
- Events 1 Notification
- Events 2 Notification
- Forum 1–4 Notification
- OH Notification

---

### Demo Day Landing Page Cards

Frame: `27033:87367` — "DD Landing Page Desktop"
**Variants:**
- PL DD Upcoming
- PL DD Reg Open
- PL DD Active
- Partner DD Reg Open
- Partner DD Active
- Card Completed DD

Frame: `27033:87438` — "DD Landing Page Mobile"
**Variants:** PLDD Upcoming, Partner DD Upcoming, Completed DD

---

### Jobs Cards

Frame: `27033:85860` — "Card Jobs Desktop" (940×435px/875px)
Frame: `27033:86091` — "Card Jobs Mobile" (400×499px/1200px)
**Property 1:** Default, Expanded

---

### Card Topic (Founder Guides / Forum)

Frame: `27033:87492` — "Card Topic"
**Property 1:** Default, Hover, Disabled, Request Topic
Size: 286×229px

---

### Office Hours Cards

Frame: `27033:87526` — "Card OH Desktop" (900×156px)
Frame: `27033:87560` — "Card OH Mobile" (368×236px)
**Property 1:** Team, Member

---

### Comments

Frame: `27033:87590` — "Comments Desktop"
Frame: `27033:87756` — "Comments Mobile"
**Desktop Property 1:** Comments Empty, Comments Typing, Comments Filled, Comments Published (1), Comments Published (7)
**Mobile includes:** @mention typing state

---

### Deals Cards

- `Card Deals Default` (desktop 900×174px, mobile 400×185px)
- Frame `27033:87472` — "Deals Empty": Card Empty, Card Filters Empty
- Frame `27033:86359` — Sorting controls (desktop + mobile)

---

### Team Fundraising Cards

Frame: `27033:86366` — "Team Fundraising Cards"
**Property 1:** Card Large, Card Large Empty, Card Large Empty Founders, Card Small

Frame: `27033:86608` — "Team Fundraising Cards Investors"
**Property 1:** Investors, Founders

---

### Forum Posts

- `Forum Post Desktop` — 852×182px instance
- `Forum Post Mobile` — 368×206px instance

---

### Badge OH (Availability)

Frame: `27033:87326` — "Badge OH"
**Status:** Available to connect, Frequently Booked

---

### Card News

- `Card News` — 594×192px instance

---

## Usage Rules

1. Use `Member Card Desktop` / `Member Card Mobile` for member directory grids
2. Use `Updates Desktop` for homepage and profile activity feeds
3. Use `Comments Desktop/Mobile` for all comment threads — never recreate comment UI
4. Use `Card OH Desktop/Mobile` for office hours entries
5. Use `Card Jobs Desktop/Mobile` with Expanded variant for full job post view
6. Always use the `Deals Empty` variant when no deals are available for current filters
7. Use `Badge OH` for availability status labels on Member and Team cards

---

## AI Instructions

- Always instantiate cards from Figma library: `Composite Components / Cards`
- Select the specific card group (Members, Teams, Forum, Deals, etc.) by frame name
- For comments, use the Comments frames — never build custom comment UIs
- Preserve Desktop/Mobile variant pairs — never use desktop card in a mobile layout
- Never create new card layouts; use the established component types
