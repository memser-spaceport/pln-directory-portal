# Member Profile Enrichment

## Overview

Automated, periodic gap-filling for Directory member profiles: **primary team/role**,
**bio**, **email**, and **skills**. Sourced from the member's own LinkedIn (or, when no
LinkedIn handle is on file, X/Twitter) profile via ScrapingDog, plus a free CRM lookup for
email. A daily marking cron finds newly-eligible members; a 5-minute cron processes the
pending queue.

**Fill-gaps-only, no exceptions.** Every field is only written when it is currently empty.
A pre-existing value — set by the member, an admin, or a prior import — is never
overwritten, and is stamped `ChangedByUser` the first time enrichment notices it, purely
for audit visibility.

Modeled on [`TEAM_ENRICHMENT.md`](./TEAM_ENRICHMENT.md)'s marking-cron → enrichment-cron
shape and eligibility-filter pattern, but **deliberately simpler**: there is no
candidate-column + AI-judge second pass. The values here are the member's own
self-reported identity (their own LinkedIn profile), not a public company identity an AI
might misattribute — the same reasoning that already lets `member-bio.util.ts` and
`husky-generation.service.ts` write bios/skills directly to `Member` with no judge stage
(see [`MEMBER_BIO_GENERATION.md`](./MEMBER_BIO_GENERATION.md)). So `MemberEnrichment` is a
lean, state-only sidecar — accepted values go straight to `Member`, `TeamMemberRole`, and
`Skill`.

## Storage model

`MemberEnrichment` — 1:1 with `Member`. No candidate scalar/array columns:

```prisma
model MemberEnrichment {
  id        Int      @id @default(autoincrement())
  uid       String   @unique @default(cuid())
  memberUid String   @unique
  member    Member   @relation(fields: [memberUid], references: [uid], onDelete: Cascade)

  /// shouldEnrich, status, fieldsMeta, scrapingDog snapshot, usage, errorMessage,
  /// enrichedAt, enrichedBy.
  dataEnrichment Json?

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

### Fields enriched and their canonical home

| Field | Canonical home | Fill source | "Gap" means |
| --- | --- | --- | --- |
| primary team/role | `TeamMemberRole.mainTeam` (+ `role`) | LinkedIn `experience[0]` (most-recent-first) matched to an existing `Team` | member has no `TeamMemberRole` row with `mainTeam: true` |
| bio | `Member.bio` | `generateMemberBioText` (reused, unchanged) | `Member.bio` is empty |
| email | `Member.email` | `AffinityPerson.primaryEmail` via `MasterProfile` | `Member.email` is empty |
| skills | `Member.skills` (m2m) | `HuskyGenerationService.generateMemberSkills` (reused, unchanged) | `Member.skills` is empty |

### `dataEnrichment` shape

```ts
interface MemberDataEnrichment {
  shouldEnrich: boolean;
  status: 'PendingEnrichment' | 'InProgress' | 'Enriched' | 'FailedToEnrich';
  isAIGenerated?: boolean;
  enrichedAt?: string;      // ISO
  enrichedBy?: string;      // 'system-cron' | admin email
  errorMessage?: string;
  fieldsMeta: Partial<Record<'primaryTeamRole' | 'bio' | 'email' | 'skills', {
    status: 'Enriched' | 'ChangedByUser' | 'CannotEnrich';
    source?: 'linkedin-experience' | 'linkedin-profile' | 'x-profile' | 'affinity-crm' | 'ai';
    lastModifiedAt?: string;  // ISO
    note?: string;            // short reason, populated on CannotEnrich
  }>>;
  scrapingDog?: { used: boolean; fetchedAt?: string; source?: 'linkedin' | 'x' };
}
```

`Enriched` here means the value has already been written to its canonical home — there is
no separate "awaiting promotion" state. `CannotEnrich` means the field was a gap but no
usable source data existed this run (e.g. no LinkedIn/X handle at all, or no matching
Directory team). Once a member has a `MemberEnrichment` row, the marking cron will not
pick them up again automatically — a stuck `CannotEnrich` field only gets retried via the
admin force-trigger endpoint.

## Eligibility & ordering

`member-enrichment-eligibility-filter.ts` composes with OR, member-scoped (reaching
through `TeamMemberRole` since `priority`/`isFund` live on `Team`, not `Member`):

- `isInvestor: true` — always included (unconditional category).
- `MEMBER_ENRICHMENT_FILTER_IS_FUND` (default `'true'`) → member has a `TeamMemberRole` on a
  `Team` with `isFund: true`.
- `MEMBER_ENRICHMENT_FILTER_PRIORITY` (default `'1,2,3'`) → member has a `TeamMemberRole` on
  a `Team` whose `priority` is in the list.

Unlike the team-enrichment version, both defaults are pre-populated (not opt-in), since
the request is investors + fund + P1-P3 members out of the box.

**Founders/team-leads first.** The marking job runs two passes against the same
eligibility + "has a gap" + "no `MemberEnrichment` row yet" filter — pass 1 additionally
requires a `TeamMemberRole` with `teamLead: true` or a `role` containing "founder", pass 2
covers everyone else. Rows are marked (created) in that order, and the enrichment cron
consumes pending rows oldest-`createdAt`-first, so founders/leads are processed first.

## Pipeline

Per member, **one** ScrapingDog call total:

1. **Fetch** — `MemberScrapingDogService.fetchPersonProfile(linkedinHandler)` if the member
   has a LinkedIn handle, else `fetchXProfile(...)` if they have an X/Twitter handle, else
   skip (no source data at all).
2. **email** (resolved first — skills needs it) — if empty, look up
   `AffinityPerson.primaryEmail` via `MasterProfile` (same join `resolveMemberPronouns`'s
   CRM branch already uses for gender, just a different field). Skipped if that email is
   already claimed by another `Member` (`CannotEnrich`, not an overwrite).
3. **primaryTeamRole** — if the member has no `mainTeam` role, take `experience[0]` from
   the LinkedIn profile and match its company name to an existing `Team`
   (`member-enrichment-team-match.util.ts`: exact case-insensitive name equality, falling
   back to `namesShareSubstantiveToken` — the same doctrine team-enrichment trusts for
   company-identity matching). **No match → `CannotEnrich`. A team is never created.**
   Match found: if the member already has a `TeamMemberRole` row for that team, its
   `mainTeam` is flipped to `true` (role filled only if currently empty); otherwise a new
   `TeamMemberRole` row is created.
4. **bio** — if empty, `resolveMemberPronouns` + `generateMemberBioText` (unchanged),
   passing the ScrapingDog payload from step 1 as `scrapedContext` — no second scrape.
5. **skills** — if empty and the member now has an email (original or step-2-filled),
   `HuskyGenerationService.generateMemberSkills` (unchanged); the returned skills are
   `connect`ed to `Member.skills`.

> Note on the LinkedIn company slug: ScrapingDog's raw `experience[].company_url` carries
> a LinkedIn company slug, but `MemberScrapingDogService`'s existing normalization
> (shared with the bio-refresh flow, and pinned by its own spec) doesn't pick it up. Rather
> than widen that shared, already-tested normalizer, primary-team matching uses the
> company **name** instead — see step 3 above.

## Cron & environment variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `IS_MEMBER_ENRICHMENT_ENABLED` | `false` | gates both crons |
| `MEMBER_ENRICHMENT_CRON` | `*/5 * * * *` | processes the pending queue |
| `MEMBER_ENRICHMENT_MARKING_CRON` | `0 1 * * *` | marks newly-eligible members |
| `MEMBER_ENRICHMENT_BATCH_SIZE` | `20` | cap on members processed per enrichment tick — ScrapingDog person-profile calls are the expensive 50-100 credit tier, so this bounds worst-case spend per tick |
| `MEMBER_ENRICHMENT_STUCK_TTL_MINUTES` | `180` | stale-`InProgress` self-heal (pod killed mid-run), same mechanism as `TEAM_ENRICHMENT_STUCK_TTL_MINUTES` |
| `MEMBER_ENRICHMENT_FILTER_PRIORITY` | `1,2,3` | eligibility — see above |
| `MEMBER_ENRICHMENT_FILTER_IS_FUND` | `true` | eligibility — see above |
| `SCRAPINGDOG_API_KEY` | — | shared with team enrichment / bio generation. When unset, ScrapingDog is skipped and only the email/skills-from-CRM paths can still fill gaps |

## Admin endpoints

```
GET  /v1/admin/members/profile-enrichment/status
POST /v1/admin/members/:uid/trigger-profile-enrichment
POST /v1/admin/members/trigger-profile-enrichment
POST /v1/admin/members/:uid/trigger-force-profile-enrichment
```

All guarded by `AdminAuthGuard`. Automation via cron is the primary interface (per the
original request); these are manual-override / testing hooks, same secondary role the
team-enrichment admin routes play. None require `IS_MEMBER_ENRICHMENT_ENABLED`.

```bash
curl -H "Authorization: Bearer $ADMIN_TOKEN" \
  "$WEB_API_BASE_URL/v1/admin/members/profile-enrichment/status"

curl -X POST -H "Authorization: Bearer $ADMIN_TOKEN" \
  "$WEB_API_BASE_URL/v1/admin/members/uid-directoryadmin/trigger-profile-enrichment"

curl -X POST -H "Authorization: Bearer $ADMIN_TOKEN" \
  "$WEB_API_BASE_URL/v1/admin/members/trigger-profile-enrichment"

curl -X POST -H "Authorization: Bearer $ADMIN_TOKEN" \
  "$WEB_API_BASE_URL/v1/admin/members/uid-directoryadmin/trigger-force-profile-enrichment"
```

## Module structure

```
apps/web-api/src/member-enrichment/
  member-enrichment.types.ts                    # EnrichmentStatus, FieldEnrichmentStatus, EnrichmentSource, MemberDataEnrichment
  member-enrichment-eligibility-filter.ts        # investor / fund-team / priority-team OR filter
  member-enrichment-team-match.util.ts           # LinkedIn-experience company name → existing Team
  member-enrichment.service.ts                   # marking, pending-queue, the enrichment pipeline itself
  member-enrichment.job.ts                       # marking + enrichment @Cron jobs
  member-enrichment.module.ts                    # imports HuskyModule for MemberScrapingDogService / HuskyGenerationService
```

Reused as-is from the Husky bio/skills pipeline (see `MEMBER_BIO_GENERATION.md`):
`MemberScrapingDogService`, `generateMemberBioText`, `resolveMemberPronouns`,
`HuskyGenerationService.generateMemberSkills`, and the `formatPersonContext` /
`formatTwitterContext` context formatters from the bio-refresh runner.

## Testing

Unit specs cover the pure/mockable logic (eligibility filter, team-name matching, the
per-field pipeline orchestration) with no real network calls:

```bash
yarn nx run web-api:test --testFile=apps/web-api/src/member-enrichment/member-enrichment-eligibility-filter.spec.ts
yarn nx run web-api:test --testFile=apps/web-api/src/member-enrichment/member-enrichment-team-match.util.spec.ts
yarn nx run web-api:test --testFile=apps/web-api/src/member-enrichment/member-enrichment.service.spec.ts
```

ScrapingDog is a paid, real API — there is no CI-run end-to-end test against it, same
precedent as team-enrichment's `bench-judge.ts`. Verify manually via the admin trigger
endpoints against a real member, and check ScrapingDog spend stays within expectations
(one call per member per run).
