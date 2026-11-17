## 1. Weights instead of tags

- [x] 1.1 Remove the muted news tags: validation and unmute on save, effective and starting tags, digest tag picks, tests
- [x] 1.2 `labos-digest-choice.util.ts`: apply a choice to topic weights, undo from before / after weights, rebuild deltas
- [x] 1.3 `LabosDigestPageService.choose`: read and write `MemberInterestProfileEntry` TOPIC rows under the member row lock; store `beforeWeights` / `afterWeights`
- [x] 1.4 Migration: nullable `beforeWeights` / `afterWeights` on `LabosDigestChoice`
- [x] 1.5 Profile rebuild: the loader reads active choices; `buildProfile` applies them last, never below 0
- [x] 1.6 Docs: `docs/MEMBER_INTEREST_PROFILE.md`

## 2. Picks order (Anuj, LAB-3263 Q1: yes)

- [x] 2.1 Order a member's matched digest tag picks by the sum of their topic weights, newest on a tie

## 3. Check

- [x] 3.1 Unit tests and the real-Postgres check (local) pass; `nx build web-api` passes
