---
date: 2026-04-23
topic: approved-tab-extra-columns
---

# Approved Members Tab — Extra Columns

## What We're Building

When the active tab is "Approved Members", the `MembersTableV2` table shows 3 additional columns beyond the base layout:

| Column | Content | Fallback |
|---|---|---|
| **Role** | `member.memberRoles[].name` — stacked text (one per line if multiple) | `—` |
| **Group** | `demoDayAdminScopes[]` entries where `scopeType` indicates a group — rendered as a badge chip | `—` |
| **Exceptions** | `demoDayAdminScopes[]` entries where `scopeType` indicates an exception — rendered as a warning badge (`⚠️ label`) | `—` |

The toolbar on the Approved tab also gains two filter dropdowns to the right of the search input:
- **All groups** — client-side filter by group value
- **All roles** — client-side filter by role name

## Why This Approach

### Chosen: Tab-conditional columns + client-side filters

`MembersTableV2` receives an `activeTab` prop (or a separate `columns` prop) and renders a different column set when `activeTab === 'APPROVED'`. The extra filters are state managed at the page level and applied as an additional `useMemo` pass before `filteredMembers` is passed to the table.

**Why not a separate table component?** The base table (Member + Team/Project + Actions) is 3 identical columns across all tabs — only Approved adds columns. A single component that adapts is simpler than forking a second component.

### Data mapping (to confirm from RbacSection implementation)

`demoDayAdminScopes[]` has `{ scopeType, scopeValue }`. The exact `scopeType` values that distinguish "group" from "exception" need to be read from `RbacSection/` or the API schema before implementation. Best guess based on the design:
- Group: `scopeType === 'group'` or similar → `scopeValue` is the group name (e.g., "PL Internal")
- Exception: `scopeType === 'exception'` or similar → `scopeValue` is the exception label

## Key Decisions

- **Column switching**: Pass `activeTab` to `MembersTableV2`; derive the column set with `useMemo([activeTab])`. No separate component.
- **Extra filters**: `groupFilter` and `roleFilter` string state at page level, reset to `''` on tab change.
- **Filter application**: `useMemo` chains: `members → filterByState → filterByGroup → filterByRole → filteredMembers`.
- **Group badge**: Gray/dark chip matching the design (similar to existing `StatusCell` or a new `GroupBadge` sub-component).
- **Exception badge**: Warning icon + orange text, similar to the existing `s.orange` modifier pattern.
- **Dropdown options**: Derived from the full member list (`useMemo`) — unique role names and group values across all Approved members.
- **Data source**: Existing `Member` type fields — `memberRoles[]` and `demoDayAdminScopes[]`. No new API call.

## Open Questions

- What are the exact `scopeType` values in `demoDayAdminScopes` that map to "group" vs "exception"? (Read `RbacSection/` to confirm.)
- Are `All groups` and `All roles` dropdowns standard `<select>` elements or `react-select`? (Design shows native-style dropdowns — use `react-select` for consistency with the rest of the codebase.)
- Should the Role column stack multiple roles vertically (as shown) or comma-separate them?
- Should Group show a single badge or multiple? (Design shows one per row — but a member could have multiple scopes.)

## Next Steps

→ `/workflows:plan` for implementation details
