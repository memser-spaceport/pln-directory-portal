# Job Board — ownership and publication

**Linear:** [LAB-2574 — Ownership rule and publish timestamp on job openings](https://linear.app/plrs-labos/issue/LAB-2574/job-board-ownership-rule-and-publish-timestamp-on-job-openings), part of [LAB-2573 — PL ATS to job board](https://linear.app/plrs-labos/issue/LAB-2573/job-board-define-pl-ats-feature-scope).

**Scope of this document:** how a `JobOpening` records who manages it, when it counts as published, and how the crawler ingest and job alerts use both. Companion to [JOB_BOARD_IN_APP_APPLY_BACKEND.md](./JOB_BOARD_IN_APP_APPLY_BACKEND.md).

---

## Who manages a row: `JobOpening.managedBy`

| Value | Written by | Updated or closed by |
|-------|------------|----------------------|
| `ENRICHMENT` | data-enrichment crawler via `POST /v1/service/job-openings/ingest` | crawler only |
| `INTEGRATION` | a team's ATS integration (endpoints land with LAB-2577) | that integration only |
| `MANUAL` | hand-run SQL or the import script | manual only |
| `null` | rows created before the column existed | read as `ENRICHMENT` everywhere |

Rules:

- The crawler ingest never writes a row whose `managedBy` is set and is not `ENRICHMENT`. Such items are reported in the response under `skipped` with a `skippedReasons` entry of the form `owned-by-integration: <dedupKey>` or `owned-by-manual: <dedupKey>`. The row's status, `closedAt`, content and timestamps are untouched.
- Every row the crawler ingest creates is stamped `ENRICHMENT`. A legacy row with `null` is stamped `ENRICHMENT` the next time the crawler updates it.
- An ingest item may carry `managedBy`. Only `'ENRICHMENT'` is accepted on this endpoint; any other value fails the item (counted under `failed`, error names the dedup key) without touching the batch.
- Every crawler closure path (stale, cohort-exit, age-out, apply-URL liveness, invalid-role, orphan, identity) posts through the same ingest call, so this one check protects integration-owned rows from all of them.
- The per-team read `GET /v1/service/teams/:uid/job-openings` returns `managedBy` and `publishedAt` on every row so the crawler can skip early. The crawler's closure builder skips stored rows whose `managedBy` is present and not `ENRICHMENT`; that skip is noise reduction, the ingest check is the rule.

## When a row is published: `JobOpening.publishedAt`

A row is visible on the board when its status is not in `HIDDEN_JOB_OPENING_STATUSES` (`STALE`, `CLOSED_DUPLICATE`, `CLOSED_INCORRECT_SIGNAL`, `CLOSED_NOT_HIRING_SIGNAL`, `CLOSED_ROLE_FILLED`). `NEW`, `CONFIRMED` and `ROUTED_TO_WS4` are visible.

`publishedAt` is set:

- when a row is created in a visible status (crawler rows arrive as `New`, so this is the common case);
- when an update moves a row from a hidden status to a visible one (a `STALE` row re-ingested as `New`).

`publishedAt` is never changed by an update that keeps the row visible, and never cleared when the row becomes hidden. An incoming status the ingest does not recognise keeps the stored status and is not a transition.

Existing rows were backfilled once by migration `20260916140000_job_opening_managed_by_published_at`: visible rows got `publishedAt = createdAt`, hidden rows stayed `null`. The column is indexed.

## Job alerts

`JobOpeningsQueryService.findNewMatchesSince` selects openings with `publishedAt` strictly after the alert's cursor (`lastSentAt`, or `createdAt` when never sent), ordered by `publishedAt` descending. It never reads `updatedAt`. Consequences:

- A newly crawled visible row alerts once.
- Edits to a visible row, and unchanged re-ingests, do not alert.
- A row that goes hidden and comes back visible alerts again.
- A crawler run whose items were all skipped emits `job-ingest.completed` with zero created and zero updated, and dispatch does nothing.

The confirmation email sent when an alert is created uses the same query with no cursor, so it lists every currently published match in publication order.

## Ingest update path

When the crawler updates an existing crawler-managed row, the update writes every field the item carries among `roleTitle`, `roleCategory`, `seniority`, `department`, `postedDate`, `teamUid`, `sourceType`, `summary`, `workMode`, `descriptionHtml`, plus `sourceLink`, `canonicalKey`, `location`, `lastSeenLive`, `detectionDate`, `status` and `closedAt` as before. A field absent from the item leaves the stored value unchanged. `companyName` is never overwritten on update.

## Ingest response

```json
{
  "received": 3,
  "created": 1,
  "updated": 1,
  "skipped": 1,
  "failed": 0,
  "errors": [],
  "skippedReasons": ["owned-by-integration: https://jobs.example/theirs"]
}
```

## Where the code lives

| Piece | Location |
|-------|----------|
| Enum, columns, index | `apps/web-api/prisma/schema.prisma` (`JobOpeningManagedBy`, `JobOpening.managedBy`, `JobOpening.publishedAt`) |
| Ownership check, stamp, widened update | `apps/web-api/src/job-openings/job-openings.service.ts` |
| Ingest DTO and response | `apps/web-api/src/job-openings/dto/ingest-job-openings.dto.ts` |
| Per-team read shape | `libs/contracts/src/schema/team-job-enrichment.ts`, `apps/web-api/src/job-openings/job-openings-enrichment.service.ts` |
| Alert matching | `apps/web-api/src/job-openings/job-openings-query.service.ts` (`findNewMatchesSince`) |
| Crawler side | `pln-data-enrichment`: `directory-client/dto/team-enrichment.dto.ts`, `job-openings-enrichment/reconcile-jobs.util.ts`, `job-openings-enrichment/team-to-ingest.mapper.ts` |
