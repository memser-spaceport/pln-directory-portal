# Page Examples

Page examples are **structural references only**. They show how components and layout patterns are assembled into complete pages.

**Critical rule:** Do not recreate components from page screenshots. Use page examples only to understand layout hierarchy and component placement. All components must be instantiated from the Figma library.

---

## Home Page

Layout composition: Full Width + Stack
Figma page: Page Templates / Home Page
Status: TODO verify exact Figma page path

**Sections (approximate):**
- Header & Nav
- Hero / Featured section (full width)
- Featured Focus Areas (grid of Focus Area Cards)
- Recent Updates (horizontal carousel or grid of Updates Cards)
- Featured Teams (grid of Team Cards)
- Recent Forum posts (list of Forum Cards)
- Featured Deals (grid of Deals Cards)
- CTA section

**Notes:**
- Use canonical Header & Nav
- All cards use their canonical product card components
- Do not compose custom hero sections — use canonical card/banner components

---

## Team Page (Team Profile)

Layout composition: Detail / Single Focus
Figma page: Page Templates / Team Page
Status: TODO verify exact Figma page path

**Sections:**
- Header & Nav
- Team hero (logo, name, description, member count, tags)
- Team members grid (Member Cards or Avatar list)
- About / Details section
- Related teams or focus areas

---

## Members Page (Member Directory)

Layout composition: Sidebar + Grid
Figma page: Page Templates / Members Page
Status: TODO verify exact Figma page path

**Sections:**
- Header & Nav
- Search + filter controls (canonical Search Input + Sidebar)
- Directory grid (Member Cards)
- Pagination

**Notes:**
- Sidebar uses canonical `Directory filter` sidebar variant
- Member cards use canonical `Directory Member Cards`

---

## Forum Main Page

Layout composition: Sidebar + List
Figma page: Page Templates / Forum Main Page
Status: TODO verify exact Figma page path

**Sections:**
- Header & Nav
- Category navigation sidebar (or tabs)
- Forum post list (Forum Cards)
- Pinned posts at top
- Create post button (canonical Button)
- Pagination

---

## Deals Main Page

Layout composition: Sidebar + Grid
Figma page: Page Templates / Deals Main Page
Status: TODO verify exact Figma page path

**Sections:**
- Header & Nav
- Search + filter sidebar (Deals filter variant)
- Deals card grid (Deals Cards)
- Pagination

---

## Demo Day Page

Layout composition: Sidebar + Grid or Full Width
Figma page: Page Templates / Demo Day Page
Status: TODO verify exact Figma page path

**Sections:**
- Header & Nav
- Cohort filter sidebar or tab navigation
- Demo Day card grid (Demo Day Cards)
- Featured / hero cohort section
- Pagination

---

## Founder Guides

Layout composition: Sidebar + List or Centered Content
Figma page: Page Templates / Founder Guides
Status: TODO verify exact Figma page path

**Sections:**
- Header & Nav
- Category sidebar navigation
- Guides article list (Founder Guides Cards)
- Featured guide (hero card)
- Pagination

---

## Job Board

Layout composition: Sidebar + Grid or Sidebar + List
Figma page: Page Templates / Job Board
Status: TODO verify exact Figma page path

**Sections:**
- Header & Nav
- Filter sidebar (Job Board filter variant)
- Job listing cards (Jobs Cards)
- Pagination

---

## Modal Examples

**Purpose:** Reference for when and how modals appear in the system.

**Example modals:**
- Delete confirmation dialog
- Invite member dialog
- Quick view — member profile preview
- Apply to job dialog

**Rules:**
- All modal examples use canonical Modal overlay
- Content inside modal uses canonical form and button components

---

## Drawer Examples

**Purpose:** Reference for when and how drawers appear.

**Example drawers:**
- Member detail panel (right drawer)
- Deal detail panel (right drawer)
- Settings panel
- Mobile filter panel (bottom sheet)

**Rules:**
- All drawer examples use canonical Drawer or Bottom Sheet component
- Content inside drawer uses canonical components
