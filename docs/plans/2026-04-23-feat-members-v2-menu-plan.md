---
title: "feat: Members V2 nav menu group with tab deep-links"
type: feat
date: 2026-04-23
---

# feat: Members V2 Nav Menu Group

## Overview

Add a new **Members V2** dropdown group to the top nav (between existing Members and AccessControl), with direct links to `/members-v2?tab=<TAB>` that pre-select the correct tab on page load. Existing Members menu is untouched.

---

## Design Reference

Image #4: dropdown shows Pending / Verified / Approved / Rejected / Policies each with a count badge, and an "Add New Member" button at the bottom.

---

## Technical Approach

### Two-part change

1. **New `MembersV2Menu` component** — mirrors `MembersMenu` structure, links to `/members-v2?tab=<TAB>`, counts from a new lightweight hook
2. **URL-driven tab** in `/members-v2/index.tsx` — reads `router.query.tab` on first render to set the initial `activeTab`

### Counts

No member-state-counts endpoint exists. Use React Query to call `useMembersList` — same query key as the page, so **no double-fetch** once the user visits `/members-v2`. Menu gets the data from cache immediately on subsequent opens.

Policy count comes from `usePoliciesList` (already used by the page).

---

## Implementation Plan

### Phase 1 — `useMembersStateCounts` hook

**New file:** `apps/back-office/hooks/members/useMembersStateCounts.ts`

Derives counts from `useMembersList` data:

```ts
import { useMemo } from 'react';
import { useMembersList } from './useMembersList';

const ALL_LEVELS = ['L0', 'L1', 'L2', 'L3', 'L4', 'L5', 'L6', 'Rejected'];

export function useMembersStateCounts({ authToken }: { authToken: string }) {
  const { data } = useMembersList({ authToken, accessLevel: ALL_LEVELS });

  return useMemo(() => {
    const counts = { PENDING: 0, VERIFIED: 0, APPROVED: 0, REJECTED: 0 };
    for (const m of data?.data ?? []) {
      if (m.memberState && m.memberState in counts) {
        counts[m.memberState as keyof typeof counts]++;
      }
    }
    return counts;
  }, [data]);
}
```

---

### Phase 2 — `MembersV2Menu` component

**New file:** `apps/back-office/components/menu/components/MembersV2Menu/MembersV2Menu.tsx`

Mirror `MembersMenu` exactly, replacing content:

```tsx
import Link from 'next/link';
import React, { useRef, useState } from 'react';
import { useCookie } from 'react-use';
import { useOnClickOutside } from '../../../../hooks/useOnClickOutside';
import { useMembersStateCounts } from '../../../../hooks/members/useMembersStateCounts';
import { usePoliciesList } from '../../../../hooks/access-control/usePoliciesList';
import { AddMember } from '../../../../screens/members/components/AddMember/AddMember';
import s from './MembersV2Menu.module.scss';

const TABS = [
  { id: 'PENDING',  label: 'Pending'  },
  { id: 'VERIFIED', label: 'Verified' },
  { id: 'APPROVED', label: 'Approved' },
  { id: 'REJECTED', label: 'Rejected' },
] as const;

export const MembersV2Menu = () => {
  const menuRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [cookieValue] = useCookie('plnadmin');

  const counts = useMembersStateCounts({ authToken: cookieValue });
  const { data: policiesData } = usePoliciesList({ authToken: cookieValue });

  useOnClickOutside([menuRef], () => setOpen(false));

  return (
    <div className={s.root} onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button className={s.trigger}>
        <MembersV2Icon /> Members V2
        <span className={clsx(s.chevron, { [s.open]: open })}>
          <ChevronDownIcon />
        </span>
      </button>
      <div ref={menuRef} className={`${s.menu} ${open ? s.open : ''}`}>
        {TABS.map((tab) => (
          <Link key={tab.id} href={`/members-v2?tab=${tab.id}`} passHref>
            <a className={s.menuItem} onClick={() => setOpen(false)}>
              <TabIcon id={tab.id} />
              <span className={s.menuItemLabel}>{tab.label}</span>
              <span className={s.menuItemCount}>{counts[tab.id]}</span>
              <CaretIcon />
            </a>
          </Link>
        ))}
        <Link href="/members-v2?tab=POLICIES" passHref>
          <a className={s.menuItem} onClick={() => setOpen(false)}>
            <PoliciesIcon />
            <span className={s.menuItemLabel}>Policies</span>
            <span className={s.menuItemCount}>{policiesData?.length ?? 0}</span>
            <CaretIcon />
          </a>
        </Link>
        <AddMember authToken={cookieValue} className={s.addMemberBtn} showRbacSection />
      </div>
    </div>
  );
};
```

Icons: reuse `ChevronDownIcon` and `CaretIcon` SVGs from `MembersMenu`. Create `MembersV2Icon` (same as `MembersIcon` or a slight variant), and `TabIcon` mapping: Pending→spinner, Verified→checkmark, Approved→shield, Rejected→trash, Policies→shield-lock. Copy the icons from existing icon files or inline SVGs.

**New file:** `apps/back-office/components/menu/components/MembersV2Menu/MembersV2Menu.module.scss`

Copy `MembersMenu.module.scss` exactly — same visual language.

---

### Phase 3 — URL-driven initial tab in `/members-v2/index.tsx`

Read `router.query.tab` to set the initial `activeTab`:

```ts
const router = useRouter();

// Replace:
const [activeTab, setActiveTab] = useState<ActiveTab>('PENDING');

// With:
const initialTab = (router.query.tab as ActiveTab) ?? 'PENDING';
const [activeTab, setActiveTab] = useState<ActiveTab>(initialTab);

// Also react to query param changes (e.g. user clicks menu item while already on page):
useEffect(() => {
  const tab = router.query.tab as ActiveTab | undefined;
  if (tab && ['PENDING', 'VERIFIED', 'APPROVED', 'REJECTED', 'POLICIES'].includes(tab)) {
    setActiveTab(tab);
  }
}, [router.query.tab]);
```

---

### Phase 4 — Register in `menu.tsx`

```tsx
import { MembersV2Menu } from './components/MembersV2Menu/MembersV2Menu';

// In Menu():
{isDirectoryAdmin && <MembersMenu />}
{isDirectoryAdmin && <MembersV2Menu />}   // ← add after MembersMenu
{isDirectoryAdmin && <AccessControlMenu />}
```

---

## Files Summary

### New Files

| File | Purpose |
|------|---------|
| `hooks/members/useMembersStateCounts.ts` | Derive PENDING/VERIFIED/APPROVED/REJECTED counts from cached `useMembersList` |
| `components/menu/components/MembersV2Menu/MembersV2Menu.tsx` | New dropdown menu group |
| `components/menu/components/MembersV2Menu/MembersV2Menu.module.scss` | Styles (copy of MembersMenu.module.scss) |

### Modified Files

| File | Change |
|------|--------|
| `components/menu/menu.tsx` | Import and render `<MembersV2Menu />` |
| `pages/members-v2/index.tsx` | Read `router.query.tab` for initial active tab |

---

## Acceptance Criteria

- [ ] "Members V2" dropdown appears in nav after the existing "Members" group
- [ ] Clicking a tab link navigates to `/members-v2?tab=<TAB>` and opens that tab
- [ ] Pending / Verified / Approved / Rejected show member-state counts
- [ ] Policies shows policy count
- [ ] "Add New Member" button in dropdown opens the RBAC-aware form
- [ ] Existing Members menu is unchanged
- [ ] Tab survives page refresh (URL query param preserved)
- [ ] Navigating to a tab while already on /members-v2 switches the tab without a full reload
- [ ] No TypeScript errors

---

## References

- Existing menu: `apps/back-office/components/menu/menu.tsx`
- MembersMenu to mirror: `apps/back-office/components/menu/components/MembersMenu/MembersMenu.tsx`
- MembersMenu styles: `apps/back-office/components/menu/components/MembersMenu/MembersMenu.module.scss`
- Members V2 page: `apps/back-office/pages/members-v2/index.tsx`
- useMembersList hook: `apps/back-office/hooks/members/useMembersList.ts`
- usePoliciesList hook: `apps/back-office/hooks/access-control/usePoliciesList.ts`
