---
date: 2026-05-13
topic: teams-data-quality-page
---

# Teams Data Quality Page

## What We're Building

An admin-only "Data Quality" page under the Teams section that lets admins review and approve AI-enriched team fields. The page shows a table of teams that have at least one non-high-confidence enriched field, with visual indicators per field showing quality and data source. Clicking a row opens an edit modal with per-field approval toggles.

Two touch points in the existing UI:
1. **Teams nav item** — currently a plain link; becomes a dropdown with two options: "Teams" (existing `/teams`) and "Data Quality" (new page).
2. **New page** at `/teams/data-quality` — table + modal workflow for reviewing enrichment.

## Why This Approach

The backend already has all required API endpoints (merged PR #3116):
- `GET /v1/admin/teams/enrichment-review` — paginated list of teams with reviewable fields
- `PATCH /v1/admin/teams/:uid/enrichment-review/fields` — approve specific fields (marks high-confidence, promotes to team profile)

We scope the table to **only teams needing review** (non-high-confidence fields), matching the existing API. This avoids adding a new backend endpoint and keeps the page focused on actionable data.

## Key Decisions

- **Navigation**: Add dropdown to existing Teams nav item using the `NavItemWithMenu` component pattern already used by Members/Demo Days/IRL Gathering headers. Admin-only option hidden from non-admin users.

- **Route**: `/teams/data-quality` as a simple App Router page (not parallel routes). The existing teams listing uses `@content`/`@filters` parallel route slots, but that complexity is unnecessary for a single-purpose admin view.

- **Table columns**: Team Name + one column per reviewable field key (`website`, `blog`, `contactMethod`, `twitterHandler`, `linkedinHandler`, `telegramHandler`, `shortDescription`, `longDescription`, `moreDetails`, `industryTags`, `investmentFocus`, `logo`). Columns without data for a given row show empty/dash.

- **Cell content**:
  - **Error icon** — all returned fields are non-high-confidence by definition, so all cells with content show an error/warning icon (needs review)
  - **Badge** — `promotable: false` → "User" badge; `promotable: true` → "AI" badge

- **Search & filter**: Client-side text search by team name (the paginated API doesn't support search, so we load all reviewable teams — the dataset is bounded). Filter by field (show only rows that have a specific field needing review).

- **Edit modal**: Opens per row. Lists all fields returned for that team. Each field shows: current value, source badge, judgment note/score, and a toggle. Toggle ON = call `PATCH /v1/admin/teams/:uid/enrichment-review/fields` with that field key. Once approved, the toggle becomes disabled/read-only (no unapprove API exists).

- **API layer**: Next.js API route at `/api/teams/data-quality` proxies to backend. Follows existing `teamsApi.ts` co-location pattern. React Query for data fetching + cache invalidation after approval.

- **Access control**: Page and nav dropdown entry are only rendered for admin users. Follow existing admin guard pattern (check `isAdmin` flag from auth context, which already gates other admin views).

## Open Questions

- Should the Teams dropdown also include "Add Team" (currently at `/teams/add`) for convenience, or keep only "Teams" and "Data Quality"?
- Should pagination be server-side (use `page`/`pageSize` query params) or client-side? The API supports server-side pagination but the total dataset may be small enough that loading all at once is fine.
- Should approving all fields in a modal row remove it from the table, or keep it visible until the page refreshes?

## Next Steps

→ `/workflows:plan` for implementation details
