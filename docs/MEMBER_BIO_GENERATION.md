# Member Bio Generation (Husky AI Bios)

## Overview

Automated AI generation of member bios, part of the **Husky** assistant.
A signed-in member can generate their own bio on demand; admins can bulk-refresh every previously AI-generated bio via admin endpoints.

The pipeline was rebuilt around **gender accuracy**: historical bios were generated from a prompt that said "use appropriate gender pronouns (He/She)" with no gender data supplied, so the model guessed from the member's name — and guessed "She" for a large share of members. The current pipeline resolves pronouns from verified signals **before** generating and forbids the model from guessing.

## Pronoun doctrine (do not weaken)

1. **`he/him` / `she/her` only when explicitly verified** — a resolved "Known Pronouns" value, pronouns listed on the member's own LinkedIn/X profile, or gendered pronouns used about this exact person in a verified source.
2. **`they/them` only when explicitly declared** — a "(they/them)" marker on their profile or a non-binary CRM gender value. Singular *they* is not used as an unknown-gender fallback: readers can misread it as a statement of non-binary identity.
3. **Unknown → no third-person pronouns at all.** The bio refers to the member by first name and restructures sentences ("…Jamie drives adoption of…"). Bios are ~3 sentences, so name-only reads naturally.
4. **Never infer gender** from the member's name, photo, location, language, or role.

The rules are enforced in both bio system prompts (`HUSKY_AUTO_BIO_SYSTEM_PROMPT`, `HUSKY_AUTO_BIO_DATABASE_ONLY_PROMPT` in `apps/web-api/src/utils/ai-prompts.ts`) and reinforced by a `Known Pronouns:` line injected into every profile prompt — either the verified value with its source, or an explicit *"unknown — do NOT guess; avoid third-person pronouns entirely"* instruction.

## File map

| File | Role |
| --- | --- |
| `apps/web-api/src/husky/member-bio.util.ts` | Core: pronoun scanning/mapping, free-signal resolution, profile prompt builder, `generateMemberBioText` (OpenAI call) |
| `apps/web-api/src/husky/member-bio-refresh.util.ts` | Bulk refresh runner; `AI_BIO_MARKER`; the paid scrape ladder |
| `apps/web-api/src/husky/member-bio-refresh.service.ts` | Admin-facing service: status, dry-run, fire-and-forget apply run |
| `apps/web-api/src/husky/member-scrapingdog.service.ts` | Member-scoped ScrapingDog client (LinkedIn person + X profile). Separate from the team-enrichment ScrapingDog client on purpose |
| `apps/web-api/src/husky/husky-generation.service.ts` | Self-service generation (`generateMemberBio`), plus skills/recommendation generators |
| `apps/web-api/src/husky/husky-generation.controller.ts` | `GET /v1/husky/generation/bio` (member generates their own bio) |
| `apps/web-api/src/admin/member.controller.ts` | Admin endpoints `ai-bios/status` + `ai-bios/refresh` |
| `apps/web-api/src/utils/ai-prompts.ts` | Bio system prompts + `HUSKY_BIO_DISCLAIMER` |

## Storage model

- The bio lives on **`Member.bio`** (`String?`). There is **no structured "AI-generated" flag** — the only marker is the disclaimer HTML appended to every generated bio:
  - `HUSKY_BIO_DISCLAIMER` = `<p><em>Bio is AI generated & may not be accurate.</em></p>`
  - Bulk refresh identifies AI bios by substring match on the visible text (`AI_BIO_MARKER = 'Bio is AI generated'`), deliberately not the full HTML so older disclaimer variants still match.
- Generation itself does not persist: the self-service endpoint returns `{ bio }` and the front-end saves it via the normal member-update path. The bulk refresh writes `Member.bio` directly.
- **Caveat:** if a member manually edited their bio but kept the disclaimer text, a bulk refresh will overwrite that edit — the disclaimer is the only AI marker that exists.

## Generation flow

`generateMemberBioText(member, { pronouns, scrapedContext })` in `member-bio.util.ts`:

1. Builds the profile prompt: name, **Known Pronouns**, handles, location, skills, team roles, project contributions, `MemberExperience` rows, `moreDetails`, `linkedInDetails` JSON, and (refresh only) a *"verified data fetched from the member's own social profiles"* block with anything ScrapingDog returned.
2. Picks the system prompt by `hasEnoughIdentifyingInfo` (≥3 of: name, any social handle, team roles, location, experience):
   - enough → `HUSKY_AUTO_BIO_SYSTEM_PROMPT` + OpenAI `web_search_preview` tool (search context `high`, user-location hint from the member's city/country);
   - not enough → `HUSKY_AUTO_BIO_DATABASE_ONLY_PROMPT`, no web search (prevents misattribution when the member is not uniquely identifiable).
3. Model: `openai.responses(OPENAI_LLM_MODEL)`, temperature 0.7. An empty response means "not enough data for a meaningful bio" — callers keep the existing bio in that case.
4. Callers append `HUSKY_BIO_DISCLAIMER` before saving/returning.

## Pronoun resolution ladder (cost-tiered)

Cheapest first; the ladder stops at the first conclusive signal. **If a free signal resolves pronouns, no paid call of any kind is made.**

| Tier | Signal | Where | Cost |
| --- | --- | --- | --- |
| 0 | Explicit pronoun markers (`(she/her)`, `pronouns: he`, …) in stored `Member.linkedInDetails` / `Member.moreDetails` | `resolveMemberPronouns` → `scanTextForExplicitPronouns` | free |
| 1 | CRM gender: `AffinityPerson.gender` via `MasterProfile(memberUid → affinityPersonId)`, falling back to email match (`primaryEmail` / `emailAddresses`) | `resolveMemberPronouns` → `mapGenderToPronouns` | free (2-3 DB queries) |
| 2 | ScrapingDog **X profile** — pronouns are often in the X display name / bio | `member-scrapingdog.service.ts` `fetchXProfile` | cheap paid call |
| 3 | ScrapingDog **LinkedIn person profile** — pronouns in `fullName`/headline; also yields experience/about that enriches the bio | `fetchPersonProfile` | **expensive: 50-100 credits** |
| — | Nothing conclusive | prompt forbids guessing → name-only bio | free |

Tiers 2-3 run **only** in the bulk refresh (never in the self-service endpoint) and only when tiers 0-1 came up empty. Whatever was scraped along the way is passed to the generator as verified context, so a paid call improves the bio as a side effect.

`scanTextForExplicitPronouns` is deliberately narrow: it matches self-declared markers (`she/her`, `he/him`, `they/them`, `pronouns: she`), never prose that merely *uses* gendered pronouns. When several markers appear ("she/they"), the earliest in the text wins. `mapGenderToPronouns` maps only conclusive CRM values (female/male/non-binary variants); anything else returns `null` rather than guessing.

## ScrapingDog member client

`MemberScrapingDogService` — kept separate from `TeamEnrichmentScrapingDogService` (which is company/team-scoped); the two features share only the vendor.

- **LinkedIn person:** `GET https://api.scrapingdog.com/profile?type=profile&id=<slug>` — same base endpoint teams use with `type=company`. The slug is extracted from `linkedin.com/in/<slug>` URLs or bare slugs; **company URLs are rejected** so a person fetch can never scrape a company.
- **X profile:** `GET https://api.scrapingdog.com/x/profile?profileId=<handle>&parsed=true`.
- The person payload is a single-element array; field picks (`fullName`, `first_name`, `public_identifier`, `headline`, `about`, `experience[].position/company_name/starts_at/ends_at/duration/summary`, `education[].college_name/college_degree/college_degree_field`) are validated against a real captured response in `member-scrapingdog.service.spec.ts` — if ScrapingDog renames a key, that spec fails loudly.
- 15s timeout, `SCRAPINGDOG_API_KEY` gate (`isConfigured()`), not-found and empty-shell payloads normalized to `{ kind: 'not-found' }`.

## Refresh mechanisms

### Self-service (existing, per-member)

`GET /v1/husky/generation/bio` (guard: `UserAccessTokenValidateGuard`) — regenerates the **calling member's** bio each hit. Uses the free pronoun ladder (tiers 0-1) automatically; never scrapes.

### Admin endpoints (bulk)

Both under `v1/admin/members`, guard `AdminAuthGuard` (`directory.admin.full`), following the team-enrichment admin pattern (fire-and-forget + status polling — no Bull queue):

```bash
# Count of AI-generated bios + current/last run
curl -H "Authorization: Bearer $ADMIN_TOKEN" "$WEB_API_BASE_URL/v1/admin/members/ai-bios/status"

# Dry-run (DEFAULT): synchronous report, zero paid calls
curl -X POST -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" \
  -d '{"dryRun": true}' "$WEB_API_BASE_URL/v1/admin/members/ai-bios/refresh"

# Apply: background run; poll ai-bios/status
curl -X POST -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" \
  -d '{"dryRun": false, "limit": 20, "noScrape": false}' "$WEB_API_BASE_URL/v1/admin/members/ai-bios/refresh"
```

Body options: `dryRun` (default **true**), `limit`, `emails: string[]`, `noScrape`. A dry run resolves free-signal pronouns per member and reports who would need scraping — it makes no OpenAI or ScrapingDog calls. The apply run's re-entrancy guard (`isRunning`) is **in-memory per pod**; with multiple replicas another pod could start a second run. Acceptable for a manually-triggered maintenance job — same trade-off the team-enrichment status endpoint documents.

> A CLI wrapper (`yarn api:refresh-ai-member-bios`) existed briefly but was removed in favor of the endpoints — `runMemberBioRefresh` takes a plain `PrismaClient`, so a standalone script can be recreated in minutes if ever needed.

### Runner semantics

- Selects members `WHERE bio LIKE '%Bio is AI generated%'` (plus optional email filter / limit), ordered by `createdAt`.
- Per member: free ladder → (apply mode only) paid ladder → generate → save `bio + HUSKY_BIO_DISCLAIMER`.
- Empty generation keeps the existing bio (counted as `emptyGeneration`).
- Per-member errors are caught and counted; the run continues.
- Stats: `freeResolved`, `scrapeResolved`, `unknown` (name-only fallback), `updated`, `emptyGeneration`, `errors`, `xCalls`, `linkedinCalls`, plus a per-member result list.

## Environment variables

| Variable | Purpose |
| --- | --- |
| `OPENAI_LLM_MODEL` | Model for `generateText` (bio, skills, recommendations) |
| `OPENAI_API_KEY` | OpenAI auth (via `@ai-sdk/openai`) |
| `SCRAPINGDOG_API_KEY` | Enables the paid scrape ladder; when unset, scraping is skipped and unknown-pronoun members fall back to name-only bios |

## Testing

```bash
yarn nx run web-api:test --testFile=apps/web-api/src/husky/member-bio.util.spec.ts
yarn nx run web-api:test --testFile=apps/web-api/src/husky/member-scrapingdog.service.spec.ts
```

- `member-bio.util.spec.ts` — pronoun scanning/mapping, free-ladder precedence (explicit markers beat CRM gender), prompt content for verified/unknown pronouns, scraped-context injection.
- `member-scrapingdog.service.spec.ts` — handle extraction (person slug vs company URL rejection, X usernames) and payload normalization against the real captured response shape.
- The `ai` / `@ai-sdk/openai` packages ship untranspiled ESM this jest config can't parse — specs that import `member-bio.util.ts` must `jest.mock('ai', ...)` / `jest.mock('@ai-sdk/openai', ...)` at the top (see the existing spec).
- Nest e2e (`createNestApplication`) is broken repo-wide; don't add controller e2e tests for these endpoints.

## Gotchas

- **Don't re-add a pronoun default to the prompts.** The original bug was exactly that: "(He/She)" with no data → the model guessed from first names.
- **`Member.linkedInDetails` has no writer in `src/`** — it is populated by external imports (Airtable-era sync). Treat its shape as opaque; the pronoun scan runs over its JSON string form.
- The self-service endpoint appends the disclaimer even to an empty generation (pre-existing behavior, kept for compatibility); the bulk runner explicitly skips saving empty generations.
- Bios regenerated by the refresh overwrite manual edits **if** the member kept the disclaimer text in their bio (see Storage model).
- A person scrape costs 50-100 ScrapingDog credits — never move it earlier in the ladder, and never call it from the self-service endpoint.
