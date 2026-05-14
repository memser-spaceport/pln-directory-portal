---
date: 2026-05-07
topic: members-v2-refactor
---

# Members V2 Page — Flat Extraction Refactor

## What We're Building

Split `apps/back-office/pages/members-v2/index.tsx` (402 lines) into sibling files so each file has a single, obvious responsibility. The component logic and JSX stay in `index.tsx`; only the non-component declarations move out.

## Why This Approach

Flat extraction (no hook extraction, no sub-components) was chosen over deeper splits. The component is already readable once the constants, types, styles, and the SVG icon are removed. Introducing a custom hook or sub-components would be premature — the component state is tightly coupled and there are no reuse requirements identified.

## Key Decisions

- **types.ts**: `MemberStateTab`, `ActiveTab`, `SelectOption`
- **constants.ts**: `ALL_MEMBER_STATES`, `MEMBER_STATE_TABS`, `REJECTED_TAB`
- **selectStyles.ts**: `selectStyles` (react-select `StylesConfig`)
- **SearchIcon.tsx**: the inline SVG component
- **index.tsx**: component body only, imports from the above files

No new abstractions. No logic moves. Pure file splitting.

## Open Questions

None — scope is fully defined.

## Next Steps

→ `/workflows:plan` for implementation details
