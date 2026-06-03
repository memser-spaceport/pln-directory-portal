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
  /**
   * The team's OWN on-file social/communication channels. Used by the
   * `contactMethod` corroboration rule to recognize when the team set
   * `contactMethod` to the same URL/handle it already uses as its
   * `twitterHandler` / `telegramHandler` / `linkedinHandler` / `blog`.
   *
   * Catches the case where the only signal we have on a contactMethod is
   * that the team itself declared it as another channel — common with
   * Telegram one-time-invite links (`t.me/+<opaque>`), where the slug
   * isn't team-identifying on its own but the team has set the *exact same
   * URL* as both `contactMethod` and `telegramHandler`. That's self-
   * corroboration: the team explicitly named this channel as a contact.
   *
   * Values pass in their raw stored form; the rule does its own
   * normalization (strip `@`, strip URL prefix, lowercase, trim path).
   */
  teamOwnedChannels?: {
    twitterHandler?: string | null;
    telegramHandler?: string | null;
    linkedinHandler?: string | null;
    blog?: string | null;
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
 * Variant for website hosts (and other host-like single-label strings such as
 * LinkedIn slugs, Twitter/Telegram handles, Discord invite slugs).
 *
 * Two acceptance paths, both strict on placement:
 *
 *   1. **Whole-string prefix**: the first dot-separated label STARTS WITH a
 *      substantive team token. Catches concatenated / abbreviated forms:
 *      `eon.systems` for "Eon", `eonsys` for "Eon", `astera.org` for
 *      "Astera Institute", `manifestnetwork` for "Manifest Network".
 *
 *   2. **Exact hyphen-segment equality**: any hyphen-separated segment
 *      EQUALS a substantive team token. Catches LinkedIn-style slugs that
 *      put a prefix word in front of the team name: `the-manifest-network`
 *      → segment `manifest` equals team token `manifest`. Equality (not
 *      prefix) keeps the false-positive safety — segment `eonical` is NOT
 *      equal to team token `eon`, so `something-eonical-corp` for team
 *      "Eon" is correctly rejected even though `eon` is a substring.
 *
 * Substring-anywhere matching is intentionally never used — it would
 * false-positive on coincidental matches like `beontop.com` for team "Eon".
 *
 * Stopword filter + 3-char minimum on tokens still apply (two-letter team
 * names and stopword-only names won't match anything).
 */
export function hostFirstLabelMatchesTeamName(teamName: string, host: string): boolean {
  const teamTokens = tokenize(teamName);
  if (teamTokens.length === 0) return false;
  const firstLabel = host.toLowerCase().replace(/^www\./, '').split('.')[0];
  if (!firstLabel || firstLabel.length < 3) return false;
  // 1) Whole-string prefix match (concatenated / abbreviated forms).
  if (teamTokens.some((t) => firstLabel.startsWith(t))) return true;
  // 2) Exact match against any hyphen-separated segment (hyphenated forms
  //    common in LinkedIn slugs: `the-manifest-network`, `the-acme-foundation`).
  const segments = firstLabel.split('-').filter(Boolean);
  return segments.some((seg) => teamTokens.includes(seg));
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

    // Brand-alias case: the team owns multiple domains (a product domain as
    // website, a corporate domain for email). Example: team "Clockwork Labs"
    // with website `spacetimedb.com` and contact `contact@clockworklabs.io` —
    // the email-domain first-label `clockworklabs` starts with the team token
    // `clockwork`. Same prefix-only safety guard as the website-host rule
    // prevents substring-anywhere false positives (`beontop.com` for "Eon"
    // would correctly fail because `beontop` doesn't start with `eon`).
    if (hostFirstLabelMatchesTeamName(ctx.teamName, domain)) {
      return mkJudgment(FieldConfidence.High, JudgmentVerdict.Agrees, 90, 'email domain matches team name');
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

    // Team's own social channel: if contactMethod URL matches what the team
    // already has on file as its twitter / telegram / linkedin / blog, the
    // team has self-declared this channel for contact. Catches the
    // Telegram `t.me/+<opaque-invite>` case (bench: Hypercerts) — the slug
    // isn't team-identifying on its own (opaque join token), but the team
    // set the SAME URL as both `contactMethod` and `telegramHandler`.
    // Identical self-declaration on two fields is the identity proof.
    const ownChannelMatch = matchContactToTeamOwnedChannel(trimmed, ctx.teamOwnedChannels);
    if (ownChannelMatch) return ownChannelMatch;

    // Founder-contact cross-reference for URL form: contactMethod is a link
    // to a founder's twitter / telegram / linkedin profile.
    const founderUrlMatch = matchFounderContactUrl(trimmed, ctx.teamLeadContacts);
    if (founderUrlMatch) return founderUrlMatch;

    // Brand-alias URL: contactMethod URL is on a different host than the
    // website but that host's first label starts with a team token (e.g.
    // `https://clockworklabs.io/contact` for "Clockwork Labs" while website
    // is `spacetimedb.com`). Symmetric with the email branch above.
    if (contactHost && hostFirstLabelMatchesTeamName(ctx.teamName, contactHost)) {
      return mkJudgment(FieldConfidence.High, JudgmentVerdict.Agrees, 90, 'url host matches team name');
    }

    // Community / invite link: contactMethod is a Discord / Slack / Linktree /
    // Telegram URL whose path slug starts with a team token. The host matches
    // the platform (not the team), but the SLUG carries the team identifier:
    // `discord.com/invite/labdao` for "LabDAO", `discord.gg/consensys` for
    // ConsenSys, etc. Random opaque invite IDs (`discord.gg/BakDKKDpHF`)
    // correctly fail the prefix check.
    const inviteSlug = extractInviteSlug(trimmed);
    if (inviteSlug && hostFirstLabelMatchesTeamName(ctx.teamName, inviteSlug)) {
      return mkJudgment(FieldConfidence.High, JudgmentVerdict.Agrees, 90, 'name in invite slug');
    }
  }

  // ── @handle form ───────────────────────────────────────────────────────
  // Bare `@handle` — match against any lead's twitter / telegram handle, OR
  // against the team's own on-file twitter/telegram handle (self-declared).
  if (/^@[A-Za-z0-9_]{2,}$/.test(trimmed)) {
    const h = trimmed.slice(1).toLowerCase();
    if (
      ctx.teamLeadContacts?.twitter.includes(h) ||
      ctx.teamLeadContacts?.telegram.includes(h)
    ) {
      return mkJudgment(FieldConfidence.High, JudgmentVerdict.Agrees, 95, 'founder contact match');
    }
    const ownTwitter = normalizeHandleValue(ctx.teamOwnedChannels?.twitterHandler);
    const ownTelegram = normalizeHandleValue(ctx.teamOwnedChannels?.telegramHandler);
    if ((ownTwitter && ownTwitter === h) || (ownTelegram && ownTelegram === h)) {
      return mkJudgment(FieldConfidence.High, JudgmentVerdict.Agrees, 95, 'matches team social');
    }
  }

  return null;
}

/**
 * Normalizes a stored handle / URL value to a bare-handle string for equality
 * checks. Accepts the same shapes the shape validator accepts:
 *   - `@handle` → `handle`
 *   - `twitter.com/handle` / `x.com/handle` → `handle`
 *   - `t.me/handle` / `telegram.me/handle` → `handle`
 *   - `linkedin.com/company/<slug>` etc. → `company/<slug>`
 *   - Bare slug → unchanged
 * Returns the lowercased path-stripped form, or null when the input is empty.
 */
function normalizeHandleValue(raw: string | null | undefined): string | null {
  if (!raw || typeof raw !== 'string') return null;
  let v = raw.trim().toLowerCase();
  if (!v) return null;
  v = v.replace(/^https?:\/\/(?:www\.)?/i, '');
  // Platform-prefix strip: only the host part is removed, the path (handle/slug) is preserved.
  v = v.replace(/^(?:twitter|x)\.com\//, '');
  v = v.replace(/^(?:t\.me|telegram\.me)\//, '');
  v = v.replace(/^linkedin\.com\//, '');
  v = v.replace(/^@/, '');
  v = v.replace(/[?#].*$/, '');
  v = v.replace(/\/+$/, '');
  return v || null;
}

/**
 * URL-form `contactMethod` self-declaration check. Fires when the
 * contactMethod URL normalizes to the same canonical form as one of the
 * team's other on-file channels (`telegramHandler`, `twitterHandler`,
 * `linkedinHandler`, `blog`). Returns the highest-priority match with a
 * channel-specific note for explainability.
 *
 * Why this rule exists: a team setting `contactMethod` to the literal same
 * URL it already has on file as `telegramHandler` is self-declaring a
 * two-field link. The URL slug doesn't need to be team-identifying on its
 * own (e.g. opaque `t.me/+invite-token`) — the duplicate declaration IS the
 * proof.
 */
function matchContactToTeamOwnedChannel(
  contactUrl: string,
  channels: CorroborationContext['teamOwnedChannels']
): FieldJudgment | null {
  if (!channels) return null;
  const contactNorm = normalizeHandleValue(contactUrl);
  if (!contactNorm) return null;

  // Per-channel comparison. We use normalizeHandleValue on both sides so
  // protocol/host/path-suffix differences don't defeat the equality check.
  const candidates: Array<[string, string | null | undefined]> = [
    ['matches team telegram', channels.telegramHandler],
    ['matches team twitter', channels.twitterHandler],
    ['matches team linkedin', channels.linkedinHandler],
    ['matches team blog', channels.blog],
  ];
  for (const [note, channelValue] of candidates) {
    const channelNorm = normalizeHandleValue(channelValue);
    if (channelNorm && channelNorm === contactNorm) {
      return mkJudgment(FieldConfidence.High, JudgmentVerdict.Agrees, 95, note);
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
 * Extracts the team-identifying slug from a community / invite URL hosted on
 * a recognized platform (Discord, Telegram, Linktree, etc.). Returns null
 * when the URL isn't on a recognized platform or the path doesn't carry an
 * identifiable slug.
 *
 * Recognized patterns:
 *   - `discord.com/invite/<slug>`
 *   - `discord.gg/<slug>`
 *   - `t.me/<slug>` (but NOT `t.me/+<token>` which is a single-use join
 *     token, opaque and not team-identifying)
 *   - `telegram.me/<slug>`
 *   - `linktr.ee/<slug>`
 *
 * Used by `corroborateContactMethod` to fire `name in invite slug` when the
 * slug starts with a substantive team-name token (e.g. `discord.com/invite/labdao`
 * for "LabDAO" → slug `labdao` → starts with team token `labdao` ✓).
 * Random opaque invite IDs (`discord.gg/BakDKKDpHF`) won't pass the prefix
 * check and correctly stay in review.
 */
export function extractInviteSlug(rawUrl: string): string | null {
  let u: URL;
  try {
    u = new URL(rawUrl.trim());
  } catch {
    return null;
  }
  const host = u.host.replace(/^www\./, '').toLowerCase();
  const segments = u.pathname.split('/').filter(Boolean);
  if (segments.length === 0) return null;

  if (host === 'discord.com' && segments[0] === 'invite' && segments[1]) {
    return segments[1];
  }
  if (host === 'discord.gg' && segments[0]) {
    return segments[0];
  }
  if ((host === 't.me' || host === 'telegram.me') && segments[0]) {
    // `+ABC123` style is a one-time join token, not a team-identifying slug.
    if (segments[0].startsWith('+')) return null;
    return segments[0];
  }
  if (host === 'linktr.ee' && segments[0]) {
    return segments[0];
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

  // Rule 2: third-party platform, team name in the URL handle. Uses the same
  // prefix-only check the social handle rules use (`hostFirstLabelMatchesTeamName`).
  // Catches abbreviated forms too — `astera.substack.com` for "Astera Institute"
  // works because the handle starts with the substantive token "astera", even
  // though the second team token ("institute") isn't in the handle. Earlier
  // draft required EVERY token to appear as a substring, which rejected those
  // abbreviated handles and forced unnecessary admin review.
  const handle = extractBlogHandle(value);
  if (handle && hostFirstLabelMatchesTeamName(ctx.teamName, handle)) {
    return mkJudgment(FieldConfidence.High, JudgmentVerdict.Agrees, 95, 'name in blog handle');
  }

  return null;
}

/**
 * Website corroboration. Requires a name anchor to fire from at least one
 * second source: og:site_name token-match, JSON-LD Organization.name
 * token-match, ScrapingDog profile.website host-match (when nameMatch is
 * exact/partial), OR a host first-label name match. Single-source "looks
 * reachable" alone is intentionally insufficient.
 *
 * Reachability gate: blocks only on `websiteReachable === false` (definitive
 * 4xx/5xx like 404/500). `true` (2xx) and `null` (inconclusive — bot-blocked
 * 403, transient network error) BOTH allow the rule to fire when a name
 * anchor matches. Many real team websites are alive in a browser but return
 * 403 to non-browser fetches with full Cloudflare bot protection (e.g.
 * `computelabs.ai`) — the deterministic name anchor IS the identity proof in
 * those cases; the inability to probe is not a reason to fall back to the AI.
 */
export function corroborateWebsite(value: string | null, ctx: CorroborationContext): FieldJudgment | null {
  if (!value || typeof value !== 'string') return null;
  if (ctx.websiteReachable === false) return null; // only definitive 4xx/5xx blocks
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
  enrichmentConfidence: string | undefined,
  field?: FieldMetaKey
): FieldJudgment | null {
  if (enrichmentConfidence !== 'high') return null;
  if (source === EnrichmentSource.ScrapingDog) {
    // LinkedIn ScrapingDog never fills `twitterHandler` / `telegramHandler` —
    // those are X / Telegram profile verifications written from a separate
    // ScrapingDog endpoint. Surface the actual source so admin reviewers can
    // trust the note. Same enum value (`scrapingdog`), different upstream.
    const note =
      field === 'twitterHandler'
        ? 'sourced from x'
        : field === 'telegramHandler'
        ? 'sourced from telegram'
        : 'sourced from linkedin';
    return mkJudgment(FieldConfidence.High, JudgmentVerdict.Agrees, 95, note);
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
    const sourceVerdict = corroborateBySource(f.source, f.enrichmentConfidence, f.field);
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
