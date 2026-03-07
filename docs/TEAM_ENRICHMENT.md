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
  fields: Partial<Record<EnrichableTeamField, FieldEnrichmentStatus>>;
}
```

### Enums

- **EnrichmentStatus**: `PendingEnrichment`, `InProgress`, `Enriched`, `FailedToEnrich`, `Reviewed`, `Approved`
- **FieldEnrichmentStatus**: `Enriched`, `ChangedByUser`, `CannotEnrich`

### Enrichable Fields

**Scalar fields** (directly on Team model):
`blog`, `contactMethod`, `twitterHandler`, `linkedinHandler`, `telegramHandler`, `shortDescription`, `longDescription`, `moreDetails`

**Relational fields** (handled separately):
- `industryTags` — many-to-many relation via `IndustryTag` model. AI returns tag names; the system matches them case-insensitively against existing `IndustryTag` records and connects matches. Only enriched if the team has no existing industry tags.
- `investmentFocus` — `String[]` on `InvestorProfile` (one-to-one with Team). AI returns focus tags; the system creates or updates the `InvestorProfile`. Only enriched if the current focus array is empty.

> **Note:** `website` is NOT enrichable — it is a mandatory user-provided field and is always present before enrichment runs.

## Trigger Flow

1. Admin approves investor via PATCH `/v1/demo-days/:uid/participants/:uid` with `status: 'ENABLED'`
2. `DemoDayParticipantsService.updateParticipant()` identifies fund teams at L0 where participant is team lead
3. After promoting teams to L1, calls `teamEnrichmentService.markTeamForEnrichment(teamUid)`
4. Sets `dataEnrichment = { shouldEnrich: true, status: 'PendingEnrichment', ... }`

## Cron Job

- **Schedule**: `TEAM_ENRICHMENT_CRON` env var (default: `0 3 * * *` — daily at 3 AM UTC)
- **Guard**: `IS_TEAM_ENRICHMENT_ENABLED` must be `'true'`
- Finds all teams with `shouldEnrich=true` and `status=PendingEnrichment`
- Processes sequentially to avoid OpenAI rate limits
- Skips teams without a website (marks as `FailedToEnrich`)
- Only fills null/empty fields (never overwrites existing data)
- Logo: scraped via OG tags from website, uploaded to S3

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
Marks the team for enrichment and runs it immediately (synchronous).
Does NOT require `IS_TEAM_ENRICHMENT_ENABLED` — this is a manual override.

### Trigger Enrichment for All Pending Teams
```
POST /v1/admin/teams/trigger-enrichment
Guard: AdminAuthGuard
```
Finds all teams with `shouldEnrich=true` + `status=PendingEnrichment` and enriches them sequentially.
Returns `{ success, total, enriched, failed }`.

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

| Variable | Default | Description |
|----------|---------|-------------|
| `IS_TEAM_ENRICHMENT_ENABLED` | `false` | Enable/disable the cron job |
| `OPENAI_TEAM_ENRICHMENT_MODEL` | `gpt-4o` | OpenAI model for enrichment |
| `TEAM_ENRICHMENT_CRON` | `0 3 * * *` | Cron schedule expression |

## Module Structure

```
apps/web-api/src/team-enrichment/
  team-enrichment.types.ts          # Enums, interfaces, enrichable fields
  team-enrichment-ai.service.ts     # LLM wrapper + OG tag scraping
  team-enrichment.service.ts        # Core business logic
  team-enrichment.job.ts            # Daily cron job
  team-enrichment.module.ts         # NestJS module
```

## Dependencies

- `TeamEnrichmentModule` is imported by: `AppModule`, `DemoDaysModule`, `TeamsModule`, `AdminModule`
- Uses `forwardRef` for `TeamsModule` circular dependency
- AI: `ai` + `@ai-sdk/openai` packages (same as existing fund enrichment)
- File upload: `FileUploadService` from `SharedModule` (global)
