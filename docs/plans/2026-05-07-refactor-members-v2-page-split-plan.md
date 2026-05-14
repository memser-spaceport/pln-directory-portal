---
title: "refactor: Split members-v2 page into sibling files"
type: refactor
date: 2026-05-07
---

# ♻️ refactor: Split members-v2 page into sibling files

## Enhancement Summary

**Deepened on:** 2026-05-07
**Research agents used:** best-practices-researcher, kieran-typescript-reviewer, code-simplicity-reviewer, architecture-strategist, pattern-recognition-specialist

### Key Improvements Found

1. **Scope reduction:** `selectStyles` (22 lines, single-use) and `SearchIcon` (10 lines, single-use) do not need their own files — keep both inline in `index.tsx`.
2. **Deduplication opportunity:** `MemberStateTab` is already declared as `MemberStateTabId` in `memberStateTabIcons.tsx`. The new `types.ts` should be the single source of truth — update `memberStateTabIcons.tsx` to import from it.
3. **Second deduplication:** `ALL_MEMBER_STATES` is duplicated in `useMembersStateCounts.ts`. That hook should import from the new `constants.ts`.
4. **Type safety fix:** `ALL_MEMBER_STATES` should use `as const satisfies readonly MemberStateTab[]` instead of a plain `string[]` literal.
5. **`SelectOption` is not page-specific:** it is already defined in 3+ other files. Do not add it to `types.ts`; keep it inline in `index.tsx` or accept it as a per-file local type.

### Scope Change vs. Original Plan

| File | Original plan | Recommended |
|---|---|---|
| `types.ts` | Create | Create (without `SelectOption`) |
| `constants.ts` | Create | Create (with `as const satisfies` fix) |
| `selectStyles.ts` | Create | **Drop — keep inline** |
| `SearchIcon.tsx` | Create | **Drop — keep inline** |
| `memberStateTabIcons.tsx` | Not mentioned | **Update to import `MemberStateTab`** |
| `useMembersStateCounts.ts` | Not mentioned | **Update to import `ALL_MEMBER_STATES`** |

---

## Overview

`apps/back-office/pages/members-v2/index.tsx` is 402 lines. Most of its bulk is declarations that have nothing to do with rendering: type aliases, tab constants, a `StylesConfig` object, and an inline SVG. Moving the types and constants into dedicated sibling files reduces `index.tsx` to ~200 lines of component code and — more importantly — eliminates existing cross-file duplication of `MemberStateTab` and `ALL_MEMBER_STATES`.

No logic changes. No new abstractions. Pure file splitting with deduplication.

## Context

**Existing convention:** Every other `pages/` directory contains only `index.tsx` + `styles.module.scss`. The project already uses `types.ts` and `constants.ts` sibling files in `screens/` directories. This refactor mirrors that pattern at the page level.

**Cross-file duplication that already exists:**
- `MemberStateTab` union (`'PENDING' | 'VERIFIED' | 'APPROVED' | 'REJECTED'`) is defined locally in `index.tsx` AND as `MemberStateTabId` in `apps/back-office/components/menu/components/MembersV2Menu/memberStateTabIcons.tsx`. They are structurally compatible by coincidence.
- `ALL_MEMBER_STATES` array is defined in `index.tsx` AND in `apps/back-office/hooks/members/useMembersStateCounts.ts`.

**No behavioral changes:** all extracted code is referentially identical.

### Research Insight: Avoid barrel `index.ts` in Next.js pages

Do **not** add a barrel `index.ts` inside `pages/members-v2/`. Next.js treats every file in `pages/` as a potential route. Import directly from sibling files within the directory.

## Files to Create

### `apps/back-office/pages/members-v2/types.ts`

```ts
export type MemberStateTab = 'PENDING' | 'VERIFIED' | 'APPROVED' | 'REJECTED';
export type ActiveTab = MemberStateTab | 'POLICIES';
// SelectOption is intentionally NOT here — it is generic and already
// defined locally in several files; adding a page-scoped copy adds no value.
```

#### Research Insight: `MemberStateTab` consolidation

After creating `types.ts`, update `memberStateTabIcons.tsx` to import `MemberStateTab` from here instead of declaring its own `MemberStateTabId`. This removes the coincidental structural duplication and makes the type contract explicit.

```ts
// apps/back-office/components/menu/components/MembersV2Menu/memberStateTabIcons.tsx
// Before:
type MemberStateTabId = 'PENDING' | 'VERIFIED' | 'APPROVED' | 'REJECTED';

// After:
import type { MemberStateTab } from '../../../../pages/members-v2/types';
// use MemberStateTab everywhere MemberStateTabId was used
```

### `apps/back-office/pages/members-v2/constants.ts`

```ts
import type { MemberStateTab } from './types';

export const ALL_MEMBER_STATES = [
  'PENDING',
  'VERIFIED',
  'APPROVED',
  'REJECTED',
] as const satisfies readonly MemberStateTab[];

export const MEMBER_STATE_TABS: { id: MemberStateTab; label: string }[] = [
  { id: 'PENDING', label: 'Pending Members (L0)' },
  { id: 'VERIFIED', label: 'Verified Members (L1)' },
  { id: 'APPROVED', label: 'Approved Members' },
];

export const REJECTED_TAB: { id: MemberStateTab; label: string } = {
  id: 'REJECTED',
  label: 'Rejected Members',
};
```

#### Research Insight: `ALL_MEMBER_STATES` type safety

The original `const ALL_MEMBER_STATES = ['PENDING', ...]` is inferred as `string[]`. Using `as const satisfies readonly MemberStateTab[]`:
- Gives a `readonly ['PENDING', 'VERIFIED', 'APPROVED', 'REJECTED']` tuple (not `string[]`)
- `satisfies` validates the values against `MemberStateTab` at declaration time
- Catches any future typos or missing states at compile time

#### Research Insight: `ALL_MEMBER_STATES` deduplication

After creating `constants.ts`, update `useMembersStateCounts.ts` to import from here:

```ts
// apps/back-office/hooks/members/useMembersStateCounts.ts
import { ALL_MEMBER_STATES } from '../../pages/members-v2/constants';
// remove its own local ALL_MEMBER_STATES declaration
```

## Files NOT to Create (Scope Reduction)

### `selectStyles.ts` — **Keep inline in `index.tsx`**

The `selectStyles` object is ~22 lines, used only in this file (4 `<Select>` instances), and not shared anywhere. A dedicated file adds an import hop with no benefit. Three agents independently recommended keeping it inline.

### `SearchIcon.tsx` — **Keep inline in `index.tsx`**

The `SearchIcon` SVG is ~10 lines, used exactly twice in this file, and nowhere else. Single-use components do not earn their own files. Extract only if a second consumer appears.

## File to Modify

### `apps/back-office/pages/members-v2/index.tsx`

- Remove: inline `MemberStateTab`, `ActiveTab` type declarations
- Remove: `ALL_MEMBER_STATES`, `MEMBER_STATE_TABS`, `REJECTED_TAB` constants
- Add: `import type { MemberStateTab, ActiveTab } from './types';`
- Add: `import { ALL_MEMBER_STATES, MEMBER_STATE_TABS, REJECTED_TAB } from './constants';`
- Keep: `SelectOption` type (local, not worth sharing)
- Keep: `selectStyles` object (inline, single-use)
- Keep: `SearchIcon` component (inline, single-use)
- Result: ~230 lines (down from 402)

### `apps/back-office/components/menu/components/MembersV2Menu/memberStateTabIcons.tsx`

- Replace local `MemberStateTabId` type with `import type { MemberStateTab } from '../../../../pages/members-v2/types'`
- Rename all usages of `MemberStateTabId` → `MemberStateTab`

### `apps/back-office/hooks/members/useMembersStateCounts.ts`

- Replace local `ALL_MEMBER_STATES` declaration with `import { ALL_MEMBER_STATES } from '../../pages/members-v2/constants'`

## Acceptance Criteria

- [ ] `index.tsx` is ≤ 240 lines
- [ ] `types.ts` and `constants.ts` exist as siblings
- [ ] `constants.ts` imports types from `./types` (DAG: types.ts → constants.ts → index.tsx, no cycles)
- [ ] `ALL_MEMBER_STATES` typed as `readonly MemberStateTab[]` via `as const satisfies`
- [ ] `memberStateTabIcons.tsx` imports `MemberStateTab` from `types.ts` (no local duplicate)
- [ ] `useMembersStateCounts.ts` imports `ALL_MEMBER_STATES` from `constants.ts` (no local duplicate)
- [ ] TypeScript compilation passes with no new errors (`tsc --noEmit`)
- [ ] No runtime behavior changes — the page renders identically
- [ ] No new abstractions, hooks, or sub-components introduced

## Implementation Order

1. Create `types.ts` (no imports)
2. Create `constants.ts` (imports from `./types`)
3. Update `index.tsx`: remove `MemberStateTab`, `ActiveTab`, `ALL_MEMBER_STATES`, `MEMBER_STATE_TABS`, `REJECTED_TAB`; add two import lines
4. Update `memberStateTabIcons.tsx`: remove `MemberStateTabId`, import `MemberStateTab` from `types.ts`
5. Update `useMembersStateCounts.ts`: remove local `ALL_MEMBER_STATES`, import from `constants.ts`
6. Verify TypeScript compilation (`tsc --noEmit`)

## References

- Source file: `apps/back-office/pages/members-v2/index.tsx`
- Duplication target 1: `apps/back-office/components/menu/components/MembersV2Menu/memberStateTabIcons.tsx`
- Duplication target 2: `apps/back-office/hooks/members/useMembersStateCounts.ts`
- Brainstorm: `docs/brainstorms/2026-05-07-members-v2-refactor-brainstorm.md`
