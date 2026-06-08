---
date: 2026-06-05
topic: data-quality-table-row-redesign
---

# Data Quality Table — Row/Column Redesign

## What We're Building

Upgrade the Teams Data Quality table so each row exposes field-level review actions directly,
without requiring the user to open a modal first. The "Needs Review" column is replaced with
a per-field list that shows the current value, a quality badge, and inline confirm/edit/apply
buttons. The Actions column gains a "Confirm all" button. Priority and Team columns are frozen
(sticky) so they remain visible while the Needs Review column scrolls.

Reference: `data-quality-prototype (6).html` (local scratch file).

## Why This Approach

Three approaches were considered:

**A — In-place chip replacement (no extract):** Edit only `DataQualityTable.tsx` and the SCSS.
Fastest but the `needsReview` cell renderer would grow very large.

**B — Extract `NeedsReviewCell` component (Recommended):** Same visual outcome, but the
per-field list logic lives in its own file. Keeps `DataQualityTable.tsx` readable and makes
the cell independently testable. Minimal extra files (1 new component + SCSS additions).

**C — Add two-pane detail drawer:** Matches the full prototype (table + sticky right-side
detail pane). Out of scope for this iteration; the screenshot shows only the table view.

We go with **B**.

## Key Decisions

- **NeedsReviewCell component**: A new `NeedsReviewCell.tsx` renders the vertical list of
  low-quality fields. Each row: field name → current value (truncated) → quality badge
  (Low + source icon) → icon buttons (✎ edit, ✓ confirm). For fields with an `alternative`
  value, an AI suggestion card ("✦ AI suggestion: …  Apply") appears below.

- **AI suggestion source**: `FieldEntry.alternative.content` with `fromSide: 'enrichment'`
  is the AI candidate. `fromSide: 'team'` is the user value stored alongside AI content.
  The suggestion card renders when `alternative` is present and `fromSide === 'enrichment'`.

- **Inline Confirm (✓) behavior**: Fires `PATCH /v1/admin/teams/:uid/enrichment-review`
  immediately for the single field. On success the field row is removed from the cell.
  Optimistic UI: remove the row immediately, restore on error.

- **Apply AI suggestion**: Writes the `alternative.content` to the field value via the same
  PATCH endpoint, then removes the row. Same optimistic-remove pattern.

- **"Confirm all" button**: Sends one PATCH per low field (parallel), or a batch call if the
  backend supports it. On full success the "Confirm all" button changes to a "✓ Confirmed"
  badge. The Edit button remains.

- **Edit button (Actions column)**: Unchanged — opens the existing EditModal for the team.

- **Pencil (✎) per field**: Opens EditModal scoped to that field (if the modal supports
  pre-selecting a field tab) or the full modal as a fallback.

- **Sticky columns**: `position: sticky` on Priority (left: 0) and Team (left: ~80 px).
  Both th and td need matching sticky declarations. A subtle box-shadow on the right edge
  of the Team column marks the freeze boundary.

- **Row height**: Rows become variable-height because the Needs Review list can be 1–5 items
  tall. `vertical-align: top` on td is appropriate; sticky column tds must also set
  `background` to avoid bleed-through.

- **Quality badge for "Low"**: Amber pill with source icon (sparkle = AI, person = user),
  matching the prototype's `.quality-badge.low` style.

- **No-issues state**: When a team has zero low-quality fields the Needs Review cell shows
  a faint italic "All good — no low-quality fields" message and the Actions column shows
  "✓ Confirmed" instead of "Confirm all".

## Data Mapping (existing API types)

```ts
// FieldEntry (already in useTeamsEnrichmentReview.ts)
//   .content              → current value shown in the row
//   .metadata.source      → 'ai' | 'open-graph' | 'scrapingdog' | undefined
//   .metadata.status      → 'Enriched' | 'ChangedByUser' | 'CannotEnrich'
//   .judgment.confidence  → 'high' | 'medium' | 'low'
//   .judgment.verdict     → 'agrees' | 'disagrees' | 'uncertain'
//   .alternative          → { content, fromSide: 'team' | 'enrichment' }
//                            render suggestion card when fromSide === 'enrichment'
```

`needsReview(team, key)` and `isAIEnriched(entry)` from `constants.ts` remain unchanged.

## Files to Change

| File | Change |
|---|---|
| `components/teams/data-quality/NeedsReviewCell.tsx` | **New** — per-field row list |
| `components/teams/data-quality/DataQualityTable.tsx` | Use NeedsReviewCell; add sticky; update Actions column |
| `pages/teams/data-quality.module.scss` | Add sticky-col styles; review-item styles; action button styles |

The EditModal and useTeamsEnrichmentReview hook are **not** changed.

## Open Questions

- Does the PATCH endpoint accept a batch payload for "Confirm all", or must we fire N requests?
- Should the ✎ per-field pencil open the full EditModal or a scoped single-field edit?
  (Prototype shows inline text edit; current codebase has the full modal only.)

## Next Steps

→ `/workflows:plan` for implementation details
