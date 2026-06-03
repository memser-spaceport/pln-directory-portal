# Team Data Enrichment

## Overview

Automated AI enrichment for fund teams.
When an investor is approved in the Demo Day back-office and their new fund team is promoted from L0 to L1,
the system marks the team for enrichment. A daily cron job processes pending teams using LLM + web search.

## Storage model

AI enrichment is split across two tables:

- **`Team`** — the canonical "what users see" record. Only judge-confirmed high-confidence values reach this table. User edits also live here.
- **`TeamEnrichment`** (1:1 with Team) — AI candidate values, full enrichment state, judgment metadata, ScrapingDog provenance, and AI-cost telemetry. Created lazily by `markTeamForEnrichment`.

The judge is the only writer that can promote a value from `TeamEnrichment` to `Team` (see [AI Judge](#ai-judge-second-pass-verification)).

### `TeamEnrichment` columns

```prisma
model TeamEnrichment {
  uid              String        @unique @default(cuid())
  teamUid          String        @unique  // 1:1 with Team
  team             Team

  // AI candidate scalars (mirror Team's enrichable columns)
  website          String?
  blog             String?
  contactMethod    String?
  twitterHandler   String?
  linkedinHandler  String?
  telegramHandler  String?
  shortDescription String?
  longDescription  String?
  moreDetails      String?

  // AI candidate logo. The Image row is owned here until the judge / admin promotes
  // to Team.logoUid.
  logo             Image?
  logoUid          String?

  // AI candidate relational fields. Stored as plain TEXT[] (matches investmentFocus's
  // shape and avoids an extra join table for ~1K teams). The judge re-resolves
  // industryTags titles → IndustryTag rows at promotion-time.
  industryTags     String[]      @default([])
  investmentFocus  String[]      @default([])

  // Enrichment metadata (shouldEnrich, status, fieldsMeta, scrapingDog, judgment, usage).
  dataEnrichment   Json?
}
```

> **Indexes:** only the unique `uid` and unique `teamUid`. No GIN indexes on the `dataEnrichment` JSONB paths — the portal carries ~1K teams, so JSONB scans are sub-millisecond and a GIN index would cost more on writes than it saves on reads.

### `TeamEnrichment.dataEnrichment` (JSONB)

```typescript
interface TeamDataEnrichment {
  shouldEnrich: boolean; // true = pending pickup by cron
  status: EnrichmentStatus; // PendingEnrichment | InProgress | Enriched | FailedToEnrich | Reviewed | Approved
  isAIGenerated: boolean; // true if any fields were filled by AI
  enrichedAt?: string; // ISO timestamp
  enrichedBy?: string; // 'system-cron' or user email
  reviewedAt?: string; // ISO timestamp
  reviewedBy?: string; // reviewer email
  errorMessage?: string; // error details if FailedToEnrich
  fieldsMeta: Partial<
    Record<
      FieldMetaKey,
      {
        status: FieldEnrichmentStatus;
        confidence?: 'high' | 'medium' | 'low';
        source?: 'ai' | 'open-graph' | 'scrapingdog';
        judgment?: FieldJudgment;
        lastModifiedAt?: string;       // ISO timestamp of the most recent VALUE write
      }
    >
  >;
}
```

### Per-field last-modified tracking

Each `fieldsMeta[<field>]` carries a `lastModifiedAt` ISO timestamp updated whenever the field's **value** is touched. Who wrote the value is derivable from `status` — there is no separate "modified by" field:

| `status`        | Implied modifier                                                |
| --------------- | --------------------------------------------------------------- |
| `Enriched`      | AI wrote the value (`source` carries the sub-channel)           |
| `ChangedByUser` | user wrote the value                                            |
| `CannotEnrich`  | AI declared the field unsalvageable                             |

`lastModifiedAt` is stamped from these paths:

- Enrichment pipeline `doEnrichTeam`: every Enriched / CannotEnrich write (scalars, industryTags, investmentFocus, logo).
- ScrapingDog fallback (`maybeEnrichViaScrapingDog`): every field it fills, plus the bad-LinkedIn-handle nulling path.
- Logo refetch (`doRefetchLogo`).
- `handleUserFieldChange`: when a user edit flips an Enriched / CannotEnrich field to ChangedByUser. Called from participants-request team updates, `PATCH /v1/teams/:uid/profile-update`, and `PATCH /demo-days/:slug/teams/:teamUid/fundraising-profile/team`.

**The judge never touches `lastModifiedAt`** — even on its `nullBadLinkedinHandle` path. The judge owns `judgment` and the promotion-to-Team step; `lastModifiedAt` belongs to the enrichment + user-edit paths. When the judge invalidates a bad LinkedIn handle, it flips the status to `CannotEnrich` but leaves the prior `lastModifiedAt` in place; the next enrichment run will refresh it when retrying the field.

The **pre-existing user-data discovery** branches in `doEnrichTeam` (where the enrichment loop notices a non-empty Team column with no prior `Enriched` meta and flips to `ChangedByUser`) preserve any prior timestamp rather than fabricating a "now" stamp — the user's actual edit happened earlier and we honestly don't know when. Use the absence of `lastModifiedAt` as a "pre-tracking / very old" signal.

Use case: query `fieldsMeta[<field>].lastModifiedAt < (now - threshold)` to surface stale enrichment for re-run. Combine with `status` to distinguish stale-AI from stale-user data (e.g. `status = 'Enriched' AND lastModifiedAt < 60d ago` → AI hasn't refreshed in 60 days).

> **Note:** The legacy `fields` property (a simple `field → status` map) may still exist in older records but is superseded by `fieldsMeta`, which includes the same `status` along with `confidence` and `source`. New code should use `fieldsMeta` exclusively.

### Enums

- **EnrichmentStatus**: `PendingEnrichment`, `InProgress`, `Enriched`, `FailedToEnrich`, `Reviewed`, `Approved`
- **FieldEnrichmentStatus**: `Enriched`, `ChangedByUser`, `CannotEnrich`

### Enrichable Fields

**Scalar fields** (candidates land on `TeamEnrichment.<field>`; the judge promotes high-confidence values to `Team.<field>`):
`website`, `blog`, `contactMethod`, `twitterHandler`, `linkedinHandler`, `telegramHandler`, `shortDescription`, `longDescription`, `moreDetails`

**Relational fields:**

- `industryTags` — matched against existing `IndustryTag` records (case-insensitive) at enrichment time; stored as `TEXT[]` titles on `TeamEnrichment.industryTags`. The judge re-resolves titles to `IndustryTag` rows at promotion-time and sets the `Team.industryTags` M2M. Only enriched if `Team` has none.
- `investmentFocus` — `TEXT[]` on `TeamEnrichment.investmentFocus`. The judge writes high-confidence values to `InvestorProfile.investmentFocus`. Only enriched if currently empty.

**Logo** — extracted from website metadata (`og:image`, `twitter:image`, favicon) via `open-graph-scraper`; the Image row is owned by `TeamEnrichment.logoUid`. Only fetched if the team has no logo. If website extraction fails and a LinkedIn handle exists, the ScrapingDog fallback supplies a high-confidence logo from LinkedIn's `profile_photo`. **The judge does NOT auto-promote logos** (logo isn't judged — binary presence, not a semantic value); the logo stays on `TeamEnrichment` until the logo-verification pipeline or an admin review handles promotion.

> **Note:** `website` is enrichable — if a team has no website, the AI will attempt to discover it via web search.

### Field Statuses

Each enrichable field is tracked in `TeamEnrichment.dataEnrichment.fieldsMeta[<field>].status`:

- `Enriched` — field was empty on `Team` and successfully filled by AI; the candidate value lives on `TeamEnrichment.<field>` until the judge promotes it.
- `CannotEnrich` — field was empty but AI could not find a value
- `ChangedByUser` — field is user-controlled: either (a) it was enriched by AI and later modified by a user on `Team`, (b) it was already populated on `Team` before enrichment ever ran, or (c) the user filled in a previously `CannotEnrich` field. In all three cases, future enrichment runs (including force mode) will not overwrite the field.

### Field Confidence & Source

`TeamEnrichment.dataEnrichment.fieldsMeta[<field>]` also records per-field `confidence` and `source`:

| Source                                                | Confidence                                                             |
| ----------------------------------------------------- | ---------------------------------------------------------------------- |
| `ai` (OpenAI / Gemini / Anthropic web search)         | `high` / `medium` / `low` — taken from the model's `confidence` object |
| `open-graph` (website favicon / OG scraping)          | `medium`                                                               |
| `scrapingdog` (LinkedIn first-party)                  | `high`                                                                 |
| `team-lead` (lead Member backfill, identity-matched)  | `high`                                                                 |

When a user later edits an enriched field on `Team`, the corresponding `TeamEnrichment.dataEnrichment.fieldsMeta[field].status` flips to `ChangedByUser` but `confidence` and `source` are preserved as provenance.

## Trigger Flow

Marking a team always upserts the `TeamEnrichment` row carrying `dataEnrichment.shouldEnrich = true` + `status: PendingEnrichment`. No state is written to `Team` at this stage.

### Path A — Demo Day Approval (L0→L1 promotion)

1. Admin approves investor via PATCH `/v1/demo-days/:uid/participants/:uid` with `status: 'ENABLED'`
2. System identifies fund teams at L0 where participant is team lead
3. After promoting teams to L1, upserts `TeamEnrichment` with `dataEnrichment = { shouldEnrich: true, status: 'PendingEnrichment', ... }`

### Path B — Team creation by L5-L6 members via participants-request

1. L5/L6 member creates a team via POST `/v1/participants-request` with `participantType: 'TEAM'`
2. Team is created with `accessLevel: 'L1'` (automatic for L5-L6 requesters)
3. After creation, system upserts `TeamEnrichment` with `dataEnrichment = { shouldEnrich: true, status: 'PendingEnrichment', ... }`

### Path C — Automatic marking of eligible existing teams

1. A cron job (`TEAM_ENRICHMENT_MARKING_CRON`) periodically scans for **eligible** teams that have never been enriched (no `TeamEnrichment` row exists). Eligibility is governed by `TEAM_ENRICHMENT_FILTER_PRIORITY` and `TEAM_ENRICHMENT_FILTER_IS_FUND` (see Environment Variables) — active filters compose with OR. For example `PRIORITY=1,2,3` + `IS_FUND=true` selects fund teams OR priority 1/2/3 teams. With both unset/empty, eligibility falls back to `isFund=true`.
2. Teams must also have at least one empty enrichable scalar field on `Team` (website, blog, contactMethod, twitterHandler, linkedinHandler, telegramHandler, shortDescription, longDescription, moreDetails)
3. Matching teams get a `TeamEnrichment` row with `dataEnrichment = { shouldEnrich: true, status: 'PendingEnrichment', ... }`
4. The enrichment cron picks them up on its next run

> **Marking-job query shape:** the eligibility filter is a single read against `Team` with `where: { teamEnrichment: { is: null }, ... }` — a unique-index lookup against `TeamEnrichment.teamUid`. No JSONB filter is involved at this stage.

## Enrichment Behavior

All enrichment writes target `TeamEnrichment` (candidate values + `dataEnrichment` metadata). The `Team` row is read for current state but is never mutated by the enrichment pipeline — promotion is the judge's job.

- Teams without a website are enriched using team name and other available identifiers; the AI will attempt to discover the website
- **Standard mode** (cron, `trigger-enrichment`): only fills slots that are null/empty on `Team` — never overwrites existing data. On subsequent runs, only fields with status `CannotEnrich` are retried. Fields already marked `Enriched` or `ChangedByUser` are skipped. Previous field statuses are preserved and merged with new results.
- **Force mode** (`trigger-force-enrichment?mode=all`): re-queries every field whose value is **unsettled**. Two states count as settled and are skipped even in force mode:
  - `status === ChangedByUser` with a shape-valid `Team.<field>` value — user-owned, never overwrite.
  - `status === Enriched` with a shape-valid `Team.<field>` value — **previously judge-promoted** at `agrees + high` (that's the only path an AI value reaches `Team.<field>`), so the field is already verified at the judge's promotion bar. Re-querying it can only produce a worse candidate on `TeamEnrichment.<field>` that drags the team back into review for a question we already answered (bench symptom: Akave's `blog` was promoted in an earlier run as `https://akave.ai/blog`; a later `mode=all` replaced TE with an unreachable `https://blog.akave.cloud` and re-flagged the team). Logged as `alreadyPromoted=[...]`. Admins who want to refresh a stale promoted value should edit `Team.<field>` directly — that flips status to `ChangedByUser` and lets enrichment re-evaluate naturally on the next run.

  Unsettled fields (`status === Enriched` with empty/junk `Team.<field>`, `CannotEnrich`, or no `fieldsMeta` entry yet) are re-queried as before. Force mode still overwrites existing `TeamEnrichment.<field>` candidates and replaces `industryTags` / `investmentFocus` candidate arrays for those unsettled fields. Logo is also re-fetched: if the team already has a logo (on `Team.logoUid` or `TeamEnrichment.logoUid`), `mode=all` overwrites the `TeamEnrichment` candidate via the OG/website pass (the ScrapingDog fallback treats the logo as a gap so it can upgrade to a high-confidence LinkedIn logo when available). User-owned logos — those flagged `ChangedByUser`, or pre-enrichment logos that have no `fieldsMeta.logo` entry — are still protected and never overwritten. The dedicated Force Logo Refetch endpoint is still available for targeted logo-only runs that prioritize ScrapingDog over OG.
- **Concurrency guard**: if enrichment is already `InProgress` for a team, duplicate requests are rejected immediately
- **`enrichedBy`**: set to `'system-cron'` for cron jobs, `'manually'` for admin-triggered enrichment
- **Website signal backfill**: when the team has (or AI just discovered) a website, the pipeline fetches the page once and extracts self-declared `twitterHandler` / `linkedinHandler` / `telegramHandler` / `contactMethod` from multiple structured-data channels: (a) `<script type="application/ld+json">` Organization-like nodes (`sameAs`, `contactPoint.email`), (b) Twitter Card meta tags (`<meta name="twitter:site">`, `twitter:creator`), (c) HTML microdata (`itemprop="sameAs"`, `itemprop="email"`), with (d) `<a href>` and `mailto:` anchors as a final fallback. The single pre-fetched HTML is also reused by the logo path via ogs's `html` option, so one enrichment run hits the website at most once. Backfill runs **only** for fields the AI returned `null` for — never overwrites AI-supplied values, never touches user-owned data. Source is recorded as `open-graph`; confidence is `high` when the website is `ChangedByUser`, otherwise `medium`. No `Organization.name` ↔ team-name gate is applied because an existing `team.website` is already upstream-trusted (rebrand cases like "Invent Money" declared on `theinventionnetwork.com` flow through). Backfilled `linkedinHandler` is still passed through ScrapingDog for free verification.

- **Team-lead backfill**: an additional non-AI backfill source that pulls candidate contact/social values from the team's lead Members (`TeamMemberRole` rows filtered to `teamLead = true` OR `role ILIKE '%founder%'` at the DB layer). For each candidate value, the same identity-match guards used by the judge's Stage 1.5 corroboration are applied — only values whose **structure matches the team's identity** are accepted:

  | Field | Accepted from a lead when… | Example |
  | --- | --- | --- |
  | `contactMethod` (email) | email's domain equals the team's website host (or subdomain-of) | Jane's `jane@acme.com` for team Acme with website `acme.com` ✓; her `jane@gmail.com` ✗ |
  | `twitterHandler` | handle's first label starts with a substantive team-name token (`hostFirstLabelMatchesTeamName`, prefix-only, stopword-aware) | `@acmehq` for team Acme ✓; `@janedoe` ✗; `@beontop` for team Eon ✗ (mid-word, not prefix) |
  | `telegramHandler` | same prefix-only guard as twitter | `acme_chat` for team Acme ✓; `janepersonal` ✗ |
  | `linkedinHandler` | **never** backfilled from a lead | `Member.linkedinHandler` is always the lead's personal `in/<name>` profile — wrong shape for the team's `company/<slug>` field |

  Runs alongside the website-signal backfill — both fill `aiResponse` nulls **only** (never overwrites AI-supplied or user-owned values), keyed by independent sources. Lead-derived fields are recorded with `source: team-lead` and `confidence: high`, so the judge's source-trust rule auto-promotes them at Stage 1.5 without an AI call. The lead members are pulled in the same Prisma query as the team row (no extra round-trip).

  Catches the pre-seed pattern where the team-shaped contact info already lives on a founder's Member row — no AI / ScrapingDog / website fetch needed to populate `contactMethod` / `twitterHandler` / `telegramHandler`. Personal contacts (handles that don't structurally match the team) are intentionally rejected.

- **User-confirmed identity hints**: before each enrichment AI call, the pipeline collects the user-confirmed subset of `shortDescription` / `longDescription` / `moreDetails` (each included only when its `fieldsMeta[field].status === ChangedByUser`, or when the field is non-empty and has no prior `fieldsMeta` entry, i.e. pre-enrichment user data). The collected hints are emitted in a dedicated `USER-CONFIRMED IDENTITY HINTS` block of the user prompt, and the prompt's `IMPORTANT` line is rephrased to instruct the AI: when hints are present, the target entity is the one matching BOTH the team name AND the hints. This disambiguates ambiguous bare names (e.g. team named `"Neiro"` whose user-supplied description begins `"NeiroCoin is a community-driven cryptocurrency..."` — without the hint, the AI was matching against the unrelated "Studio Neiro" on LinkedIn). When no field is user-confirmed, the existing fallback line (`Existing Description: ...` / `Description: Not available`) is kept. Non-user-confirmed (`Enriched`) descriptions are intentionally not echoed back to the AI to avoid biasing it with its own prior output.

## AI Judge (Second-Pass Verification + Promotion)

After enrichment completes, a separate **AI Judge** cron independently verifies each enriched field, then **promotes high-confidence values from `TeamEnrichment` onto `Team`** in the same transaction. The judge uses a **different AI model** from the enricher (configurable via `TEAM_ENRICHMENT_JUDGE_AI_PROVIDER`) and can leverage ScrapingDog's LinkedIn profile for a deterministic first stage where applicable. Verdict metadata is written back to `TeamEnrichment.dataEnrichment.judgment` and `fieldsMeta[field].judgment`.

### Promotion rule

For each Enriched field whose Stage 1 or Stage 2 verdict is `agrees` at `high` confidence, the judge writes the candidate value from `TeamEnrichment` to its corresponding home:

| Field                                          | Promotion target                           |
| ---------------------------------------------- | ------------------------------------------ |
| scalar (website, blog, contactMethod, social handles, descriptions, moreDetails) | `Team.<field>`               |
| `industryTags`                                 | `Team.industryTags` M2M (titles → `IndustryTag` rows resolved at promotion) |
| `investmentFocus`                              | `InvestorProfile.investmentFocus` (creating the profile if missing) |
| `logo`                                         | **not promoted by the judge** — logo isn't judged. Stays on `TeamEnrichment.logoUid` until the logo-verification pipeline or an admin review handles it. |

Anything less than `agrees + high` stays on `TeamEnrichment` only — the user-facing `Team` row does not receive it. Fields whose status is `ChangedByUser` are never promoted (the user's value is already on `Team`; the candidate, if any, is informational).

### What the judge evaluates

- Only teams matching the shared eligibility filter (`TEAM_ENRICHMENT_FILTER_PRIORITY` and/or `TEAM_ENRICHMENT_FILTER_IS_FUND`, OR-composed; see [Eligibility filter](#eligibility-filter)) and `TeamEnrichment.dataEnrichment.status = Enriched`.
- Per-field, the judge runs on either:
  - any field whose `fieldsMeta[field].status === Enriched` (reads the candidate from `TeamEnrichment.<field>`), OR
  - a **user-supplied** website / contact link (`fieldsMeta[field].status === ChangedByUser`, reads from `Team.<field>`) — restricted to: `website`, `blog`, `contactMethod`, `linkedinHandler`, `twitterHandler`, `telegramHandler`. These are the high-signal identity fields a team lead can fill in directly, and we want an independent check that the value really belongs to the team.
- **Excluded**: `logo` (binary presence, not a semantic value), `CannotEnrich`, any `ChangedByUser` field outside the user-judgable subset above (descriptions, `industryTags`, `investmentFocus`).
- **Non-destructive for user data**: when judging a `ChangedByUser` field, the judge writes only the `judgment` sub-object. The field's value on `Team`, its `status`, `confidence`, and `source` are preserved verbatim, and the promotion path is bypassed. A "disagrees" verdict surfaces the field in `fieldsForReview` for admin review but never overwrites the user's input. The bad-LinkedIn-handle nulling path also continues to skip user-supplied handles.

### Two stages

> **Stage 1.5 — Deterministic Cross-Field Corroboration** runs between Stage 1 and Stage 2. See [Stage 1.5 below](#stage-15--deterministic-cross-field-corroboration).

1. **Stage 1 — ScrapingDog LinkedIn match (deterministic).** Runs when `SCRAPINGDOG_API_KEY` is set and the team has a `linkedinHandler`. The judge fetches the canonical LinkedIn profile, classifies the name match as `exact` / `partial` / `none`, then performs direct field-to-field comparisons (**`company_name` match + optional website-host corroboration for the LinkedIn handle itself**, tagline/about overlap for descriptions, set intersection for industries). Fields the comparison can resolve authoritatively (`agrees` at `high`, or `disagrees` at `low`) skip Stage 2. `mkJudgment` applies two **website-host-aware** confidence shifts:

   - **Partial-name downshift** — when `nameMatch === 'partial'` AND there is no website-host corroboration, `agrees + high` verdicts are demoted to `agrees + medium`. Without a second anchor, "Acme" matching "Acme Beauty Salon" is too risky to mark as identity-verified.
   - **Website-corroboration upshift** — when `websiteCorroborates === true` AND the comparator emitted `agrees + medium` (text-overlap on tagline / about / details / industries is intrinsically a fuzzy method, so it starts at Medium), the verdict is lifted to `agrees + high`. The text-overlap quality drives whether we say `agrees` vs `uncertain`; the **website-host anchor** drives the identity confidence. Once identity is double-anchored, an `agrees` verdict on identity-verified data is high-confidence by construction.

   **`linkedinHandler` verification — name match, not slug match.** The handle verdict is **not** produced by comparing the team's stored slug to ScrapingDog's `universal_name_id`. LinkedIn 301-redirects renamed companies to their canonical slug, so a stored `company/oldco` resolving to a profile whose `universal_name_id` is `newco-rebrand` would falsely look like a mismatch even though it points at the correct entity. Instead, Stage 1 trusts the precondition that produced this comparator run: ScrapingDog returned a profile whose `company_name` matched the team (per `classifyNameMatch`), so the handle pointed at the right company. Optionally, a website-host equality between `team.website` and `profile.website` corroborates the match and bumps confidence/score. Verdict matrix:

   | `nameMatch` | website host equal | verdict     | confidence | score | note                              |
   | ----------- | ------------------ | ----------- | ---------- | ----- | --------------------------------- |
   | `exact`     | yes                | `agrees`    | `high`     | 100   | `name match and website`          |
   | `exact`     | no / unknown       | `agrees`    | `high`     | 95    | `name match`                      |
   | `partial`   | yes                | `agrees`    | `high`¹    | 90    | `name match partial and website`  |
   | `partial`   | no / unknown       | `uncertain` | `medium`   | 55    | `name match partial only`         |
   | `none`      | —                  | —           | —          | —     | _no Stage 1 verdict — falls through to Stage 2 AI judge_ |

   ¹ The `partial → medium` downshift is **skipped when the website host corroborates** — two converging anchors (partial name + website match) are strong enough for full confidence. Bench case ARIA (`cly4ypxxz002e3l022n0nm4bx`): team `ARIA` ↔ profile `Advanced Research + Invention Agency (ARIA)` with both ends declaring `aria.org.uk`. `classifyNameMatch` returned `partial` (because "ARIA" is a token in the profile name, not byte-equal), but the website host match resolved identity beyond doubt. Without the website match, `partial-only` is correctly surfaced as `uncertain` rather than silently agreed. `nameMatch === 'none'` continues to skip the comparator entirely; the AI judge handles those.

   Same doctrine extends to the descriptions / industries / details rows: when the website corroborates, `agrees + medium` text-overlap verdicts (tagline overlap, about overlap, details match, tags overlap) are upshifted to `agrees + high`. This is the bench fix that recovered the `moreDetails` auto-promote rate after ScrapingDog Stage 1 came online (Stage 1 was previously capping these at Medium and overwriting Stage 1.5's high-confidence source-trust verdicts).

   **`website` (and other URL fields) — not judged by Stage 1.** Earlier revisions emitted a `host-match` / `host-mismatch` verdict by comparing the team's stored URL to the URL listed on the LinkedIn profile. This produced too many false negatives — companies routinely use alias domains, product subdomains, or rebrand without updating LinkedIn (e.g. team `Mercle` with website `mercle.ai` whose LinkedIn profile lists a different host) — so the comparator was condemning correct websites. The deterministic comparator is therefore intentionally silent on URL fields; the AI judge (Stage 2) verifies them via web search instead, and is explicitly instructed not to disagree on a URL solely because it differs from another URL we already have on file. Same reasoning as the `linkedinHandler` slug-equality removal.

   **Website reachability probe.** The judge runs a lightweight reachability probe on the website value being judged (single GET, follows redirects, 8s timeout, **uses the same `BROWSER_REQUEST_HEADERS` bouquet as `fetchWebsiteHtml`** so it doesn't get Cloudflare-blocked on real-but-bot-protected sites). The probe runs **unconditionally** when the team has a judgable website — it was previously nested inside the ScrapingDog success branch, which meant that any team without a `linkedinHandler` (or any ScrapingDog 403) silently skipped the probe and left the AI judge to guess at reachability.

   Three-state result, propagated to both Stage 1.5 `corroborateWebsite` and the Stage 2 AI prompt:

   | Probe response | `reachable` | Meaning |
   | --- | --- | --- |
   | 2xx | `true` | Definitively up. AI sees `Website reachability: yes`. Corroboration rule can fire on any name anchor. |
   | 404 / 410 / 500 / 502 / 504 (and other 4xx/5xx outside the bot-block set) | `false` | Definitive negative — URL is dead. AI sees `Website reachability: no` and leans toward `disagrees`. Corroboration rule is blocked even if name anchors match. |
   | 401 / 403 / 429 / 451 / 503 | `null` | **Inconclusive — bot-blocked, not dead.** Site is almost certainly alive for humans (Cloudflare / WAF rejecting our probe), but we can't confirm. AI sees `Website reachability: unknown` and is told not to infer either way. Corroboration rule CAN still fire when a deterministic name anchor matches — the name anchor IS the identity proof. |
   | Network error / timeout | `null` | Same `unknown` handling. |

   The bot-block category covers the dominant Cloudflare-403 case where a real team's site (e.g. `computelabs.ai`) returns 403 to any non-browser fetch despite being fine in an actual browser. Treating 403 as a definitive negative was forcing those into the AI review queue unnecessarily; the deterministic name anchors (host-first-label-matches-team-token, og:site_name, JSON-LD) are independently sufficient.

   When ScrapingDog Stage 1 ran, the probe result is also persisted to `TeamEnrichment.dataEnrichment.judgment.scrapingDog.websiteReachable` / `websiteFinalHost`. The probe runs only when the value passes the value-validity gate below, so we never `fetch()` a placeholder string.

2. **Stage 2 — AI judge.** For remaining fields (those Stage 1 and Stage 1.5 didn't resolve), the second AI model returns a per-field `{ confidence, score, verdict, note }` plus an `overallAssessment`. Temperature is conservative (`0.1`) so the judge prefers `uncertain` over guessing. The prompt asks for **space-separated** keyword notes (no hyphens, no prose).

   **Prompt context blocks** the user prompt now includes when applicable:

   - **ScrapingDog pre-verification** — when ScrapingDog Stage 1 ran, tells the AI whether LinkedIn identity is `exact` / `partial` / `none` match.
   - **Website reachability** — `yes` / `no` / `unknown` from the unconditional reachability probe.
   - **Cross-source signals from website extraction** — when `dataEnrichment.websiteSignals` is populated, lists `og:site_name`, `jsonld Organization.name`, declared socials, declared contact email, and the website's meta description. The AI uses these as a second independent source when judging any field.
   - **Corroboration already established by deterministic stage** — defense-in-depth listing of fields Stage 1 / Stage 1.5 already auto-promoted. In practice those fields are pulled OUT of the input list before reaching Stage 2, but the block exists in case a future change ever re-routes them.

   **Field-specific prompt rules:**

   - **URL fields (website, blog, contactMethod, social handles):** Do NOT mark `disagrees` merely because the value differs from another URL on file (e.g. LinkedIn's listed website). Companies use alias domains, product subdomains, or rebrand without updating LinkedIn. Verify each URL independently via web search; prefer `uncertain` when unverifiable.
   - **Contact email rule:** When `contactMethod` is an email like `x@DOMAIN` and the team's website host is `DOMAIN`, the email's domain corroborates the website host — verdict `agrees`, NOT `disagrees` against a different LinkedIn-listed email. (Same logic when a website-extraction declares a matching contact email.)
   - **Description fields (`shortDescription`, `longDescription`, `moreDetails`):** Paraphrasing, summarization, and reworded versions of the team's own LinkedIn / website description are expected and acceptable. The source is typically the team's own LinkedIn About text or website meta description — exact wording will not match other web-search sources. Verdict `agrees + high` as long as the **core facts** (mission, products, founding, team identity) align. Do NOT downgrade to `medium` solely because phrasing differs — paraphrasing is not a defect. (This rule was added because the AI was systematically punishing LinkedIn-paraphrased descriptions; combined with the source-trust rule that auto-promotes scrapingdog/open-graph high-confidence values, descriptions rarely reach Stage 2 anymore.)
   - **Website reachability:** `yes` is positive but not sufficient (liveness ≠ identity). `no` (definitive 4xx/5xx) is a real negative signal — lean toward `disagrees` for the website verdict if web search also can't confirm. `unknown` — do not infer either way.

### Stage 1.5 — Deterministic Cross-Field Corroboration

A pure-function pass inserted between Stage 1 (ScrapingDog) and Stage 2 (AI judge). No LLM, no network. For each judgable field, runs a ruleset using anchors already on hand (`team.*`, `fieldsMeta[<field>].{source,confidence}`, `dataEnrichment.websiteSignals`, Stage 1 ScrapingDog meta, and the unconditional website reachability probe). Rules emit a `FieldJudgment` with `judgedVia: 'corroboration'` whose `note` is a short space-separated phrase listing which anchor(s) fired (e.g. `"email domain matches website"`, `"name in twitter handle"`, `"og name match + jsonld name match"`).

`agrees + high` verdicts from Stage 1.5 are merged into the Stage-1 verdict map BEFORE the `stage1Resolved` set is computed — so any corroborated field skips the AI judge entirely and is promoted to `Team.<field>` on the same promotion gate as before. This is the primary mechanism by which the admin review queue shrinks.

**Merge is confidence-aware, not positional.** When both Stage 1 (the ScrapingDog `compareProfileToTeam` comparator) AND Stage 1.5 produce a verdict for the same field, the `agrees + high` verdict is preserved — Stage 1 only overwrites Stage 1.5 when both are at the same tier (or when Stage 1 is `agrees + high`). This guards against Stage 1's fuzzy text-overlap heuristics silently demoting fields that Stage 1.5's source-trust rule already accepted. Bench evidence: an earlier version of this merge let Stage 1 unconditionally overwrite Stage 1.5, which dropped the `moreDetails` auto-promote rate from 47% → 16% and `linkedinHandler` from 97% → 73% once ScrapingDog Stage 1 came online (because `compareProfileToTeam` re-derives the same verdict at a weaker tier — `agrees+medium` from tagline / partial-name overlap — and was overwriting the high-confidence source-trust verdicts).

#### Rule index

The dispatcher always runs **source-trust** first; if it fires, the field-specific rules are skipped. All field-specific rules below produce `agrees + high` verdicts and require ≥2 independent signals to converge.

| Rule | Applies to | Fires when | Note string | Score |
| --- | --- | --- | --- | --- |
| **source-trust** | every field | `fieldsMeta[<field>].source ∈ {scrapingdog, open-graph}` AND `confidence === 'high'` | `sourced from linkedin` / `sourced from website` | 95 / 90 |
| `email domain matches website` | `contactMethod` (email form) | email-domain host-equal to `team.website` host (or subdomain-of) | `email domain matches website` | 100 |
| `email domain matches jsonld` | `contactMethod` (email form) | email-domain equal to the JSON-LD `Organization.email` domain found on the team's website | `email domain matches jsonld` | 95 |
| `founder contact match` | `contactMethod` (email, `@handle`, or twitter / telegram / linkedin URL) | value matches any team lead's recorded `Member.email` / `twitterHandler` / `telegramHandler` / `linkedinHandler`. Catches the pre-seed pattern where a founder's personal email or social is entered as the team contact (so the host-match rules can't help). | `founder contact match` | 95 |
| `email domain matches team name` | `contactMethod` (email form) | email-domain's first label starts with a substantive team-name token (prefix-only). Catches brand-alias domains — team "Clockwork Labs" with website `spacetimedb.com` and contact `contact@clockworklabs.io`. | `email domain matches team name` | 90 |
| `url host matches website` | `contactMethod` (URL form) | URL host equal to `team.website` host (or subdomain-of) — catches "team's own /contact page", anchor-link self-references, etc. | `url host matches website` | 95 |
| `url host matches team name` | `contactMethod` (URL form) | URL host's first label starts with a substantive team-name token (prefix-only). Symmetric with `email domain matches team name` for URL-form contact methods on a brand-alias domain. | `url host matches team name` | 90 |
| `name in invite slug` | `contactMethod` (URL form) | URL is a Discord / Telegram / Linktree community/invite link on a recognized platform (`discord.com/invite/<slug>`, `discord.gg/<slug>`, `t.me/<slug>`, `linktr.ee/<slug>`) AND the path slug starts with a substantive team-name token. The host matches the platform (not the team), but the SLUG carries the team identifier. Random opaque invite IDs (`discord.gg/BakDKKDpHF`, `t.me/+YF9AYb6zCv1mNDJi`) correctly fail the prefix check. | `name in invite slug` | 90 |
| `matches team telegram` / `matches team twitter` / `matches team linkedin` / `matches team blog` / `matches team social` | `contactMethod` (URL or `@handle` form) | contactMethod normalizes to the same canonical handle/slug the team already has on file under `telegramHandler` / `twitterHandler` / `linkedinHandler` / `blog`. Catches the **self-declared duplicate** pattern — bench case Hypercerts (`clnez5ttg00021h02he9ljx5m`) where the team set `contactMethod = telegramHandler = "https://t.me/+YF9AYb6zCv1mNDJi"` (opaque invite token; `name in invite slug` correctly rejects, but the duplicate declaration IS the identity proof). Per-channel note for explainability; `matches team social` is the bare-`@handle` variant. Normalization strips protocol / `www.` / `twitter.com\|x.com` / `t.me\|telegram.me` / `linkedin.com` host prefixes so `@acmehq` ↔ `https://x.com/acmehq` are recognized as the same handle. | `matches team telegram` / ... | 95 |
| `user trusted` | `contactMethod` (any shape — email / URL / `@handle`) | Final fallback for `contactMethod` only. Fires when `fieldsMeta.contactMethod.status === ChangedByUser` AND none of the deterministic anchors above matched. The team lead has authority over their own contact channel: a `discord.gg/<opaque-token>` invite, a `https://getlit.dev/chat` off-host path, a Calendly URL, or a personal-domain email that the team admin chose to publish. We trust the lead's authority over re-queueing the field for admin review forever (the lead has the information the AI judge would ask for). The value already passed `isLikelyValueForField`, so junk strings like `"Coming soon!"` don't get this fallback. Score 85 is intentionally lower than any deterministic anchor — when a future judge run finds a real anchor, that anchor will outrank this fallback in any merge. | `user trusted` | 85 |
| `website self declared` | `twitterHandler` / `linkedinHandler` / `telegramHandler` | value exact-equal to what `websiteSignals.<field>` extracted from the team's own website HTML (JSON-LD `sameAs`, `twitter:site`, microdata, anchor) | `website self declared` | 100 |
| `name in twitter handle` | `twitterHandler` | handle starts with a substantive team-name token (prefix-only — `eonsys` for "Eon", `Surus_io` for "Surus") | `name in twitter handle` | 90 |
| `name in linkedin slug` | `linkedinHandler` | slug after `company/`/`school/`/`in/` starts with a substantive team-name token, OR any hyphen-separated segment equals a team token (`company/eon-systems-pbc` for "Eon", `company/the-manifest-network` for "Manifest Network"). | `name in linkedin slug` | 90 |
| `name in telegram handle` | `telegramHandler` | handle starts with a substantive team-name token (`fileverse`, `hextrustannouncements`, `vitadao`) | `name in telegram handle` | 90 |
| `host corroborated` | `blog` | blog host equals `team.website` host (or subdomain-of: `blog.acme.com` ↔ `acme.com`, `acme.com/blog` ↔ `acme.com`) | `host corroborated` | 95 |
| `name in blog handle` | `blog` (third-party platforms) | blog is on Substack / Medium / Ghost / paragraph.xyz / Mirror / dev.to / Hashnode / Beehiiv / Posthaven AND the URL's identity slug (subdomain or path) contains every substantive team-name token (`asterainstitute.substack.com` for "Astera Institute", `manifestnetwork.medium.com` for "Manifest Network") | `name in blog handle` | 95 |
| `name in website host` | `website` | host's first dot-separated label STARTS WITH a substantive team-name token (`eon.systems` ↔ "Eon", `devonian.ai` ↔ "Devonian Systems") AND probe didn't report a definitive 4xx/5xx (`websiteReachable !== false`). Bot-blocked (403) sites with a strong name match still auto-promote. Prefix-only — `beontop.com` is NOT a match for "Eon". | `name in website host` | 95 |
| `og name match` / `jsonld name match` / `sd website host match` | `website` | a second-source name anchor fires from one of: `websiteSignals.ogSiteName`, `websiteSignals.jsonLdOrgName`, or ScrapingDog `profile.website` host. Multiple anchors concatenate with ` + ` in the note. (These anchors implicitly require successful HTML fetch, since they come from extracted page content — so they only fire on truly-reachable sites.) | `og name match` / `jsonld name match` / `sd website host match` (or `+`-joined) | 95 |

#### Prefix-and-segment guard

The `name in <handle>` family checks use a two-rule placement guard, never substring-anywhere. Both rules apply via the shared `hostFirstLabelMatchesTeamName` helper:

1. **Whole-string prefix** — handle/host first label STARTS WITH a substantive team token. Catches concatenated / abbreviated forms: `eonsys`, `astera.org`, `manifestnetwork`, `clockworklabs`.
2. **Exact hyphen-segment equality** — any hyphen-separated segment EQUALS a substantive team token. Catches LinkedIn-style slugs that prefix the team name with a word: `the-manifest-network` (segment `manifest` equals team token), `the-acme-foundation` (segment `acme` equals team token).

Equality on segments (not prefix) preserves the false-positive guard: `something-eonical-corp` for team "Eon" → segment `eonical` is NOT equal to team token `eon`, so safely rejected even though `eon` is a substring. Same for `beontop` (mid-segment substring also safely rejected via rule 1).

Stopword filter + 3-char minimum on tokens still apply (drops "labs", "inc", "team", "network", "protocol", "foundation", etc.). Two-letter team names and stopword-only names match nothing.

#### Founder-contact cross-reference (data source for `contactMethod`)

When the judge runs, the team query also pulls `TeamMemberRole` rows for the team — filtered at the DB layer to `teamLead = true` OR `role ILIKE '%founder%'`, so it doesn't load every member for teams with large rosters. The selected members' `email`, `twitterHandler`, `linkedinHandler`, and `telegramHandler` are normalized (lowercased, `@` stripped, URL prefixes stripped, LinkedIn slug expanded to both `in/<slug>` and bare `<slug>` form) and passed into `CorroborationContext.teamLeadContacts`.

The `founder contact match` rule then matches the team's `contactMethod` against this set, in the following shapes:

| Input `contactMethod` shape | Matched against |
| --- | --- |
| `someone@gmail.com` (or any email) | `teamLeadContacts.emails` |
| `@handle` | `teamLeadContacts.twitter` ∪ `teamLeadContacts.telegram` |
| `https://twitter.com/<x>` or `https://x.com/<x>` | `teamLeadContacts.twitter` |
| `https://t.me/<x>` or `https://telegram.me/<x>` | `teamLeadContacts.telegram` |
| `https://www.linkedin.com/in/<x>/` (or `/company/<x>`, `/school/<x>`) | `teamLeadContacts.linkedin` |

Rule ordering inside `corroborateContactMethod` is strongest-first — each falls through to the next when it doesn't fire:

1. `email domain matches website` (score 100) — both signals self-declared by the team
2. `email domain matches jsonld` (score 95) — team's website JSON-LD declared the same email domain
3. `founder contact match` for emails (score 95) — founder cross-reference
4. `url host matches website` (score 95) — team's own /contact page, anchor-link self-reference, etc.
5. `founder contact match` for URLs / `@handle` (score 95)

The website-host rules outrank the founder-match rule when both apply — `jane@acme.com` for a team with website `acme.com` and a founder `jane@acme.com` resolves via the host-match (score 100), not via the founder match (score 95). The verdict is the same; the note tells the reviewer which signal fired.

#### Source-trust (no second source needed)

When the enrichment pipeline already filled a field from a trusted deterministic source at high confidence, accept it without re-verifying via the AI judge. The pipeline records `source` per field on `fieldsMeta`:

- `scrapingdog` → pulled from the team's LinkedIn company profile, OR (for `twitterHandler`) verified against the team's X / Twitter profile. Verdict `agrees + high`, score 95. The note is **field-aware** to surface the actual upstream:
  - `twitterHandler` → `sourced from x` (only X verification writes scrapingdog into this field; LinkedIn's company-profile fetcher never sets twitterHandler)
  - `telegramHandler` → `sourced from telegram` (reserved for the future Telegram verification source — same enum, distinct note)
  - everything else → `sourced from linkedin`
- `open-graph` → pulled from the team's own website HTML (JSON-LD, twitter cards, microdata, anchors). Verdict `agrees + high`, note `sourced from website`, score 90.
- `ai` → filled by the LLM. NOT trusted by this rule, because LLM self-assessed confidence is exactly what the judge exists to verify.

The enrichment-time `confidence` must be `high` — `medium`/`low` indicates the source didn't fully corroborate the value (e.g. open-graph extraction from a website whose ownership wasn't verified). Only `high` clears the bar. This rule was added because the AI judge was systematically downgrading high-confidence LinkedIn-paraphrased descriptions (`shortDescription`, `longDescription`, `moreDetails`) to `medium` based on web-search wording differences — the source IS the verification.

> **The canonical failure cases this fixes:**
>
> - Team has `contactMethod = "test@bestTeam.xyz"` and `website = "bestTeam.xyz"`. The `email domain matches website` rule produces `agrees + high` for `contactMethod`, so the AI judge never sees this field and it auto-promotes. Previously, the AI was finding a different email listed on the team's LinkedIn page and marking the field `disagrees`.
> - Team's `longDescription` was pulled from LinkedIn's About text by ScrapingDog at high confidence. The AI judge would web-search, find paraphrased wording, and downgrade to `medium`. The source-trust rule now auto-promotes — LinkedIn IS the source, paraphrasing is expected.
> - Pre-seed team enters the solo founder's personal `jane@gmail.com` as the team contact. Host-match can't help (gmail.com isn't the team's website host). The `founder contact match` rule cross-references against the `TeamMemberRole` lead members' emails and auto-promotes when Jane is registered as a team lead.
> - Brand-alias case: team "Clockwork Labs" with website `spacetimedb.com` (their product) and contact `contact@clockworklabs.io` (their corporate domain). Website-host match can't fire — the two domains differ — but the email domain's first label (`clockworklabs`) starts with the team token (`clockwork`). The `email domain matches team name` rule auto-promotes.
> - Community invite link: team "LabDAO" with `contactMethod = https://discord.com/invite/labdao`. Host `discord.com` doesn't match the team, but the path slug after `/invite/` literally IS the team's name. The `name in invite slug` rule extracts the slug and prefix-matches it against substantive team tokens — auto-promotes. Random opaque invite IDs (`discord.gg/BakDKKDpHF`) don't match and correctly stay in review.
> - Self-declared duplicate (bench case Hypercerts): team set `contactMethod = telegramHandler = "https://t.me/+YF9AYb6zCv1mNDJi"`. The `+token` form is an opaque join token, so `name in invite slug` correctly rejects — but the duplicate declaration across two fields IS the identity proof. The `matches team telegram` rule normalizes both values and equality-checks, then auto-promotes. Symmetric for `twitterHandler` / `linkedinHandler` / `blog`.

The full rule implementations + an eval bench live in `team-enrichment-corroboration.ts` and `team-enrichment-corroboration.spec.ts`. The bench pins precision/recall: any rule change that regresses fixtures fails CI.

### Website signal persistence (`dataEnrichment.websiteSignals`)

`fetchSocialSignalsFromWebsite` already extracts self-declared signals from the team's website HTML during enrichment (JSON-LD `Organization` nodes, Twitter cards, microdata, anchors, `og:site_name`, `meta description`). The extracted block is now also **persisted** to `TeamEnrichment.dataEnrichment.websiteSignals` so Stage 1.5 can read it as a second independent source:

```ts
websiteSignals?: {
  extractedAt: string;          // ISO timestamp
  host?: string;                // normalized website host (no www., lowercase)
  twitterHandler?: string;
  linkedinHandler?: string;
  telegramHandler?: string;
  contactEmail?: string;
  jsonLdOrgName?: string;
  ogSiteName?: string;
  metaDescription?: string;
}
```

The block is preserved across runs if a subsequent fetch fails — a transient website outage doesn't wipe a recent extraction.

**Browser-like header bouquet for HTML fetches.** `fetchWebsiteHtml` now uses the full `BROWSER_REQUEST_HEADERS` set from `team-enrichment-http.util.ts` (User-Agent + Accept-Language + Accept-Encoding + Sec-Ch-Ua-* + Sec-Fetch-* + Priority + Upgrade-Insecure-Requests). The bouquet was ported from `pln-data-enrichment/apps/data-enrichment/src/common/utils/user-agent.util.ts`, where it documented a 66% recovery rate on `homepage-unreachable` outcomes once the absent-headers bot-signal class was eliminated. More successful HTML fetches → more `websiteSignals` populated → more Stage 1.5 corroboration → fewer fields reaching the AI judge.

### Quality block + thin-evidence flag (`dataEnrichment.judgment.quality`)

Computed at judge time and persisted alongside the verdict. Mirrors the 6-dimension scoring doctrine from `pln-data-enrichment/apps/signal-sourcing/src/quality/quality.util.ts`. Surfaced through the review-list endpoint so admins can sort/filter the queue.

```ts
quality?: {
  completeness: number;        // populated / total enrichable fields
  validity: number;            // URL/email zod pass-rate over populated fields
  freshness: number;           // 1 - days_since_enriched/365 (clamped [0,1])
  distinctSources: number;     // distinct sources contributing any field (ai|open-graph|scrapingdog|website-signals|user)
  thinEvidence: boolean;       // distinctSources < 2 OR fewer than 3 core fields populated
  anchorsFired: string[];      // dedup'd Stage 1.5 anchor notes from this run (explainability)
}
```

`thinEvidence: true` flags teams whose verdicts look high-confidence but are built on sparse data (the failure mode the `pln-data-enrichment` `isLowData` flag was designed to catch). Reviewers can de-prioritize those teams independently of the per-field verdict.

### Value-validity gate (per-field shape check)

The same per-field shape validator (`team-enrichment-field-shape.util.ts`, function `isLikelyValueForField`) is used on **both** sides of the pipeline:

- **At enrichment time** (`team-enrichment.service.ts`): a `Team.<field>` value that fails the shape gate is treated as effectively empty. The field falls through to AI / website-signal / lead / ScrapingDog enrichment as if the user had left it blank, the AI's candidate is written with `status: Enriched`, and the judge can then promote it — overwriting the junk placeholder on `Team.<field>`. See [Governing invariant](#governing-invariant).
- **At judge time** (`team-enrichment-judge.service.ts`): a candidate value that fails the shape gate is skipped entirely — no Stage 1 verdict, no Stage 2 AI call, no entry in `fieldsForReview` (there is nothing meaningful to verify, and we don't want the AI to hallucinate a verdict against junk input).

The validator rejects values **by structure**, not by enumerating placeholder strings. "Coming soon!", "TBD", "n/a", "pending", "email", "Twitter", "Telegram" all fail because none of them match the field's expected shape — no blocklist needed.

| Field | Accepted shapes | Examples of rejected values |
| --- | --- | --- |
| `website` / `blog` | `http(s)://host.tld/...` (full URL with scheme + host containing a dot) | `Coming soon!`, `t54.ai` (schemeless), `n/a`, `TBD` |
| `contactMethod` | email (`x@host.tld`), URL-with-scheme, `mailto:`, or `@handle` (≥2 alphanumeric/underscore chars) | `email`, `Twitter`, `Telegram`, `phone`, `Coming soon!`, `TBD` |
| `twitterHandler` | 1-15 alphanumeric / underscore (with optional `@` prefix or full `twitter.com` / `x.com` URL) | `acme team` (space), `acme-team` (hyphen), `n/a`, anything >15 chars |
| `linkedinHandler` | `company/<slug>`, `school/<slug>`, `in/<slug>`, bare slug (2-100 alphanumeric / `_` / `-` / `.`), or full `linkedin.com/...` URL | `Coming soon!`, `n/a` |
| `telegramHandler` | 3-32 alphanumeric / underscore (with optional `@` prefix or full `t.me` / `telegram.me` URL) | `@ab` (too short), `n/a`, `Coming soon!` |
| descriptions, `moreDetails`, array fields (`industryTags` / `investmentFocus`) | any non-empty value | empty / whitespace-only / empty array |

Two design choices worth noting:

- **Conditional URL-prefix stripping.** For platforms with URL form (Twitter `twitter.com/...`, LinkedIn `linkedin.com/...`, Telegram `t.me/...`), the validator only strips path / query / fragment when the value actually starts with the platform's URL prefix. An earlier draft stripped after any `/`, which made `n/a` falsely pass `twitterHandler` validation (stripped to `n`, a valid 1-char handle).
- **Short legit handles still pass.** `@EFF` (3 chars), `@safe` (4 chars), `@bluesky` (7 chars) all pass `twitterHandler`. The shape is the gate, not the length, so the validator doesn't accidentally reject real short brands.

This replaces the earlier URL-only gate (`URL_REQUIRED_FIELD_KEYS` + `z.string().url()`) that only covered `website` and `blog` — placeholder values typed into `contactMethod` (`"email"`, `"Twitter"`) used to get judged and clutter the review queue.

### fieldsMeta after judgment

The judge is **non-destructive on metadata**: it adds a `judgment` sub-object to each judged field but does not overwrite any enrichment-time values on `TeamEnrichment.dataEnrichment.fieldsMeta`. The top-level `status`, `confidence`, and `source` remain as enrichment (or the user) set them — including any ScrapingDog confidence upgrade applied during enrichment, and including `ChangedByUser` for user-supplied website/contact-link fields that the judge now also evaluates. Admins who want the judge's independent confidence should read `fieldsMeta[field].judgment.confidence`. The judge IS authorized to write candidate values to `Team` (and `InvestorProfile.investmentFocus`) — but only as the [promotion rule](#promotion-rule) allows, and never for `ChangedByUser` fields.

```ts
fieldsMeta[field]: {
  status: FieldEnrichmentStatus,
  confidence: FieldConfidence,     // enrichment-time value — never overwritten by the judge
  source: EnrichmentSource,
  judgment: {
    confidence: 'high' | 'medium' | 'low',   // judge's independent assessment
    score: 0..100,
    verdict: 'agrees' | 'disagrees' | 'uncertain',
    note?: string,                 // max 60 chars, hyphenated-keyword style (e.g. 'name-match')
    judgedVia: 'scrapingdog' | 'ai',
  }
}
```

Per-field `judgedAt` and `judgedModel` are intentionally omitted — they're the same for every field in a run, so they live only on the top-level `TeamEnrichment.dataEnrichment.judgment.judgedAt` / `aiModel`.

And on the team-level:

```ts
TeamEnrichment.dataEnrichment.judgment: {
  status: 'PendingJudgment' | 'InProgress' | 'Judged' | 'FailedToJudge',
  judgedAt, judgedBy, aiModel, errorMessage,
  overallAssessment: string,       // max 120 chars — compact one-liner
  fieldsForReview: string[],       // DB column names needing manual check: ['website','contactMethod',...]
                                   // — includes every field whose judge verdict is disagrees,
                                   //   uncertain, or agrees-at-low-confidence
  scrapingDog?: {
    used, fetchedAt, nameMatch, companyNameFromLinkedIn, verifiedFields, linkedinInternalId,
    websiteReachable?: boolean | null,   // true = 2xx final, false = 4xx/5xx, null = not probed / transient / invalid URL
    websiteFinalHost?: string | null     // post-redirect normalized host when reachable
  }
}
```

### Bad LinkedIn handle handling

Both the judge (Stage 1) and the enrichment pipeline (ScrapingDog branch) distinguish "profile not found" from other ScrapingDog failures. When ScrapingDog returns the specific "profile not found" body (`{success: false, message: /not found/i}`) for an **AI-supplied** LinkedIn handle, the handle is nulled on **both** `Team.linkedinHandler` and `TeamEnrichment.linkedinHandler` and its `fieldsMeta.linkedinHandler.status` is flipped to `CannotEnrich` so the next enrichment run can attempt to rediscover it. User-supplied handles (`ChangedByUser`) are never nulled. Any other ScrapingDog failure (HTTP 4xx/5xx, quota exhausted, timeout, malformed JSON) leaves the team untouched.

### Judge cron

- **Schedule**: `TEAM_ENRICHMENT_JUDGE_CRON` env var (default `0 4 * * *` — daily 4 AM UTC, one hour after the enrichment default).
- **Guard**: reuses `IS_TEAM_ENRICHMENT_ENABLED` — the same toggle gates all three crons.
- **Idempotency**: skips teams whose `TeamEnrichment.dataEnrichment.judgment.status` is already `Judged` or `InProgress`.

### Admin endpoints

```
POST /v1/admin/teams/:uid/trigger-judgment           # Run judge for a team (skips if already judged)
POST /v1/admin/teams/trigger-judgment                # Run judge for all pending teams
POST /v1/admin/teams/:uid/trigger-force-judgment     # Re-run judge even if already judged
```

All require `AdminAuthGuard`. They do NOT require `IS_TEAM_ENRICHMENT_ENABLED` — manual overrides.

## Logo Verification (Vision-Model Pass)

A separate, **logo-only** verification pipeline. It runs independently of the enrichment / judge crons and writes its results to the `TeamLogoVerificationResult` Postgres table — it never mutates `Team.logo`, `Team.logoUid`, `TeamEnrichment.logoUid`, or `dataEnrichment`. Output is an append-only audit log that admins (or downstream review tooling) can query to spot wrong-brand logos uploaded or auto-fetched onto a team.

### What it does

For each candidate team, the job downloads the current logo image (SVG is rasterized to PNG via `sharp`) and sends it to a vision-language model (VLM) along with the team name + website. The VLM returns a JSON verdict:

```ts
{
  predictedCompanyName: string | null,
  verdict: 'verified' | 'weak_match' | 'mismatch' | 'unverifiable',
  confidence: 'high' | 'medium' | 'low',
  quality: 'good' | 'poor' | 'unusable',
  hasReadableText: boolean,
  reason: string,
  brandSignals: string[]
}
```

A new row is inserted into `TeamLogoVerificationResult` per run — history is preserved across re-runs (logo swaps, model bumps, force re-verifies). The row carries `teamUid`, `logoUid`, `provider`, `model`, the snapshotted `website` / `logoUrl` / `source`, the parsed verdict fields, and the `rawResponse` for debugging.

### Cron

- **Schedule**: `LOGO_VERIFICATION_CRON` env var (default `0 */6 * * *` — every 6 hours UTC). Runs separately from the enrichment / marking / judge crons and on its own toggle.
- **Guard**: `IS_LOGO_VERIFICATION_ENABLED` must be `'true'` (default `false`). Independent of `IS_TEAM_ENRICHMENT_ENABLED`.
- **In-process re-entry guard**: an `isRunning` flag prevents two ticks from overlapping if a batch outlives its interval.
- **Batch size**: `LOGO_VERIFICATION_BATCH_SIZE` (default `20`) — number of teams pulled per tick. Sequential per-team processing keeps VLM rate-limits manageable.

### How teams are picked

Two filters run in order:

1. **DB-level candidates** — `team-logo-verification` selects teams where `logoUid IS NOT NULL`, joined to a `TeamEnrichment` row (i.e. enrichment has at least been _marked_ for the team), with `isFund = false` AND `priority IN (1, 2, 3)`. The joined `Image.url` must also be non-null. Ordered by `priority ASC` then `updatedAt DESC` and limited to `LOGO_VERIFICATION_BATCH_SIZE` — higher-priority, recently-changed teams surface first so a freshly-uploaded or freshly-enriched logo gets verified on the next tick.
2. **Per-team `shouldVerifyTeam` gate** — for each candidate, the persistence layer looks up the latest `TeamLogoVerificationResult` for the same `(teamUid, provider)` pair and skips if all of the following hold:
   - a prior result exists,
   - its `logoUid` matches the team's current `logoUid` (i.e. the logo wasn't replaced),
   - its `model` matches the currently-resolved model name.

   If the logo was swapped, or the VLM model was upgraded (e.g. `gemini-2.5-flash` → a newer Gemini), the team re-verifies. Teams with no `logoUid` are also skipped at this stage (defensive — the DB filter already excludes them).

3. **Force re-verify** — set `LOGO_VERIFICATION_FORCE_UPDATE=true` to bypass the per-team gate and re-verify every batched team regardless of prior results. Useful when calibrating against a new VLM or after a prompt change.

### Provider selection

Resolved per run from `LOGO_VLM_PROVIDER` (default `gemini`). Each provider has its own model env var: `GEMINI_LOGO_VERIFICATION_MODEL` (default `gemini-2.5-flash`), `OPENAI_LOGO_VERIFICATION_MODEL` (default `gpt-4.1-mini`), `ANTHROPIC_LOGO_VERIFICATION_MODEL` (default `claude-3-5-sonnet-latest`). The chosen `provider` and `model` are persisted on every row, so the table remains queryable when defaults change.

### On-demand admin endpoints

The same VLM service is also exposed via on-demand HTTP endpoints (no auth guard wired here — intended for internal tooling). These do **not** write to `TeamLogoVerificationResult`; only the cron persists.

```
POST /team-enrichment/verify-logo                       # single image, default provider
POST /team-enrichment/verify-logo/all                   # runs gemini + openai + anthropic in parallel + composite decision
POST /team-enrichment/verify-logo/provider/:provider    # single image, specific provider
POST /team-enrichment/verify-logo/batch                 # batch of images, mode: all | gemini | openai | anthropic
```

The `/all` variant returns a composite `decision: 'accept' | 'reject' | 'review'` derived from cross-provider agreement (e.g. both Gemini and OpenAI saying `verified` → `accept`; Gemini saying `mismatch` at high confidence → `reject`; otherwise → `review`).

## ScrapingDog Fallback (LinkedIn)

A secondary, high-confidence enrichment source that queries LinkedIn company profiles via the [ScrapingDog](https://www.scrapingdog.com/) API. Because the API is paid, it is **only** called when the primary AI+OG pass leaves high-value gaps.

### Gating — ScrapingDog is invoked only if ALL are true

- `SCRAPINGDOG_API_KEY` is set.
- The team has a `linkedinHandler` (either existing or discovered by the AI pass).
- After the primary pass, at least one of these gaps remains: logo, website, shortDescription, longDescription, moreDetails, industryTags.

### What it populates (all as `FieldEnrichmentStatus.Enriched`, written to `TeamEnrichment`)

| TeamEnrichment field | ScrapingDog source                                                              |
| -------------------- | ------------------------------------------------------------------------------- |
| `logo` / `logoUid`   | `profile_photo` (high-confidence LinkedIn-hosted logo, no OG validation needed) |
| `website`            | `website`                                                                       |
| `shortDescription`   | `tagline` (truncated to 200 chars)                                              |
| `longDescription`    | `about` (truncated to 1000 chars)                                               |
| `moreDetails`        | concatenation of `founded`, `headquarters`, `industries`, `specialties`         |
| `industryTags`       | `industries` + `specialties` matched against `IndustryTag` records, persisted as `TEXT[]` of titles |

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

When invoked, the run is recorded on `TeamEnrichment.dataEnrichment.scrapingDog`:

```ts
scrapingDog?: {
  used: boolean;
  fetchedAt: string;             // ISO timestamp
  fields: string[];              // which fields ScrapingDog filled this run
  linkedinInternalId?: string;   // LinkedIn internal company id
}
```

## ScrapingDog X / Twitter Verification

A secondary deterministic verification source that targets the `twitterHandler` field specifically. Runs at **enrichment time** (not judge time) via `TeamEnrichmentScrapingDogService.fetchTwitterProfile`, which calls ScrapingDog's `/x/profile?parsed=true` endpoint. Same paid API as the LinkedIn fallback, gated by the same `SCRAPINGDOG_API_KEY` env var.

The LinkedIn fallback's job is to **discover** missing values from the company profile. The X verification's job is to **upgrade** an already-filled `twitterHandler` candidate from `source: ai` (LLM self-assessed) to `source: scrapingdog + confidence: high` (deterministic identity proof). The judge's Stage 1.5 source-trust rule then auto-promotes the value with `note: "sourced from x"` — no AI judge call, no admin review.

### When it runs

After the AI pass, website-signal backfill, lead-backfill, and the LinkedIn ScrapingDog fallback all complete. Gated by ALL of:

- `SCRAPINGDOG_API_KEY` is set.
- `twitterHandler` is NOT user-owned (`ChangedByUser` with a structurally-valid value).
- A candidate handle exists from EITHER:
  - `enrichmentUpdate.twitterHandler` — written this run by AI / website-signal / lead-backfill, OR
  - `TeamEnrichment.twitterHandler` — orphan value from a prior enrichment cycle (the common case when a re-enrichment marked the field `CannotEnrich` but left the prior candidate in place; see [Stale judgment handling](#stale-judgment-cleared-on-re-enrichment)).
- The candidate passes the `twitterHandler` shape gate (`isLikelyValueForField`) — placeholder text like `"Twitter"` is rejected before we burn a ScrapingDog call.

### Identity check

`verifyTwitterProfileMatchesTeam` (exported from `team-enrichment-scrapingdog.service.ts` so it's unit-testable in isolation) emits an anchor list. Verification succeeds when ANY anchor fires:

| Anchor | Fires when | Sufficient alone? |
| --- | --- | --- |
| `website host match` | The X profile's listed `website` host equals the team's `website` host (normalized — `www.` stripped, lowercased). | **Yes.** Both ends are independently-controlled team assets — a host match is decisive. |
| `name match` + `x verified org` | The X profile's display `name` shares a substantive token with `team.name` AND `verified_type` is `Business` or `Government` (X manually verifies these tiers, so the verification flag is a high-quality second source). | Yes, when combined. |
| `name match` + `handle prefix match` | Display-name token overlap AND the handle's first label prefix-matches a substantive team token (same rule as Stage 1.5's `name in twitter handle` — mirrors the existing converging-anchors doctrine). | Yes, when combined. |

`name match` alone is **not** sufficient — could be a brand-squatter or fan account. Same rationale as the rest of the Stage 1.5 rules: single-source overlap doesn't clear the bar, two converging anchors does.

### What it writes

On a verified profile:

1. `enrichmentUpdate.twitterHandler` is set to the **canonical** handle from `profile.username` (X's preferred casing, lowercased, `@`-stripped). This may differ from the AI-supplied casing (e.g. `"ScienceCorp_"` → `"sciencecorp_"`).
2. `newFieldsMeta.twitterHandler = { status: Enriched, confidence: High, source: ScrapingDog }`. The same enum value as the LinkedIn ScrapingDog upgrade — `corroborateBySource` distinguishes by field key when emitting the judge-time note (`sourced from x` for twitterHandler, `sourced from linkedin` for company fields).

### Non-destructive on failure

The X verification step is non-destructive on every non-`ok` outcome:

- `error` (HTTP non-200, timeout, malformed JSON, missing API key) — logs and returns. The candidate's prior `source` / `confidence` / `status` stand. The AI judge will get a normal turn at the field via the Stage 2 path.
- `not-found` (the documented `success: false, message: /not found/i` shape) — logs and returns. We intentionally do NOT mirror the LinkedIn `nullBadLinkedinHandle` path here. X profiles can legitimately move to a new handle without HTTP redirects, and the existing handle may still be the team's chosen identity even when X's parsed payload temporarily misses it. The handle stays as the AI / lead-backfill supplied it.
- Profile fetched but no identity anchor fired — same treatment as `not-found`. We log the anchors we evaluated (`profile.name`, `profile.website`, `verified_type`) so admin reviewers can spot mis-tagged accounts at a glance.

### Canonical failure case this fixes

> Team `Science` (`cldvnx75t01czu21k77n84pg2`) with website `https://science.xyz`. The AI pipeline guessed `twitterHandler = "ScienceCorp_"`. Earlier, the AI judge couldn't independently verify this and emitted `verdict: uncertain, confidence: medium, note: "ScienceCorp_-handle-not-independently-confirmed"` — surfacing the team in admin review.
>
> With X verification: `fetchTwitterProfile("ScienceCorp_")` returns a profile whose `website` is `https://science.xyz/` (matching the team's website host). The `website host match` anchor fires → handle's source is upgraded to `scrapingdog + high` → Stage 1.5 source-trust rule auto-promotes with `note: "sourced from x"`. Auto-cleared from the review queue.

### Stale judgment cleared on re-enrichment

Independent of the X verification, the enrichment-time `fieldsMeta` merge now drops any prior `judgment` block whenever it writes fresh meta for a field. Rationale: the judgment is owned by the judge stage and is rendered against a specific `(status, value)` tuple — once enrichment rewrites the field, the prior verdict no longer applies.

Before this change, a value that flipped `Enriched → CannotEnrich` (AI lost its previous answer on a force-rerun) kept surfacing the team in admin review because the legacy `uncertain / medium` verdict was still attached. The next judge run writes a fresh verdict only for fields whose status is `Enriched` or `ChangedByUser` (judgable) — `CannotEnrich` fields no longer carry a stale verdict at all.

## Cron Job

- **Schedule**: `TEAM_ENRICHMENT_CRON` env var (default: `0 3 * * *` — daily at 3 AM UTC)
- **Guard**: `IS_TEAM_ENRICHMENT_ENABLED` must be `'true'`
- Finds all teams whose `TeamEnrichment.dataEnrichment.shouldEnrich=true` AND `status=PendingEnrichment` (the eligibility filter is applied at the _marking_ step, so this cron processes everything that's been marked, regardless of current `isFund`/`priority`)
- Processes sequentially to avoid rate limits

## Stale `InProgress` recovery

A pod killed mid-run (SIGKILL, OOM, container restart, hung pipeline) can leave a row stuck with `dataEnrichment.status = InProgress` (or `judgment.status = InProgress`) forever — every entry point (`enrichTeam`, `forceEnrichTeam`, `judgeTeam`, `forceJudgeTeam`, plus all `trigger-*-all` variants and the crons) treats `InProgress` as an "already running" guard and skips. To prevent permanent stuck rows, a TTL-based self-heal runs on every `findTeamsPendingEnrichment` / `findTeamsPendingJudgment` call:

- **Enrichment recovery** — any row with `dataEnrichment.status = 'InProgress'` AND `updatedAt < NOW() - TEAM_ENRICHMENT_STUCK_TTL_MINUTES` is flipped back to `PendingEnrichment + shouldEnrich = true` in a single `UPDATE`. The next pass of the same call picks it up.
- **Judge recovery** — any row with `dataEnrichment.judgment.status = 'InProgress'` AND `updatedAt < NOW() - TTL` has its `judgment` block dropped (via JSONB `-` operator). Since the judge only excludes `Judged` and `InProgress` from its candidate set, removing the block re-qualifies the team on the same call.

Both writes also bump `updatedAt` so a successful recovery is itself protected from being re-fired on the next tick.

**TTL choice.** Default `60` minutes. A single team's enrichment is ~2 minutes worst-case (one AI call + a couple of HTTP fetches), and a judge run is a few seconds — so 60 minutes is comfortably outside the longest possible live run. Lower it if you want faster recovery; raise it if you ever see actually-running teams flagged.

**Observability.** When the self-heal fires, it logs at `warn` level with the affected row count:

```
Stale enrichment recovery: reset N row(s) from InProgress → PendingEnrichment (ttl=60m)
Stale judge recovery: cleared judgment block on N row(s) stuck InProgress (ttl=60m)
```

Treat repeated firings against the same team as a real bug signal (a deterministic crash inside the pipeline), not a normal pod restart.

**Why TTL-only, no extra error handling.** Both pipelines already wrap the entire body in `try/catch` blocks that write `FailedToEnrich` / `FailedToJudge` on error. The cases where `InProgress` still escapes are (a) the process being killed before any catch can run, or (b) the catch's own DB write failing (typically because the DB is what threw in the first place). Adding more catch-the-catch layers helps only the second case — and only marginally, since the same DB call is being retried — so the TTL is the right defense for both.

## Endpoints

### Admin Field-Level Review — List

```
GET /v1/admin/teams/enrichment-review
Guard: AdminAuthGuard
```

Full list of teams that still have **at least one thing needing admin review**. Sorted by `team.name` ASC. No pagination — the portal carries ~1K teams and the back-office UI consumes the full set at once.

Inclusion criteria — a team is included if ANY of:
- At least one non-logo `fieldsMeta[k].judgment` is NOT (`verdict === 'agrees'` AND `confidence === 'high'`). That pair is the exact criterion the judge uses to auto-promote a field from `TeamEnrichment` to `Team`, and admin approval normalizes to the same pair — so anything else (`disagrees`, `uncertain`, or `medium`/`low` confidence) is still pending review and surfaces here. Fields without a `judgment` entry yet are ignored (they're not review-ready). Score is **not** the gate: ScrapingDog can legitimately emit `score=90` at `medium` confidence (e.g. partial nameMatch + website corroboration — not promoted) and `score=85` at `high` (e.g. tagline-overlap with exact name match — promoted), so score-thresholding produces both false negatives and false positives relative to what the judge actually did.
- The team has a logo (`TeamEnrichment.logoUid` set) and NEITHER of the two approval sources is at high confidence. Logo has two independent approval sources, EITHER is sufficient: (a) admin approval via PATCH `/enrichment-review` writes `agrees + high` to `fieldsMeta.logo.judgment`; (b) the VLM cron writes `verified + high` to the latest `TeamLogoVerificationResult` row. The union is required because admin approval only **updates** an existing VLM row — it does not **create** one — so a logo approved by an admin before the VLM cron ever ran would otherwise keep surfacing in the review list forever.
- A `ChangedByUser` field has a **junk Team value** (fails `isLikelyValueForField`) AND `TeamEnrichment.<field>` has a shape-valid AI candidate. The judge may have accepted the user's value at `agrees + high` (typically via the `user trusted` fallback — see Stage 1.5), but with a usable AI alternative on hand the admin should still confirm or apply the AI suggestion. Per-field response carries the AI side under `alternative` (see below). Bench case: **ANDÉN** (`cmgovmq5z0g2sow4flvtzrkkk`) with `Team.website = "Coming soon!"` and TE candidate `https://andendigital.com/`.

The endpoint excludes `PendingEnrichment`, `InProgress`, and `FailedToEnrich` at the query level — those teams have nothing review-ready. Remaining statuses (`Enriched`, `Reviewed`, `Approved`, and any future addition) all surface as long as the inclusion check flags something.

Per-field rules in the response:
- Every field that has a `fieldsMeta[k].judgment` entry is surfaced, including those at `agrees + high + 100` (so admins can see the full picture of what already passed). A `ChangedByUser` field with no judgment is ALSO surfaced when the team's value is junk and a shape-valid AI candidate exists on `TeamEnrichment` — see `alternative` below.
- `content` source is decided by `fieldsMeta[k].status`:
  - `ChangedByUser` → reads from `Team.<field>` (user's value is the source of truth; the `TeamEnrichment.<field>` candidate, if any, is informational provenance).
  - `Enriched` / `CannotEnrich` → reads from `TeamEnrichment.<field>` (AI candidate not yet promoted).
  The other side is used as a fallback if the primary side is empty. Fields that are empty in **both** places are skipped — there's nothing to review.
- `alternative` carries the **opposite-side value** when it exists, differs from `content`, and at least one of the two sides is shape-valid. `fromSide: 'enrichment'` means the alternative is the AI candidate (primary is the user's value); `fromSide: 'team'` means the alternative is the literal user-typed value (primary is the AI candidate after the junk-override path). Lets the back-office EditModal render an "AI suggestion: …" / "User-typed value: …" pill with an Apply button so the admin can swap the primary for the alternative. Omitted when (a) the two sides are equal, (b) the opposite side is empty, or (c) both sides fail the shape gate (nothing useful to surface).
- Logo is included whenever `TeamEnrichment.logoUid` is set, regardless of the latest verification's confidence. The latest `TeamLogoVerificationResult` row (any provider, newest by `createdAt`) populates `verification`; `verification` is `null` when no row exists.
- The logo URL also appears in `fields.logo.content` (mirrors the scalar-field shape so the UI can iterate uniformly). The richer VLM verdict stays on the top-level `logo` block.

Response shape:

```ts
{
  teams: Array<{
    uid: string;
    name: string;
    priority: number;                            // Team.priority (1 = highest, 5 = lowest, 99 = NA)
    enrichmentStatus: EnrichmentStatus;          // always 'Enriched' in this list
    enrichmentAt: string | null;                 // dataEnrichment.usage.enrichment.lastRunAt (ISO)
    judgedAt: string | null;                     // dataEnrichment.judgment.judgedAt (ISO)
    fields: Partial<Record<FieldMetaKey, {
      content: string | string[];                // primary value (Team for ChangedByUser, TE for Enriched/CannotEnrich)
      metadata: { status?: FieldEnrichmentStatus; source?: EnrichmentSource; lastModifiedAt?: string };
      judgment: { note?: string; score?: number; verdict?: 'agrees' | 'disagrees' | 'uncertain'; confidence?: 'high' | 'medium' | 'low' };
      alternative?: {                            // opposite side, when different + at least one side shape-valid
        content: string | string[];
        fromSide: 'team' | 'enrichment';         // which side this value comes from
      };
    }>>;
    logo?: {
      content: { uid: string; url: string } | null;   // candidate logo from TeamEnrichment
      metadata: { status?: FieldEnrichmentStatus; source?: EnrichmentSource; lastModifiedAt?: string };
      judgment?: { note?: string; score?: number; verdict?: 'agrees' | 'disagrees' | 'uncertain'; confidence?: 'high' | 'medium' | 'low' };  // admin-approval judgment from fieldsMeta.logo.judgment; absent until admin approves
      verification: {
        verdict: string;
        confidence: string;
        reason: string | null;
        verifiedAt: string;                       // TeamLogoVerificationResult.createdAt (ISO)
      } | null;
    };
  }>
}
```

### Admin Team Approval

```
PATCH /v1/admin/teams/:uid/enrichment-review
Guard: AdminAuthGuard
Body: { fields: Array<{ key: FieldMetaKey, content?: string | string[] }> }
```

Admin reviews a team and approves its enrichment. Body lists per-field decisions (at least one):

- `content` provided → admin edited the value. Final value goes to `Team.<column>` and `fieldsMeta[key].status` flips to `ChangedByUser`.
- `content` omitted ("Confirm") → admin accepted the current value as-is. The canonical source is read (`Team.<field>` when status is `ChangedByUser`, otherwise the `TeamEnrichment.<field>` candidate) and promoted to Team. `status` is unchanged.

In both cases the per-field judgment is normalized to `{ verdict: 'agrees', confidence: 'high', score: 100, note: '' }` (with `judgedVia` preserved). `note` is cleared because admin approval supersedes the AI's prior justification — keeping stale notes like `"matches-known-..."` would misrepresent why the field is now high-confidence. `lastModifiedAt` is restamped per the value-write invariant.

Value shape per field:
- Scalars (`website`, `blog`, `contactMethod`, social handles, descriptions, `moreDetails`): `string`.
- `logo`: `string` (a logo `Image.uid` — `Team.logoUid` is connected to it).
- `industryTags`: `string[]` of tag titles. Resolved case-insensitively against existing `IndustryTag` records; unmatched titles are silently dropped (same rule as the judge).
- `investmentFocus`: `string[]`. Written to `InvestorProfile.investmentFocus` (the profile is created if missing).

What happens in one `prisma.$transaction`:

1. **Team writes** per the per-field resolution above. For `ChangedByUser` + confirm-only entries, no Team write is issued (the value is already there); only `fieldsMeta` is normalized.
2. **`fieldsMeta` normalization** for every approved key — `status` + `judgment` updated per the rules above, `lastModifiedAt` restamped.
3. **Team-level metadata**:
   - `dataEnrichment.status` → `Reviewed`. The flip happens whether the admin approved every flagged field or only a subset — partial reviews stay in `Reviewed` and the team remains in the list endpoint until all flagged fields land at `verdict=agrees, confidence=high` (the same pair the judge uses to auto-promote; admin approval normalizes to this with `score=100`). `Approved` is reserved for an explicit team-level finalization (not exposed through this endpoint).
   - `reviewedAt` → now (ISO).
   - `reviewedBy` → requestor email from the JWT (`req.userEmail`).
   - Approved keys removed from `dataEnrichment.judgment.fieldsForReview`.
4. **Logo verification audit** — when `logo` is approved, the latest `TeamLogoVerificationResult` row for the team (any provider, newest by `createdAt`) is updated to `{ verdict: 'verified', confidence: 'high' }`. Other snapshot columns are preserved.

Guards & skip reasons:

- **Concurrency**: if `dataEnrichment.status === 'InProgress'`, returns `{ success: false, ... }` and writes nothing.
- **Per-field skips** are returned in `skipped: { key, reason }[]` (the call still succeeds for the other fields):
  - `empty_value` — admin sent an empty `content` (empty string / empty array).
  - `no_candidate` — no `content` was provided and the canonical source (Team or TeamEnrichment) is empty.

Returns `{ success, approved: FieldMetaKey[], skipped: { key, reason }[], message }`. Does NOT require `IS_TEAM_ENRICHMENT_ENABLED`.

### Admin Enrichment Status — Single Team

```
GET /v1/admin/teams/:uid/enrichment-status
Guard: AdminAuthGuard
```

Per-team enrich + judge status snapshot. Useful for back-office to ask "what's the current state of team X?" without parsing the full enrichment-review list.

- Returns 404 if the team uid doesn't exist.
- Returns `enrichment: null` and `judgment: null` when the team has no `TeamEnrichment` row.
- Returns `judgment: null` when the team has been enriched but the judge has not run yet.

Response shape:

```ts
{
  uid: string;
  name: string;
  enrichment: {
    status: EnrichmentStatus;             // PendingEnrichment | InProgress | Enriched | FailedToEnrich | Reviewed | Approved
    shouldEnrich: boolean;
    enrichedAt: string | null;            // ISO timestamp of last successful enrichment
    enrichedBy: string | null;            // 'system-cron' | 'manually' | <email>
    reviewedAt: string | null;
    reviewedBy: string | null;
    errorMessage: string | null;
    aiModel: string | null;
  } | null;
  judgment: {
    status: JudgmentStatus;               // PendingJudgment | InProgress | Judged | FailedToJudge
    judgedAt: string | null;
    judgedBy: string | null;
    aiModel: string | null;
    errorMessage: string | null;
    overallAssessment: string | null;
    fieldsForReview: string[];            // DB column names the judge flagged for manual review
  } | null;
}
```

### Admin Enrichment Status — Cron Jobs

```
GET /v1/admin/teams/enrichment-status
Guard: AdminAuthGuard
```

Cron progress snapshot — `isRunning` flags for the three cron jobs (enrichment, marking, judge), plus pending / in-progress team counts. Admins use this to confirm whether a manual `trigger-enrichment` is still mid-batch, or to know whether the daily cron has anything queued.

Response shape:

```ts
{
  enrichment: {
    isRunning: boolean;        // per-pod in-memory flag
    pending: number;           // TeamEnrichment rows with shouldEnrich=true AND status=PendingEnrichment
    inProgress: number;        // TeamEnrichment rows with status=InProgress
  };
  marking: {
    isRunning: boolean;        // per-pod in-memory flag (separate marking cron)
  };
  judge: {
    isRunning: boolean;        // per-pod in-memory flag
    pending: number;           // status=Enriched AND judgment.status NOT IN (Judged, InProgress) — SQL pre-filter only
    inProgress: number;        // judgment.status=InProgress
  };
}
```

Caveats:

- **`isRunning` is per-pod**. The flag is an in-memory boolean on the cron-job class — accurate within this pod, but if the API runs as multiple replicas, only the pod actually executing the cron will report `true`. Counts come from the DB and are authoritative across pods.
- **Judge `pending` is the SQL pre-filter only**, before `collectJudgableFieldKeys` weeds out rows with nothing to judge. The true cron-eligible count is `≤ pending` — same shape as the cron's own log line.

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

- `mode=all` (default) — re-queries every **unsettled** enrichable field. Skipped: (a) `ChangedByUser` with shape-valid `Team.<field>` (user-owned), AND (b) `Enriched` with shape-valid `Team.<field>` (previously judge-promoted at `agrees + high`). See the [Force mode](#enrichment-behavior) write-up for the full rationale.
- `mode=cannotEnrich` — retries only fields whose prior status was `CannotEnrich`. Leaves `Enriched` fields untouched.

User-edited fields (`ChangedByUser`) are never overwritten in either mode.
Returns `{ success, message }` on success, or `{ success: false, message }` if enrichment is already in progress. Does NOT require `IS_TEAM_ENRICHMENT_ENABLED`.

### Force Re-Enrichment for All Completed Teams

```
POST /v1/admin/teams/trigger-force-enrichment?mode=all|cannotEnrich
Guard: AdminAuthGuard
```

Finds all teams matching the shared eligibility filter (`TEAM_ENRICHMENT_FILTER_PRIORITY` and/or `TEAM_ENRICHMENT_FILTER_IS_FUND`) with `status ∈ { Enriched, Reviewed, Approved, FailedToEnrich }` and re-queues them using the same `mode` semantics as the single-team variant.
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

Runs the single-team refetch for every team matching the shared eligibility filter (`TEAM_ENRICHMENT_FILTER_PRIORITY` and/or `TEAM_ENRICHMENT_FILTER_IS_FUND`) with a non-empty `website` or `linkedinHandler`, regardless of current enrichment status. Teams whose logo is `ChangedByUser`, whose enrichment is `InProgress`, or which have no fetchable source are skipped with per-bucket counters.
Returns `{ success, total, started, skippedInProgress, skippedUserOwned, noSource, notFound, message }`.

### AI Cost Report

```
GET /v1/admin/teams/ai-report?since=<ISO8601>&page=<int>&pageSize=<int>
Guard: AdminAuthGuard
```

Aggregated AI token usage + USD cost across all teams that have a `TeamEnrichment.dataEnrichment.usage` block. Teams are sorted by combined cost desc and paginated.

- `since` (optional) — filter per-stage by `lastRunAt >= since`. Each stage is filtered independently, so a team's enrichment run can be in-window while its judge run is out-of-window.
- `page` (optional, default `1`) — 1-based page index for the `teams` list. Out-of-range pages clamp to the last available page.
- `pageSize` (optional, default `10`, capped at `100`) — items per page for the `teams` list.

> **Important:** `totals` and `byModel` are always computed over the full filtered result set, **not** the current page. Pagination only narrows the `teams` array.

Response shape:

```ts
{
  generatedAt: string,
  filter: { since: string | null },
  pagination: { page, pageSize, totalTeams, totalPages },
  totals: {
    teamsWithUsage: number,                                        // == pagination.totalTeams
    enrichment: { teams, runs, inputTokens, outputTokens, cachedInputTokens, totalTokens, costUsd },
    judge:      { teams, runs, inputTokens, outputTokens, cachedInputTokens, totalTokens, costUsd },
    grandTotal: { totalTokens, costUsd }
  },
  byModel: Array<{ aiModel, stage: 'enrichment' | 'judge', teams, runs, totalTokens, costUsd }>,
  teams:   Array<{ uid, name, enrichment: AIUsageEntry | null, judge: AIUsageEntry | null, grandTotalCostUsd }>
}
```

Implementation reads `TeamEnrichment.dataEnrichment.usage` in-memory across all `TeamEnrichment` rows, sorts and paginates in the service. Pagination is presentation-only — the underlying scan is always the full set, so `since` is the right knob when you want to narrow the actual computation. No cron/scheduler — call the endpoint when you want a fresh report.

### Team Lead Review

```
PATCH /v1/teams/:uid/enrichment-review
Guard: UserTokenValidation
Body: { status: 'Reviewed' | 'Approved' }
Validates requestor is team lead of the team
```

## User Change Tracking

### Governing invariant

**If a field has a *structurally valid* value on `Team` and its prior `fieldsMeta[field].status` is not `Enriched`, it is user-owned. Enrichment never overwrites it (on either `Team` or `TeamEnrichment`) and marks it `ChangedByUser`.**

The "structurally valid" qualifier is enforced by [`isLikelyValueForField`](#value-validity-gate-per-field-shape-check) — the same per-field shape validator the judge uses. A `Team` value that doesn't pass its field's shape (`"Coming soon!"` on `website`, `"n/a"` on `contactMethod`, `"email"` typed into `contactMethod`, etc.) is treated as **effectively empty** by both the user-owned guard and the `ChangedByUser` short-circuit. This means:

- A user value of `"Coming soon!"` on `website` does NOT block enrichment. The AI pipeline runs, fills `TeamEnrichment.website` with a real URL, status flips to `Enriched`, and the judge promotes the AI value to `Team.website` on the next run — overwriting the junk placeholder. The enrichment log records this under `userJunkOverridden=[website,...]` for audit.
- If the user typed junk by mistake AND the AI's replacement isn't high-confidence, the field surfaces in `/v1/admin/teams/enrichment-review` like any other AI-supplied `Enriched` field — admin can confirm or edit.
- A user value that *does* pass shape validation (e.g. an actual URL on `website`, an actual email on `contactMethod`) keeps the existing protection: enrichment never overwrites it.

This rule applies in both standard and force modes. Force mode can re-query fields marked `Enriched` (AI-owned, candidate value lives on `TeamEnrichment`), but it will not touch any *structurally valid* user value on `Team` — including on a team's very first enrichment where no `TeamEnrichment` row exists yet.

**User-owned = highest-confidence truth.** Beyond write-protection, user-owned fields also bypass downstream verification when used as seeds:

- `linkedinHandler` (ChangedByUser) → skips `verifyScrapingDogEntity` fuzzy team-name match. The user has already asserted this handle belongs to them, so ScrapingDog's company profile is accepted without the team-name check (applies in both `maybeEnrichViaScrapingDog` and the logo refetch path).
- `industryTags` (ChangedByUser, including user-cleared sets) is never treated as a ScrapingDog gap.
- `website` existence on `Team` already causes `verifyEntityIdentity` to be skipped for the AI-enrichment pass, so user-owned websites are implicitly trusted.

All three of these bypasses require the user value to pass the shape gate. Junk-shaped values don't get the seed-trust treatment — they're treated as if the field were empty, so verification still happens.

The shared `isFieldUserOwned(fieldsMeta, field, teamValue)` helper at the top of `team-enrichment.service.ts` encodes the "ChangedByUser OR non-empty-on-Team-with-no-meta, AND value passes shape gate" check used throughout. The helper takes the actual value (not just a boolean) so it can run the shape validator. Note that "non-empty" is evaluated against `Team`, not `TeamEnrichment` — what matters is what the user/judge actually sees.

### Where `ChangedByUser` is written

1. **During any enrichment run** — when the loop encounters a scalar field / `industryTags` / `investmentFocus` / `logo` that is non-empty on `Team`, **passes the per-field shape gate**, and has no prior `Enriched` status, it writes `fieldsMeta[field] = { ..., status: ChangedByUser }` on `TeamEnrichment.dataEnrichment`. Covers pre-existing user data on a first-ever run (whether triggered by cron or by force-enrichment) and any orphan user-supplied values that bypassed the team-update flow. Junk-shaped values (failing the shape gate) are treated as effectively empty here too — they don't get the `ChangedByUser` stamp and they DO get re-enriched.
2. **When a user edits an AI-filled field on `Team`** — `handleUserFieldChange()` flips `Enriched → ChangedByUser` for modified fields in `TeamEnrichment.dataEnrichment.fieldsMeta` (called from `updateTeamFromParticipantsRequest()` when the team has `isAIGenerated=true`).
3. **When a user fills in a `CannotEnrich` field** — `handleUserFieldChange()` also flips `CannotEnrich → ChangedByUser` when the user supplies a non-empty value for a field AI had previously given up on.

`confidence` and `source` from any prior status are preserved as provenance across the status flip. The candidate value on `TeamEnrichment.<field>` (if any) is left alone — it's now informational (the user's value is on `Team`), but the metadata flip means the next enrichment run will skip it.

## Environment Variables

| Variable                            | Default                    | Description                                                                                                                                                                                                |
| ----------------------------------- |----------------------------| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `IS_TEAM_ENRICHMENT_ENABLED`        | `false`                    | Enable/disable all enrichment-related cron jobs (enrichment, marking, judge)                                                                                                                               |
| `TEAM_ENRICHMENT_FILTER_PRIORITY`   | _(unset)_                  | Comma-separated list of `Team.priority` values (e.g. `1,2,3`). When set, contributes a `priority IN (...)` clause to the eligibility filter. See [Eligibility filter](#eligibility-filter).                |
| `TEAM_ENRICHMENT_FILTER_IS_FUND`    | _(unset)_                  | `'true'` / `'false'` (case-insensitive). When `'true'`, contributes an `isFund = true` clause to the eligibility filter. See [Eligibility filter](#eligibility-filter).                                    |
| `AI_PROVIDER`                       | `gemini`                   | Global default AI provider. Accepts `openai`, `gemini`, or `anthropic`.                                                                                                                                    |
| `TEAM_ENRICHMENT_AI_PROVIDER`       | —                          | Overrides `AI_PROVIDER` for team enrichment only. Accepts `openai`, `gemini`, or `anthropic`.                                                                                                              |
| `TEAM_ENRICHMENT_JUDGE_AI_PROVIDER` | —                          | Overrides `AI_PROVIDER` for the AI Judge only. Set to a **different** value from `TEAM_ENRICHMENT_AI_PROVIDER` for a meaningful second-opinion verification (e.g. enrichment=`gemini`, judge=`anthropic`). |
| `OPENAI_LLM_MODEL`                  | `gpt-4o`                   | OpenAI model                                                                                                                                                                                               |
| `GEMINI_MODEL`                      | `gemini-2.5-flash`         | Gemini model                                                                                                                                                                                               |
| `CLAUDE_API_KEY`                    | —                          | Anthropic API key. Required when the resolved provider is `anthropic`. Falls back to `ANTHROPIC_API_KEY` for SDK-default compatibility.                                                                    |
| `CLAUDE_MODEL`                      | `claude-sonnet-4-6`        | Claude model. Also accepts `ANTHROPIC_MODEL`.                                                                                                                                                              |
| `TEAM_ENRICHMENT_CRON`              | `*/5 * * * *`              | Cron schedule for the enrichment job                                                                                                                                                                       |
| `TEAM_ENRICHMENT_MARKING_CRON`      | `0 2 * * *`                | Cron schedule for auto-marking eligible teams                                                                                                                                                              |
| `TEAM_ENRICHMENT_JUDGE_CRON`        | `0 4 * * *`                | Cron schedule for the AI Judge second-pass verification job                                                                                                                                                |
| `TEAM_ENRICHMENT_STUCK_TTL_MINUTES` | `180`                      | Stale-`InProgress` TTL in minutes. Rows whose enrichment or judgment status has been `InProgress` longer than this are auto-reset on the next `findTeamsPending*` call (cron tick or `trigger-*-all`). See [Stale `InProgress` recovery](#stale-inprogress-recovery). |
| `SCRAPINGDOG_API_KEY`               | —                          | ScrapingDog LinkedIn API key. When set, enables the ScrapingDog fallback for teams with a known `linkedinHandler`.                                                                                         |
| `IS_LOGO_VERIFICATION_ENABLED`      | `false`                    | Enable/disable the Logo Verification cron. Independent of `IS_TEAM_ENRICHMENT_ENABLED`.                                                                                                                    |
| `LOGO_VERIFICATION_CRON`            | `0 */6 * * *`              | Cron schedule for the Logo Verification job (every 6 hours UTC by default).                                                                                                                                |
| `LOGO_VERIFICATION_BATCH_SIZE`      | `20`                       | Max teams pulled per Logo Verification tick. Sequential per-team to keep VLM rate-limits manageable.                                                                                                       |
| `LOGO_VERIFICATION_FORCE_UPDATE`    | `false`                    | When `true`, bypasses the per-team `shouldVerifyTeam` gate and re-verifies every batched team regardless of prior results.                                                                                 |
| `LOGO_VLM_PROVIDER`                 | `gemini`                   | Vision-language model provider for Logo Verification. Accepts `gemini`, `openai`, or `anthropic`. Independent of `AI_PROVIDER`.                                                                            |
| `GEMINI_LOGO_VERIFICATION_MODEL`    | `gemini-2.5-flash`         | Gemini model used by the Logo Verification job when `LOGO_VLM_PROVIDER=gemini`.                                                                                                                            |
| `OPENAI_LOGO_VERIFICATION_MODEL`    | `gpt-4.1-mini`             | OpenAI model used by the Logo Verification job when `LOGO_VLM_PROVIDER=openai`.                                                                                                                            |
| `ANTHROPIC_LOGO_VERIFICATION_MODEL` | `claude-3-5-sonnet-latest` | Anthropic model used by the Logo Verification job when `LOGO_VLM_PROVIDER=anthropic`.                                                                                                              |

### Eligibility filter

Two env vars gate which teams the marking cron, force-enrich-all, force-logo-refetch-all, and the judge cron operate on. Each is independently optional, and active filters compose with **OR** — i.e. a team qualifies if it matches any active clause.

- `TEAM_ENRICHMENT_FILTER_PRIORITY` — comma-separated list of `Team.priority` values (e.g. `1,2,3`). Active when set to a non-empty list of integers. Adds `priority IN (...)`.
- `TEAM_ENRICHMENT_FILTER_IS_FUND` — `'true'` / `'false'` (case-insensitive). Active when set to `'true'`. Adds `isFund = true`.

If neither filter is active, eligibility falls back to `isFund = true` (preserves behavior of deployments predating `TEAM_ENRICHMENT_FILTER_IS_FUND`).

| Use case                                | `TEAM_ENRICHMENT_FILTER_PRIORITY` | `TEAM_ENRICHMENT_FILTER_IS_FUND` | Resulting WHERE clause                     |
| --------------------------------------- | --------------------------------- | -------------------------------- | ------------------------------------------ |
| Default — fund teams only (back-compat) | _(unset / empty)_                 | _(unset)_                        | `isFund = true`                            |
| Fund teams only (explicit)              | _(unset / empty)_                 | `true`                           | `isFund = true`                            |
| P1/P2/P3 teams only                     | `1,2,3`                           | _(unset or `false`)_             | `priority IN (1, 2, 3)`                    |
| Only P1 teams                           | `1`                               | _(unset or `false`)_             | `priority IN (1)`                          |
| Fund teams **plus** P1/P2/P3 teams      | `1,2,3`                           | `true`                           | `priority IN (1, 2, 3) OR isFund = true`   |

This filter does **not** affect single-team admin endpoints (`POST /v1/admin/teams/:uid/trigger-enrichment` etc.) — those are explicit overrides and run on whatever uid is provided. Path A (Demo Day approval) and Path B (participants-request team creation) are also unaffected; they continue to mark fund / new-L1 teams regardless of these env vars.

### AI provider selection

The enrichment pipeline supports three providers: **OpenAI**, **Gemini**, and **Anthropic (Claude)**. The effective provider is resolved per request: `TEAM_ENRICHMENT_AI_PROVIDER` wins if set, otherwise the global `AI_PROVIDER`, otherwise `gemini`. The resolved model id is written to `dataEnrichment.aiModel` for telemetry.

Web search behaviour differs by provider:

- **OpenAI** — uses the Responses API `web_search_preview` tool.
- **Gemini** — uses model-level search grounding (no tool object).
- **Anthropic** — Claude receives a provider-defined `web_search` tool in the shape the AI SDK accepts. Note that `@ai-sdk/anthropic@1.x` does not yet forward this tool to the Anthropic API, so the SDK emits an `unsupported-tool` warning and Claude answers from training knowledge. The call shape is kept forward-compatible so that a future SDK upgrade enables server-side web search without code changes.

## AI Token Usage & Cost Tracking

Each AI call (enrichment + judge) captures `usage` and `experimental_providerMetadata` from the Vercel AI SDK and converts them to a USD estimate via the per-model price table in `team-enrichment-cost.ts`. Token counts are persisted on the team; cost is logged and persisted alongside.

### Persisted shape

`TeamEnrichment.dataEnrichment.usage` carries one entry per stage. Both keys are optional — pre-tracking teams will not have them.

```ts
TeamEnrichment.dataEnrichment.usage?: {
  enrichment?: {
    inputTokens, outputTokens, cachedInputTokens?, totalTokens,
    costUsd,            // estimate from PRICING_TABLE; raw counts are the source of truth
    aiModel,
    durationMs,         // generateText wall-clock, summed across runs
    runs,               // accumulates on force-enrichment / retries
    lastRunAt           // ISO timestamp of most recent call
  },
  judge?: { …same shape… }
}
```

`runs` and `durationMs` accumulate; `costUsd` is summed from the per-call estimate. A force-re-enrichment of a team produces `runs: 2`, summed tokens, summed cost, and the latest `lastRunAt`.

### Pricing table

`team-enrichment-cost.ts` keeps published per-1M-token rates for the models we run (Gemini 2.5 Flash/Pro, GPT-4o family, Claude Sonnet/Opus/Haiku 4.x). Lookup is exact id first, then prefix match (so `claude-sonnet-4-5-20250929` resolves to the `claude-sonnet-4` row). Unknown models log a `warn` and produce `costUsd: 0` — that's the signal to add a row.

Cost numbers are estimates: provider pricing changes, web-search-grounding fees aren't reflected in `usage`, and cached-token discount tiers vary by provider. Treat `costUsd` as a budget signal; the persisted token counts let you re-derive cost later if rates change.

**Maintenance cadence.** The table needs updating only a few times per year — token counts are exact and persisted, so stale rates affect `costUsd` estimates only, never historical accuracy.

| Provider  | Typical change frequency               | Triggers                                                                                  |
| --------- | -------------------------------------- | ----------------------------------------------------------------------------------------- |
| OpenAI    | Every 6–18 months                      | Major model launches (4o → 4.1) and occasional re-pricings of existing models.            |
| Anthropic | Stable across a generation             | New model rows when a tier ships (Sonnet 4.6, Opus 4.7); rarely re-prices existing rows.  |
| Gemini    | Most volatile — adjusted in 2025       | Watch the [pricing page](https://ai.google.dev/pricing) when bumping `GEMINI_MODEL`.      |

Recommended workflow: when a `WARN` log appears with `No pricing entry for model "<id>"`, that's the action item — add a row to `PRICING_TABLE`. No need to monitor proactively. If a provider repricies an existing model, edit the corresponding row; historical `costUsd` won't be backfilled (it's an estimate, and the underlying token counts remain accurate for re-derivation).

### Logging

Three structured log granularities, all keyword-style for grep / Loki / Datadog ingestion:

1. **Per-AI-call** (one line per `generateText` invocation, in both AI services):
   ```
   AI enrichment call team="<name>" stage=enrichment ok=true model=gemini-2.5-flash
     inputTokens=… outputTokens=… cachedInputTokens=… totalTokens=… costUsd=…
     durationMs=… runs=1
   ```
   On failure, the line is logged at `error` with `ok=false error="…"`. If the SDK doesn't return a usage object (rare; cached/streamed paths), the line is logged at `warn` with `usage=unavailable`.

2. **Per-team rollup** (one line at the end of each `doEnrichTeam` / `runJudgmentPipeline` after the persisted usage block has been written):
   ```
   Enrichment usage rollup team=<uid> name="<name>" stage=enrichment <…same fields…>
   Judge usage rollup     team=<uid> name="<name>" stage=judge      <…same fields…>
   ```
   `runs` here reflects the cumulative count, so it answers "what has this team cost in total" rather than "what did this single call cost".

3. **Per-cron summary** — the existing "job completed: N enriched / failed" line now ends with a pointer to the per-team rollup lines. Cron-level totals are intentionally **not** computed inline because both `enrichTeam` and `judgeTeam` fire background pipelines and return immediately; aggregating in-process would change that contract. For session-level spend, query the persisted `TeamEnrichment.dataEnrichment.usage` (sum across teams enriched in a window) or aggregate the per-team rollup logs by timestamp.

### Caveats

- `costUsd` excludes search-grounding fees (Gemini grounding, OpenAI Responses web-search-preview, Anthropic provider-defined web_search).
- ScrapingDog calls are not in this telemetry — those have a separate vendor billing channel.
- The `usage` block is cumulative across re-runs; if you want per-run detail, the per-AI-call log lines are the source.

## Module Structure

```
apps/web-api/src/team-enrichment/
  team-enrichment.types.ts          # Enums, interfaces, enrichable fields (incl. JudgmentSource.Corroboration, WebsiteSignals, TeamQuality)
  team-enrichment-eligibility-filter.ts # Shared isFund/priority WHERE filter for cron + admin queries
  team-enrichment-cost.ts           # AI usage → USD estimator + pricing table + log formatter
  team-enrichment-http.util.ts      # BROWSER_USER_AGENT + BROWSER_REQUEST_HEADERS (Cloudflare-safe bouquet)
  team-enrichment-field-shape.util.ts # Per-field shape validator — rejects placeholders by structure
  team-enrichment-corroboration.ts  # Stage 1.5 pure-function rules (source-trust + per-field anchors)
  team-enrichment-quality.ts        # 6-dimension team quality + thin-evidence flag
  team-enrichment-lead-backfill.ts  # Enrichment-stage backfill from team-lead Members (identity-matched, no AI)
  team-enrichment-ai.service.ts     # Enrichment LLM wrapper + logo scraping + website signal extractor
  team-enrichment-scrapingdog.service.ts # LinkedIn fallback + X profile verification (fetchTwitterProfile + verifyTwitterProfileMatchesTeam)
  team-enrichment-scrapingdog.service.spec.ts # X profile fetcher + verification anchors coverage
  team-enrichment.service.ts        # Core enrichment business logic (persists websiteSignals, applies lead backfill)
  team-enrichment.job.ts            # Enrichment + marking cron jobs
  team-enrichment-judge-ai.service.ts # Judge LLM wrapper (independent model) — also renders Cross-source signals + Corroboration blocks into the prompt
  team-enrichment-judge.service.ts  # Two/three-stage judgment pipeline orchestration (Stage 1 ScrapingDog + Stage 1.5 corroboration + Stage 2 AI)
  team-enrichment-judge.job.ts      # Judge cron job
  team-enrichment-promotion.ts      # Promotion payload builder + executor (TeamEnrichment → Team)
  team-enrichment-report.service.ts # Aggregator behind GET /v1/admin/teams/ai-report
  bench-judge.ts                    # Standalone Nest bootstrap that re-judges every team in `bench_team_uid` (prod-data bench runner)
  bench-judge-single.ts             # Single-team variant of bench-judge.ts (pass `BENCH_TEAM_UID=<uid>` to validate one team without burning the full bench)
  prod_data/                        # Imported prod data + compare.sql for the review-queue reduction bench
  team-enrichment-corroboration.spec.ts # Eval bench — pinned precision/recall on labelled corroboration fixtures
  team-enrichment-field-shape.util.spec.ts # Shape-validator coverage (placeholders + short legit handles)
  team-enrichment-lead-backfill.spec.ts # Lead-backfill coverage (identity-matched accepts, personal-info rejects)
  logo-verification.types.ts        # Verdict / confidence / quality types for the VLM pass
  logo-verification.service.ts      # VLM wrapper (gemini / openai / anthropic) + image prep
  logo-verification-persistence.service.ts # Candidate selection + shouldVerify gate + TeamLogoVerificationResult writes
  logo-verification-job.service.ts  # Logo Verification cron job
  logo-verification.controller.ts   # On-demand /team-enrichment/verify-logo* endpoints
  team-enrichment.module.ts         # NestJS module
```

## Dependencies

- `TeamEnrichmentModule` is imported by: `AppModule`, `DemoDaysModule`, `TeamsModule`, `AdminModule`, `ParticipantsRequestModule`
- Uses `forwardRef` for `TeamsModule` circular dependency
- AI: `ai` + `@ai-sdk/openai` + `@ai-sdk/google` + `@ai-sdk/anthropic` packages
- Logo extraction: `open-graph-scraper`
- File upload: `FileUploadService` from `SharedModule` (global)

## Migration from the legacy `Team.dataEnrichment` column

The `Team.dataEnrichment` JSONB column was removed by migration `20260511120000_add_team_enrichment`. The migration is single-transaction:

1. `CREATE TABLE TeamEnrichment`.
2. `INSERT INTO TeamEnrichment` from each Team that had a non-null `dataEnrichment`. For every field whose `fieldsMeta[field].status === 'Enriched'`, the migration copies the value from `Team` / `InvestorProfile` / the IndustryTag M2M to `TeamEnrichment` as the AI candidate. ChangedByUser values are never copied — they're the user's value, not an AI candidate.
3. `UPDATE Team SET <scalar> = NULL` for every enriched scalar field whose verdict isn't `agrees + high` (i.e. anything the judge hadn't already promoted to high confidence). ChangedByUser is preserved by the `status === 'Enriched'` guard. Relational fields on `Team` (industryTags M2M, InvestorProfile.investmentFocus) are intentionally NOT cleared — the candidate copy lives on `TeamEnrichment` and the judge will overwrite the Team side when it next confirms at high confidence; clearing them blindly would destroy any user-curated tags.
4. `ALTER TABLE Team DROP COLUMN "dataEnrichment"`.

After the migration runs, all enrichment metadata + AI candidates live on `TeamEnrichment`, and `Team` contains only judge-confirmed high-confidence values + user data.
