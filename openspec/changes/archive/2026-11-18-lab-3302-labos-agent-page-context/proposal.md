## Why

Today the frontend sends member, team, job and profile pages as `home` with no id. So the agent does not know what "this member", "this team" or "this job" means. Slice S5 (LAB-3302) of LAB-3272 adds these pages to the C1 context. The contract is fixed in `contracts/lab-3272-labos-agent-api.md` (section 9, change 3). Decisions (Anna, all option A): Q1 the page target is also the intro target on member and team pages; Q2 the job board is `job` with no `jobUid`; Q3 the team page uses the team page rule and maps 403 to 404; Q4 jobs of `INACTIVE` teams show as on the GET (bug LAB-3322 is separate); Q5 plain-text bio up to 1000 characters.

## What Changes

- C1 accepts `context.page` `member` (`memberUid`), `team` (`teamUid`), `job` (optional `jobUid`) and `profile` (no id). Each id is allowed only on its own page.
- Lookups before the stream, after the pilot gate: 404 `MEMBER_NOT_FOUND`, `TEAM_NOT_FOUND`, `JOB_NOT_FOUND`. The team page uses `TeamsService.assertTeamVisibleToViewer`. The job page uses `JobOpeningsQueryService.getJobOpening`.
- The page context has public fields only. `profile` has only the session uid and the `get_my_profile` hint. A member page with the own uid is `profile`.
- On member and team pages, the page target is the intro target of the turn (`findAgentTargetName`).
- `news-story`, `home` and `intro` do not change.

## Capabilities

### Modified Capabilities

- `labos-agent`: the new page values, their lookups, the prompt fields and the page intro target.

## Impact

- **Code:** `apps/web-api/src/labos-agent/` (`labos-agent-page-context.ts` new, service, module), `libs/contracts/src/schema/labos-agent.ts`.
- **API:** C1 request gets four page values and three id fields. Three new 404 codes. Response fields do not change.
- **Database, config:** none. No migration, no cache entry, no new env var, no guard, RBAC, MCP cap or rate limit change. `LabosAgentModule` imports `TeamsModule` and `JobOpeningsModule`; no module gets a new export.
