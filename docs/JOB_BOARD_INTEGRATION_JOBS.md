# Job Board — integration job endpoints

**Linear:** [LAB-2577 — Publishable job contract and integration job endpoints](https://linear.app/plrs-labos/issue/LAB-2577/job-board-publishable-job-contract-and-integration-job-endpoints), part of [LAB-2573 — PL ATS to job board](https://linear.app/plrs-labos/issue/LAB-2573/job-board-define-pl-ats-feature-scope).

**Scope of this document:** how an integrated system (for example a team's ATS) publishes, edits, pauses, closes, claims and lists job openings on the LabOS board through a team-scoped integration key. Companions: [INTEGRATION_KEYS.md](./INTEGRATION_KEYS.md) for the key and guard, [JOB_BOARD_OWNERSHIP.md](./JOB_BOARD_OWNERSHIP.md) for `managedBy` and `publishedAt`.

---

## How the Directory and an ATS talk

```mermaid
flowchart LR
  Member([Member])
  Crawler([Enrichment crawler])

  subgraph Directory[Directory / LabOS job board]
    Board[(Job openings)]
    Candidates[(Applications and interests)]
  end

  ATS[Team's ATS]

  Member -- browse, apply, "I'm interested" --> Directory
  Crawler -- crawled roles, only rows it owns --> Board

  ATS -- "publish / edit / pause / close a role<br/>claim an existing row<br/>(team-scoped key)" --> Board
  Board -- "the team's roles" --> ATS
  Candidates -- "applicants and interested members" --> ATS
```

Three rules hold the picture together:

- **The board is the single record of a role.** Alerts, referrals, applications and interests all hang off one job opening, whoever authored it.
- **Each row has one owner.** The crawler writes only crawler rows; an ATS writes only rows its key created or claimed. Neither can touch the other's.
- **The ATS is the author, the board is the apply path.** Members never apply inside the ATS; applicants and interests flow from the Directory to the ATS.

## The contract

`libs/contracts/src/schema/publishable-job.ts` is the single shape an integration submits. It imports only zod so an integration can vendor the file verbatim (with a header naming this path).

| Field | Required | Value |
|-------|----------|-------|
| `title` | yes | 1..200 |
| `descriptionHtml` | yes | non-empty; sanitised on write with the crawler's sanitiser; rejected (422) if empty afterwards |
| `state` | yes | `published`, `paused`, `closed` |
| `department` | no | ≤100, the sub-organisation label (for example "PL Infra") |
| `roleCategory`, `seniority` | no | ≤100 each; free strings, not validated against the board's facet vocabularies |
| `workMode` | no | `remote`, `hybrid`, `in-office` |
| `locations` | no | up to 20 non-empty strings |
| `summary` | no | ≤2000 |
| `pay` | no | `{ min, max, currency, period }`: non-negative integers in whole units, `min ≤ max`, ISO 4217 code, period `year`, `month` or `hour` |
| `equityNote` | no | ≤500 |
| `postedAt` | no | ISO datetime |

The caller's own id for the role (`externalId`) travels in the route path, 1..200 characters.

## Routes

All under `/v1/integrations/jobs`, authenticated by `IntegrationKeyGuard` with the `jobs:write` scope, exempt from the member rate limiter, not cached. Every route acts only on the key's team.

Response shape for writes:

```json
{ "uid": "ckx…", "externalId": "role-42", "dedupKey": "integration:<keyUid>:role-42", "status": "CONFIRMED", "publishedAt": "2026-09-17T09:00:00.000Z", "boardUrl": "https://os.pl.xyz/jobs/openings/ckx…" }
```

### Upsert

```
PUT /v1/integrations/jobs/:externalId
<publishable job body>
```

- No row for `(key, externalId)`: a row is created with `managedBy = INTEGRATION`, the key, `teamUid` = the key's team, `companyName` = the team's name, `signalType = "integration"`, `sourceType = "ATS Integration"`, `sourceLink = null` (in-app apply only), `canonicalKey = dedupKey = integration:<keyUid>:<externalId>`, `detectionDate = now`, `postedDate = postedAt ?? now`.
- A row exists (created here or claimed): it is updated in place. `dedupKey` is never rewritten.
- **The body is the whole public record.** An optional field absent from the body is written as null. This differs from the crawler ingest, where an absent field leaves the stored value alone.
- `state` on the body applies the state mapping below.

### State

```
PATCH /v1/integrations/jobs/:externalId/state
{ "state": "paused" }
```

| `state` | `status` | `closedAt` | `publishedAt` |
|---------|----------|------------|---------------|
| `published` | `CONFIRMED` | cleared | set to now if the row was hidden; otherwise unchanged |
| `paused` | `STALE` | unchanged | unchanged |
| `closed` | `CLOSED_ROLE_FILLED` | set once (kept if already set) | unchanged |

404 when the key owns no row with that external id.

### Claim

```
POST /v1/integrations/jobs/claim
{ "uid": "<Directory uid>", "externalId": "role-7" }
```

Adopts an existing row of the key's team whose `managedBy` is null, `MANUAL` or `ENRICHMENT`. Sets `managedBy = INTEGRATION`, the key, the external id, and clears `sourceLink`. Leaves `dedupKey`, `canonicalKey`, `status`, `publishedAt`, `closedAt` and every descriptive field unchanged; the next `PUT` for that external id updates the row.

| Situation | Result |
|-----------|--------|
| Row's team is not the key's team, or has no team | 403 |
| Unknown uid | 404 |
| Already claimed by this key | 200, no change |
| Owned by another integration key | 409 |
| External id already used by another row of this key | 409 |

### List

```
GET /v1/integrations/jobs
```

Every job opening of the key's team, in any status. Identity and state: `uid`, `externalId` (null unless the key owns the row), `ownedByCaller`, `managedBy`, `status`, `dedupKey`, `publishedAt`, `closedAt`, `boardUrl`. Public fields, so an ATS can import a board row as a draft role without a second read: `title`, `department`, `roleCategory`, `seniority`, `workMode`, `locations`, `summary`, `descriptionHtml`, `postedAt`, `applyUrl` (the external link a crawled row still carries; null once claimed), `pay`, `equityNote`.

## Publication and alerts

Each write emits the same `job-ingest.completed` event the crawler ingest does, with `runId = integration:<keyUid>:<epochMs>`, `source = "integration"` and the created/updated count, so job alert dispatch runs unchanged. `publishedAt` follows the shared rule in `job-opening-visibility.ts`: stamped when a row is created visible and on each hidden → visible transition. Consequences:

- A publish sends one digest to each matching saved alert.
- An edit while published sends none.
- Pause then publish sends one again.
- A claim of an already visible row does not change `publishedAt` and sends none.

## Public board response

`JobRoleSchema` (the `/v1/job-openings` list and detail) carries `department`, `pay` and `equityNote`. `pay` is the four columns as one object, or null unless all four are set with a known period. Crawler rows have all three null.

## Where the code lives

| Piece | Location |
|-------|----------|
| Contract | `libs/contracts/src/schema/publishable-job.ts` |
| Columns | `apps/web-api/prisma/schema.prisma` (`JobOpening.integrationExternalId`, `payMin`, `payMax`, `payCurrency`, `payPeriod`, `equityNote`, unique `(integrationKeyUid, integrationExternalId)`) |
| Service (upsert, state, claim, list, `applyState`) | `apps/web-api/src/job-openings/job-openings-integration.service.ts` |
| Controller | `apps/web-api/src/job-openings/job-openings-integration.controller.ts` |
| Shared visibility rule | `apps/web-api/src/job-openings/job-opening-visibility.ts` |
| Public pay mapping | `apps/web-api/src/job-openings/job-openings-public-role.ts` |
