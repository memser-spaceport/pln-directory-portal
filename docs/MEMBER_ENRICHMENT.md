# Member Profile Enrichment

## Overview

Automated, periodic gap-filling for Directory member profiles: **social handles**
(LinkedIn, Twitter/X, GitHub, Telegram, Bluesky), **primary team/role**, **work history**,
**bio**, **email**, and **skills**. Sourced from the member's own LinkedIn (or, when no
LinkedIn handle is on file, X/Twitter) profile via ScrapingDog — or, when enabled, Coresignal's
Clean Employee API instead, by default for high-value members (accessLevel `L5`/`L6`, team lead,
founder, fund team, or a high-priority team) and ScrapingDog by default for everyone else, always
overridable per-member/per-list via an admin's explicit `source` param — falling back to
ScrapingDog when Coresignal has nothing usable, and vice versa when Coresignal is disabled or
unconfigured (see [Coresignal source](#coresignal-source) below) — a free CRM lookup for email,
and — only for social handles neither provider can source — a narrow, identity-gated AI web
search. A daily marking cron finds newly-eligible members; an hourly cron processes the pending
queue, at most `MEMBER_ENRICHMENT_CONCURRENCY` members at a time (see
[Bulk processing](#bulk-processing--concurrency) below).

**Fill-gaps-only, no exceptions.** Every field is only written when it is currently empty.
A pre-existing value — set by the member, an admin, or a prior import — is never
overwritten, and is stamped `ChangedByUser` the first time enrichment notices it, purely
for audit visibility.

Modeled on [`TEAM_ENRICHMENT.md`](./TEAM_ENRICHMENT.md)'s marking-cron → enrichment-cron
shape and eligibility-filter pattern, but **deliberately simpler**: there is no
candidate-column + AI-judge second pass. Most values here are the member's own
self-reported identity (their own LinkedIn profile), not a public company identity an AI
might misattribute — the same reasoning that already lets `member-bio.util.ts` and
`husky-generation.service.ts` write bios/skills directly to `Member` with no judge stage
(see [`MEMBER_BIO_GENERATION.md`](./MEMBER_BIO_GENERATION.md)). The one exception is the
social-handle AI web search (`member-enrichment-ai.service.ts`): since there's no
second-pass judge to catch a wrong guess, that call self-gates instead — it only runs when
the member has enough other identifying signal on file (`hasEnoughIdentifyingInfo`, same
gate `member-bio.util.ts` uses for bio generation), and only accepts a result at
`confidence: 'high'`. So `MemberEnrichment` is a lean, state-only sidecar — accepted values
go straight to `Member`, `TeamMemberRole`, `MemberExperience`, and `Skill`.

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
| `linkedinHandler`, `twitterHandler`, `githubHandler`, `telegramHandler`, `blueskyHandler` | `Member.<field>` | Identity-gated AI web search (`member-enrichment-ai.service.ts`), high-confidence only | field is empty. `discordHandler` is not attempted — no crawlable public profile to search |
| primary team/role | `TeamMemberRole.mainTeam` (+ `role`) | `experience[0]` (most-recent-first) from LinkedIn (ScrapingDog) or, when Coresignal is enabled and preferred for this member, Coresignal — matched to an existing `Team` | member has no `TeamMemberRole` row with `mainTeam: true` |
| work history | `MemberExperience` (one row per position) | every `experience[]` entry (LinkedIn via ScrapingDog, or Coresignal when preferred) the member doesn't already have a row for | per-position: an entry with no matching existing row by company name |
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
  fieldsMeta: Partial<Record<
    | 'primaryTeamRole' | 'workHistory' | 'bio' | 'email' | 'skills'
    | 'linkedinHandler' | 'twitterHandler' | 'githubHandler' | 'telegramHandler' | 'blueskyHandler',
  {
    status: 'Enriched' | 'ChangedByUser' | 'CannotEnrich';
    source?: 'linkedin-experience' | 'linkedin-profile' | 'x-profile' | 'affinity-crm' | 'ai' | 'coresignal';
    lastModifiedAt?: string;  // ISO
    note?: string;            // short reason, populated on CannotEnrich
  }>>;
  scrapingDog?: { used: boolean; fetchedAt?: string; source?: 'linkedin' | 'x' };
  coresignal?: { used: boolean; fetchedAt?: string; fellBackToScrapingDog?: boolean };
  preferredSource?: 'auto' | 'coresignal' | 'scrapingdog'; // see Coresignal source below
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

> **Known limitation:** the "has a gap" check (`HAS_GAP_FILTER`) only looks at `bio`, `email`,
> `skills`, `mainTeam` role, and `experiences` — it does **not** check the social-handle fields
> (`linkedinHandler`, `twitterHandler`, `githubHandler`, `telegramHandler`, `blueskyHandler`).
> A member whose bio/email/skills/team/experiences are all already filled but who is missing,
> say, `githubHandler` will never be marked for automatic enrichment at all (none of the OR
> clauses match), even though step 0 of the pipeline would otherwise try to fill it. Such a
> member only gets a social-handle backfill attempt via the admin force-trigger endpoints.

## Pipeline

Per member, **at most one** profile-fetch call (Coresignal, or ScrapingDog — see step 1 below and
[Coresignal source](#coresignal-source) for when each applies) plus, only if Coresignal was
attempted and came up empty, one additional ScrapingDog call as fallback — and **at most one** AI
social-handle search call:

0. **Social handles** (`linkedinHandler`, `twitterHandler`, `githubHandler`,
   `telegramHandler`, `blueskyHandler`) — runs **before** the ScrapingDog fetch below, on
   purpose: a handle discovered here (e.g. `linkedinHandler`) is written to the in-memory
   member object immediately, so step 1's ScrapingDog fetch — and therefore bio,
   work-history, and primaryTeamRole — can use it in this same run rather than waiting for
   the next enrichment cycle. For every currently-empty handle field, a single
   `MemberEnrichmentAiService.findMissingSocialHandles` call asks the model to find all of
   them at once (one AI call, not one per field), passing along whatever handles/team/role/
   location are already known as identity-verification context. The call is skipped
   entirely when `hasEnoughIdentifyingInfo(member)` says there isn't enough signal to
   search safely; per field, a result is only accepted at `confidence: 'high'` — anything
   else is `CannotEnrich`. `discordHandler` is never requested (no crawlable public profile
   to verify a match against).
1. **Fetch** — see [Coresignal source](#coresignal-source): when `MEMBER_ENRICHMENT_CORESIGNAL_ENABLED`
   is on and Coresignal is configured, `CoresignalService.fetchEmployeeProfile(linkedinHandler)` is
   tried first for a member with a LinkedIn handle if either (a) the member's stored
   `preferredSource` is explicitly `'coresignal'`, or (b) `preferredSource` is `'auto'`/unset and
   the member is high-value per `isHighValueMemberForCoresignal`; if it returns a profile with at
   least one experience entry, that profile is used and ScrapingDog is skipped entirely. Otherwise
   (disabled, unconfigured, no LinkedIn handle, `preferredSource: 'scrapingdog'`, not high-value
   under `'auto'`, or Coresignal had nothing usable) —
   `MemberScrapingDogService.fetchPersonProfile(linkedinHandler)` if the member has a LinkedIn
   handle (possibly one step 0 just found), else `fetchXProfile(...)` if they have an X/Twitter
   handle, else skip (no source data at all).
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
4. **workHistory** — per-position gap-fill (`member-enrichment-experience.util.ts`):
   every LinkedIn `experience[]` entry the member does **not** already have a
   `MemberExperience` row for is inserted as a new row; entries that match an existing
   row are left alone. Matching is by company name only — same conservative two-tier
   doctrine as `primaryTeamRole`'s team matching (exact case-insensitive equality,
   falling back to a shared substantive token) — so two separate stints at the same
   company collapse to "already covered" rather than risk misreading an edit as a gap.
   Existing rows are **never** updated, replaced, or deleted, only topped up — a
   manually-added or admin-edited entry is always preserved. An entry with no parseable
   `starts_at` (e.g. "Oct 2024") is skipped rather than guessed; a missing/unparseable
   `ends_at` (including "Present") maps to `isCurrent: true`. Zero new rows to add, with
   at least one existing row already on file → `ChangedByUser` (nothing needed doing).
   Zero new rows and zero existing rows (no LinkedIn/Coresignal data at all, or no
   experience section) → `CannotEnrich`. The `Enriched` note records the count actually
   inserted, not the candidate count — if an individual `MemberExperience.create` fails
   (e.g. a constraint violation), that row is skipped and logged rather than counted; if
   every candidate row fails to insert, the field is stamped `CannotEnrich` instead of a
   falsely-optimistic `Enriched`.
5. **bio** — if empty, `resolveMemberPronouns` + `generateMemberBioText` (unchanged),
   passing the step 1 profile payload (ScrapingDog or Coresignal, whichever answered) as
   `scrapedContext` — no second scrape.
6. **skills** — if empty and the member now has an email (original or step-2-filled),
   `HuskyGenerationService.generateMemberSkills` (unchanged); the returned skills are
   `connect`ed to `Member.skills`.

> Note on the LinkedIn company slug: ScrapingDog's raw `experience[].company_url` carries
> a LinkedIn company slug, but `MemberScrapingDogService`'s existing normalization
> (shared with the bio-refresh flow, and pinned by its own spec) doesn't pick it up. Rather
> than widen that shared, already-tested normalizer, primary-team matching uses the
> company **name** instead — see step 3 above.

## Coresignal source

`apps/web-api/src/coresignal/` is a standalone module (no dependency on `member-enrichment/` or
`husky/`) so a future Team Enrichment change can adopt it too. `CoresignalService.fetchEmployeeProfile`
calls Coresignal's **Clean Employee API** `/collect` endpoint directly by LinkedIn shorthand
name/URL — never `/search` — since `/collect` costs 10 credits per successful call while
`/search` is free but only returns a preview subset (no full experience), so calling `/collect`
directly (skipping search) is the lowest-cost correct usage when the caller already has the
person's LinkedIn identifier, which member-enrichment always does. Clean was chosen over
Coresignal's pricier Multi-source Employee API (20 credits) deliberately: Multi-source's extra
value is an "AI-enriched" cross-source aggregation layer, and this pipeline already runs its own
AI enrichment/judgment on top of whatever a provider returns, so that extra aggregation isn't
worth double the cost. The raw Coresignal response (Clean's `experience[]` entries use `title` +
`date_from_year`/`date_from_month` + an `is_current` flag) is normalized into the exact same shape
`MemberScrapingDogService.fetchPersonProfile` already returns (a single "Mon YYYY" `startsAt`/
`endsAt` string pair), so `member-enrichment-team-match.util.ts` and
`member-enrichment-experience.util.ts` need no provider-specific branching.

**No hard Coresignal-eligibility gate — a value-tier default, always overridable.** Every member
the enrichment pipeline processes is reachable by Coresignal; there is no attribute-based check
that blocks a member from it outright. Instead, `isHighValueMemberForCoresignal`
(`member-enrichment-coresignal-value-tier.util.ts`) decides the **default** preferred provider when
no explicit choice has been made for that member:

- **High-value → Coresignal by default**: `accessLevel` is `L5` or `L6` (investor tiers — see
  `docs/ACCESS_LEVEL_PERMISSIONS.md`), a `TeamMemberRole.teamLead`, a `role` containing "founder",
  a fund team (`Team.isFund`), or a team whose `priority` is in
  `MEMBER_ENRICHMENT_CORESIGNAL_VALUE_PRIORITY` (default `1,2,3`, independently tunable from the
  general `MEMBER_ENRICHMENT_FILTER_PRIORITY` eligibility filter — one controls who gets enrolled
  into enrichment at all, the other controls which enrolled members prefer the pricier provider).
- **Everyone else → ScrapingDog by default.**

An admin can override this default per-member or per-list via the `source` param on
`trigger-force-profile-enrichment`/`trigger-force-profile-enrichment-bulk`
(`'auto' | 'coresignal' | 'scrapingdog'`), stored as `MemberDataEnrichment.preferredSource` and
read at fetch time — `'coresignal'` always attempts Coresignal for that member regardless of value
tier (still falling back to ScrapingDog on failure), `'scrapingdog'` never attempts Coresignal for
that member regardless of value tier, and `'auto'` (the default, including for members marked by
the regular eligibility-marking cron, which never sets this field) defers to the heuristic above.
A later force-trigger call's requested source always fully replaces any prior override for that
member — there's no way for a stale preference from an old call to linger.

**Coresignal spend is controlled two ways**: which members get enrolled into enrichment at all
(`MEMBER_ENRICHMENT_FILTER_IS_FUND` / `MEMBER_ENRICHMENT_FILTER_PRIORITY` at marking time — see
[Eligibility & ordering](#eligibility--ordering) — or an admin's explicit bulk-trigger pick), and,
within that enrolled population, which ones default to or are explicitly forced onto the pricier
provider. A Clean Employee API `/collect` call still costs more than a ScrapingDog person-profile
call, so tune `MEMBER_ENRICHMENT_CORESIGNAL_VALUE_PRIORITY` (or use `source` deliberately) if spend
needs bounding further — see the "Cost overrun" risks in this change's `design.md` for more detail.

**Fallback is bidirectional.** If Coresignal returns not-found, an error (including an expired or
invalid API key), or a profile with no experience entries, the pipeline falls through to the
existing ScrapingDog fetch for that member in the same run — a member is never left unenriched
purely because Coresignal had an issue. Symmetrically, whenever Coresignal is disabled or
unconfigured, the pipeline runs on ScrapingDog alone, exactly as it did before Coresignal support
existed — neither provider's outage or misconfiguration blocks the other, since ScrapingDog never
checks Coresignal's state (or vice versa) before running. At most one Coresignal call and, only on
fallback, at most one ScrapingDog call happen per member per run — never both unconditionally.

Field-level provenance is unaffected by which provider actually answered: `fieldsMeta[field].source`
is stamped `'coresignal'` when a Coresignal-sourced profile filled that field, or the existing
ScrapingDog/CRM/AI source values otherwise — so a member whose work history came from Coresignal
but whose primary team/role came from an earlier ScrapingDog run keeps both attributions
independently. The `coresignal` snapshot (`used`, `fetchedAt`, `fellBackToScrapingDog`) records
whether Coresignal was attempted for a given member and whether it fell back.

## Bulk processing & concurrency

Bulk enrichment paths — the hourly cron and the `trigger-profile-enrichment` "all pending" admin
endpoint — run at most `MEMBER_ENRICHMENT_CONCURRENCY` enrichment pipelines concurrently (default
`5`), using the same `p-limit`-throttled-batch pattern `TEAM_ENRICHMENT_JUDGE_CONCURRENCY` already
uses for team judgment: without a cap, a batch of N pending members would fire N concurrent
outbound ScrapingDog/Coresignal/AI calls at once, risking the same connection-pool starvation PR
#3361 fixed on the team-judgment side. The hourly cron awaits the whole throttled batch before its
tick ends (so its running/idle state is honest); the "all pending" admin endpoint dispatches the
throttled batch detached and returns immediately, so the HTTP call doesn't block on however long a
large batch takes.

`POST /v1/admin/members/trigger-force-profile-enrichment-bulk` accepts an explicit list of member
uids (`{ uids: string[] }`) and marks each for force re-enrichment — the same "force" semantics as
the single-member force-trigger endpoint, applied per-uid. It only marks; it does not run the
pipeline itself. The marked members are picked up and processed (concurrency-bounded, as above) by
the existing hourly enrichment cron on its normal schedule. Use this to re-enrich a hand-picked
list (e.g. newly-important fund/team-lead members) without waiting for the daily marking cron's
eligibility filter to notice them. A supplied uid that doesn't match an existing member is
reported back rather than silently ignored; a member already `InProgress` is left untouched; a
repeated uid in the list is deduped so it's only marked (and counted) once.

> **Known limitation:** the InProgress guard (both here and on the single-member endpoints) is a
> plain read-then-write, not an atomic claim — under a multi-replica deployment, two pods racing
> the same cron tick (or a cron tick overlapping an admin trigger) could both read a member as
> not-yet-`InProgress` and both start enriching it, firing duplicate paid API calls. This mirrors a
> pre-existing pattern across this codebase's crons (no distributed lock exists for any of them
> today); the fix would be an atomic conditional `UPDATE ... WHERE status != 'InProgress'` claim,
> not yet implemented here.

## Cron & environment variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `IS_MEMBER_ENRICHMENT_ENABLED` | `false` | gates both crons |
| `MEMBER_ENRICHMENT_CRON` | `0 * * * *` | processes the pending queue |
| `MEMBER_ENRICHMENT_MARKING_CRON` | `0 1 * * *` | marks newly-eligible members |
| `MEMBER_ENRICHMENT_BATCH_SIZE` | `20` | cap on members processed per enrichment tick — ScrapingDog person-profile calls are the expensive 50-100 credit tier, so this bounds worst-case spend per tick |
| `MEMBER_ENRICHMENT_STUCK_TTL_MINUTES` | `180` | stale-`InProgress` self-heal (pod killed mid-run), same mechanism as `TEAM_ENRICHMENT_STUCK_TTL_MINUTES` |
| `MEMBER_ENRICHMENT_FILTER_PRIORITY` | `1,2,3` | eligibility — see above |
| `MEMBER_ENRICHMENT_FILTER_IS_FUND` | `true` | eligibility — see above |
| `MEMBER_ENRICHMENT_CONCURRENCY` | `5` | max concurrent enrichment pipelines for bulk processing paths — see [Bulk processing](#bulk-processing--concurrency) |
| `SCRAPINGDOG_API_KEY` | — | shared with team enrichment / bio generation. When unset, ScrapingDog is skipped and only the email/skills-from-CRM paths can still fill gaps |
| `MEMBER_ENRICHMENT_CORESIGNAL_ENABLED` | `false` | global kill switch for Coresignal usage — see [Coresignal source](#coresignal-source). Independent of `IS_MEMBER_ENRICHMENT_ENABLED` |
| `CORESIGNAL_API_KEY` | — | Coresignal API key. When unset, Coresignal is skipped entirely (same as ScrapingDog-unset behavior) |
| `CORESIGNAL_TIMEOUT_MS` | `15000` | Coresignal request timeout |
| `MEMBER_ENRICHMENT_CORESIGNAL_VALUE_PRIORITY` | `1,2,3` | value-tier default — team priorities that default a member to Coresignal (see [Coresignal source](#coresignal-source)). Empty string disables this criterion |
| `HUSKY_GENERATION_AI_PROVIDER` | `gemini` | provider for the step-0 social-handle AI search — shared with bio generation, no dedicated env var |

## Admin endpoints

```
GET  /v1/admin/members/profile-enrichment/status
POST /v1/admin/members/:uid/trigger-profile-enrichment
POST /v1/admin/members/trigger-profile-enrichment
POST /v1/admin/members/:uid/trigger-force-profile-enrichment
POST /v1/admin/members/trigger-force-profile-enrichment-bulk
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

curl -X POST -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" \
  -d '{"uids": ["uid-directoryadmin", "uid-anothermember"]}' \
  "$WEB_API_BASE_URL/v1/admin/members/trigger-force-profile-enrichment-bulk"

# Force Coresignal for an otherwise-ordinary member/list (overrides the value-tier default):
curl -X POST -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" \
  -d '{"uids": ["uid-anothermember"], "source": "coresignal"}' \
  "$WEB_API_BASE_URL/v1/admin/members/trigger-force-profile-enrichment-bulk"

# Force ScrapingDog-only even for a high-value member (e.g. to deliberately save cost):
curl -X POST -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" \
  -d '{"source": "scrapingdog"}' \
  "$WEB_API_BASE_URL/v1/admin/members/uid-directoryadmin/trigger-force-profile-enrichment"
```

## Module structure

```
apps/web-api/src/member-enrichment/
  member-enrichment.types.ts                    # EnrichmentStatus, FieldEnrichmentStatus, EnrichmentSource, MemberDataEnrichment
  member-enrichment-eligibility-filter.ts        # investor / fund-team / priority-team OR filter (general enrichment eligibility — who gets enrolled at all)
  member-enrichment-coresignal-value-tier.util.ts # isHighValueMemberForCoresignal — the 'auto' default provider-preference heuristic
  member-enrichment-team-match.util.ts           # LinkedIn/Coresignal-experience company name → existing Team
  member-enrichment-experience.util.ts           # LinkedIn/Coresignal experience[] → missing-vs-existing diff → MemberExperience create inputs
  member-enrichment-ai.service.ts                # identity-gated AI web search for missing social handles (step 0)
  member-enrichment.service.ts                   # marking, pending-queue, the enrichment pipeline itself, bulk/throttled-batch helpers
  member-enrichment.job.ts                       # marking + enrichment @Cron jobs
  member-enrichment.module.ts                    # imports HuskyModule (MemberScrapingDogService / HuskyGenerationService) and CoresignalModule

apps/web-api/src/coresignal/
  coresignal.types.ts                            # CoresignalEmployeeProfile (= ScrapingDogPersonProfile shape), CoresignalFetchResult
  coresignal.service.ts                          # Clean Employee API /collect client + normalization
  coresignal.module.ts                           # standalone — no member-enrichment-specific coupling, reusable by a future Team Enrichment change
```

Reused as-is from the Husky bio/skills pipeline (see `MEMBER_BIO_GENERATION.md`):
`MemberScrapingDogService`, `generateMemberBioText`, `resolveMemberPronouns`,
`HuskyGenerationService.generateMemberSkills`, and the `formatPersonContext` /
`formatTwitterContext` context formatters from the bio-refresh runner.

## Testing

Unit specs cover the pure/mockable logic (eligibility filters, team-name matching, the
per-field pipeline orchestration, Coresignal client normalization, bulk/throttled-batch
behavior) with no real network calls:

```bash
yarn nx run web-api:test --testFile=apps/web-api/src/member-enrichment/member-enrichment-eligibility-filter.spec.ts
yarn nx run web-api:test --testFile=apps/web-api/src/member-enrichment/member-enrichment-coresignal-value-tier.util.spec.ts
yarn nx run web-api:test --testFile=apps/web-api/src/member-enrichment/member-enrichment-team-match.util.spec.ts
yarn nx run web-api:test --testFile=apps/web-api/src/member-enrichment/member-enrichment-experience.util.spec.ts
yarn nx run web-api:test --testFile=apps/web-api/src/member-enrichment/member-enrichment.service.spec.ts
yarn nx run web-api:test --testFile=apps/web-api/src/coresignal/coresignal.service.spec.ts
```

ScrapingDog and Coresignal are both paid, real APIs — there is no CI-run end-to-end test against
either, same precedent as team-enrichment's `bench-judge.ts`. Verify manually via the admin
trigger endpoints against a real member, and check spend stays within expectations (at most one
ScrapingDog call and, when Coresignal is enabled, at most one Coresignal call per member per run).

`apps/web-api/src/admin/member.controller.ts` has no unit spec: it transitively imports
ESM-only packages (`axios`, `ai`/`@ai-sdk/*`) this repo's Jest config can't parse, matching the
existing zero-controller-spec precedent across `apps/web-api/src/admin/*`. Its thin
validation-then-delegate endpoints are covered via the service-level specs above plus manual
verification.
