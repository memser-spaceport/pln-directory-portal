---
date: 2026-04-23
topic: view-policy-dialog
---

# View Policy Dialog

## What We're Building

A read-only modal that opens when the user clicks "View" on a policy row in the Policies tab. Shows the policy's description, its module permissions (from `policy.permissions[]`), and a searchable list of members assigned to that policy.

## Why This Approach

All required data is already loaded on the page — no new API calls needed:
- Policy fields (`name`, `group`, `description`, `permissions[]`) come from the `Policy` object
- Members are filtered client-side: `members.filter(m => m.policies?.some(p => p.code === policy.code))`

This follows YAGNI: reuse loaded data before adding new endpoints.

## Key Decisions

- **State location**: `selectedPolicy: Policy | null` lives in `PoliciesTable` component; `members: Member[]` passed as a new prop from the parent page
- **Dialog component**: `PolicyViewDialog` — separate component taking `policy`, `members`, `isOpen`, `onClose`
- **Modal base**: Use existing `@headlessui/react` Dialog pattern (same as `apps/back-office/components/modal/modal.tsx`)
- **Header**: Shield icon + `"{policy.name} — {policy.group}"` + X close button
- **Description section**: `policy.description ?? "No description"`
- **Module Permissions section**: Render `policy.permissions[]` as rows with shield icon + permission code/name. Skip View/Edit/Admin badges — structured level data is not in the current API response.
- **Members section**: Heading `"Members ({count})"` + search input + scrollable table (avatar + name/email | Team/Project | Date)
  - Members list: filtered from all loaded members by matching `policy.code`
  - Team/Project: reuse `ProjectsCell` component
  - Date: member's `plnStartDate` (join date — closest available proxy)
  - Member search: client-side filter on name/email

## Open Questions

- The View/Edit/Admin badges in the design require structured permission level data not present in `policy.permissions: string[]`. Skipping for v1 — revisit if the API is extended.
- The "Date" column in the design likely represents when the member was assigned to the policy. We use `plnStartDate` as a proxy since no assignment timestamp is available.

## Next Steps

→ `/workflows:plan` for implementation details
