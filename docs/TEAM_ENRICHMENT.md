# Team Data Enrichment (LAB-1454)

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
| `ai` (OpenAI/Gemini web search) | `high` / `medium` / `low` — taken from the model's `confidence` object |
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

The ScrapingDog `company_name` / `universal_name_id` is normalized and compared to the team name (substring match). If it doesn't match, the response is discarded and no fields are filled — this protects against a bad LinkedIn handle discovered by the AI.

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
| `IS_TEAM_ENRICHMENT_ENABLED` | `false`     | Enable/disable the cron job |
| `OPENAI_TEAM_ENRICHMENT_MODEL` | `gpt-4o`    | OpenAI model for enrichment |
| `TEAM_ENRICHMENT_CRON` | `0 3 * * *` | Cron schedule expression |
| `TEAM_ENRICHMENT_MARKING_CRON` | `0 2 * * *` | Cron schedule for auto-marking eligible teams |
| `SCRAPINGDOG_API_KEY` | —           | ScrapingDog LinkedIn API key. When set, enables the ScrapingDog fallback for teams with a known `linkedinHandler`. |

## Module Structure

```
apps/web-api/src/team-enrichment/
  team-enrichment.types.ts          # Enums, interfaces, enrichable fields
  team-enrichment-ai.service.ts     # LLM wrapper + logo scraping
  team-enrichment-scrapingdog.service.ts # LinkedIn fallback via ScrapingDog
  team-enrichment.service.ts        # Core business logic
  team-enrichment.job.ts            # Daily cron job
  team-enrichment.module.ts         # NestJS module
```

## Dependencies

- `TeamEnrichmentModule` is imported by: `AppModule`, `DemoDaysModule`, `TeamsModule`, `AdminModule`, `ParticipantsRequestModule`
- Uses `forwardRef` for `TeamsModule` circular dependency
- AI: `ai` + `@ai-sdk/openai` packages
- Logo extraction: `open-graph-scraper`
- File upload: `FileUploadService` from `SharedModule` (global)
