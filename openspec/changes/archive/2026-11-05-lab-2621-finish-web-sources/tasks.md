# Tasks

## 1. Setup

- [x] 1.1 Create worktrees on the agent branches: `~/Work/PLN/pln-directory-portal-lab-2621` and `~/Work/PLN/pln-directory-portal-v2-lab-2621`, both on `claude/LAB-2621-fill-thin-answers-with-labeled-web-sources`; merge `origin/develop` into each and verify there are no conflicts (`git status` clean, frontend PR #3480 reports `MERGEABLE`)
- [x] 1.2 Copy this change (`openspec/changes/lab-2621-finish-web-sources/`) into the backend worktree and verify `openspec validate lab-2621-finish-web-sources --strict` passes there against the branch's `openspec/specs/ai-search/spec.md`
- [x] 1.3 Install deps in both worktrees (`yarn install --frozen-lockfile` backend, the v2 install command from its AGENTS.md) and verify the PR's own specs pass before any edit: `yarn nx run web-api:test --testFile=apps/web-api/src/husky` (only failures that also fail on develop) and the 5 new v2 test files

## 2. Backend: source matching (blocker)

- [x] 2.1 Add failing tests to `apps/web-api/src/husky/source-refs.spec.ts` for the four scenarios of "A cited web page is never labeled as a directory source" (verify's repro first) and verify they fail on the current code
- [x] 2.2 Change `findEntry` in `source-refs.ts` per design decision 1 (web exact URL first; absolute vs `externalUrl` by host without `www.` plus path/query; relative paths keep path matching) and verify the new tests and every existing `source-refs.spec.ts` / `husky-ai.service.spec.ts` case pass

## 3. Backend: web search tool and prompt

- [x] 3.1 Move the query limits from the zod schema into `execute` (trim, cut to 300, empty → `WEB_SEARCH_NOT_AVAILABLE` with no `generateText` call); add tests for a 400-character and a blank query in `web-search.tool.spec.ts`, and verify with a short script or test against `ai@4.0.19` `streamText` that a schema-invalid tool call was in fact a stream error (so the change is justified) and that the new schema accepts it
- [x] 3.2 Make `summaryOf` cut only at the last line starting with `Sources:`; add the "data sources: on-chain logs." test and verify the existing summary tests still pass
- [x] 3.3 Cancel the response body in `resolvePageUrl` (`finally`, errors ignored); add a test with a mocked `fetch` whose body `cancel` is asserted, and verify it passes
- [x] 3.4 Add the untrusted-data line to `WEB_RESULTS_HEADER` and one line to the "Web search" section of `HUSKY_CONTEXTUAL_TOOLS_SYSTEM_PROMPT`; extend `ai-prompts.spec.ts` / `web-search.tool.spec.ts` to assert both, and verify they pass
- [ ] 3.5 Run backend checks scoped to touched code and verify: `yarn nx run web-api:test --testFile=apps/web-api/src/husky` and `--testFile=apps/web-api/src/utils/ai-prompts.spec.ts` pass (failures only where develop fails too), lint on changed files has 0 errors, `yarn build:api` succeeds
- [x] 3.6 Archive this change in the backend worktree (`openspec archive lab-2621-finish-web-sources`) and verify `openspec/specs/ai-search/spec.md` holds the three new requirements and `openspec validate --specs --strict` passes for `ai-search`

## 4. Backend: end-to-end with real web search

- [ ] 4.1 Confirm `HUSKY_SEARCH_AI_PROVIDER` / `HUSKY_SEARCH_OPUS_ENABLED` for dev and prod in `pl-infra-pipeline` config (read-only) and verify the search provider resolves to Gemini there (the OpenAI text-URL path is then unused); record the values in the PR body
- [x] 4.2 Run web-api from the backend worktree against the local stack (Docker Redis/Mongo, `pl-local-db-v2`, Gemini key from `.env`) and call `POST /v1/husky/chat/contextual-tools` with (a) a thin question about a team with only a short description, (b) "What is a zero-knowledge proof?", (c) a question the directory answers fully (a team's open jobs); verify (a) and (b) stream "Searching the web" and end with `web` refs that have `externalUrl`, no `directoryLink`, and resolved page URLs (not `vertexaisearch…` redirects), and (c) has no `web` ref; save the three responses under the session scratchpad
- [x] 4.3 Force a web failure (wrong Gemini key or a 1 ms timeout via a local-only edit that is reverted) and verify the answer still streams to the end, has no `web` ref, and the failure is logged

## 5. Frontend

- [x] 5.1 Strip query and fragment from `link` in `onAiWebSourceClicked` (design decision 6); extend `__tests__/analytics/unified-search.analytics.test.ts` with a URL that has `?utm=…#x` and verify it passes
- [x] 5.2 Add the scenario "The web source click event sends no query string" under the "Web source use is measured" requirement in the v2 `openspec/specs/ai-search/spec.md` and verify `openspec validate --specs --strict` passes for `ai-search` in v2
- [x] 5.3 Run v2 checks and verify: the LAB-2621 test files and the full jest suite pass, lint on changed files has 0 errors, `npm run build` (or the v2 build command) succeeds
- [ ] 5.4 Run v2 locally against the local web-api from 4.2, ask question (a) on `/ai-search` and in the header search dialog, and verify both show a "Directory" and a "Web" group, a web source opens in a new tab, and PostHog debug (or a network capture) shows `unified-search-ai-web-sources-shown` once and `unified-search-ai-web-source-clicked` with a URL without query string; take screenshots at 375 and 1440

## 6. Ship the PRs

- [ ] 6.1 Ask the user before pushing; then push both worktree branches, update both PR bodies (via `--body-file` with a quoted heredoc) with the fixes, the E2E evidence and the provider values, and verify the CI checks on #3671 and #3480 are green
- [ ] 6.2 With the user's approval: mark both PRs ready for review, remove `agent-blocked` from LAB-2621, post one ticket comment summarizing the review fixes and the E2E result, and move the ticket to Code review; verify the labels and status in Linear

## Workflow follow-up

- After review: merge backend #3671 first, then frontend #3480 (into `develop`; the ticket moves to Ready for test).
- Dev check: ask question (a) on the dev site (`directoryv2.dev.os.pl.xyz`), verify the "Web" group and a resolved web URL; this is the live check the verify comment asked for.
- Prod push via the `lab-ticket-workflow` skill (develop → main release with the other-authors check), then a prod check of one thin answer.
- Move LAB-2621 to Done after the prod check (Done means in prod), and tell the owner of LAB-2703 that its blocker is cleared.
- Remove the two `-lab-2621` worktrees.
