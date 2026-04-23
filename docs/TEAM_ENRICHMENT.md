# Team Data Enrichment

## Overview

Automated AI enrichment for fund teams.
When an investor is approved in the Demo Day back-office and their new fund team is promoted from L0 to L1,
the system marks the team for enrichment. A daily cron job processes pending teams using LLM + web search.

## Schema

### `Team.dataEnrichment` (JSONB, nullable)

```typescript
interface TeamDataEnrichment {
  shouldEnrich: boolean;           // true = pending pickup by cron
  status: EnrichmentStatus;        // PendingEnrichment | InProgress | Enriched | FailedToEnrich | Reviewed | Approved
  isAIGenerated: boolean;          // true if any fields were filled by AI
  enrichedAt?: string;             // ISO timestamp
  enrichedBy?: string;             // 'system-cron' or user email
  reviewedAt?: string;             // ISO timestamp
  reviewedBy?: string;             // reviewer email
  errorMessage?: string;           // error details if FailedToEnrich
  fieldsMeta: Partial<Record<FieldMetaKey, {
    status: FieldEnrichmentStatus;
    confidence?: 'high' | 'medium' | 'low';
    source?: 'ai' | 'open-graph' | 'scrapingdog';
  }>>;
}
```

> **Note:** The legacy `fields` property (a simple `field → status` map) may still exist in older records but is superseded by `fieldsMeta`, which includes the same `status` along with `confidence` and `source`. New code should use `fieldsMeta` exclusively.

### Enums

- **EnrichmentStatus**: `PendingEnrichment`, `InProgress`, `Enriched`, `FailedToEnrich`, `Reviewed`, `Approved`
- **FieldEnrichmentStatus**: `Enriched`, `ChangedByUser`, `CannotEnrich`

### Enrichable Fields

**Scalar fields** (directly on Team model):
`website`, `blog`, `contactMethod`, `twitterHandler`, `linkedinHandler`, `telegramHandler`, `shortDescription`, `longDescription`, `moreDetails`

**Relational fields:**
- `industryTags` — matched against existing `IndustryTag` records (case-insensitive). Only enriched if team has none.
- `investmentFocus` — `String[]` on `InvestorProfile`. Only enriched if currently empty.

**Logo** — extracted from website metadata (`og:image`, `twitter:image`, favicon) via `open-graph-scraper`. Only fetched if team has no logo. If the website-based extraction fails and we have a LinkedIn handle, the ScrapingDog fallback (below) supplies a high-confidence logo from LinkedIn's `profile_photo`.

> **Note:** `website` is enrichable — if a team has no website, the AI will attempt to discover it via web search.

### Field Statuses

Each enrichable field is tracked in `dataEnrichment.fieldsMeta[<field>].status`:
- `Enriched` — field was empty and successfully filled by AI
- `CannotEnrich` — field was empty but AI could not find a value
- `ChangedByUser` — field is user-controlled: either (a) it was enriched by AI and later modified by a user, (b) it was already populated before enrichment ever ran, or (c) the user filled in a previously `CannotEnrich` field. In all three cases, future enrichment runs (including force mode) will not overwrite the field.

### Field Confidence & Source

`dataEnrichment.fieldsMeta[<field>]` also records per-field `confidence` and `source`:

| Source | Confidence |
|--------|------------|
| `ai` (OpenAI / Gemini / Anthropic web search) | `high` / `medium` / `low` — taken from the model's `confidence` object |
| `open-graph` (website favicon / OG scraping) | `medium` |
| `scrapingdog` (LinkedIn first-party) | `high` |

When a user later edits an enriched field, its `fieldsMeta[field].status` is flipped to `ChangedByUser` but the `confidence` and `source` are preserved as provenance.

## Trigger Flow

### Path A — Demo Day Approval (L0→L1 promotion)

1. Admin approves investor via PATCH `/v1/demo-days/:uid/participants/:uid` with `status: 'ENABLED'`
2. System identifies fund teams at L0 where participant is team lead
3. After promoting teams to L1, marks them for enrichment
4. Sets `dataEnrichment = { shouldEnrich: true, status: 'PendingEnrichment', ... }`

### Path B — Team creation by L5-L6 members via participants-request

1. L5/L6 member creates a team via POST `/v1/participants-request` with `participantType: 'TEAM'`
2. Team is created with `accessLevel: 'L1'` (automatic for L5-L6 requesters)
3. After creation, system marks the team for enrichment
4. Sets `dataEnrichment = { shouldEnrich: true, status: 'PendingEnrichment', ... }`

### Path C — Automatic marking of eligible existing teams

1. A cron job (`TEAM_ENRICHMENT_MARKING_CRON`) periodically scans for fund teams that have never been enriched (`dataEnrichment` is null)
2. Teams must also have at least one empty enrichable scalar field (website, blog, contactMethod, twitterHandler, linkedinHandler, telegramHandler, shortDescription, longDescription, moreDetails)
3. Matching teams are marked for enrichment: `dataEnrichment = { shouldEnrich: true, status: 'PendingEnrichment', ... }`
4. The existing enrichment cron picks them up on its next run

## Enrichment Behavior

- Teams without a website are enriched using team name and other available identifiers; the AI will attempt to discover the website
- **Standard mode** (cron, `trigger-enrichment`): only fills null/empty fields — never overwrites existing data. On subsequent runs, only fields with status `CannotEnrich` are retried. Fields already marked `Enriched` or `ChangedByUser` are skipped. Previous field statuses are preserved and merged with new results.
- **Force mode** (`trigger-force-enrichment?mode=all`): re-queries every field except those marked `ChangedByUser`. Overwrites existing scalar values, replaces `industryTags` with the new set, and replaces `investmentFocus`. Logo is also re-fetched: if the team already has a logo, `mode=all` overwrites it via the OG/website pass (and the ScrapingDog fallback treats the logo as a gap so it can upgrade to a high-confidence LinkedIn logo when available). User-owned logos — those flagged `ChangedByUser`, or pre-enrichment logos that have no `fieldsMeta.logo` entry — are still protected and never overwritten. The dedicated Force Logo Refetch endpoint is still available for targeted logo-only runs that prioritize ScrapingDog over OG.
- **Concurrency guard**: if enrichment is already `InProgress` for a team, duplicate requests are rejected immediately
- **`enrichedBy`**: set to `'system-cron'` for cron jobs, `'manually'` for admin-triggered enrichment

## AI Judge (Second-Pass Verification)

After enrichment completes, a separate **AI Judge** cron independently verifies each enriched field. The judge uses a **different AI model** from the enricher (configurable via `TEAM_ENRICHMENT_JUDGE_AI_PROVIDER`) and can leverage ScrapingDog's LinkedIn profile for a deterministic first stage where applicable. Results are written back to `dataEnrichment.judgment` and `fieldsMeta[field].judgment` so admins reviewing a team see an independent confidence + rationale per field.

### What the judge evaluates

- Only teams with `Team.isFund = true` and `dataEnrichment.status = Enriched`.
- Per-field: only fields whose `fieldsMeta[field].status === Enriched`.
- **Excluded**: `logo` (binary presence, not a semantic value), anything `ChangedByUser` (user-owned), `CannotEnrich`.

### Two stages

1. **Stage 1 — ScrapingDog LinkedIn match (deterministic).** Runs when `SCRAPINGDOG_API_KEY` is set and the team has a `linkedinHandler`. The judge fetches the canonical LinkedIn profile, classifies the name match as `exact` / `partial` / `none`, then performs direct field-to-field comparisons (URL host match for website, normalized equality for handle, tagline/about overlap for descriptions, set intersection for industries). Fields the comparison can resolve authoritatively (`agrees` at `high`, or `disagrees` at `low`) skip Stage 2. `partial` tier downshifts `high` verdicts to `medium`.
2. **Stage 2 — AI judge.** For remaining fields (or all fields when Stage 1 is unavailable), the second AI model returns a per-field `{ confidence, score, verdict, rationale }` plus an `overallAssessment` and `flagsForReview[]`. Temperature is conservative so the judge prefers `uncertain` over guessing.

### fieldsMeta after judgment

Each judged field gets an extra `judgment` sub-object, and the top-level `confidence` is overwritten with the judge's verdict (the verdict detail is preserved inside `judgment` for provenance):

```ts
fieldsMeta[field]: {
  status: FieldEnrichmentStatus,
  confidence: FieldConfidence,     // overwritten by judgment.confidence
  source: EnrichmentSource,
  judgment: {
    confidence: 'high' | 'medium' | 'low',
    score: 0..100,
    verdict: 'agrees' | 'disagrees' | 'uncertain',
    rationale: string,
    judgedAt: ISO string,
    judgedVia: 'scrapingdog' | 'ai',
    judgedModel?: string,          // only when judgedVia === 'ai'
  }
}
```

And on the team-level:

```ts
dataEnrichment.judgment: {
  status: 'PendingJudgment' | 'InProgress' | 'Judged' | 'FailedToJudge',
  judgedAt, judgedBy, aiModel, errorMessage,
  overallAssessment: string,
  flagsForReview: string[],        // e.g. 'scrapingdog-website-mismatch'
  scrapingDog?: { used, fetchedAt, nameMatch, companyNameFromLinkedIn, verifiedFields, linkedinInternalId }
}
```

### Bad LinkedIn handle handling

Both the judge (Stage 1) and the enrichment pipeline (ScrapingDog branch) distinguish "profile not found" from other ScrapingDog failures. When ScrapingDog returns the specific "profile not found" body (`{success: false, message: /not found/i}`) for an **AI-supplied** LinkedIn handle, the handle is nulled on the team record and its `fieldsMeta.linkedinHandler.status` is flipped to `CannotEnrich` so the next enrichment run can attempt to rediscover it. User-supplied handles (`ChangedByUser`) are never nulled. Any other ScrapingDog failure (HTTP 4xx/5xx, quota exhausted, timeout, malformed JSON) leaves the team untouched.

### Judge cron

- **Schedule**: `TEAM_ENRICHMENT_JUDGE_CRON` env var (default `0 4 * * *` — daily 4 AM UTC, one hour after the enrichment default).
- **Guard**: reuses `IS_TEAM_ENRICHMENT_ENABLED` — the same toggle gates all three crons.
- **Idempotency**: skips teams whose `dataEnrichment.judgment.status` is already `Judged` or `InProgress`.

### Admin endpoints

```
POST /v1/admin/teams/:uid/trigger-judgment           # Run judge for a team (skips if already judged)
POST /v1/admin/teams/trigger-judgment                # Run judge for all pending teams
POST /v1/admin/teams/:uid/trigger-force-judgment     # Re-run judge even if already judged
```
All require `AdminAuthGuard`. They do NOT require `IS_TEAM_ENRICHMENT_ENABLED` — manual overrides.

## ScrapingDog Fallback (LinkedIn)

A secondary, high-confidence enrichment source that queries LinkedIn company profiles via the [ScrapingDog](https://www.scrapingdog.com/) API. Because the API is paid, it is **only** called when the primary AI+OG pass leaves high-value gaps.

### Gating — ScrapingDog is invoked only if ALL are true

- `SCRAPINGDOG_API_KEY` is set.
- The team has a `linkedinHandler` (either existing or discovered by the AI pass).
- After the primary pass, at least one of these gaps remains: logo, website, shortDescription, longDescription, moreDetails, industryTags.

### What it populates (all as `FieldEnrichmentStatus.Enriched`)

| Team field | ScrapingDog source |
|------------|--------------------|
| `logo` | `profile_photo` (high-confidence LinkedIn-hosted logo, no OG validation needed) |
| `website` | `website` |
| `shortDescription` | `tagline` (truncated to 200 chars) |
| `longDescription` | `about` (truncated to 1000 chars) |
| `moreDetails` | concatenation of `founded`, `headquarters`, `industries`, `specialties` |
| `industryTags` | `industries` + `specialties` matched against `IndustryTag` records |

### Entity verification

The ScrapingDog `company_name` / `universal_name_id` is normalized and compared to the team name via `classifyNameMatch(teamName, profile)` which returns `exact` / `partial` / `none`. If the result is `none` (and the handle isn't user-owned), the response is discarded — this protects against a bad LinkedIn handle discovered by the AI. Exact/partial matches proceed normally.

### Enrichment-time confidence upgrade

When ScrapingDog returns a profile with an `exact` or `partial` name match, `compareProfileToTeam` is run inline. Fields the AI already filled that agree with LinkedIn's canonical values get their `fieldsMeta[field].confidence` upgraded to `high` (or `medium` on `partial`). The upgrade is strictly additive — it never downgrades confidence and never touches user-owned fields. The `fieldsMeta[field].judgment` sub-object is NOT written here; that stays owned by the AI Judge.

### Tagged fetch result

`TeamEnrichmentScrapingDogService.fetchCompanyProfile()` returns a tagged union `{ kind: 'ok' | 'not-found' | 'error' }`. Callers switch on `kind`:
- `ok` — profile is usable.
- `not-found` — the handle is invalid (HTTP 200 with `success: false, message: /not found/i`, or a payload missing both `company_name` and `universal_name_id`). Enrichment and the judge both null AI-supplied handles on this outcome; user-supplied handles are preserved.
- `error` — any other failure (HTTP non-200, timeout, malformed JSON). Callers leave the team state untouched.

### Metadata

When invoked, the run is recorded on `Team.dataEnrichment.scrapingDog`:

```ts
scrapingDog?: {
  used: boolean;
  fetchedAt: string;             // ISO timestamp
  fields: string[];              // which fields ScrapingDog filled this run
  linkedinInternalId?: string;   // LinkedIn internal company id
}
```

## Cron Job

- **Schedule**: `TEAM_ENRICHMENT_CRON` env var (default: `0 3 * * *` — daily at 3 AM UTC)
- **Guard**: `IS_TEAM_ENRICHMENT_ENABLED` must be `'true'`
- Finds all teams with `shouldEnrich=true` and `status=PendingEnrichment`
- Processes sequentially to avoid rate limits

## Endpoints

### Admin Review
```
PATCH /v1/admin/teams/:uid/enrichment-review
Guard: AdminAuthGuard
Body: { status: 'Reviewed' | 'Approved' }
```

### Trigger Enrichment for a Single Team
```
POST /v1/admin/teams/:uid/trigger-enrichment
Guard: AdminAuthGuard
```
Runs enrichment in the background. Returns `{ success: false, message: "..." }` if already in progress.
Does NOT require `IS_TEAM_ENRICHMENT_ENABLED` — this is a manual override.

### Trigger Enrichment for All Pending Teams
```
POST /v1/admin/teams/trigger-enrichment
Guard: AdminAuthGuard
```
Finds all pending teams and enriches them. Teams already in progress are skipped.
Returns `{ success, total, started, skipped, message }`.

### Force Re-Enrichment for a Single Team
```
POST /v1/admin/teams/:uid/trigger-force-enrichment?mode=all|cannotEnrich
Guard: AdminAuthGuard
```
Re-queues an already-enriched team for re-processing. Use when a team's data is stale
(e.g. they changed their website, pivoted focus) or when a new AI model has been rolled out.

- `mode=all` (default) — re-queries every enrichable field except those with status `ChangedByUser`. Overwrites existing AI-filled values with fresh results.
- `mode=cannotEnrich` — retries only fields whose prior status was `CannotEnrich`. Leaves `Enriched` fields untouched.

User-edited fields (`ChangedByUser`) are never overwritten in either mode.
Returns `{ success, message }` on success, or `{ success: false, message }` if enrichment is already in progress. Does NOT require `IS_TEAM_ENRICHMENT_ENABLED`.

### Force Re-Enrichment for All Completed Teams
```
POST /v1/admin/teams/trigger-force-enrichment?mode=all|cannotEnrich
Guard: AdminAuthGuard
```
Finds all `isFund=true` teams with `status ∈ { Enriched, Reviewed, Approved, FailedToEnrich }` and re-queues them using the same `mode` semantics as the single-team variant.
Teams currently `InProgress` or `PendingEnrichment` are skipped.
Returns `{ success, total, started, skipped, message }`.

### Force Logo Refetch for a Single Team
```
POST /v1/admin/teams/:uid/trigger-force-logo-refetch
Guard: AdminAuthGuard
```
Re-fetches the team's logo only, bypassing the "skip if team already has a logo" guard in `trigger-force-enrichment`. Sources are tried in this order:

1. **ScrapingDog** (high confidence) — used if `SCRAPINGDOG_API_KEY` is set and the team has a `linkedinHandler`. The response must pass entity-name verification.
2. **Website / Open Graph** (medium confidence) — fallback when ScrapingDog is unavailable or returns no usable profile photo. Uses favicon first, then Google / DuckDuckGo icon APIs, validated by dimension + aspect ratio.

Behavior:

- Protects user-uploaded logos: if `fieldsMeta.logo.status === ChangedByUser`, returns `{ success: false, message: "...logo is user-owned..." }` and makes no changes.
- Preserves the existing `logoUid` on failure — the team is never left worse off than before the call.
- The team's overall `dataEnrichment.status` is restored to its prior value after the refetch (terminal statuses are preserved; `null` / non-terminal defaults to `Enriched`).
- Concurrency: if `status === InProgress`, returns `{ success: false, message: "...already in progress..." }`.
- If the team has neither `website` nor `linkedinHandler`, returns `{ success: false, message: "...cannot refetch logo" }`.

Returns `{ success: true, message }` when queued. Does NOT require `IS_TEAM_ENRICHMENT_ENABLED`.

### Force Logo Refetch for All Teams
```
POST /v1/admin/teams/trigger-force-logo-refetch
Guard: AdminAuthGuard
```
Runs the single-team refetch for every `isFund=true` team with a non-empty `website` or `linkedinHandler`, regardless of current enrichment status. Teams whose logo is `ChangedByUser`, whose enrichment is `InProgress`, or which have no fetchable source are skipped with per-bucket counters.
Returns `{ success, total, started, skippedInProgress, skippedUserOwned, noSource, notFound, message }`.

### Team Lead Review
```
PATCH /v1/teams/:uid/enrichment-review
Guard: UserTokenValidation
Body: { status: 'Reviewed' | 'Approved' }
Validates requestor is team lead of the team
```

## User Change Tracking

### Governing invariant

**If a field has a value and its prior `fieldsMeta[field].status` is not `Enriched`, it is user-owned. Enrichment never overwrites it and marks it `ChangedByUser`.**

This rule applies in both standard and force modes. Force mode can re-query fields marked `Enriched` (AI-owned), but it will not touch anything the user has populated — including on a team's very first enrichment where `dataEnrichment` is `null`.

**User-owned = highest-confidence truth.** Beyond write-protection, user-owned fields also bypass downstream verification when used as seeds:

- `linkedinHandler` (ChangedByUser) → skips `verifyScrapingDogEntity` fuzzy team-name match. The user has already asserted this handle belongs to them, so ScrapingDog's company profile is accepted without the team-name check (applies in both `maybeEnrichViaScrapingDog` and the logo refetch path).
- `industryTags` (ChangedByUser, including user-cleared sets) is never treated as a ScrapingDog gap.
- `website` existence already causes `verifyEntityIdentity` to be skipped for the AI-enrichment pass, so user-owned websites are implicitly trusted.

The shared `isFieldUserOwned(fieldsMeta, field, slotHasValue)` helper at the top of `team-enrichment.service.ts` encodes the "ChangedByUser OR non-empty-with-no-meta" check used throughout.

### Where `ChangedByUser` is written

1. **During any enrichment run** — when the loop encounters a scalar field / `industryTags` / `investmentFocus` / `logo` that is non-empty and has no prior `Enriched` status, it writes `fieldsMeta[field] = { ..., status: ChangedByUser }`. Covers pre-existing user data on a first-ever run (whether triggered by cron or by force-enrichment) and any orphan user-supplied values that bypassed the team-update flow.
2. **When a user edits an AI-filled field** — `handleUserFieldChange()` flips `Enriched → ChangedByUser` for modified fields (called from `updateTeamFromParticipantsRequest()` when the team has `isAIGenerated=true`).
3. **When a user fills in a `CannotEnrich` field** — `handleUserFieldChange()` also flips `CannotEnrich → ChangedByUser` when the user supplies a non-empty value for a field AI had previously given up on.

`confidence` and `source` from any prior status are preserved as provenance across the status flip.

## Environment Variables

| Variable | Default     | Description |
|----------|-------------|-------------|
| `IS_TEAM_ENRICHMENT_ENABLED` | `false`     | Enable/disable all enrichment-related cron jobs (enrichment, marking, judge) |
| `AI_PROVIDER` | `gemini`    | Global default AI provider. Accepts `openai`, `gemini`, or `anthropic`. |
| `TEAM_ENRICHMENT_AI_PROVIDER` | —           | Overrides `AI_PROVIDER` for team enrichment only. Accepts `openai`, `gemini`, or `anthropic`. |
| `TEAM_ENRICHMENT_JUDGE_AI_PROVIDER` | —      | Overrides `AI_PROVIDER` for the AI Judge only. Set to a **different** value from `TEAM_ENRICHMENT_AI_PROVIDER` for a meaningful second-opinion verification (e.g. enrichment=`gemini`, judge=`anthropic`). |
| `OPENAI_LLM_MODEL` | `gpt-4o`    | OpenAI model |
| `GEMINI_MODEL` | `gemini-2.5-flash` | Gemini model |
| `CLAUDE_API_KEY` | —           | Anthropic API key. Required when the resolved provider is `anthropic`. Falls back to `ANTHROPIC_API_KEY` for SDK-default compatibility. |
| `CLAUDE_MODEL` | `claude-sonnet-4-6` | Claude model. Also accepts `ANTHROPIC_MODEL`. |
| `TEAM_ENRICHMENT_CRON` | `*/5 * * * *` | Cron schedule for the enrichment job |
| `TEAM_ENRICHMENT_MARKING_CRON` | `0 2 * * *` | Cron schedule for auto-marking eligible teams |
| `TEAM_ENRICHMENT_JUDGE_CRON` | `0 4 * * *` | Cron schedule for the AI Judge second-pass verification job |
| `SCRAPINGDOG_API_KEY` | —           | ScrapingDog LinkedIn API key. When set, enables the ScrapingDog fallback for teams with a known `linkedinHandler`. |

### AI provider selection

The enrichment pipeline supports three providers: **OpenAI**, **Gemini**, and **Anthropic (Claude)**. The effective provider is resolved per request: `TEAM_ENRICHMENT_AI_PROVIDER` wins if set, otherwise the global `AI_PROVIDER`, otherwise `gemini`. The resolved model id is written to `dataEnrichment.aiModel` for telemetry.

Web search behaviour differs by provider:

- **OpenAI** — uses the Responses API `web_search_preview` tool.
- **Gemini** — uses model-level search grounding (no tool object).
- **Anthropic** — Claude receives a provider-defined `web_search` tool in the shape the AI SDK accepts. Note that `@ai-sdk/anthropic@1.x` does not yet forward this tool to the Anthropic API, so the SDK emits an `unsupported-tool` warning and Claude answers from training knowledge. The call shape is kept forward-compatible so that a future SDK upgrade enables server-side web search without code changes.

## Module Structure

```
apps/web-api/src/team-enrichment/
  team-enrichment.types.ts          # Enums, interfaces, enrichable fields
  team-enrichment-ai.service.ts     # Enrichment LLM wrapper + logo scraping
  team-enrichment-scrapingdog.service.ts # LinkedIn fallback + classifyNameMatch/compareProfileToTeam helpers
  team-enrichment.service.ts        # Core enrichment business logic
  team-enrichment.job.ts            # Enrichment + marking cron jobs
  team-enrichment-judge-ai.service.ts # Judge LLM wrapper (independent model)
  team-enrichment-judge.service.ts  # Two-stage judgment pipeline orchestration
  team-enrichment-judge.job.ts      # Judge cron job
  team-enrichment.module.ts         # NestJS module
```

## Dependencies

- `TeamEnrichmentModule` is imported by: `AppModule`, `DemoDaysModule`, `TeamsModule`, `AdminModule`, `ParticipantsRequestModule`
- Uses `forwardRef` for `TeamsModule` circular dependency
- AI: `ai` + `@ai-sdk/openai` + `@ai-sdk/google` + `@ai-sdk/anthropic` packages
- Logo extraction: `open-graph-scraper`
- File upload: `FileUploadService` from `SharedModule` (global)
