# Overlay Patterns

Overlays appear on top of existing page content. They must use canonical overlay components — never raw div-based approximations.

**Rule:** Always use canonical Modal, Drawer, or Bottom Sheet components. Do not stack overlays. Preserve focus trapping.

---

## Modal

Canonical component: `Primitive Components / Drawer` (modal variant) or dedicated Modal component
Status: TODO verify exact canonical path — check if Modal is a Drawer variant or a distinct component in Figma

**Purpose:**
Focused, blocking overlay for confirmation dialogs, forms, and important decision points.

**Use for:**
- Confirmation dialogs (Delete, Leave, Cancel)
- Multi-step forms that don't require full-page navigation
- Quick view / preview of a member, team, or deal
- Image/media lightbox

**Anatomy:**
- Backdrop (semi-transparent dark overlay)
- Modal container (centered, constrained width)
- Header (title + close button)
- Body content
- Footer actions (primary + secondary Button)

**Rules:**
- Modal must trap focus (keyboard users cannot tab outside)
- Close on backdrop click (unless destructive — confirm first)
- Close on Escape key
- Only one modal can be open at a time — do not stack modals
- Footer uses canonical Button components
- Do not compose a modal from raw divs + `position: fixed`

---

## Drawer

Canonical component: `Primitive Components / Drawer`
Status: TODO verify exact variant names via MCP

**Purpose:**
Slide-in side panel for secondary content, filters, detail views, or settings.

**Position variants:**
- Right drawer (default — detail, settings, filters on desktop)
- Left drawer (navigation, secondary menu)
- Bottom — see Bottom Sheet

**Use for:**
- Member detail panel in directory (right drawer)
- Deal detail panel (right drawer)
- Mobile filter panel → use Bottom Sheet instead

**Rules:**
- Drawer must trap focus
- Close on backdrop click
- Close on Escape key
- Do not use Drawer for primary navigation
- Mobile Drawer becomes Bottom Sheet
- Do not stack Drawers — only one active at a time

---

## Bottom Sheet

Canonical component: `Primitive Components / Drawer` (bottom position) or `Product Components / Sidebars & Bottom Sheets`
Status: TODO verify exact canonical path

**Purpose:**
Mobile bottom slide-up panel. The mobile equivalent of a Drawer or filter sidebar.

**Use for:**
- Mobile filter panel (replaces desktop Sidebar)
- Mobile action sheet (replaces desktop Context Menu when many actions)
- Mobile detail drawer

**Rules:**
- Mobile only — do not use Bottom Sheet on desktop
- Swipe-down to dismiss
- Backdrop tap to dismiss
- Must trap focus when open
- Use canonical Drawer (bottom variant) — do not build custom CSS `translateY` animation
