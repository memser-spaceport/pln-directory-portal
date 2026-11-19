## 1. Contract

- [x] 1.1 Add the `member`, `team`, `job` and `profile` pages, `memberUid`, `teamUid`, `jobUid` and three refines.
- [x] 1.2 Add `MEMBER_NOT_FOUND`, `TEAM_NOT_FOUND` and `JOB_NOT_FOUND`.

## 2. Lookups and context

- [x] 2.1 Member lookup (no `deletedAt`), team page rule (403 and 404 give 404), job GET rule. All after the gate, before the stream.
- [x] 2.2 Public fields only in the prompt context (`labos-agent-page-context.ts`). Plain-text bio (1000) and job description (2000).
- [x] 2.3 Own uid on a member page gives the `profile` context. `profile` has only the session uid.
- [x] 2.4 The member or team page target is the intro target of the turn (`findAgentTargetName`).

## 3. Tests

- [x] 3.1 `labos-agent-page-context.spec.ts`: tests for S5-C1 to S5-C23 (names carry the IDs), on a fake Prisma that applies the filters.
- [x] 3.2 Existing S1, S2 and S3 specs pass. Only their constructor calls get the two new arguments.
