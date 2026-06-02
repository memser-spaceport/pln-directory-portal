/**
 * Stage 1.5 — Deterministic Cross-Field Corroboration.
 *
 * Sits between Stage 1 (ScrapingDog LinkedIn match) and Stage 2 (AI judge).
 * Pure functions only: no I/O, no LLM, no time-dependent state. For each
 * judgable field, evaluates a small set of cross-source corroboration rules
 * using the anchors already on hand (team scalars, the website-extracted
 * `WebsiteSignals` block, and the ScrapingDog company profile).
 *
 * Doctrine ported from `pln-data-enrichment/apps/signal-sourcing`:
 *   - Skip rather than guess: a rule only emits a verdict when ≥2 distinct
 *     anchors converge. Fields with no corroboration fall through to the AI
 *     judge (no verdict emitted here).
 *   - Explainability: every verdict carries a hyphenated `note` listing
 *     which anchors fired (e.g. "email-domain==website", "og-name-match+sd-host").
 *   - Same promotion gate as the rest of the judge: an `agrees + high` verdict
 *     short-circuits the AI judge AND promotes the value to `Team.<field>`.
 *
 * The most impactful rule is `contactMethod` email-domain ↔ website-host:
 * it eliminates the dominant false-positive class where the AI judge marks a
 * team's self-declared email as `disagrees` because LinkedIn lists a
 * different one. Both signals come from the team's own assets.
 */

import {
  FieldConfidence,
  FieldJudgment,
  FieldMetaKey,
  JudgmentSource,
  JudgmentVerdict,
  NameMatchTier,
  WebsiteSignals,
} from './team-enrichment.types';
import { ScrapingDogCompanyProfile } from './team-enrichment-scrapingdog.service';

/** Snapshot of every anchor the corroboration rules can consult. */
export interface CorroborationContext {
  teamName: string;
  /** Current website value being judged (Team or TeamEnrichment, whichever is canonical). */
  website?: string | null;
  /** Probe result from the judge pipeline. true = 2xx, false = definitive 4xx/5xx, null = unknown. */
  websiteReachable?: boolean | null;
  /** Second source: signals scraped from the team's own website HTML. */
  websiteSignals?: WebsiteSignals | null;
  /** Third source: LinkedIn company profile via ScrapingDog. */
  scrapingDogProfile?: ScrapingDogCompanyProfile | null;
  /** ScrapingDog name-match tier — gates whether sd-profile signals are trusted. */
  scrapingDogNameMatch?: NameMatchTier | null;
}

/** Stopword list used for substantive-token name overlap (mirrors pln-data-enrichment). */
const COMPANY_STOPWORDS = new Set([
  'inc',
  'llc',
  'ltd',
  'co',
  'corp',
  'corporation',
  'company',
  'the',
  'and',
  'of',
  'for',
  'lab',
  'labs',
  'ai',
  'io',
  'app',
  'apps',
  'team',
  'group',
  'network',
  'protocol',
  'foundation',
  'ventures',
  'capital',
  'partners',
  'fund',
  'studio',
  'studios',
  'project',
  'platform',
  'systems',
  'solutions',
  'technologies',
  'tech',
  'global',
  'international',
  'world',
  'pte',
  'gmbh',
  'sa',
  'bv',
  'sl',
  'ag',
]);

function normalizeHost(rawUrl: string | null | undefined): string | null {
  if (!rawUrl || typeof rawUrl !== 'string') return null;
  const trimmed = rawUrl.trim();
  if (!trimmed) return null;
  try {
    const u = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
    return u.host.replace(/^www\./, '').toLowerCase();
  } catch {
    return null;
  }
}

function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@.]+\.[^\s@]+$/.test(value.trim());
}

function emailDomain(value: string): string | null {
  const trimmed = value.trim().toLowerCase();
  const m = trimmed.match(/^[^\s@]+@([^\s@]+)$/);
  return m ? m[1] : null;
}

function tokenize(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 3 && !COMPANY_STOPWORDS.has(t));
}

/**
 * Returns true when the two names share at least one substantive token (≥3 chars,
 * not in the company-stopword list). Mirrors pln-data-enrichment's nameToken
 * anchor — strong enough to confirm "Acme Robotics" matches "Acme Labs", but
 * stopword-aware enough to NOT match "Acme Labs" against "Beta Labs".
 */
export function namesShareSubstantiveToken(a: string, b: string): boolean {
  const aToks = new Set(tokenize(a));
  if (aToks.size === 0) return false;
  for (const t of tokenize(b)) if (aToks.has(t)) return true;
  return false;
}

function mkJudgment(
  confidence: FieldConfidence,
  verdict: JudgmentVerdict,
  score: number,
  note: string
): FieldJudgment {
  return { confidence, verdict, score, note, judgedVia: JudgmentSource.Corroboration };
}

function hostsMatch(a: string | null, b: string | null): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  // accept subdomain-of relationships: blog.acme.com ↔ acme.com
  return a.endsWith('.' + b) || b.endsWith('.' + a);
}

// ─── Field-specific rules ──────────────────────────────────────────────────

/**
 * The user's canonical failure case. `contactMethod = "test@bestTeam.xyz"`
 * with `website = "bestTeam.xyz"` — the email's domain corroborates the
 * website host. Two distinct self-declared signals from the team's own
 * assets agreeing is enough; we promote at high confidence and the LLM
 * never sees this field.
 */
export function corroborateContactMethod(
  value: string | null,
  ctx: CorroborationContext
): FieldJudgment | null {
  if (!value || typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!isEmail(trimmed)) return null;

  const domain = emailDomain(trimmed);
  if (!domain) return null;

  const websiteHost = normalizeHost(ctx.website);
  if (websiteHost && hostsMatch(domain.toLowerCase(), websiteHost)) {
    return mkJudgment(FieldConfidence.High, JudgmentVerdict.Agrees, 100, 'email domain matches website');
  }

  const jsonLdEmail = ctx.websiteSignals?.contactEmail ?? null;
  if (jsonLdEmail) {
    const jdom = emailDomain(jsonLdEmail);
    if (jdom && jdom.toLowerCase() === domain.toLowerCase()) {
      return mkJudgment(FieldConfidence.High, JudgmentVerdict.Agrees, 95, 'email domain matches jsonld');
    }
  }
  return null;
}

/**
 * Twitter/X handle corroboration. The website's own twitter:site tag (or a
 * twitter.com/<handle> URL discovered in JSON-LD `sameAs`) is an
 * unambiguous self-declaration — equality with the AI value is bulletproof.
 */
export function corroborateTwitterHandler(
  value: string | null,
  ctx: CorroborationContext
): FieldJudgment | null {
  if (!value || typeof value !== 'string') return null;
  const candidate = value.replace(/^@/, '').trim().toLowerCase();
  if (!candidate) return null;
  const ws = ctx.websiteSignals?.twitterHandler?.replace(/^@/, '').trim().toLowerCase();
  if (ws && ws === candidate) {
    return mkJudgment(FieldConfidence.High, JudgmentVerdict.Agrees, 100, 'website self declared');
  }
  return null;
}

export function corroborateLinkedinHandler(
  value: string | null,
  ctx: CorroborationContext
): FieldJudgment | null {
  if (!value || typeof value !== 'string') return null;
  const norm = (s: string) =>
    s
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\/(?:www\.)?linkedin\.com\//, '')
      .replace(/\/+$/, '');
  const candidate = norm(value);
  if (!candidate) return null;
  const ws = ctx.websiteSignals?.linkedinHandler ? norm(ctx.websiteSignals.linkedinHandler) : null;
  if (ws && ws === candidate) {
    return mkJudgment(FieldConfidence.High, JudgmentVerdict.Agrees, 100, 'website self declared');
  }
  return null;
}

export function corroborateTelegramHandler(
  value: string | null,
  ctx: CorroborationContext
): FieldJudgment | null {
  if (!value || typeof value !== 'string') return null;
  const candidate = value.replace(/^@/, '').trim().toLowerCase();
  if (!candidate) return null;
  const ws = ctx.websiteSignals?.telegramHandler?.replace(/^@/, '').trim().toLowerCase();
  if (ws && ws === candidate) {
    return mkJudgment(FieldConfidence.High, JudgmentVerdict.Agrees, 100, 'website self declared');
  }
  return null;
}

/**
 * Blog URL on the same host (or subdomain of) the team's website. Two paths
 * matter equally here: `blog.acme.com` ↔ `acme.com`, and `acme.com/blog`
 * ↔ `acme.com`. We don't require the blog host to be reachable — the host
 * relationship to the website is the corroboration signal.
 */
export function corroborateBlog(value: string | null, ctx: CorroborationContext): FieldJudgment | null {
  if (!value || typeof value !== 'string') return null;
  const blogHost = normalizeHost(value);
  const siteHost = normalizeHost(ctx.website);
  if (!blogHost || !siteHost) return null;
  if (hostsMatch(blogHost, siteHost)) {
    return mkJudgment(FieldConfidence.High, JudgmentVerdict.Agrees, 95, 'host corroborated');
  }
  return null;
}

/**
 * Website corroboration. Requires the website to be reachable AND a name
 * anchor to fire from at least one second source: og:site_name token-match,
 * JSON-LD Organization.name token-match, or ScrapingDog profile.website
 * host-match (when the ScrapingDog name-match is exact/partial). Single-source
 * "looks reachable" is intentionally insufficient — reachability alone is
 * not identity, per the AI-judge system prompt.
 */
export function corroborateWebsite(value: string | null, ctx: CorroborationContext): FieldJudgment | null {
  if (!value || typeof value !== 'string') return null;
  if (ctx.websiteReachable !== true) return null;
  const siteHost = normalizeHost(value);
  if (!siteHost) return null;

  const anchorsFired: string[] = [];

  if (ctx.websiteSignals?.ogSiteName && namesShareSubstantiveToken(ctx.teamName, ctx.websiteSignals.ogSiteName)) {
    anchorsFired.push('og name match');
  }
  if (
    ctx.websiteSignals?.jsonLdOrgName &&
    namesShareSubstantiveToken(ctx.teamName, ctx.websiteSignals.jsonLdOrgName)
  ) {
    anchorsFired.push('jsonld name match');
  }
  if (
    ctx.scrapingDogProfile?.website &&
    ctx.scrapingDogNameMatch &&
    ctx.scrapingDogNameMatch !== 'none' &&
    hostsMatch(normalizeHost(ctx.scrapingDogProfile.website), siteHost)
  ) {
    anchorsFired.push('sd website host match');
  }

  if (anchorsFired.length === 0) return null;
  // First anchor establishes high-confidence agreement; additional anchors are
  // appended for explainability but don't change the verdict — the note stays
  // under FIELD_JUDGMENT_NOTE_MAX_LENGTH (60).
  const note = anchorsFired.join(' + ');
  return mkJudgment(FieldConfidence.High, JudgmentVerdict.Agrees, 95, note);
}

// ─── Dispatcher ────────────────────────────────────────────────────────────

/**
 * Per-field input passed to the dispatcher. Mirrors the shape the judge already
 * builds when collecting judgable fields — just the field key and the value
 * being judged.
 */
export interface CorroborationFieldInput {
  field: FieldMetaKey;
  value: string | string[] | null;
}

/**
 * Runs every applicable corroboration rule against the supplied fields,
 * returning a verdict map. Fields with no rule, or rules that didn't fire,
 * are omitted (fall through to the AI judge).
 */
export function runCorroboration(
  fields: CorroborationFieldInput[],
  ctx: CorroborationContext
): Partial<Record<FieldMetaKey, FieldJudgment>> {
  const out: Partial<Record<FieldMetaKey, FieldJudgment>> = {};
  for (const f of fields) {
    if (Array.isArray(f.value)) continue; // array fields (industryTags, investmentFocus) are not Stage-1.5 candidates
    const v = f.value;
    let verdict: FieldJudgment | null = null;
    switch (f.field) {
      case 'contactMethod':
        verdict = corroborateContactMethod(v, ctx);
        break;
      case 'twitterHandler':
        verdict = corroborateTwitterHandler(v, ctx);
        break;
      case 'linkedinHandler':
        verdict = corroborateLinkedinHandler(v, ctx);
        break;
      case 'telegramHandler':
        verdict = corroborateTelegramHandler(v, ctx);
        break;
      case 'blog':
        verdict = corroborateBlog(v, ctx);
        break;
      case 'website':
        verdict = corroborateWebsite(v, ctx);
        break;
      default:
        verdict = null;
    }
    if (verdict) out[f.field] = verdict;
  }
  return out;
}
