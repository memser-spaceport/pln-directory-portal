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
  fields: Partial<Record<EnrichableField, FieldEnrichmentStatus>>;
}
```

### Enums

- **EnrichmentStatus**: `PendingEnrichment`, `InProgress`, `Enriched`, `FailedToEnrich`, `Reviewed`, `Approved`
- **FieldEnrichmentStatus**: `Enriched`, `ChangedByUser`, `CannotEnrich`

### Enrichable Fields

**Scalar fields** (directly on Team model):
`website`, `blog`, `contactMethod`, `twitterHandler`, `linkedinHandler`, `telegramHandler`, `shortDescription`, `longDescription`, `moreDetails`

**Relational fields:**
- `industryTags` — matched against existing `IndustryTag` records (case-insensitive). Only enriched if team has none.
- `investmentFocus` — `String[]` on `InvestorProfile`. Only enriched if currently empty.

**Logo** — extracted from website metadata (`og:image`, `twitter:image`, favicon) via `open-graph-scraper`. Only fetched if team has no logo.

> **Note:** `website` is enrichable — if a team has no website, the AI will attempt to discover it via web search.

### Field Statuses

Each enrichable field is tracked in `dataEnrichment.fields`:
- `Enriched` — field was empty and successfully filled by AI
- `CannotEnrich` — field was empty but AI could not find a value
- `ChangedByUser` — field was enriched by AI but later modified by a user

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
- Only fills null/empty fields — never overwrites existing data
- **Re-run safe**: on subsequent runs, only fields with status `CannotEnrich` are retried. Fields already marked `Enriched` or `ChangedByUser` are skipped. Previous field statuses are preserved and merged with new results.
- **Concurrency guard**: if enrichment is already `InProgress` for a team, duplicate requests are rejected immediately
- **`enrichedBy`**: set to `'system-cron'` for cron jobs, `'manually'` for admin-triggered enrichment

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

### Team Lead Review
```
PATCH /v1/teams/:uid/enrichment-review
Guard: UserTokenValidation
Body: { status: 'Reviewed' | 'Approved' }
Validates requestor is team lead of the team
```

## User Change Tracking

When a team is updated via `updateTeamFromParticipantsRequest()`, if the team has `isAIGenerated=true`,
any modified enrichable fields are marked as `ChangedByUser` in the `fields` map.

## Environment Variables

| Variable | Default     | Description |
|----------|-------------|-------------|
| `IS_TEAM_ENRICHMENT_ENABLED` | `false`     | Enable/disable the cron job |
| `OPENAI_TEAM_ENRICHMENT_MODEL` | `gpt-4o`    | OpenAI model for enrichment |
| `TEAM_ENRICHMENT_CRON` | `0 3 * * *` | Cron schedule expression |
| `TEAM_ENRICHMENT_MARKING_CRON` | `0 2 * * *` | Cron schedule for auto-marking eligible teams |

## Module Structure

```
apps/web-api/src/team-enrichment/
  team-enrichment.types.ts          # Enums, interfaces, enrichable fields
  team-enrichment-ai.service.ts     # LLM wrapper + logo scraping
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
