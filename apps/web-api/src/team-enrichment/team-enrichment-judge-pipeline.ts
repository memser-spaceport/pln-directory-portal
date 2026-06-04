/**
 * Typed registry of the judge's verification rules.
 *
 * The pipeline runs rules in **cost-tier order** — cheap deterministic checks
 * first, the expensive AI judge last. As soon as a rule emits an `agrees+high`
 * (or `disagrees+low`) verdict for a field, that field is considered resolved
 * and never reaches the more expensive tiers.
 *
 * This is the canonical place to add new judge logic. To add a rule:
 *   1. Implement a `(value, ctx) => FieldJudgment | null` function (typically
 *      in team-enrichment-corroboration.ts for Stage 1.5 rules).
 *   2. Wrap it in a `JudgeRule` and add to STAGE_1_5_RULES below, keyed by
 *      the field key(s) it applies to.
 *   3. The dispatch in `runCorroboration` consumes this registry — no extra
 *      wiring needed.
 *
 * Why a registry: makes rule ordering, applicability and cost tier explicit
 * and inspectable. Telemetry, admin tools and tests can introspect the
 * registry instead of grepping switch statements.
 */

import {
  CorroborationContext,
  CorroborationFieldInput,
  corroborateBlog,
  corroborateBySource,
  corroborateContactMethod,
  corroborateLinkedinHandler,
  corroborateTelegramHandler,
  corroborateTwitterHandler,
  corroborateWebsite,
} from './team-enrichment-corroboration';
import { FieldJudgment, FieldMetaKey } from './team-enrichment.types';

/**
 * Verification cost ladder. Lower tier = run first (cheaper, faster, more
 * deterministic). Higher tier = run last (expensive, slower, fuzzier).
 */
export enum JudgeCostTier {
  /** Provenance check on already-stored enrichment metadata. Effectively zero cost. */
  SOURCE_TRUST = 0,
  /** Pure functions over signals already on hand (Team scalars, websiteSignals, ScrapingDog meta). */
  DETERMINISTIC = 1,
  /** One network probe (HTTP HEAD/GET against the team's website) — runs at pipeline start. */
  NETWORK_PROBE = 2,
  /** External deterministic API call (ScrapingDog LinkedIn / X profile). */
  SCRAPING_API = 3,
  /** LLM-based verification with web search grounding. Highest cost, lowest determinism. */
  AI = 4,
}

/**
 * Verdict the rule emits when it fires. `null` means "rule did not match" —
 * the field falls through to the next rule (or, eventually, the AI judge).
 */
export type JudgeRuleVerdict = FieldJudgment | null;

/** Input passed to every Stage 1.5 corroboration rule. */
export interface JudgeRuleInput {
  field: FieldMetaKey;
  value: string | null;
  source?: string;
  enrichmentConfidence?: string;
  isUserOwned?: boolean;
}

/**
 * A single judge rule. The same shape is used for source-trust, every
 * deterministic corroboration check, and (conceptually) the ScrapingDog and
 * AI tiers — though the latter two have their own orchestration in
 * team-enrichment-judge.service.ts because they need separate I/O.
 */
export interface JudgeRule {
  /** Stable identifier — appears in telemetry, admin tools, and judgment notes. */
  name: string;
  /** Position in the cost ladder. Drives execution order. */
  costTier: JudgeCostTier;
  /**
   * Field keys this rule applies to. `'*'` runs on every field (used by the
   * source-trust rule, which is field-agnostic).
   */
  appliesTo: ReadonlyArray<FieldMetaKey> | '*';
  /** Short documentation string. Surface this in admin UI / docs. */
  description: string;
  /** Pure synchronous evaluation. Receives the field value + full context. */
  run(input: JudgeRuleInput, ctx: CorroborationContext): JudgeRuleVerdict;
}

// ─── Stage 1.5 registry ─────────────────────────────────────────────────────

/**
 * Runs FIRST for every field — accept the enrichment-time value when it came
 * from a trusted deterministic source (ScrapingDog, open-graph) at high
 * confidence. No need to re-verify what we already verified at enrichment.
 */
const SOURCE_TRUST_RULE: JudgeRule = {
  name: 'source-trust',
  costTier: JudgeCostTier.SOURCE_TRUST,
  appliesTo: '*',
  description: 'Promote values previously written by a trusted deterministic source (scrapingdog, open-graph) at high confidence.',
  run: ({ field, source, enrichmentConfidence }) =>
    corroborateBySource(source, enrichmentConfidence, field),
};

const CONTACT_METHOD_RULE: JudgeRule = {
  name: 'contactMethod corroboration',
  costTier: JudgeCostTier.DETERMINISTIC,
  appliesTo: ['contactMethod'],
  description:
    'Verify email domain ↔ website host, founder-contact cross-reference, brand-alias domain, team-owned-channel self-declaration, invite-slug team-name match, or user-trusted fallback.',
  run: ({ value, isUserOwned }, ctx) => corroborateContactMethod(value, ctx, { isUserOwned }),
};

const TWITTER_RULE: JudgeRule = {
  name: 'twitterHandler corroboration',
  costTier: JudgeCostTier.DETERMINISTIC,
  appliesTo: ['twitterHandler'],
  description: 'Verify against website-declared twitter handle, handle prefix-matches a substantive team token, or user-trusted fallback.',
  run: ({ value, isUserOwned }, ctx) => corroborateTwitterHandler(value, ctx, { isUserOwned }),
};

const LINKEDIN_RULE: JudgeRule = {
  name: 'linkedinHandler corroboration',
  costTier: JudgeCostTier.DETERMINISTIC,
  appliesTo: ['linkedinHandler'],
  description: 'Verify against website-declared LinkedIn slug, slug prefix-matches a substantive team token, or user-trusted fallback.',
  run: ({ value, isUserOwned }, ctx) => corroborateLinkedinHandler(value, ctx, { isUserOwned }),
};

const TELEGRAM_RULE: JudgeRule = {
  name: 'telegramHandler corroboration',
  costTier: JudgeCostTier.DETERMINISTIC,
  appliesTo: ['telegramHandler'],
  description: 'Verify against website-declared Telegram handle, handle prefix-matches a substantive team token, or user-trusted fallback.',
  run: ({ value, isUserOwned }, ctx) => corroborateTelegramHandler(value, ctx, { isUserOwned }),
};

const BLOG_RULE: JudgeRule = {
  name: 'blog corroboration',
  costTier: JudgeCostTier.DETERMINISTIC,
  appliesTo: ['blog'],
  description: 'Verify blog URL shares host (or subdomain-of) the website, platform handle matches team token, host first-label matches team token, or user-trusted fallback (custom domain only).',
  run: ({ value, isUserOwned }, ctx) => corroborateBlog(value, ctx, { isUserOwned }),
};

const WEBSITE_RULE: JudgeRule = {
  name: 'website corroboration',
  costTier: JudgeCostTier.DETERMINISTIC,
  appliesTo: ['website'],
  description: 'Verify host first-label / og:site_name / jsonld Organization.name / ScrapingDog profile host matches the team name (or user-trusted fallback) AND the site is not a definitive 4xx/5xx.',
  run: ({ value, isUserOwned }, ctx) => corroborateWebsite(value, ctx, { isUserOwned }),
};

/**
 * Ordered registry — the dispatcher walks this in array order and stops on
 * the first non-null verdict per field. SOURCE_TRUST_RULE goes first because
 * it's field-agnostic and effectively free (just reads metadata already
 * loaded). Field-specific rules follow.
 *
 * To add a new rule: append it here (or insert at a specific tier position).
 * Tests in team-enrichment-corroboration.spec.ts assert per-rule behavior
 * via the underlying corroborate* functions, so they keep passing as long
 * as the run() wrapper is faithful.
 */
export const STAGE_1_5_RULES: readonly JudgeRule[] = [
  SOURCE_TRUST_RULE,
  CONTACT_METHOD_RULE,
  TWITTER_RULE,
  LINKEDIN_RULE,
  TELEGRAM_RULE,
  BLOG_RULE,
  WEBSITE_RULE,
];

/**
 * Dispatches Stage 1.5 rules over the supplied fields, returning a verdict
 * map. Replaces the old switch-based dispatcher.
 */
export function runStage15Rules(
  fields: CorroborationFieldInput[],
  ctx: CorroborationContext
): Partial<Record<FieldMetaKey, FieldJudgment>> {
  const out: Partial<Record<FieldMetaKey, FieldJudgment>> = {};
  for (const f of fields) {
    // Array-valued fields (industryTags, investmentFocus) have no Stage 1.5
    // rule — fall through to AI. Convert to JudgeRuleInput shape.
    if (Array.isArray(f.value)) continue;
    const input: JudgeRuleInput = {
      field: f.field,
      value: f.value,
      source: f.source,
      enrichmentConfidence: f.enrichmentConfidence,
      isUserOwned: f.isUserOwned,
    };
    for (const rule of STAGE_1_5_RULES) {
      if (rule.appliesTo !== '*' && !rule.appliesTo.includes(f.field)) continue;
      const verdict = rule.run(input, ctx);
      if (verdict) {
        out[f.field] = verdict;
        break;
      }
    }
  }
  return out;
}

/** Back-compat alias used by team-enrichment-judge.service.ts and tests. */
export const runCorroboration = runStage15Rules;

// ─── Higher-tier rule descriptors (documentation; orchestrated elsewhere) ──

/**
 * Stage 1: LinkedIn company profile lookup via ScrapingDog. Implemented as a
 * tier in TeamEnrichmentJudgeService.runJudgmentPipeline because it requires
 * per-team API I/O. Surfaced here so the registry is the single source of
 * truth on what rules exist + how they're ordered.
 */
export const STAGE_1_DESCRIPTOR = {
  name: 'scrapingdog linkedin',
  costTier: JudgeCostTier.SCRAPING_API,
  appliesTo: ['linkedinHandler', 'shortDescription', 'longDescription', 'industryTags', 'moreDetails'] as const,
  description:
    'Fetch the LinkedIn company profile and run deterministic field comparators (name match, tagline overlap, about sentence overlap, industry set intersection, founded/HQ contains).',
};

export const WEBSITE_PROBE_DESCRIPTOR = {
  name: 'website reachability probe',
  costTier: JudgeCostTier.NETWORK_PROBE,
  appliesTo: ['website'] as const,
  description:
    'HTTP fetch with browser-mimic headers. Three-state result (reachable | not-reachable | unknown). Definitive 4xx/5xx blocks the website corroboration rule; bot-block codes treated as unknown.',
};

export const STAGE_2_DESCRIPTOR = {
  name: 'ai judge',
  costTier: JudgeCostTier.AI,
  appliesTo: '*' as const,
  description:
    'LLM verification with web-search grounding for fields the cheaper tiers could not resolve. Runs in TeamEnrichmentJudgeAiService.judgeTeamFields with maxSteps=3, low temperature.',
};

/**
 * Full ordered tier listing for documentation, telemetry, and admin tools.
 * NOT a callable dispatcher — Stage 1 / probe / Stage 2 are orchestrated in
 * the judge service because they need I/O and per-stage merge logic.
 */
export const JUDGE_TIER_REGISTRY = [
  WEBSITE_PROBE_DESCRIPTOR,
  STAGE_1_DESCRIPTOR,
  SOURCE_TRUST_RULE,
  CONTACT_METHOD_RULE,
  TWITTER_RULE,
  LINKEDIN_RULE,
  TELEGRAM_RULE,
  BLOG_RULE,
  WEBSITE_RULE,
  STAGE_2_DESCRIPTOR,
] as const;
