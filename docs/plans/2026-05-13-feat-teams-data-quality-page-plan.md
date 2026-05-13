---
title: "feat: Teams Data Quality Review Page"
type: feat
date: 2026-05-13
---

# feat: Teams Data Quality Review Page

## Overview

Add a "Data Quality" page to the back-office admin app (`apps/back-office`) that displays a table of teams with non-high-confidence AI-enriched fields for admin review. Admins can approve individual fields per team via toggle switches in an inline modal, calling the existing `PATCH /v1/admin/teams/:uid/enrichment-review/fields` API.

**Only admin-only changes in `apps/back-office/`.** No changes to `apps/web-api/` (backend APIs already exist) and no changes to the public `frontend/` app.

---

## Problem Statement / Motivation

PR #3116 shipped backend APIs for team enrichment review but there is no admin UI to use them. Admins currently have no way to review AI-enriched team fields or approve them to be promoted to the team profile. This page closes that gap.

---

## Proposed Solution

1. Convert `TeamsMenu` from a plain link to a hover dropdown (matching the `IrlGatheringMenu` pattern) with two options: "Teams" and "Data Quality".
2. Create a new page `/teams/data-quality` that loads all enrichment-reviewable teams and renders a wide scrollable table.
3. Clicking "Review" on a row opens an inline modal listing each reviewable field with a toggle. Toggling ON approves that field via the API.

---

## Technical Approach

### Architecture

```
apps/back-office/
├── components/menu/components/TeamsMenu/
│   ├── TeamsMenu.tsx          (MODIFY — add dropdown)
│   └── TeamsMenu.module.scss  (MODIFY — add dropdown styles)
└── pages/teams/
    ├── data-quality.tsx       (CREATE — main page)
    └── data-quality.module.scss (CREATE — page styles)
```

**Auth pattern** (same as `pages/teams/index.tsx`):
- `getServerSideProps`: redirect to login if no `plnadmin` cookie
- Client-side `useEffect`: redirect to `/access-denied` if not `isDirectoryAdmin`

**API calls** (same as teams page):
```ts
const cookies = parseCookies();
const config = { headers: { authorization: `Bearer ${cookies.plnadmin}` } };
// Fetch list
api.get('/v1/admin/teams/enrichment-review?pageSize=200', config)
// Approve fields
api.patch(`/v1/admin/teams/${uid}/enrichment-review/fields`, { fields: [key] }, config)
```

### Data Flow

```
Page mount
  → getServerSideProps: check plnadmin cookie → redirect if missing
  → useEffect: check isDirectoryAdmin → redirect if false
  → loadTeams(): GET /v1/admin/teams/enrichment-review?pageSize=200
  → setTeams(response.teams)

Search input
  → setSearch(value)
  → filteredTeams = teams.filter(name.includes(search))

"Review" button click on row
  → setSelectedTeam(team)
  → modal opens with team.fields

Toggle ON for field key
  → setApproving({ [key]: true })
  → PATCH /v1/admin/teams/:uid/enrichment-review/fields { fields: [key] }
  → on success: setApproved((prev) => ({ ...prev, [key]: true }))
  → toggle becomes disabled/checked
```

### Type Definitions

```ts
// data-quality.tsx — local type definitions

type FieldKey =
  | 'website' | 'blog' | 'contactMethod'
  | 'twitterHandler' | 'linkedinHandler' | 'telegramHandler'
  | 'shortDescription' | 'longDescription' | 'moreDetails'
  | 'industryTags' | 'investmentFocus' | 'logo';

const FIELD_KEYS: FieldKey[] = [
  'website', 'blog', 'contactMethod',
  'twitterHandler', 'linkedinHandler', 'telegramHandler',
  'shortDescription', 'longDescription', 'moreDetails',
  'industryTags', 'investmentFocus', 'logo',
];

type FieldEntry = {
  content: string | string[] | { uid: string; url: string } | null;
  metadata: { source?: string; lastModifiedAt?: string };
  judgment?: { note?: string; score?: number };
  promotable: boolean;
};

type EnrichmentTeam = {
  uid: string;
  name: string;
  enrichmentStatus: string;
  fields: Partial<Record<FieldKey, FieldEntry>>;
  logo?: FieldEntry & {
    verification: { verdict: string; confidence: string; reason: string } | null;
  };
};
```

---

## Implementation Phases

### Phase 1 — Navigation Dropdown

**File: `apps/back-office/components/menu/components/TeamsMenu/TeamsMenu.tsx`**

Replace the current plain `<Link>` with a hover dropdown matching `IrlGatheringMenu`:

```tsx
import React, { useRef, useState } from 'react';
import Link from 'next/link';
import { clsx } from 'clsx';
import { useOnClickOutside } from '../../../../hooks/useOnClickOutside';
import { useAuth } from '../../../../context/auth-context';
import s from './TeamsMenu.module.scss';

export const TeamsMenu = () => {
  const menuRef = useRef(null);
  const [open, setOpen] = useState(false);
  const { isDirectoryAdmin } = useAuth();

  useOnClickOutside([menuRef], () => setOpen(false));

  return (
    <div className={s.root} onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button className={s.trigger}>
        <TeamsIcon />
        <span>Teams</span>
        <span className={clsx(s.chevron, { [s.open]: open })}>
          <ChevronDownIcon />
        </span>
      </button>

      <div ref={menuRef} className={clsx(s.menu, { [s.open]: open })}>
        <Link href="/teams" passHref>
          <a className={s.menuItem}>
            <TeamsIcon />
            <span className={s.menuItemLabel}>Teams</span>
            <CaretIcon />
          </a>
        </Link>

        {isDirectoryAdmin && (
          <Link href="/teams/data-quality" passHref>
            <a className={s.menuItem}>
              <DataQualityIcon />
              <span className={s.menuItemLabel}>Data Quality</span>
              <CaretIcon />
            </a>
          </Link>
        )}
      </div>
    </div>
  );
};
```

Include existing SVG icon components (`TeamsIcon`, `ChevronDownIcon`, `CaretIcon`) from the current file plus a new simple `DataQualityIcon` (a checkmark-in-circle SVG similar to existing icons in the file).

**File: `apps/back-office/components/menu/components/TeamsMenu/TeamsMenu.module.scss`**

Copy the styles from `IrlGatheringMenu.module.scss` (`.root`, `.trigger`, `.menu`, `.menu.open`, `.chevron`, `.chevron.open`, `.menuItem`, `.menuItemLabel`, `.caret`). They are identical in structure.

---

### Phase 2 — Data Quality Page

**File: `apps/back-office/pages/teams/data-quality.tsx`**

Full page implementation following `pages/teams/index.tsx` patterns:

```tsx
import React, { useCallback, useEffect, useState } from 'react';
import { GetServerSideProps } from 'next';
import { parseCookies } from 'nookies';
import { AnimatePresence, motion } from 'framer-motion';
import { toast } from 'react-toastify';
import { useRouter } from 'next/router';
import { clsx } from 'clsx';

import { ApprovalLayout } from '../../layout/approval-layout';
import api from '../../utils/api';
import { useAuth } from '../../context/auth-context';
import s from './data-quality.module.scss';

// Types (see Type Definitions section above)

const FIELD_KEYS: FieldKey[] = [ /* as listed above */ ];

const FIELD_LABELS: Record<FieldKey, string> = {
  website: 'Website',
  blog: 'Blog',
  contactMethod: 'Contact',
  twitterHandler: 'Twitter',
  linkedinHandler: 'LinkedIn',
  telegramHandler: 'Telegram',
  shortDescription: 'Short Desc',
  longDescription: 'Long Desc',
  moreDetails: 'More Details',
  industryTags: 'Industry Tags',
  investmentFocus: 'Inv. Focus',
  logo: 'Logo',
};

const DataQualityPage: React.FC = () => {
  const router = useRouter();
  const { isDirectoryAdmin, isLoading, user } = useAuth();

  const [teams, setTeams] = useState<EnrichmentTeam[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedTeam, setSelectedTeam] = useState<EnrichmentTeam | null>(null);
  const [approved, setApproved] = useState<Record<string, boolean>>({});
  const [approving, setApproving] = useState<Record<string, boolean>>({});

  // Auth guard
  useEffect(() => {
    if (!isLoading && user && !isDirectoryAdmin) {
      router.replace('/access-denied');
    }
  }, [isLoading, user, isDirectoryAdmin, router]);

  useEffect(() => {
    loadTeams();
  }, []);

  // Reset approval state when a new team modal opens
  useEffect(() => {
    setApproved({});
    setApproving({});
  }, [selectedTeam?.uid]);

  async function loadTeams() {
    try {
      setLoading(true);
      const cookies = parseCookies();
      const config = { headers: { authorization: `Bearer ${cookies.plnadmin}` } };
      const res = await api.get('/v1/admin/teams/enrichment-review?pageSize=200', config);
      setTeams(res.data?.teams ?? []);
    } catch (e) {
      console.error('Failed to load enrichment data', e);
      toast.error('Failed to load teams. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  const handleApproveField = useCallback(async (teamUid: string, fieldKey: FieldKey) => {
    const stateKey = `${teamUid}:${fieldKey}`;
    if (approved[stateKey] || approving[stateKey]) return;

    try {
      setApproving((prev) => ({ ...prev, [stateKey]: true }));
      const cookies = parseCookies();
      const config = { headers: { authorization: `Bearer ${cookies.plnadmin}` } };
      await api.patch(
        `/v1/admin/teams/${teamUid}/enrichment-review/fields`,
        { fields: [fieldKey] },
        config
      );
      setApproved((prev) => ({ ...prev, [stateKey]: true }));
    } catch (e) {
      console.error('Failed to approve field', e);
      toast.error(`Failed to approve ${fieldKey}. Please try again.`);
    } finally {
      setApproving((prev) => ({ ...prev, [stateKey]: false }));
    }
  }, [approved, approving]);

  const filteredTeams = teams.filter((t) => {
    const q = search.trim().toLowerCase();
    return !q || t.name.toLowerCase().includes(q);
  });

  if (!isLoading && user && !isDirectoryAdmin) return null;

  return (
    <ApprovalLayout>
      <div className={s.root}>
        <div className={s.header}>
          <span className={s.title}>Teams — Data Quality</span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by team name…"
            className={s.input}
          />
        </div>

        <div className={s.tableWrapper}>
          <table className={s.table}>
            <thead>
              <tr>
                <th className={clsx(s.th, s.stickyCol)}>Team</th>
                {FIELD_KEYS.map((key) => (
                  <th key={key} className={s.th}>{FIELD_LABELS[key]}</th>
                ))}
                <th className={s.th}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={FIELD_KEYS.length + 2} className={s.loadingCell}>Loading…</td></tr>
              )}
              {!loading && filteredTeams.length === 0 && (
                <tr><td colSpan={FIELD_KEYS.length + 2} className={s.emptyCell}>No teams with reviewable fields found.</td></tr>
              )}
              {!loading && filteredTeams.map((team) => (
                <tr key={team.uid} className={s.tr}>
                  <td className={clsx(s.td, s.stickyCol, s.teamNameCell)}>
                    <span className={s.teamName}>{team.name}</span>
                  </td>
                  {FIELD_KEYS.map((key) => {
                    const entry = key === 'logo' ? team.logo : team.fields[key];
                    return (
                      <td key={key} className={s.td}>
                        {entry ? (
                          <div className={s.fieldCell}>
                            <ErrorIcon />
                            <span className={clsx(s.badge, entry.promotable ? s.badgeAI : s.badgeUser)}>
                              {entry.promotable ? 'AI' : 'User'}
                            </span>
                          </div>
                        ) : (
                          <span className={s.emptyField}>—</span>
                        )}
                      </td>
                    );
                  })}
                  <td className={s.td}>
                    <button className={s.reviewButton} onClick={() => setSelectedTeam(team)}>
                      Review
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Inline modal */}
        <AnimatePresence>
          {selectedTeam && (
            <motion.div
              className={s.overlay}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedTeam(null)}
            >
              <motion.div
                className={s.modal}
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96 }}
                onClick={(e) => e.stopPropagation()}
              >
                <div className={s.modalHeader}>
                  <h2 className={s.modalTitle}>{selectedTeam.name} — Enrichment Review</h2>
                  <button className={s.closeButton} onClick={() => setSelectedTeam(null)}>✕</button>
                </div>

                <div className={s.modalBody}>
                  {FIELD_KEYS.map((key) => {
                    const entry = key === 'logo' ? selectedTeam.logo : selectedTeam.fields[key];
                    if (!entry) return null;
                    const stateKey = `${selectedTeam.uid}:${key}`;
                    const isApproved = !!approved[stateKey];
                    const isApproving = !!approving[stateKey];

                    return (
                      <div key={key} className={clsx(s.fieldRow, { [s.fieldRowApproved]: isApproved })}>
                        <div className={s.fieldInfo}>
                          <span className={s.fieldLabel}>{FIELD_LABELS[key]}</span>
                          <span className={clsx(s.badge, entry.promotable ? s.badgeAI : s.badgeUser)}>
                            {entry.promotable ? 'AI' : 'User'}
                          </span>
                          <span className={s.fieldValue}>
                            {formatFieldContent(entry.content)}
                          </span>
                          {entry.judgment?.note && (
                            <span className={s.judgmentNote} title={entry.judgment.note}>
                              AI note: {entry.judgment.note}
                              {entry.judgment.score !== undefined && ` (${entry.judgment.score})`}
                            </span>
                          )}
                        </div>
                        <label className={s.toggleLabel}>
                          <input
                            type="checkbox"
                            className={s.toggleInput}
                            checked={isApproved}
                            disabled={isApproved || isApproving || !entry.promotable}
                            onChange={() => handleApproveField(selectedTeam.uid, key)}
                          />
                          <span className={s.toggleTrack} />
                          <span className={s.toggleStatus}>
                            {isApproved ? 'Approved' : isApproving ? 'Saving…' : !entry.promotable ? 'User-owned' : 'Approve'}
                          </span>
                        </label>
                      </div>
                    );
                  })}
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </ApprovalLayout>
  );
};

export default DataQualityPage;

export const getServerSideProps: GetServerSideProps = async (ctx) => {
  const { plnadmin } = parseCookies(ctx);
  if (!plnadmin) {
    return {
      redirect: {
        destination: `/?backlink=${ctx.resolvedUrl}`,
        permanent: false,
      },
    };
  }
  return { props: {} };
};

// Helper
function formatFieldContent(content: FieldEntry['content']): string {
  if (content === null || content === undefined) return '';
  if (Array.isArray(content)) return content.join(', ');
  if (typeof content === 'object') return (content as any).url ?? '';
  const str = String(content);
  return str.length > 80 ? str.slice(0, 80) + '…' : str;
}

// Inline icons (small SVGs consistent with existing back-office icons)
const ErrorIcon = () => (
  <svg width="16" height="16" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M10 2a8 8 0 100 16A8 8 0 0010 2zm0 9a1 1 0 01-1-1V7a1 1 0 012 0v3a1 1 0 01-1 1zm0 3a1 1 0 110-2 1 1 0 010 2z" fill="#F59E0B"/>
  </svg>
);

const DataQualityIcon = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M10 2a8 8 0 100 16A8 8 0 0010 2zm-1 11.414L5.293 9.707l1.414-1.414L9 10.586l4.293-4.293 1.414 1.414L9 13.414z" fill="#3D4A5C"/>
  </svg>
);
```

---

### Phase 3 — Page Styles

**File: `apps/back-office/pages/teams/data-quality.module.scss`**

Key CSS rules to implement:

```scss
.root {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 24px;
}

.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.title {
  font-size: 20px;
  font-weight: 600;
  color: var(--foreground-neutral-primary, #0A0C11);
}

.input {
  // same as teams/styles.module.scss .input
  padding: 8px 12px;
  border: 1px solid #E2E8F0;
  border-radius: 8px;
  font-size: 14px;
  width: 300px;
}

.tableWrapper {
  overflow-x: auto;
  border: 1px solid #E2E8F0;
  border-radius: 8px;
}

.table {
  width: 100%;
  border-collapse: collapse;
  font-size: 14px;
}

.th {
  padding: 10px 12px;
  text-align: left;
  font-weight: 500;
  font-size: 12px;
  color: #455468;
  background: #F8FAFC;
  border-bottom: 1px solid #E2E8F0;
  white-space: nowrap;
  min-width: 90px;
}

.stickyCol {
  position: sticky;
  left: 0;
  z-index: 1;
  background: #F8FAFC; // same as th background when in header
  box-shadow: 2px 0 4px rgba(0,0,0,0.04);
}

.tr {
  border-bottom: 1px solid #F1F5F9;
  &:last-child { border-bottom: none; }
  &:hover { background: #F8FAFC; }
}

.td {
  padding: 10px 12px;
  vertical-align: middle;
  min-width: 90px;
}

// Override stickyCol for body cells
.td.stickyCol {
  background: #fff;
  .tr:hover & { background: #F8FAFC; }
}

.teamNameCell {
  min-width: 180px;
  max-width: 220px;
}

.teamName {
  font-weight: 500;
  color: #0A0C11;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  display: block;
}

.fieldCell {
  display: flex;
  align-items: center;
  gap: 4px;
}

.badge {
  font-size: 10px;
  font-weight: 600;
  padding: 2px 5px;
  border-radius: 4px;
  white-space: nowrap;
}

.badgeAI {
  background: #EFF6FF;
  color: #1D4ED8;
}

.badgeUser {
  background: #F0FDF4;
  color: #15803D;
}

.emptyField {
  color: #CBD5E1;
  font-size: 14px;
}

.reviewButton {
  padding: 5px 10px;
  font-size: 12px;
  font-weight: 500;
  color: #3B82F6;
  background: #EFF6FF;
  border: 1px solid #BFDBFE;
  border-radius: 6px;
  cursor: pointer;
  white-space: nowrap;
  &:hover { background: #DBEAFE; }
}

.loadingCell, .emptyCell {
  padding: 40px;
  text-align: center;
  color: #94A3B8;
  font-size: 14px;
}

// Modal
.overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  z-index: 50;
  display: flex;
  align-items: center;
  justify-content: center;
}

.modal {
  background: #fff;
  border-radius: 16px;
  width: 680px;
  max-width: 95vw;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.12);
}

.modalHeader {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px 16px;
  border-bottom: 1px solid #E2E8F0;
}

.modalTitle {
  font-size: 16px;
  font-weight: 600;
  color: #0A0C11;
}

.closeButton {
  background: none;
  border: none;
  cursor: pointer;
  color: #94A3B8;
  font-size: 18px;
  &:hover { color: #475569; }
}

.modalBody {
  overflow-y: auto;
  padding: 16px 24px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.fieldRow {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 12px 0;
  border-bottom: 1px solid #F1F5F9;
  &:last-child { border-bottom: none; }
}

.fieldRowApproved {
  opacity: 0.6;
}

.fieldInfo {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1;
  min-width: 0;
}

.fieldLabel {
  font-size: 13px;
  font-weight: 600;
  color: #0A0C11;
}

.fieldValue {
  font-size: 13px;
  color: #475569;
  word-break: break-all;
}

.judgmentNote {
  font-size: 11px;
  color: #94A3B8;
  font-style: italic;
}

.toggleLabel {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  flex-shrink: 0;
}

.toggleInput {
  // visually hidden; styled via toggleTrack pseudo
  position: absolute;
  opacity: 0;
  width: 0;
  height: 0;
}

.toggleTrack {
  display: inline-block;
  width: 36px;
  height: 20px;
  background: #E2E8F0;
  border-radius: 10px;
  position: relative;
  transition: background 0.2s;
  
  &::after {
    content: '';
    position: absolute;
    width: 16px;
    height: 16px;
    background: #fff;
    border-radius: 50%;
    top: 2px;
    left: 2px;
    transition: transform 0.2s;
    box-shadow: 0 1px 3px rgba(0,0,0,0.2);
  }
  
  .toggleInput:checked ~ & {
    background: #22C55E;
    &::after { transform: translateX(16px); }
  }
  
  .toggleInput:disabled ~ & {
    opacity: 0.5;
    cursor: not-allowed;
  }
}

.toggleStatus {
  font-size: 12px;
  color: #64748B;
  white-space: nowrap;
  min-width: 70px;
}
```

---

## Acceptance Criteria

### Functional Requirements

- [x] Teams nav item in the back-office header has a dropdown with "Teams" and "Data Quality" links
- [x] "Data Quality" link only appears in the dropdown for `isDirectoryAdmin` users
- [x] Clicking "Teams" still navigates to `/teams` (existing behavior unchanged)
- [x] `/teams/data-quality` redirects to login if no `plnadmin` cookie (server-side)
- [x] `/teams/data-quality` redirects to `/access-denied` if not `isDirectoryAdmin` (client-side)
- [x] Page loads and fetches from `GET /v1/admin/teams/enrichment-review?pageSize=200`
- [x] Table shows all teams returned by the API (each row = one team)
- [x] Table has a column for each of the 12 enrichable field keys
- [x] Cell shows error icon + AI/User badge when that field is present for the team
- [x] Cell shows "—" when that field is absent for the team
- [x] Search input filters table rows by team name (case-insensitive, client-side)
- [x] Empty state message shown when no teams found (or search returns no results)
- [x] Clicking "Review" on a row opens the inline modal for that team
- [x] Modal shows only fields present in `team.fields` (and `team.logo` if present)
- [x] Each field shows: label, AI/User badge, value preview, judgment note + score (if present)
- [x] Toggle is OFF (unchecked) by default for all fields
- [x] Toggling ON calls `PATCH /v1/admin/teams/:uid/enrichment-review/fields` with that field key
- [x] On success: toggle becomes checked + disabled, status shows "Approved"
- [x] On error: toast error shown, toggle reverts
- [x] Toggle is disabled (not togglable) for `promotable: false` fields (user-owned data); status shows "User-owned"
- [x] Clicking overlay or ✕ closes the modal
- [x] Opening a different team's modal resets all approval state

### Non-Functional Requirements

- [x] Table has horizontal scroll (`overflow-x: auto`) — no layout breakage at any viewport width
- [x] Team name column is sticky (stays visible while scrolling horizontally)
- [x] No changes to existing `teams/index.tsx` functionality or styles
- [x] No changes to `apps/web-api/` or `frontend/`
- [x] No TypeScript type errors introduced

---

## Dependencies & Risks

| Risk | Mitigation |
|------|-----------|
| TeamsMenu change breaks existing Teams navigation | Test that clicking "Teams" in new dropdown navigates to `/teams`; the existing Link href is preserved |
| `pageSize=200` may not cover all teams | Add a note to load more if `totalPages > 1`; acceptable for initial implementation |
| `promotable: false` fields shown but not togglable | Toggle is disabled with "User-owned" label — no silent failure |
| Wide table (13+ columns) on small screens | `overflow-x: auto` on wrapper handles this; sticky Team Name column preserves context |

---

## References & Research

### Internal References

- `IrlGatheringMenu` dropdown pattern: `apps/back-office/components/menu/components/IrlGatheringMenu/IrlGatheringMenu.tsx`
- `IrlGatheringMenu` CSS: `apps/back-office/components/menu/components/IrlGatheringMenu/IrlGatheringMenu.module.scss`
- Teams page (API calls, auth pattern, table/modal): `apps/back-office/pages/teams/index.tsx`
- Auth context: `apps/back-office/context/auth-context.tsx` — provides `isDirectoryAdmin`, `hasPermission()`
- Menu component: `apps/back-office/components/menu/menu.tsx` — controls which menus render

### Backend API Endpoints (Already Implemented)

- `GET /v1/admin/teams/enrichment-review?page=1&pageSize=200` — list of teams with reviewable fields
- `PATCH /v1/admin/teams/:uid/enrichment-review/fields` — body: `{ fields: FieldKey[] }` — approves listed fields

### API Response Shape

```ts
// GET /v1/admin/teams/enrichment-review
{
  pagination: { page: number; pageSize: number; totalTeams: number; totalPages: number },
  teams: Array<{
    uid: string;
    name: string;
    enrichmentStatus: string; // 'Enriched'
    fields: Partial<Record<FieldKey, {
      content: string | string[];
      metadata: { source?: 'ai'|'open-graph'|'scrapingdog'; lastModifiedAt?: string };
      judgment: { note?: string; score?: number };
      promotable: boolean; // false = ChangedByUser (no approve allowed)
    }>>;
    logo?: { /* same shape */ verification: {...} | null };
  }>
}
```

### Key Schema

```ts
// Backend: apps/web-api/src/admin/schema/admin-teams.ts
// REVIEWABLE_FIELD_KEYS — the valid values for the PATCH body
['website','blog','contactMethod','twitterHandler','linkedinHandler',
 'telegramHandler','shortDescription','longDescription','moreDetails',
 'industryTags','investmentFocus','logo']
```
