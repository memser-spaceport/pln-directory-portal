# Gantry — Needs & Roadmap

## Overview

Gantry is the PL Infra internal needs-and-roadmap kanban board. PL Infra users submit
needs ("ideas"), signal which ones matter most to them, and follow them across the
board; the product team triages submissions, sets the roadmap priority order, and
moves items through the lanes to Shipped.

Naming note: **Gantry** is the product name. In code the backend module is called
`roadmap` (`apps/web-api/src/roadmap/`, permissions `roadmap.*`, API `/v1/roadmap/*`),
while analytics events use the `gantry_` prefix. The frontend lives in a separate
repository (`pln-directory-portal-v2`) under `app/gantry/` and `services/gantry/`.

Product direction is defined by the **Boost Signaling PRD** (see
[Boost signaling](#boost-signaling-pins) below): a scarce, crowd-authored demand
signal (Boost — implemented in the backend as **pins**) next to a team-authored
roadmap priority order. The two are deliberately separate: boosts signal priority to
the product team; the team sets the final order.

## Where it is in the UI

- URL: `https://<directory-portal>/gantry` → redirects to `/gantry/dashboard` (the
  kanban board). Item detail pages live at `/gantry/<uid>`.
- Navigation: a **Gantry — "Needs and roadmap"** entry appears in the directory
  portal navbar (and in the mobile "More" menu). The entry is only shown to members
  who have view access.
- Without access, visiting `/gantry` shows: *"You do not have access to Gantry. Ask
  an admin to grant roadmap permissions."*

## Getting access (via UI)

Access is permission-based (RBAC v2). Everything is managed from the **Back Office**
(`apps/back-office`) by a directory admin — there is no self-serve request flow yet;
ask an admin.

### Permissions

| Permission code | Grants |
| --- | --- |
| `roadmap.view` | See the Gantry board and item details (minimum to use Gantry at all) |
| `roadmap.idea.create` | Submit a new need/idea |
| `roadmap.item.upvote` | Upvote and pin (boost) items |
| `roadmap.item.edit_own` | Edit/archive your own item while it is still an idea (IDEA/BACKLOG) |
| `roadmap.item.curate` | Product team: edit any item, reorder the roadmap, manage objectives, change settings, see who pinned/upvoted (and their notes) |
| `roadmap.item.transition` | Product team: promote, decline, move items between kanban columns |
| `roadmap.admin` | Aggregate — implies all of the above |

(Defined in `apps/web-api/src/access-control-v2/access-control-v2.constants.ts`;
`ADMIN_PERMISSIONS.DIRECTORY_FULL` also passes the curate gates.)

### How an admin grants access

Two paths in the Back Office:

1. **Per-permission (recommended for product team / one-offs):**
   Back Office → **Access Control** (`/access-control`) → open the permission (e.g.
   `roadmap.admin` at `/access-control/permissions/roadmap.admin`) → **Members** tab →
   **Add member** (direct grant), or **Roles** tab to attach the permission to a role.
   Product-team curate/transition access is granted this way by convention — as
   direct member grants, not via a policy (see migration
   `20260528120000_add_roadmap_rbac`).

2. **Via policy (regular PL Infra users):**
   Back Office → **Members** → edit the member → **RBAC section** → assign the
   **`pl_infra_team_pl_internal`** policy. That policy carries the standard user
   bundle: `roadmap.view`, `roadmap.idea.create`, `roadmap.item.upvote`,
   `roadmap.item.edit_own`.

> Note: roadmap permissions were intentionally **removed** from the
> `directory_admin_pl_internal` policy (`20260529140000_remove_roadmap_from_directory_admin`).
> Being a directory admin does not by itself grant Gantry usage — grant `roadmap.admin`
> explicitly if an admin needs it.

The frontend resolves these via `useGantryAccess()` and gates every control
accordingly (e.g. the upvote button is disabled without `roadmap.item.upvote`;
drag-to-reorder only appears with `roadmap.item.curate`).

## The board

### Stages (lanes)

| Stage (code) | UI label | Who puts items here | Signals |
| --- | --- | --- | --- |
| `IDEA` | Submitted | Any user with `idea.create` | Upvote + pin (interactive) |
| `BACKLOG` | Backlog | Product team | Frozen — entering releases pins |
| `PLANNED` | Planned | Product team (promote) | Upvote + pin interactive; team rank order |
| `IN_PROGRESS` | In Progress | Product team | Frozen — entering releases pins; team rank order |
| `SHIPPED` | Shipped | Product team | Frozen snapshot |
| `DECLINED` | Declined | Product team (decline, reason required) | Frozen — entering releases pins |

`DECLINED` and `BACKLOG` columns are hidden by default in the board view.

### Using Gantry as a regular user

- **Submit a need**: "Share a need" → title, description, optional acceptance
  criteria, type (Bug / Improvement / Feature Request), tags, focus area. Submitting
  is always free and unlimited — it is never gated by your boost budget.
- **Upvote**: one per item; optional note (max 500 chars).
- **Boost (pin)**: spend one of your scarce pins (default budget: 3) on an item in
  Submitted or Planned to tell the product team it's a priority for you. Optional
  one-line "why now" note. Max one pin per item. Remove a pin any time to get it
  back. At zero budget you can swap in one motion (remove one + pin another). Pinning
  also counts as an upvote automatically.
- **Anonymity**: pin/upvote *counts* are public; *who* pinned and the note text are
  visible to the product team only.
- **Boost return**: when an item you pinned is committed (moves to In Progress) or
  leaves play (Backlog / Declined / archived), the pin returns to your budget
  automatically.
- **Sorting** the Submitted lane: Trending (time-decayed pins, 14-day half-life,
  default), Top (raw pins), New (recency). All sorts tie-break by recency, so fresh
  unboosted items stay discoverable.

### Using Gantry as the product team (curate/transition)

- **Triage**: promote ideas onto the roadmap (Planned) or decline with a required
  reason; move items across kanban columns. The creator gets an in-app notification
  on promote, decline, and ship.
- **Roadmap order**: drag-and-drop to set explicit priority order on Planned and
  In Progress (stored as a fractional `order` value). Crowd boosts never reorder the
  roadmap — they're advisory input only.
- **Review demand**: on any item, see the list of pinners and upvoters with their
  notes (`curate`-gated endpoints) to weight the signal and follow up.
- **Objectives (OKR chips)**: create/assign an objective to roadmap items and filter
  the board by it. Objectives feed no score — re-tagging each quarter is harmless.
- **Settings**: tune the pin budget size (`PATCH /v1/roadmap/settings`, default 3).
  Scarcity is the point — bump it only if users routinely max out.

## Boost signaling (pins)

The Boost Signaling PRD (LabOS · Gantry, 2026-06-09) defines the target model:

- One scarce signal (**Boost**) drawn from a per-user budget (default 3,
  admin-tunable). Binary per item, re-allocatable, returned on commitment.
- The free per-item **like is removed** and migrated into boosts (recount on
  Submitted+Planned; In Progress likes returned; over-budget users grandfathered).
- Team-authored **rank badges** (#1, #2…) on Planned/In Progress + OKR chips.
- In-app notifications: new need submitted (group), boost returned (item →
  In Progress), backed item shipped, submitter's need shipped.

**Implementation status**: the backend pin machinery is live (budget, notes, swap,
release-on-commitment, balance endpoint, pinners list, trending sort, reorder,
objectives, settings), and the PRD §7 notifications are implemented (see below).
The frontend currently ships the **upvote** UI only — the boost affordance, budget
counter, run-out swap, opt-in boost-on-submit, rank badges, and the like→boost
migration are not yet built (UI explorations live in
`prototypes/entries/gantry-priority-support/` in the frontend repo).

## Notifications (in-app)

All Gantry notifications go through the in-app bell (`PushNotificationsService`,
category GANTRY, metadata `{ eventType: 'roadmap', itemUid, trigger? }`); failures
are logged and never fail the underlying action. Copy lives in one place —
`ROADMAP_NOTIFICATION_COPY` in `apps/web-api/src/roadmap/roadmap.constants.ts` — so
the planned "pin"→"boost" wording swap is a one-file change. Links point at
`/gantry/<uid>` (built by `itemDetailPath`).

| Trigger | Recipients | Title — Description |
| --- | --- | --- |
| New need submitted (IDEA only — curator direct-creates don't broadcast) | everyone holding `roadmap.view` or `roadmap.admin` (one permission-gated notification, not per-member fan-out) | New need: "{title}" — Take a look — boost it if it matters to you. |
| Item enters In Progress | each member whose pin was just auto-released | "{title}" is now in progress — Your boost budget is back — spend it on what matters next. |
| Item ships | every member who ever pinned it (released pins included, deduped; creator excluded — they get the dedicated line below) | "{title}" just shipped 🎉 — Something you boosted is now live. |
| Item ships | original submitter | Your need "{title}" just shipped 🎉 — It's live now — go try it out. |
| Need declined | original submitter | Your need "{title}" was not taken forward — Reason: {reason} |

No double-fire on IN_PROGRESS → SHIPPED: pins are released exactly once (at
IN_PROGRESS), so the boost-returned notification cannot repeat at SHIPPED. Moves to
BACKLOG/DECLINED also return pins but intentionally send no boost-returned
notification (PRD lists only the In Progress return).

For engineering conventions and invariants (budget state machine, attribution
boundary, stage groups), see the **`gantry-boost-signaling`** Claude skill at
`.claude/skills/gantry-boost-signaling/SKILL.md`.

## Data model

All models in `apps/web-api/prisma/schema.prisma`:

- **`RoadmapItem`** — title, description, acceptance criteria, `stage`, type, tags,
  focus area, `order` (Float — team rank), creator, promoted-by/at, declined reason,
  external tracker URL, `objectiveUid`, soft-delete fields.
- **`RoadmapItemUpvote`** — one per (item, member), optional note. The v0 "like".
- **`RoadmapItemPin`** — the boost. One *active* pin per (item, member) (partial
  unique index `WHERE releasedAt IS NULL`); `releasedAt` set on unpin or when the
  item leaves a pinnable stage — released rows are the frozen history.
- **`RoadmapObjective`** — OKR chip: unique title, display order, assigned items.
- **`RoadmapSettings`** — single row; `pinLimit` (default 3).

## API quick reference

Base: `/v1/roadmap` (guards: `UserTokenCheckGuard` + `RbacGuard`). Contracts in
`libs/contracts/src/lib/contract-roadmap.ts`.

| Endpoint | Method | Permission | Purpose |
| --- | --- | --- | --- |
| `/items` | GET | view | List/filter/sort (`default`, `trending`, `top_pins`, `newest`) |
| `/items/:uid` | GET | view | Detail incl. viewer's upvote/pin state |
| `/items` | POST | idea.create | Submit a need (curators may create directly in PLANNED/IN_PROGRESS) |
| `/items/:uid` | PATCH / DELETE | view (owner/curate checked in service) | Edit / archive (archiving releases pins) |
| `/items/:uid/promote` · `/decline` · `/transition` | POST | item.transition | Stage moves; decline requires a reason |
| `/items/:uid/upvote` | POST / DELETE | item.upvote | Like with optional note (IDEA/PLANNED only) |
| `/items/:uid/pin` | POST / DELETE / PATCH | item.upvote | Boost (optional note, optional `swapItemUid`) / unpin / edit note |
| `/pins/me` | GET | view | `{ limit, used, remaining, pins }` budget summary |
| `/items/:uid/pins` · `/upvotes` | GET | item.curate | Who pinned/upvoted + notes (product team only) |
| `/items/reorder` | POST | item.curate | Bulk set roadmap rank order |
| `/objectives` | GET / POST | view / item.curate | List / create-or-find objective |
| `/items/:uid/objective` | PATCH | item.curate | Set/clear an item's objective |
| `/settings` | GET / PATCH | view / item.curate | Read / tune the pin budget |

## Reference files

```
apps/web-api/src/roadmap/                    # backend module (controller, services, constants)
apps/web-api/src/access-control-v2/access-control-v2.constants.ts  # ROADMAP_PERMISSIONS + roadmap.admin expansion
apps/web-api/prisma/migrations/20260528120000_add_roadmap_rbac/    # permission + policy seeding
libs/contracts/src/{lib/contract-roadmap.ts,schema/roadmap.ts}     # ts-rest contracts
apps/back-office/pages/access-control/       # where admins grant roadmap permissions
.claude/skills/gantry-boost-signaling/SKILL.md  # engineering conventions / PRD deltas

# Frontend repo: /Users/ghost/Work/PLN/pln-directory-portal-v2
app/gantry/                                  # routes (/gantry → /gantry/dashboard)
components/page/gantry/                      # board, detail page, access guard
services/gantry/                             # types, stage labels, API hooks
services/rbac/hooks/useGantryAccess.ts       # permission flags for UI gating
prototypes/entries/gantry-priority-support/  # boost-UI design explorations (not production)
```
