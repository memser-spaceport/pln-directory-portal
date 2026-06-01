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
  EnrichmentSource,
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
  /**
   * Contact info for the team's leads / founders (TeamMemberRole rows where
   * `teamLead = true` OR `role ILIKE '%founder%'`). Used by the founder-contact
   * cross-reference rule on `contactMethod` — pre-seed teams routinely enter a
   * founder's personal email as the team contact, and the host-match rule
   * misses those (founder's email lives on `@gmail.com` or their personal
   * domain, not the team's website host). All values are normalized:
   * lowercased, no leading `@`, no URL prefix.
   */
  teamLeadContacts?: {
    emails: string[];
    twitter: string[];
    telegram: string[];
    linkedin: string[];
  };
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

/**
 * Looser sibling of `namesShareSubstantiveToken`, designed for handles found
 * in URLs (subdomains, path slugs) that have no whitespace delimiters: e.g.
 * `asterainstitute` for the team "Astera Institute", `manifestnetwork` for
 * "Manifest Network".
 *
 * Tokenizes the team name as usual (stopword-aware), then checks whether
 * EVERY substantive team token appears as a substring of the normalized
 * handle. Both "asterainstitute" (concatenated) and "astera-institute"
 * (hyphenated) match. `essentialtechnology` for "Convergent Research" does
 * not, because neither `convergent` nor `research` appears.
 */
export function handleMatchesTeamName(teamName: string, rawHandle: string): boolean {
  const teamTokens = tokenize(teamName);
  if (teamTokens.length === 0) return false;
  const handle = rawHandle.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (handle.length < 3) return false;
  return teamTokens.every((t) => handle.includes(t));
}

/**
 * Variant for website hosts, where the team name is typically abbreviated to
 * its leading distinctive token: `eon.systems` for "Eon", `astera.org` for
 * "Astera Institute" (drops "Institute"), `fil.org` for "Filecoin Foundation"
 * (loses the team name entirely — falls through).
 *
 * Strict on placement: requires the first dot-separated label of the host to
 * START WITH a substantive team token (or equal it). Substring-anywhere would
 * false-positive on coincidental matches — a team named "Eon" with website
 * `beontop.com` would falsely match if we just checked for "eon" anywhere.
 * Prefix-of-first-label keeps Astera/Eon/Devonian/etc. matching while
 * rejecting `beontop.com` (first label "beontop" doesn't start with "eon").
 *
 * Stopword filter + 3-char minimum on tokens still apply (so two-letter team
 * names and stopword-only names won't match anything).
 */
export function hostFirstLabelMatchesTeamName(teamName: string, host: string): boolean {
  const teamTokens = tokenize(teamName);
  if (teamTokens.length === 0) return false;
  const firstLabel = host.toLowerCase().replace(/^www\./, '').split('.')[0];
  if (!firstLabel || firstLabel.length < 3) return false;
  return teamTokens.some((t) => firstLabel.startsWith(t));
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
  const websiteHost = normalizeHost(ctx.website);

  // ── Email form ─────────────────────────────────────────────────────────
  if (isEmail(trimmed)) {
    const domain = emailDomain(trimmed);
    if (!domain) return null;
    const normEmail = trimmed.toLowerCase();

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

    // Founder-contact cross-reference: pre-seed teams often enter a founder's
    // personal email (gmail / outlook / their own domain) as the team contact.
    // The host-match rules above can't help — gmail.com isn't the team's host —
    // but a direct email-vs-lead-email match is a strong identity signal.
    if (ctx.teamLeadContacts?.emails.includes(normEmail)) {
      return mkJudgment(FieldConfidence.High, JudgmentVerdict.Agrees, 95, 'founder contact match');
    }
    return null;
  }

  // ── URL form ───────────────────────────────────────────────────────────
  // Teams commonly enter a link to their /contact page, a Calendly URL, or
  // even just the homepage itself (often with a `#contact` fragment) as their
  // contactMethod. When the URL's host matches the verified website host,
  // it's the team's own asset — same identity strength as the email rule.
  // Same matcher (`hostsMatch`) handles `www.` prefix and subdomain-of cases.
  if (/^https?:\/\//i.test(trimmed)) {
    const contactHost = normalizeHost(trimmed);
    if (contactHost && websiteHost && hostsMatch(contactHost, websiteHost)) {
      return mkJudgment(FieldConfidence.High, JudgmentVerdict.Agrees, 95, 'url host matches website');
    }

    // Founder-contact cross-reference for URL form: contactMethod is a link
    // to a founder's twitter / telegram / linkedin profile.
    const founderUrlMatch = matchFounderContactUrl(trimmed, ctx.teamLeadContacts);
    if (founderUrlMatch) return founderUrlMatch;
  }

  // ── @handle form ───────────────────────────────────────────────────────
  // Bare `@handle` — match against any lead's twitter / telegram handle.
  if (/^@[A-Za-z0-9_]{2,}$/.test(trimmed)) {
    const h = trimmed.slice(1).toLowerCase();
    if (
      ctx.teamLeadContacts?.twitter.includes(h) ||
      ctx.teamLeadContacts?.telegram.includes(h)
    ) {
      return mkJudgment(FieldConfidence.High, JudgmentVerdict.Agrees, 95, 'founder contact match');
    }
  }

  return null;
}

/**
 * Helper: when contactMethod is a twitter / telegram / linkedin URL, check
 * whether the embedded handle / slug matches any team lead's recorded social.
 */
function matchFounderContactUrl(
  url: string,
  leads: CorroborationContext['teamLeadContacts']
): FieldJudgment | null {
  if (!leads) return null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  const host = parsed.host.replace(/^www\./, '').toLowerCase();
  const segments = parsed.pathname.split('/').filter(Boolean);
  if (segments.length === 0) return null;

  if ((host === 'twitter.com' || host === 'x.com') && leads.twitter.includes(segments[0].toLowerCase())) {
    return mkJudgment(FieldConfidence.High, JudgmentVerdict.Agrees, 95, 'founder contact match');
  }
  if ((host === 't.me' || host === 'telegram.me') && leads.telegram.includes(segments[0].toLowerCase())) {
    return mkJudgment(FieldConfidence.High, JudgmentVerdict.Agrees, 95, 'founder contact match');
  }
  if (host === 'linkedin.com' || /^[a-z]{2}\.linkedin\.com$/.test(host)) {
    const [kind, slug] = segments;
    if (slug && (kind === 'in' || kind === 'company' || kind === 'school')) {
      const candidate = (kind === 'in' ? slug : `${kind}/${slug}`).toLowerCase();
      if (leads.linkedin.includes(candidate) || leads.linkedin.includes(slug.toLowerCase())) {
        return mkJudgment(FieldConfidence.High, JudgmentVerdict.Agrees, 95, 'founder contact match');
      }
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

  // Rule 1: exact match with what the website self-declares (strongest).
  const ws = ctx.websiteSignals?.twitterHandler?.replace(/^@/, '').trim().toLowerCase();
  if (ws && ws === candidate) {
    return mkJudgment(FieldConfidence.High, JudgmentVerdict.Agrees, 100, 'website self declared');
  }

  // Rule 2: handle starts with a substantive team token. Twitter handles are
  // capped at 15 chars, so abbreviations + suffixes ("eonsys", "asterainst")
  // are common. Same prefix-only guard as the website host rule prevents
  // substring-anywhere false positives.
  if (hostFirstLabelMatchesTeamName(ctx.teamName, candidate)) {
    return mkJudgment(FieldConfidence.High, JudgmentVerdict.Agrees, 90, 'name in twitter handle');
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

  // Rule 1: exact match with website-self-declared LinkedIn URL/slug.
  const ws = ctx.websiteSignals?.linkedinHandler ? norm(ctx.websiteSignals.linkedinHandler) : null;
  if (ws && ws === candidate) {
    return mkJudgment(FieldConfidence.High, JudgmentVerdict.Agrees, 100, 'website self declared');
  }

  // Rule 2: extract the slug after company/school/in/ and check if it starts
  // with a substantive team token. `company/eon-systems-pbc` for team "Eon" →
  // slug `eon-systems-pbc` → starts with "eon" → match.
  const slugMatch = candidate.match(/^(?:company|school|in)\/([^/?#]+)/);
  const slug = slugMatch ? slugMatch[1] : candidate;
  if (hostFirstLabelMatchesTeamName(ctx.teamName, slug)) {
    return mkJudgment(FieldConfidence.High, JudgmentVerdict.Agrees, 90, 'name in linkedin slug');
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

  // Rule 1: exact match with website-self-declared Telegram handle.
  const ws = ctx.websiteSignals?.telegramHandler?.replace(/^@/, '').trim().toLowerCase();
  if (ws && ws === candidate) {
    return mkJudgment(FieldConfidence.High, JudgmentVerdict.Agrees, 100, 'website self declared');
  }

  // Rule 2: handle starts with a substantive team token. Catches "fileverse",
  // "vitadao", "talentprotocol" etc. — Telegram handle conventions are similar
  // to Twitter's so same prefix-match guard applies.
  if (hostFirstLabelMatchesTeamName(ctx.teamName, candidate)) {
    return mkJudgment(FieldConfidence.High, JudgmentVerdict.Agrees, 90, 'name in telegram handle');
  }
  return null;
}

/**
 * Extracts the team-identity "handle" from a blog URL hosted on a third-party
 * publishing platform (Substack, Medium, Ghost, paragraph.xyz, etc.). Returns
 * null when the URL isn't on a recognized platform or no handle could be
 * extracted. The handle is the part of the URL that identifies WHO owns the
 * blog — typically the subdomain (`<handle>.substack.com`) or a path segment
 * (`medium.com/@<handle>`). Used by the blog corroboration rule below to
 * check whether the team name appears in the URL itself.
 */
export function extractBlogHandle(blogUrl: string): string | null {
  let u: URL;
  try {
    u = new URL(/^https?:\/\//i.test(blogUrl.trim()) ? blogUrl.trim() : `https://${blogUrl.trim()}`);
  } catch {
    return null;
  }
  const host = u.host.replace(/^www\./, '').toLowerCase();
  const segments = u.pathname.split('/').filter(Boolean);

  // Subdomain-based platforms: <handle>.<platform-host>
  const subdomainPlatforms = [
    'substack.com',
    'medium.com',
    'ghost.io',
    'hashnode.dev',
    'beehiiv.com',
    'posthaven.com',
    'mirror.xyz',
  ];
  for (const platform of subdomainPlatforms) {
    if (host !== platform && host.endsWith('.' + platform)) {
      const handle = host.slice(0, -(platform.length + 1));
      // Reject empty / reserved-prefix-only handles (e.g. "www" already stripped).
      if (handle && handle !== 'blog') return handle;
    }
  }

  // Path-based platforms: <platform-host>/@<handle> or <platform-host>/<handle>
  // Note: substack.com appears in BOTH subdomainPlatforms (publication URLs like
  // acme.substack.com) AND here (user-profile URLs like substack.com/@acme/posts).
  // The subdomain branch above only fires when host !== platform, so the two
  // patterns don't collide.
  const pathPlatforms: Record<string, 'at-handle' | 'plain'> = {
    'medium.com': 'at-handle',
    'substack.com': 'at-handle',
    'paragraph.xyz': 'at-handle',
    'mirror.xyz': 'plain',
    'dev.to': 'plain',
    'hashnode.com': 'at-handle',
  };
  const style = pathPlatforms[host];
  if (style && segments.length > 0) {
    const first = decodeURIComponent(segments[0]);
    if (style === 'at-handle' && first.startsWith('@')) {
      return first.slice(1).toLowerCase();
    }
    if (style === 'plain') {
      // Strip ENS-style suffix common on mirror.xyz handles ("acme.eth" -> "acme").
      return first.replace(/\.eth$/i, '').toLowerCase();
    }
  }

  return null;
}

/**
 * Blog URL corroboration. Two patterns auto-approve at high confidence:
 *
 *   1. **Same-host / subdomain-of website**: `blog.acme.com` ↔ `acme.com`,
 *      `acme.com/blog` ↔ `acme.com`. Note `"host corroborated"`.
 *
 *   2. **Third-party platform with team name in the handle**: e.g. team
 *      `Astera Institute` with blog `asterainstitute.substack.com`. The
 *      handle in the URL (subdomain or path slug, depending on platform)
 *      shares a substantive token with the team name. Note `"name in blog handle"`.
 *
 * The second rule catches blogs hosted on Substack/Medium/Ghost/paragraph/etc.
 * where the team-owned identity lives in the URL slug rather than the host.
 * Token-match is stopword-aware (drops "labs", "the", "network", "ai", etc.)
 * so it correctly does NOT fire on `essentialtechnology.substack.com` for a
 * team named "Convergent Research" — those handles share no substantive token.
 */
export function corroborateBlog(value: string | null, ctx: CorroborationContext): FieldJudgment | null {
  if (!value || typeof value !== 'string') return null;
  const blogHost = normalizeHost(value);
  const siteHost = normalizeHost(ctx.website);
  if (!blogHost) return null;

  // Rule 1: same-host / subdomain-of website.
  if (siteHost && hostsMatch(blogHost, siteHost)) {
    return mkJudgment(FieldConfidence.High, JudgmentVerdict.Agrees, 95, 'host corroborated');
  }

  // Rule 2: third-party platform, team name in the URL handle.
  const handle = extractBlogHandle(value);
  if (handle && handleMatchesTeamName(ctx.teamName, handle)) {
    return mkJudgment(FieldConfidence.High, JudgmentVerdict.Agrees, 95, 'name in blog handle');
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

  // Strongest anchor: the host itself starts with a substantive team token.
  // `eon.systems` ↔ "Eon", `astera.org` ↔ "Astera Institute", `devonian.ai`
  // ↔ "Devonian Systems". Combined with reachability, this is a deterministic
  // identity match — the team owns a domain that's named after them and the
  // domain is live. (Reachability is required by the `websiteReachable !== true`
  // gate above, so adding this anchor here means both signals are in hand.)
  if (hostFirstLabelMatchesTeamName(ctx.teamName, siteHost)) {
    anchorsFired.push('name in website host');
  }

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

/**
 * Source-trust rule: when the enrichment pipeline already populated this
 * field from a trusted deterministic source at high confidence, accept it
 * without re-verifying via the AI judge.
 *
 * The pipeline records `source` per field on `fieldsMeta`:
 *   - `scrapingdog` — pulled from the team's LinkedIn company profile.
 *   - `open-graph`  — pulled from the team's own website HTML (JSON-LD,
 *                     twitter cards, microdata, anchors).
 *   - `ai`          — filled by the LLM. NOT trusted by this rule, because
 *                     LLM self-assessed confidence is exactly what the
 *                     judge exists to verify in the first place.
 *
 * The enrichment-time `confidence` must be `high` — `medium`/`low` indicates
 * the source didn't fully corroborate the value (e.g. open-graph extraction
 * from a website whose ownership wasn't verified). Only `high` clears the bar.
 *
 * This rule turns "source provenance" into the second source, the same way
 * the website-self-declared / email-domain-matches-website rules do — except
 * the corroboration happened at enrichment-time, not at judge-time.
 */
export function corroborateBySource(
  source: string | undefined,
  enrichmentConfidence: string | undefined
): FieldJudgment | null {
  if (enrichmentConfidence !== 'high') return null;
  if (source === EnrichmentSource.ScrapingDog) {
    return mkJudgment(FieldConfidence.High, JudgmentVerdict.Agrees, 95, 'sourced from linkedin');
  }
  if (source === EnrichmentSource.OpenGraph) {
    return mkJudgment(FieldConfidence.High, JudgmentVerdict.Agrees, 90, 'sourced from website');
  }
  return null;
}

// ─── Dispatcher ────────────────────────────────────────────────────────────

/**
 * Per-field input passed to the dispatcher. Mirrors the shape the judge already
 * builds when collecting judgable fields — field key, the value being judged,
 * and (optionally) the field's provenance from `fieldsMeta` so the source-trust
 * rule can fire when the value came from a deterministic source.
 */
export interface CorroborationFieldInput {
  field: FieldMetaKey;
  value: string | string[] | null;
  /** Enrichment-time provenance: `ai` / `scrapingdog` / `open-graph`. */
  source?: string;
  /** Enrichment-time self-assessed confidence: `high` / `medium` / `low`. */
  enrichmentConfidence?: string;
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

    // Source-trust rule runs FIRST for every field — if the value came from a
    // trusted deterministic source at high confidence, that's the verification
    // and we skip the per-field rules + AI judge. Symmetric for all field types.
    const sourceVerdict = corroborateBySource(f.source, f.enrichmentConfidence);
    if (sourceVerdict) {
      out[f.field] = sourceVerdict;
      continue;
    }

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
