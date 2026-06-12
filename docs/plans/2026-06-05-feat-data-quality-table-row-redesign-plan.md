---
title: "feat: Data Quality Table — Per-Field Row Redesign"
type: feat
date: 2026-06-05
brainstorm: docs/brainstorms/2026-06-05-data-quality-table-row-redesign-brainstorm.md
---

# feat: Data Quality Table — Per-Field Row Redesign

## Overview

Replace the chip-based "Needs Review" column with a detailed per-field list that exposes inline
confirm, apply-AI, and edit actions directly in the table row. Freeze the Priority and Team
columns. Add a "Confirm all" button to the Actions column.

Reference design: `data-quality-prototype (6).html` (local scratch).
Screenshot: confirmed in brainstorm session.

---

## Problem Statement

The current table shows field names as small chips. An admin has to open the EditModal for every
team to see field values, quality reasons, and take action. The redesign surfaces everything
needed for quick review directly in the table, eliminating most modal round-trips.

---

## Proposed Solution

Three focused changes, each independently deliverable:

1. **NeedsReviewCell** — new component rendering a vertical list of low-quality fields
2. **Sticky columns** — wire the existing `.stickyCol` CSS class to Priority and Team `<th>`/`<td>`
3. **Actions column** — add "Confirm all" button; track per-team confirmed state

---

## Technical Approach

### Architecture

```
data-quality.tsx (page)
  ├── owns: authToken, onEdit callback
  ├── owns: onConfirmFields(teamUid, fields[]) — mutation wrapper
  └── DataQualityTable.tsx
        ├── owns: confirmedFields Map<teamUid → Set<FieldKey>>  (optimistic state)
        ├── columns: Priority (sticky), Team (sticky), Last Enrichment, Needs Review, Actions
        └── NeedsReviewCell.tsx
              ├── renders: per-field rows (field name, value, badge, buttons)
              └── renders: AI suggestion card when alternative.fromSide === 'enrichment'
```

### Mutation hook refactor (`useApproveEnrichmentFields`)

The existing hook accepts `teamUid` as a hook parameter, making it impossible to call once
for all teams. **Refactor** so `teamUid` is part of the mutation variables, not the hook
initialization:

```ts
// Before:  useApproveEnrichmentFields(teamUid, authToken)
// After:   useApproveEnrichmentFields(authToken)
//           mutate({ teamUid, fields: [{ key, content? }] })
```

This single hook instance lives in `DataQualityTable.tsx` (or the page) and handles all teams.

### Local optimistic state

`DataQualityTable` holds `confirmedFields: Map<string, Set<FieldKey>>` in `useState`.
When a field confirm/apply succeeds optimistically:

```
confirmedFields.get(teamUid).add(key)  →  NeedsReviewCell filters it out
```

On mutation error: remove the key from the set (restore the row).
On React Query refetch success (query invalidation): clear the local set (server is now source
of truth and the team's row will have updated data).

### Concurrency guard

While a per-field ✓ or "Confirm all" mutation is in-flight for a given team, disable all other
confirm/apply buttons for that same team. Track this with a `pendingTeams: Set<string>` state.

---

## Implementation Phases

### Phase 1 — Sticky Columns (CSS + table wiring)

**Files:** `DataQualityTable.tsx`, `data-quality.module.scss`

The `.stickyCol` class already exists in the SCSS but is unwired. Two columns need different
`left` offsets, so add two sub-classes:

**SCSS additions:**

```scss
/* data-quality.module.scss */

.stickyPriority {
  position: sticky;
  left: 0;
  z-index: 2;
  background: inherit;          /* inherits from th (#f9fafb) or td (#fff) */
  box-shadow: none;
}

.stickyTeam {
  position: sticky;
  left: 80px;                   /* width of Priority column */
  z-index: 2;
  background: inherit;
  box-shadow: 1px 0 0 #eee;     /* freeze boundary line */
}

/* Ensure body cells in sticky cols stay opaque on hover */
.tr:hover .td.stickyPriority,
.tr:hover .td.stickyTeam {
  background: #f9fafb;          /* matches .tr hover td background */
}
```

**DataQualityTable.tsx wiring:**

```tsx
// Priority column th/td
<th className={clsx(s.th, s.thSortable, s.stickyPriority)} ...>

// Team column th/td  
<th className={clsx(s.th, s.stickyTeam)} ...>
```

Also change `vertical-align` on `.td` from `middle` to `top` to handle variable-height rows.

---

### Phase 2 — NeedsReviewCell Component

**Files:** `NeedsReviewCell.tsx` (new), `data-quality.module.scss`

#### Props interface

```ts
interface NeedsReviewCellProps {
  team: EnrichmentTeam;
  confirmedKeys: Set<FieldKey>;    // optimistic removes from parent
  isPending: boolean;              // true while a mutation is in-flight for this team
  onConfirm: (key: FieldKey) => void;
  onApply: (key: FieldKey, content: string) => void;
  onEdit: (team: EnrichmentTeam) => void;
}
```

#### Rendering logic

```
lowFields = FIELD_KEYS
  .filter(key => needsReview(team, key) && !confirmedKeys.has(key))
  .filter(key => getEntry(team, key)?.judgment?.confidence !== 'high'
               || getEntry(team, key)?.judgment?.verdict !== 'agrees')

if lowFields.length === 0:
  → render faint "All good — no low-quality fields"

else:
  → render <div.reviewList>
       for each key in lowFields:
         entry = getEntry(team, key)
         value = formatFieldContent(entry.content)   // from utils.ts, truncates to 100 chars
         isAI  = isAIEnriched(entry)                // from constants.ts
         hasSuggestion = entry.alternative?.fromSide === 'enrichment'
                      && !!entry.alternative?.content

         → <div.reviewItem>
              <span.fieldName>{FIELD_LABELS[key]}</span>
              <span.fieldValue title={fullValue}>{value || '(no value)'}</span>
              <span.qualityBadge.low>
                {isAI ? <SparkleIcon/> : <UserIcon/>}
                Low
              </span>
              <span.cellActions>
                <button.iconBtn aria-label={`Edit ${FIELD_LABELS[key]}`}
                                onClick={() => onEdit(team)}
                                disabled={isPending}>
                  <PencilIcon/>
                </button>
                <button.iconBtn.confirm aria-label={`Confirm ${FIELD_LABELS[key]}`}
                                       onClick={() => onConfirm(key)}
                                       disabled={isPending}>
                  <CheckIcon/>
                </button>
              </span>

              {hasSuggestion && (
                <div.aiSuggestion aria-label={`AI suggestion for ${FIELD_LABELS[key]}`}>
                  <span.aiLabel><SparkleIcon/> AI suggestion:</span>
                  <span.aiValue title={entry.alternative.content}>
                    {formatFieldContent(entry.alternative.content)}
                  </span>
                  <button.applyBtn
                    onClick={() => onApply(key, entry.alternative.content)}
                    disabled={isPending}>
                    Apply
                  </button>
                </div>
              )}
           </div>
```

#### New SCSS classes needed

```scss
/* data-quality.module.scss additions */

.reviewList {
  display: flex;
  flex-direction: column;
  gap: 0;
}

.reviewItem {
  display: flex;
  flex-direction: column;
  gap: 5px;
  padding: 8px 0;
  font-size: 13px;
}
.reviewItem + .reviewItem {
  border-top: 1px solid #eee;
}

.reviewItemMain {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: nowrap;
}

.fieldName {
  font-weight: 500;
  color: #455468;
  width: 100px;
  flex-shrink: 0;
  white-space: nowrap;
  font-size: 13px;
}

.fieldValue {
  flex: 1;
  min-width: 0;
  color: #0a0c11;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 13px;
}

.qualityBadgeLow {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 2px 7px;
  border-radius: 9999px;
  background: #fff8e9;     /* amber-50 */
  color: #b87a07;          /* amber-700 */
  font-size: 10.5px;
  font-weight: 600;
  white-space: nowrap;
  flex-shrink: 0;
}

.cellActions {
  display: inline-flex;
  gap: 4px;
  flex-shrink: 0;
  margin-left: auto;
}

.iconBtn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 6px;
  border: 1px solid rgba(27, 56, 96, 0.24);
  background: #fff;
  color: #455468;
  cursor: pointer;
  flex-shrink: 0;

  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  &:hover:not(:disabled) {
    background: #f2f5ff;
    color: #0a0c11;
  }
}

.iconBtnConfirm {
  border-color: #1f8a4c;
  color: #1f8a4c;

  &:hover:not(:disabled) {
    background: #d9faea;
  }
}

.aiSuggestion {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: 108px;        /* aligns under value, past the field-name column */
  padding: 5px 10px;
  background: #e8edff;       /* blue-50 */
  border: 1px solid #c7d7fa;
  border-radius: 6px;
  font-size: 12px;
}

.aiLabel {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: #1b4dff;
  font-weight: 600;
  flex-shrink: 0;
  white-space: nowrap;
}

.aiValue {
  flex: 1;
  min-width: 0;
  color: #0a0c11;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.applyBtn {
  color: #1b4dff;
  background: transparent;
  border: none;
  font-weight: 600;
  cursor: pointer;
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 4px;
  flex-shrink: 0;
  font-family: inherit;
  white-space: nowrap;

  &:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.7);
  }

  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
}

.reviewEmpty {
  font-size: 13px;
  color: #8897ae;
  font-style: italic;
}
```

---

### Phase 3 — Mutation Wiring & Optimistic State

**Files:** `useApproveEnrichmentFields.ts`, `DataQualityTable.tsx`

#### Step 3a: Refactor `useApproveEnrichmentFields`

Current: `useApproveEnrichmentFields(teamUid, authToken)`
New: `useApproveEnrichmentFields(authToken)` — `teamUid` moves into mutation variables.

```ts
// apps/back-office/hooks/teams/useApproveEnrichmentFields.ts

type ApprovePayload = {
  teamUid: string;
  fields: { key: FieldKey; content?: string }[];
};

export function useApproveEnrichmentFields(authToken: string | null | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ teamUid, fields }: ApprovePayload) =>
      api.patch(`/v1/admin/teams/${teamUid}/enrichment-review`,
        { fields },
        { headers: { authorization: `Bearer ${authToken}` } }
      ),
    onSuccess: () => queryClient.invalidateQueries([TeamsQueryKeys.ENRICHMENT_REVIEW]),
  });
}
```

Verify that `EditModal.tsx` still works after this refactor (it likely passes `teamUid` at hook
call time — update those call sites).

#### Step 3b: Optimistic state in DataQualityTable

```ts
// DataQualityTable.tsx

const [confirmedFields, setConfirmedFields] = useState<Map<string, Set<FieldKey>>>(new Map());
const [pendingTeams, setPendingTeams]       = useState<Set<string>>(new Set());

const { mutateAsync: approveFields } = useApproveEnrichmentFields(authToken);

function addConfirmed(teamUid: string, keys: FieldKey[]) {
  setConfirmedFields(prev => {
    const next = new Map(prev);
    const existing = next.get(teamUid) ?? new Set();
    keys.forEach(k => existing.add(k));
    next.set(teamUid, existing);
    return next;
  });
}

function removeConfirmed(teamUid: string, keys: FieldKey[]) {
  setConfirmedFields(prev => {
    const next = new Map(prev);
    const existing = next.get(teamUid) ?? new Set();
    keys.forEach(k => existing.delete(k));
    next.set(teamUid, existing);
    return next;
  });
}

async function handleConfirmField(teamUid: string, key: FieldKey, content?: string) {
  addConfirmed(teamUid, [key]);
  setPendingTeams(prev => new Set(prev).add(teamUid));
  try {
    await approveFields({ teamUid, fields: [{ key, content }] });
  } catch {
    removeConfirmed(teamUid, [key]);
  } finally {
    setPendingTeams(prev => { const s = new Set(prev); s.delete(teamUid); return s; });
  }
}

async function handleConfirmAll(teamUid: string, keys: FieldKey[]) {
  addConfirmed(teamUid, keys);
  setPendingTeams(prev => new Set(prev).add(teamUid));
  try {
    await approveFields({ teamUid, fields: keys.map(key => ({ key })) });
  } catch {
    removeConfirmed(teamUid, keys);
  } finally {
    setPendingTeams(prev => { const s = new Set(prev); s.delete(teamUid); return s; });
  }
}
```

---

### Phase 4 — Actions Column Update

**Files:** `DataQualityTable.tsx`, `data-quality.module.scss`

Replace the single "Edit" button with a two-button cluster per row.

```tsx
// In the 'actions' column cell renderer:
const team = info.row.original;
const teamConfirmed = confirmedFields.get(team.uid) ?? new Set();
const lowKeys = FIELD_KEYS.filter(
  key => needsReview(team, key) && !teamConfirmed.has(key)
);
const isPending = pendingTeams.has(team.uid);
const allConfirmed = lowKeys.length === 0;

return (
  <div className={s.actionsCell}>
    {allConfirmed ? (
      <span className={s.allConfirmedBadge}>
        <CheckIcon /> Confirmed
      </span>
    ) : (
      <button
        className={s.confirmAllBtn}
        disabled={isPending}
        onClick={() => handleConfirmAll(team.uid, lowKeys)}
        aria-label={`Confirm all fields for ${team.name}`}
      >
        {isPending ? <SpinnerIcon /> : <CheckIcon />}
        Confirm all
      </button>
    )}
    <button className={s.editRowBtn} onClick={() => onEdit(team)}>
      <PencilIcon /> Edit
    </button>
  </div>
);
```

New SCSS:

```scss
.actionsCell {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 6px;
  white-space: nowrap;
}

.confirmAllBtn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  border: 1px solid rgba(27, 56, 96, 0.24);
  background: #fff;
  color: #0a0c11;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  font-family: inherit;

  &:hover:not(:disabled) {
    background: #f2f5ff;
    border-color: #5e718d;
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}

.editRowBtn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border: 1px solid rgba(27, 56, 96, 0.24);
  background: #fff;
  color: #374151;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  font-family: inherit;

  &:hover {
    background: #f2f5ff;
    border-color: #5e718d;
  }
}

.allConfirmedBadge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 12px;
  border-radius: 9999px;
  background: #d9faea;
  color: #0d7e44;
  font-size: 12px;
  font-weight: 600;
}
```

---

### Phase 5 — Wire NeedsReviewCell into DataQualityTable

Replace the `needsReview` column cell renderer's chip logic with `NeedsReviewCell`:

```tsx
columnHelper.display({
  id: 'needsReview',
  header: 'Needs Review',
  enableSorting: false,
  cell: (info) => {
    const team = info.row.original;
    return (
      <NeedsReviewCell
        team={team}
        confirmedKeys={confirmedFields.get(team.uid) ?? emptySet}
        isPending={pendingTeams.has(team.uid)}
        onConfirm={(key) => handleConfirmField(team.uid, key)}
        onApply={(key, content) => handleConfirmField(team.uid, key, content)}
        onEdit={onEdit}
      />
    );
  },
}),
```

Pass `authToken` into `DataQualityTable` (it's already available in the page via `useSession`).

---

### Phase 6 — Cleanup

- Delete orphaned `FieldStatusCell.tsx` (confirmed unused in research — not imported anywhere in
  `DataQualityTable.tsx`)
- Remove `reviewChips`, `reviewChip`, `reviewChipAI`, `reviewChipUser` from SCSS (replaced by
  `reviewList` / `reviewItem` styles)
- Rename `.stickyCol` in SCSS to `.stickyPriority` / `.stickyTeam` (or keep `.stickyCol` as
  a base and extend) — coordinate with any other files using the class

---

## Acceptance Criteria

### Functional

- [ ] Each team row's "Needs Review" column shows one row per low-quality field
- [ ] Each field row shows: field name, current value (truncated to ≤ 100 chars with full value in `title`), amber "Low" badge with source icon, ✎ and ✓ icon buttons
- [ ] ✓ button immediately removes the field row (optimistic) and calls PATCH; row is restored on error
- [ ] AI suggestion card appears below a field row when `alternative.fromSide === 'enrichment'` and `alternative.content` is non-empty
- [ ] "Apply" in the suggestion card calls PATCH with `content: alternative.content` and removes the row
- [ ] "Confirm all" sends one PATCH for all remaining low fields; button shows spinner while pending; on error all rows are restored
- [ ] When all low fields are confirmed: Needs Review cell shows "All good — no low-quality fields"; Actions shows "✓ Confirmed" + Edit button
- [ ] Priority and Team columns stay fixed while the table scrolls horizontally
- [ ] ✎ button opens the existing EditModal (unchanged behaviour)

### Accessibility

- [ ] All icon-only buttons have `aria-label` that includes the field name (e.g. `"Confirm website"`, `"Edit twitter"`)
- [ ] "Apply" button has `aria-label` that includes field name and value (e.g. `"Apply AI suggestion for blog: bagel.com/blog"`)
- [ ] "Confirm all" button has `aria-label` that includes team name
- [ ] All action buttons are `disabled` (not just visually muted) while a mutation is in-flight for that team

### Non-functional

- [ ] No regressions to EditModal behaviour
- [ ] TypeScript strict mode — no `any` in new code
- [ ] No unused SCSS classes left behind

---

## Dependencies & Risks

| Risk | Mitigation |
|---|---|
| `useApproveEnrichmentFields` refactor breaks EditModal callers | Read EditModal before refactoring; update all call sites in the same PR |
| Variable-height rows cause layout jank on confirm (row removal) | CSS `transition: height` is complex in tables — accept the snap; no animation needed |
| Concurrent single-confirm + confirm-all race | `pendingTeams` set disables all buttons for a team while any mutation is in-flight |
| `alternative.content` is a non-string type (logo is `{ uid, url }`) | Guard: only render AI suggestion card when `typeof alternative.content === 'string'` |

---

## Open Questions (from SpecFlow)

These are documented but **not blocking** — accept the simpler answer for now:

1. **"Confirm all" failure**: Restore all fields as a batch (all-or-nothing). One PATCH = one
   atomic operation; no partial restore logic needed.
2. **Inline edit via ✎**: Opens full EditModal (not scoped single-field). Consistent with current
   UX; scoped editing can be added later.
3. **Background refetch after manual confirm**: React Query invalidation on mutation success will
   cause a refetch; the local `confirmedFields` map is cleared once the query returns fresh data
   (implement via `onSettled` or `useEffect` watching the query data).
4. **`needsReview` re-gate on refetch**: Because the server will now not include confirmed fields
   in the response, the local confirmed set becomes redundant after the refetch. Clearing it on
   refetch is safe.

---

## File Change Summary

| File | Change |
|---|---|
| `apps/back-office/components/teams/data-quality/NeedsReviewCell.tsx` | **Create** |
| `apps/back-office/components/teams/data-quality/DataQualityTable.tsx` | Modify — sticky wiring, NeedsReviewCell, Actions column, mutation state |
| `apps/back-office/components/teams/data-quality/FieldStatusCell.tsx` | **Delete** (orphaned) |
| `apps/back-office/hooks/teams/useApproveEnrichmentFields.ts` | Modify — move `teamUid` to mutation vars |
| `apps/back-office/pages/teams/data-quality.module.scss` | Modify — sticky classes, review-item styles, action button styles |
| `apps/back-office/pages/teams/data-quality.tsx` | Possibly modify — pass `authToken` to DataQualityTable if not already |

---

## References

### Internal

- `apps/back-office/components/teams/data-quality/DataQualityTable.tsx` — current table
- `apps/back-office/components/teams/data-quality/constants.ts` — `needsReview`, `isAIEnriched`, `getEntry`, `FIELD_LABELS`
- `apps/back-office/components/teams/data-quality/utils.ts` — `formatFieldContent` (truncate helper)
- `apps/back-office/hooks/teams/useApproveEnrichmentFields.ts:16` — PATCH mutation
- `apps/back-office/hooks/teams/useTeamsEnrichmentReview.ts` — `FieldEntry.alternative` type
- `apps/back-office/pages/teams/data-quality.module.scss:141` — `.stickyCol` already defined
- `docs/brainstorms/2026-06-05-data-quality-table-row-redesign-brainstorm.md`
