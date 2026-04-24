---
title: "feat: View Policy Dialog"
type: feat
date: 2026-04-23
---

# feat: View Policy Dialog

## Overview

A read-only modal that opens when the user clicks "View" on a policy row in the Policies tab. Shows the policy's description, module permissions list, and a searchable list of members assigned to that policy — all using data already loaded on the page.

---

## Design Reference

Design: Image #7

Sections:
- **Header**: ShieldIcon + `"{policy.name} — {policy.group}"` + X close button
- **Description**: `policy.description ?? "—"`
- **Module Permissions**: `policy.permissions[]` as rows with ShieldIcon + permission code
- **Members (`{count}`)**: search input + scrollable list (avatar+name/email | Team/Project | Date)

---

## Technical Approach

### Data flow

```
index.tsx
  members={members}   ← pass all loaded members to PoliciesTable (new prop)

PoliciesTable
  selectedPolicy: Policy | null   ← useState
  View button onClick → setSelectedPolicy(row.original)
  <PolicyViewDialog
    policy={selectedPolicy}
    members={members}
    isOpen={!!selectedPolicy}
    onClose={() => setSelectedPolicy(null)}
  />

PolicyViewDialog
  policyMembers = members.filter(m => m.policies?.some(p => p.code === policy.code))
  memberSearch: string (local state)
  filteredPolicyMembers = policyMembers.filter by name/email
```

No new API calls needed — all data is already loaded.

---

## Implementation Plan

### Phase 1 — `PolicyViewDialog` component

**New file:** `apps/back-office/screens/members/components/PoliciesTable/PolicyViewDialog.tsx`

```tsx
import React, { useState } from 'react';
import Modal from '../../../../components/modal/modal';
import { Policy } from '../../../../hooks/access-control/usePoliciesList';
import { Member } from '../../types/member';
import s from './PolicyViewDialog.module.scss';

interface Props {
  policy: Policy | null;
  members: Member[];
  isOpen: boolean;
  onClose: () => void;
}

// Inline SVGs — same ShieldIcon as PoliciesTable.tsx
const ShieldIcon = () => ( /* same SVG */ );
const XIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
  </svg>
);
const SearchIcon = () => ( /* same SVG as in index.tsx */ );

export function PolicyViewDialog({ policy, members, isOpen, onClose }: Props) {
  const [memberSearch, setMemberSearch] = useState('');

  if (!policy) return null;

  const policyMembers = members.filter(
    (m) => m.policies?.some((p) => p.code === policy.code)
  );

  const filteredMembers = memberSearch
    ? policyMembers.filter((m) => {
        const q = memberSearch.toLowerCase();
        return m.name.toLowerCase().includes(q) || m.email.toLowerCase().includes(q);
      })
    : policyMembers;

  return (
    <Modal isOpen={isOpen} onClose={onClose} modalClassName={s.modal}>
      {/* Header */}
      <div className={s.header}>
        <div className={s.headerTitle}>
          <ShieldIcon />
          <span>{policy.name} — {policy.group}</span>
        </div>
        <button type="button" className={s.closeBtn} onClick={onClose}>
          <XIcon />
        </button>
      </div>

      <div className={s.body}>
        {/* Description */}
        <section className={s.section}>
          <h4 className={s.sectionLabel}>Description</h4>
          <p className={s.descriptionText}>{policy.description ?? '—'}</p>
        </section>

        {/* Module Permissions */}
        <section className={s.section}>
          <h4 className={s.sectionLabel}>Module Permissions</h4>
          {policy.permissions.length === 0 ? (
            <p className={s.muted}>No permissions</p>
          ) : (
            <ul className={s.permissionList}>
              {policy.permissions.map((perm) => (
                <li key={perm} className={s.permissionRow}>
                  <ShieldIcon />
                  <span>{perm}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Members */}
        <section className={s.section}>
          <h4 className={s.sectionLabel}>Members ({policyMembers.length})</h4>
          <div className={s.memberSearchWrapper}>
            <SearchIcon />
            <input
              className={s.memberSearch}
              placeholder="Search members..."
              value={memberSearch}
              onChange={(e) => setMemberSearch(e.target.value)}
            />
          </div>

          {filteredMembers.length === 0 ? (
            <p className={s.muted}>No members found.</p>
          ) : (
            <div className={s.memberList}>
              {filteredMembers.map((m) => (
                <div key={m.uid} className={s.memberRow}>
                  <div className={s.memberInfo}>
                    <div className={s.avatar}>
                      {m.image?.url
                        ? <img src={m.image.url} alt={m.name} />
                        : <div className={s.avatarPlaceholder}>{m.name.charAt(0)}</div>
                      }
                    </div>
                    <div className={s.memberText}>
                      <span className={s.memberName}>{m.name}</span>
                      <span className={s.memberEmail}>{m.email}</span>
                    </div>
                  </div>
                  <div className={s.memberTeams}>
                    {[
                      ...m.projectContributions.map((c) => c.project.name),
                      ...(m.teamMemberRoles ?? []).map((t) => t.team.name),
                    ].slice(0, 2).join(', ') || '—'}
                  </div>
                  <div className={s.memberDate}>
                    {m.accessLevelUpdatedAt
                      ? new Date(m.accessLevelUpdatedAt).toLocaleDateString('en-US', {
                          month: 'short', day: 'numeric', year: 'numeric',
                        })
                      : '—'}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </Modal>
  );
}
```

---

**New file:** `apps/back-office/screens/members/components/PoliciesTable/PolicyViewDialog.module.scss`

```scss
.modal {
  width: 640px;
  max-width: 90vw;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px 16px;
  border-bottom: 1px solid #e5e7eb;
  flex-shrink: 0;
}

.headerTitle {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 16px;
  font-weight: 600;
  color: #0f172a;
  color: #5e718d; /* icon color inherited via currentColor */
}

.closeBtn {
  background: none;
  border: none;
  cursor: pointer;
  color: #9ca3af;
  padding: 4px;
  display: flex;
  align-items: center;
  &:hover { color: #374151; }
}

.body {
  padding: 0 24px 24px;
  overflow-y: auto;
  flex: 1;
}

.section {
  padding-top: 20px;
}

.sectionLabel {
  font-size: 12px;
  font-weight: 600;
  color: #6b7280;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 8px;
}

.descriptionText {
  font-size: 14px;
  color: #374151;
  line-height: 1.5;
}

.muted {
  font-size: 14px;
  color: #9ca3af;
}

.permissionList {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.permissionRow {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  color: #374151;
  padding: 6px 10px;
  border-radius: 6px;
  background: #f9fafb;

  > svg { color: #5e718d; flex-shrink: 0; }
}

.memberSearchWrapper {
  position: relative;
  margin-bottom: 12px;

  > svg {
    position: absolute;
    left: 10px;
    top: 50%;
    transform: translateY(-50%);
    color: #9ca3af;
  }
}

.memberSearch {
  width: 100%;
  padding: 8px 12px 8px 32px;
  border: 1px solid rgba(203, 213, 225, 0.5);
  border-radius: 8px;
  font-size: 14px;
  outline: none;
  box-sizing: border-box;

  &:focus { border-color: #5e718d; }
}

.memberList {
  display: flex;
  flex-direction: column;
  gap: 0;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  overflow: hidden;
  max-height: 280px;
  overflow-y: auto;
}

.memberRow {
  display: flex;
  align-items: center;
  padding: 10px 12px;
  border-bottom: 1px solid #f3f4f6;
  gap: 12px;

  &:last-child { border-bottom: none; }
}

.memberInfo {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1;
  min-width: 0;
}

.avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  overflow: hidden;
  flex-shrink: 0;
  background: #e5e7eb;

  > img { width: 100%; height: 100%; object-fit: cover; }
}

.avatarPlaceholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 600;
  color: #455468;
  text-transform: uppercase;
}

.memberText {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.memberName {
  font-size: 13px;
  font-weight: 500;
  color: #0f172a;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.memberEmail {
  font-size: 12px;
  color: #6b7280;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.memberTeams {
  font-size: 12px;
  color: #6b7280;
  width: 160px;
  flex-shrink: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.memberDate {
  font-size: 12px;
  color: #6b7280;
  white-space: nowrap;
  flex-shrink: 0;
}
```

---

### Phase 2 — Update `PoliciesTable.tsx`

**Changes:**
1. Add `members: Member[]` to `Props`
2. Add `useState<Policy | null>(null)` for `selectedPolicy`
3. Change `cell` of the `action` column to call `setSelectedPolicy(info.row.original)`
4. Render `<PolicyViewDialog>` at the bottom of the return

```tsx
// Add Member import
import { Member } from '../../types/member';
import { PolicyViewDialog } from './PolicyViewDialog';

// Extend Props:
interface Props {
  policies: Policy[];
  members: Member[];                                    // NEW
  pagination: PaginationState;
  setPagination: Dispatch<SetStateAction<PaginationState>>;
  globalFilter: string;
}

// Inside PoliciesTable component:
const [selectedPolicy, setSelectedPolicy] = useState<Policy | null>(null);

// Action column cell — replace the no-op button:
cell: (info) => (
  <button
    type="button"
    className={s.viewBtn}
    onClick={() => setSelectedPolicy(info.row.original)}
  >
    <EyeIcon /> View
  </button>
),

// At end of return, before closing </div>:
<PolicyViewDialog
  policy={selectedPolicy}
  members={members}
  isOpen={!!selectedPolicy}
  onClose={() => setSelectedPolicy(null)}
/>
```

The `columns` array must be defined inside the component (or the action cell needs access to `setSelectedPolicy`). Move columns definition inside `PoliciesTable` function, passing `setSelectedPolicy` to the action column.

---

### Phase 3 — Update `index.tsx`

Pass `members` prop to `<PoliciesTable>`:

```tsx
{activeTab === 'POLICIES' && (
  <PoliciesTable
    policies={filteredPolicies}
    members={members}                // NEW
    pagination={policyPagination}
    setPagination={setPolicyPagination}
    globalFilter={policySearch}
  />
)}
```

---

## Files Summary

### New Files

| File | Purpose |
|------|---------|
| `screens/members/components/PoliciesTable/PolicyViewDialog.tsx` | Read-only policy details modal |
| `screens/members/components/PoliciesTable/PolicyViewDialog.module.scss` | Dialog styles |

### Modified Files

| File | Change |
|------|--------|
| `screens/members/components/PoliciesTable/PoliciesTable.tsx` | Add `members` prop, `selectedPolicy` state, wire View button, render `PolicyViewDialog` |
| `pages/members-v2/index.tsx` | Pass `members={members}` to `<PoliciesTable>` |

---

## Acceptance Criteria

- [x] Clicking "View" on a policy row opens the dialog
- [x] Dialog header shows ShieldIcon + "{policy.name} — {policy.group}" + X close button
- [x] Clicking X or the backdrop closes the dialog
- [x] Description section shows `policy.description` or "—" when null
- [x] Module Permissions section lists all `policy.permissions[]` items
- [x] Members section heading shows correct count `"Members ({n})"`
- [x] Members list is filtered from all loaded `members` where `m.policies?.some(p => p.code === policy.code)`
- [x] Member search input filters by name and email (case-insensitive)
- [x] Each member row shows avatar + name/email, Team/Project column, date column
- [x] Member list is scrollable when it overflows
- [x] No TypeScript errors

---

## References

- Brainstorm: `docs/brainstorms/2026-04-23-view-policy-dialog-brainstorm.md`
- Modal base: `apps/back-office/components/modal/modal.tsx`
- Member type: `apps/back-office/screens/members/types/member.ts`
- Policy type: `apps/back-office/hooks/access-control/usePoliciesList.ts`
- PoliciesTable: `apps/back-office/screens/members/components/PoliciesTable/PoliciesTable.tsx`
- Modal pattern reference: `apps/back-office/screens/access-control/components/InfoModal.tsx`
- Members page: `apps/back-office/pages/members-v2/index.tsx`
