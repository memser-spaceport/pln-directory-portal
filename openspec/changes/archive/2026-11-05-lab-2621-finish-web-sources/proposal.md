# Proposal

## Why

LAB-2621 (AI Search fills thin answers with labeled web sources) was built by Horizon AutoDev in two draft PRs: backend memser-spaceport/pln-directory-portal#3671 and frontend memser-spaceport/pln-directory-portal-v2#3480 (branch `claude/LAB-2621-fill-thin-answers-with-labeled-web-sources` in both). The agent's verify step failed the pair: a web page at a site root (or with the same path as a team website) is matched to a directory team, so the member sees a web fact labeled as a directory fact. That breaks the main acceptance criterion. A manual review of both PRs also found smaller robustness, safety and privacy gaps. This change finishes the ticket so both PRs can be merged and the ticket closed.

## What Changes

Backend (PR #3671):
- Fix source matching: an absolute URL that the answer cites matches a directory source only through the directory page path, or through the same site (host and path) as that source's website. A bare path such as `/` never links two different sites. A `web` page whose URL the answer cites always wins over a directory entry.
- `searchWeb` never fails the answer because of its own argument checks: a long query is cut to the limit and an empty query gives the "web search not available" result, instead of a schema error from the tool call.
- The web summary keeps all its text: only a final "Sources:" line list is removed, not any sentence that has the word "sources:" in it.
- Web results are marked as untrusted page text: the answer model must not follow instructions found in them.
- Gemini redirect resolution releases each HTTP response body, so no socket stays open.

Frontend (PR #3480):
- The web source click event sends the page URL without its query string and fragment.

Both PRs:
- Tests for each fix, the `ai-search` OpenSpec specs updated in both repos, a local end-to-end check of one thin answer and one full answer with the real Gemini web search, then PRs marked ready, merged backend first, checked on dev, and shipped to prod with the ticket moved to Done.

No API shape change: the `sourceRefs[].type` value `web` from PR #3671 stays as it is.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `ai-search`: the backend capability that PR #3671 creates (`openspec/specs/ai-search/spec.md` on the PR branch). Adds requirements for how cited URLs are matched to directory and web sources, for the tool's own input limits, and for web results as untrusted text. The frontend `ai-search` spec (pln-directory-portal-v2, `openspec/specs/ai-search/spec.md` on its PR branch) gets the click-event privacy rule as a direct edit in that repo, because this planning change lives in the backend repo.

## Impact

- Backend: `apps/web-api/src/husky/source-refs.ts`, `apps/web-api/src/husky/tools/web-search.tool.ts`, `apps/web-api/src/utils/ai-prompts.ts` and their specs, `openspec/specs/ai-search/spec.md`.
- Frontend: `analytics/unified-search.analytics.ts` (or its callers in `AnswerSources.tsx` / `husky-source-card.tsx`), its test, `openspec/specs/ai-search/spec.md`.
- No new endpoint, env variable, dependency, or migration. Directory-only answers keep their current source refs; existing directory citations by absolute directory URL keep matching.
- Unblocks LAB-2703 (Ask AI on profiles), which waits for this ticket.
