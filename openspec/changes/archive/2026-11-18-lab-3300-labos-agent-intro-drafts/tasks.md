## 1. Shared sender rule (refactor)

- [x] 1.1 Add `IntroRequestsService.findEligibleRequester` and `findTargetName`. C3 uses them, with no change in behavior.
- [x] 1.2 Export `IntroRequestsService` from `IntroRequestsModule`. `LabosAgentModule` imports it.

## 2. Contract

- [x] 2.1 Add the `intro` page, `introTarget`, `INTRO_TARGET_NOT_FOUND`, the draft limits and the `LabosAgentDraft` type.

## 3. Draft tool and context

- [x] 3.1 Look up `introTarget` before the stream. 404 `INTRO_TARGET_NOT_FOUND` when it is unknown.
- [x] 3.2 Add `draft_intro` (`labos-agent-drafts.ts`): turn target check, sender rule, target name, limits, one draft. No writes.
- [x] 3.3 Add `drafts` to the stream body.

## 4. Tests

- [x] 4.1 `labos-agent-drafts.spec.ts`: one test group for each of S3-R1 to S3-R9.
- [x] 4.2 Existing S1, S2 and intro request specs pass.
