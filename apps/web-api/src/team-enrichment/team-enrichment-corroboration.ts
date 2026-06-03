/**
 * Stage 1.5 — Deterministic Cross-Field Corroboration.
 *
 * Pure functions only: no I/O, no LLM, no time-dependent state. For each
 * judgable field, evaluates cross-source corroboration rules using anchors
 * already on hand (team scalars, the website-extracted `WebsiteSignals`
 * block, and the ScrapingDog company profile).
 *
 * Doctrine:
 *   - Skip rather than guess: a rule only emits a verdict when ≥2 distinct
 *     anchors converge. Fields with no corroboration fall through to the AI.
 *   - Explainability: every verdict carries a space-separated `note` listing
 *     which anchors fired (e.g. "email domain matches website").
 *   - Promotion: an `agrees + high` verdict short-circuits the AI judge AND
 *     promotes the value to `Team.<field>`.
 */

import {
  EnrichmentSource,
  FieldConfidence,
  FieldJudgment,
  FieldMetaKey,
  JudgmentVerdict,
  NameMatchTier,
  WebsiteSignals,
} from './team-enrichment.types';
import { ScrapingDogCompanyProfile } from './team-enrichment-scrapingdog.service';
import {
  emailDomain,
  hostFirstLabelMatchesTeamName,
  hostsMatch,
  isEmail,
  makeJudgment,
  namesShareSubstantiveToken,
  normalizeHandleValue,
  normalizeHost,
} from './shared';

/** Snapshot of every anchor the corroboration rules can consult. */
export interface CorroborationContext {
  teamName: string;
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
   * misses those. All values normalized: lowercased, no `@`, no URL prefix.
   */
  teamLeadContacts?: {
    emails: string[];
    twitter: string[];
    telegram: string[];
    linkedin: string[];
  };
  /**
   * The team's OWN on-file social/communication channels. Used by the
   * `contactMethod` rule to recognize when the team set `contactMethod` to
   * the same URL it already uses as another channel. Catches Telegram
   * one-time-invite links (`t.me/+<opaque>`) where the slug isn't team-
   * identifying on its own but the team explicitly self-declares it.
   */
  teamOwnedChannels?: {
    twitterHandler?: string | null;
    telegramHandler?: string | null;
    linkedinHandler?: string | null;
    blog?: string | null;
  };
}

// Re-export the name-matching helpers for spec / pipeline consumers that still
// import them from this file's old location.
export { namesShareSubstantiveToken, hostFirstLabelMatchesTeamName };

// ─── Field-specific rules ──────────────────────────────────────────────────

/**
 * Canonical failure case the rule was written for:
 * `contactMethod = "test@bestTeam.xyz"` with `website = "bestTeam.xyz"`. Two
 * distinct self-declared signals from the team's own assets agreeing is
 * enough; promote at high confidence and the LLM never sees this field.
 */
export function corroborateContactMethod(
  value: string | null,
  ctx: CorroborationContext,
  opts: { isUserOwned?: boolean } = {}
): FieldJudgment | null {
  if (!value || typeof value !== 'string') return null;
  const trimmed = value.trim();
  const websiteHost = normalizeHost(ctx.website);

  if (isEmail(trimmed)) {
    const domain = emailDomain(trimmed);
    if (!domain) return null;
    const normEmail = trimmed.toLowerCase();

    if (websiteHost && hostsMatch(domain.toLowerCase(), websiteHost)) {
      return makeJudgment(FieldConfidence.High, JudgmentVerdict.Agrees, 100, 'email domain matches website');
    }

    const jsonLdEmail = ctx.websiteSignals?.contactEmail ?? null;
    if (jsonLdEmail) {
      const jdom = emailDomain(jsonLdEmail);
      if (jdom && jdom.toLowerCase() === domain.toLowerCase()) {
        return makeJudgment(FieldConfidence.High, JudgmentVerdict.Agrees, 95, 'email domain matches jsonld');
      }
    }

    // Founder-contact cross-reference: pre-seed teams often enter a founder's
    // personal email (gmail / outlook / their own domain) as the team contact.
    // gmail.com isn't the team's host — but a direct email-vs-lead-email match
    // is a strong identity signal.
    if (ctx.teamLeadContacts?.emails.includes(normEmail)) {
      return makeJudgment(FieldConfidence.High, JudgmentVerdict.Agrees, 95, 'founder contact match');
    }

    // Brand-alias: team owns multiple domains (product domain as website,
    // corporate domain for email). Same prefix-only guard as the website-host
    // rule keeps `beontop.com` from matching team "Eon".
    if (hostFirstLabelMatchesTeamName(ctx.teamName, domain)) {
      return makeJudgment(FieldConfidence.High, JudgmentVerdict.Agrees, 90, 'email domain matches team name');
    }
    // No deterministic anchor — fall through to user-trusted fallback rather
    // than returning here, so a ChangedByUser email on an unrelated host still
    // auto-promotes (lead's authority over their own contact email).
  }

  if (/^https?:\/\//i.test(trimmed)) {
    const contactHost = normalizeHost(trimmed);
    if (contactHost && websiteHost && hostsMatch(contactHost, websiteHost)) {
      return makeJudgment(FieldConfidence.High, JudgmentVerdict.Agrees, 95, 'url host matches website');
    }

    const ownChannelMatch = matchContactToTeamOwnedChannel(trimmed, ctx.teamOwnedChannels);
    if (ownChannelMatch) return ownChannelMatch;

    const founderUrlMatch = matchFounderContactUrl(trimmed, ctx.teamLeadContacts);
    if (founderUrlMatch) return founderUrlMatch;

    if (contactHost && hostFirstLabelMatchesTeamName(ctx.teamName, contactHost)) {
      return makeJudgment(FieldConfidence.High, JudgmentVerdict.Agrees, 90, 'url host matches team name');
    }

    // Community / invite link: contactMethod is a Discord / Telegram /
    // Linktree URL whose path slug starts with a team token. Random opaque
    // invite IDs (`discord.gg/BakDKKDpHF`) correctly fail the prefix check.
    const inviteSlug = extractInviteSlug(trimmed);
    if (inviteSlug && hostFirstLabelMatchesTeamName(ctx.teamName, inviteSlug)) {
      return makeJudgment(FieldConfidence.High, JudgmentVerdict.Agrees, 90, 'name in invite slug');
    }
  }

  if (/^@[A-Za-z0-9_]{2,}$/.test(trimmed)) {
    const h = trimmed.slice(1).toLowerCase();
    if (
      ctx.teamLeadContacts?.twitter.includes(h) ||
      ctx.teamLeadContacts?.telegram.includes(h)
    ) {
      return makeJudgment(FieldConfidence.High, JudgmentVerdict.Agrees, 95, 'founder contact match');
    }
    const ownTwitter = normalizeHandleValue(ctx.teamOwnedChannels?.twitterHandler);
    const ownTelegram = normalizeHandleValue(ctx.teamOwnedChannels?.telegramHandler);
    if ((ownTwitter && ownTwitter === h) || (ownTelegram && ownTelegram === h)) {
      return makeJudgment(FieldConfidence.High, JudgmentVerdict.Agrees, 95, 'matches team social');
    }
  }

  // User-trusted fallback: the lead supplied this value (status === ChangedByUser)
  // and no deterministic anchor matched — typically because the value is a
  // community link we can't independently validate (`discord.gg/<opaque>`,
  // `t.me/+<token>`, Calendly, etc.). It already passed `isLikelyValueForField`,
  // so it's a real email/URL/handle shape. Re-queueing for admin review forever
  // provides no information the lead doesn't already have. Score 85 so a real
  // deterministic anchor would still outrank this in any future merge.
  if (opts.isUserOwned) {
    return makeJudgment(FieldConfidence.High, JudgmentVerdict.Agrees, 85, 'user trusted');
  }

  return null;
}

function matchContactToTeamOwnedChannel(
  contactUrl: string,
  channels: CorroborationContext['teamOwnedChannels']
): FieldJudgment | null {
  if (!channels) return null;
  const contactNorm = normalizeHandleValue(contactUrl);
  if (!contactNorm) return null;

  const candidates: Array<[string, string | null | undefined]> = [
    ['matches team telegram', channels.telegramHandler],
    ['matches team twitter', channels.twitterHandler],
    ['matches team linkedin', channels.linkedinHandler],
    ['matches team blog', channels.blog],
  ];
  for (const [note, channelValue] of candidates) {
    const channelNorm = normalizeHandleValue(channelValue);
    if (channelNorm && channelNorm === contactNorm) {
      return makeJudgment(FieldConfidence.High, JudgmentVerdict.Agrees, 95, note);
    }
  }
  return null;
}

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
    return makeJudgment(FieldConfidence.High, JudgmentVerdict.Agrees, 95, 'founder contact match');
  }
  if ((host === 't.me' || host === 'telegram.me') && leads.telegram.includes(segments[0].toLowerCase())) {
    return makeJudgment(FieldConfidence.High, JudgmentVerdict.Agrees, 95, 'founder contact match');
  }
  if (host === 'linkedin.com' || /^[a-z]{2}\.linkedin\.com$/.test(host)) {
    const [kind, slug] = segments;
    if (slug && (kind === 'in' || kind === 'company' || kind === 'school')) {
      const candidate = (kind === 'in' ? slug : `${kind}/${slug}`).toLowerCase();
      if (leads.linkedin.includes(candidate) || leads.linkedin.includes(slug.toLowerCase())) {
        return makeJudgment(FieldConfidence.High, JudgmentVerdict.Agrees, 95, 'founder contact match');
      }
    }
  }
  return null;
}

export function corroborateTwitterHandler(
  value: string | null,
  ctx: CorroborationContext
): FieldJudgment | null {
  if (!value || typeof value !== 'string') return null;
  const candidate = value.replace(/^@/, '').trim().toLowerCase();
  if (!candidate) return null;

  const ws = ctx.websiteSignals?.twitterHandler?.replace(/^@/, '').trim().toLowerCase();
  if (ws && ws === candidate) {
    return makeJudgment(FieldConfidence.High, JudgmentVerdict.Agrees, 100, 'website self declared');
  }

  // Twitter handles are capped at 15 chars, so abbreviations + suffixes
  // ("eonsys", "asterainst") are common. Prefix-only guard keeps random
  // substring matches from firing.
  if (hostFirstLabelMatchesTeamName(ctx.teamName, candidate)) {
    return makeJudgment(FieldConfidence.High, JudgmentVerdict.Agrees, 90, 'name in twitter handle');
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
    return makeJudgment(FieldConfidence.High, JudgmentVerdict.Agrees, 100, 'website self declared');
  }

  const slugMatch = candidate.match(/^(?:company|school|in)\/([^/?#]+)/);
  const slug = slugMatch ? slugMatch[1] : candidate;
  if (hostFirstLabelMatchesTeamName(ctx.teamName, slug)) {
    return makeJudgment(FieldConfidence.High, JudgmentVerdict.Agrees, 90, 'name in linkedin slug');
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
    return makeJudgment(FieldConfidence.High, JudgmentVerdict.Agrees, 100, 'website self declared');
  }

  if (hostFirstLabelMatchesTeamName(ctx.teamName, candidate)) {
    return makeJudgment(FieldConfidence.High, JudgmentVerdict.Agrees, 90, 'name in telegram handle');
  }
  return null;
}

/**
 * Extracts the team-identity handle from a third-party blog URL (Substack,
 * Medium, Ghost, paragraph.xyz, etc.). The handle is the part that identifies
 * WHO owns the blog — typically the subdomain (`<handle>.substack.com`) or a
 * path segment (`medium.com/@<handle>`). Returns null when the URL isn't on
 * a recognized platform.
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
      if (handle && handle !== 'blog') return handle;
    }
  }

  // Note: substack.com appears in BOTH the subdomain branch (publication URLs)
  // and here (user-profile URLs). The subdomain branch only fires when host !==
  // platform, so the two patterns don't collide.
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
 * Extracts the team-identifying slug from a community / invite URL. Returns
 * null when the URL isn't on a recognized platform or carries an opaque
 * single-use join token (`t.me/+ABC123`) that's not team-identifying.
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
    if (segments[0].startsWith('+')) return null;
    return segments[0];
  }
  if (host === 'linktr.ee' && segments[0]) {
    return segments[0];
  }
  return null;
}

export function corroborateBlog(value: string | null, ctx: CorroborationContext): FieldJudgment | null {
  if (!value || typeof value !== 'string') return null;
  const blogHost = normalizeHost(value);
  const siteHost = normalizeHost(ctx.website);
  if (!blogHost) return null;

  if (siteHost && hostsMatch(blogHost, siteHost)) {
    return makeJudgment(FieldConfidence.High, JudgmentVerdict.Agrees, 95, 'host corroborated');
  }

  // Third-party platform, team name in the URL handle. Same prefix-only check
  // the social handle rules use — catches abbreviated forms (`astera.substack.com`
  // for "Astera Institute" works because the handle starts with "astera").
  const handle = extractBlogHandle(value);
  if (handle && hostFirstLabelMatchesTeamName(ctx.teamName, handle)) {
    return makeJudgment(FieldConfidence.High, JudgmentVerdict.Agrees, 95, 'name in blog handle');
  }

  return null;
}

/**
 * Website corroboration. Requires a name anchor from at least one second
 * source to fire (host first-label, og:site_name, jsonld Organization.name,
 * or ScrapingDog profile.website host). Single-source "looks reachable" alone
 * is intentionally insufficient.
 *
 * Reachability gate: only `websiteReachable === false` (definitive 4xx/5xx)
 * blocks. `true` and `null` (bot-blocked 403, transient error) both let the
 * rule fire when a name anchor matches — many real sites are alive in a
 * browser but 403 to non-browser fetches.
 */
export function corroborateWebsite(value: string | null, ctx: CorroborationContext): FieldJudgment | null {
  if (!value || typeof value !== 'string') return null;
  if (ctx.websiteReachable === false) return null;
  const siteHost = normalizeHost(value);
  if (!siteHost) return null;

  const anchorsFired: string[] = [];

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
  // First anchor establishes high-confidence agreement; additional anchors
  // are appended for explainability but don't change the verdict.
  const note = anchorsFired.join(' + ');
  return makeJudgment(FieldConfidence.High, JudgmentVerdict.Agrees, 95, note);
}

/**
 * Source-trust rule: when the enrichment pipeline already populated this
 * field from a trusted deterministic source at high confidence, accept it
 * without re-verifying via the AI judge.
 *
 * The pipeline records `source` per field on `fieldsMeta`:
 *   - `scrapingdog` — LinkedIn or X profile via ScrapingDog.
 *   - `open-graph`  — pulled from the team's own website HTML.
 *   - `ai`          — filled by the LLM. NOT trusted here, because LLM self-
 *                     assessed confidence is exactly what the judge exists to
 *                     verify in the first place.
 */
export function corroborateBySource(
  source: string | undefined,
  enrichmentConfidence: string | undefined,
  field?: FieldMetaKey
): FieldJudgment | null {
  if (enrichmentConfidence !== 'high') return null;
  if (source === EnrichmentSource.ScrapingDog) {
    // LinkedIn ScrapingDog never fills `twitterHandler` / `telegramHandler` —
    // those come from a separate ScrapingDog endpoint. Surface the actual
    // source in the note so admin reviewers can trust the provenance.
    const note =
      field === 'twitterHandler'
        ? 'sourced from x'
        : field === 'telegramHandler'
        ? 'sourced from telegram'
        : 'sourced from linkedin';
    return makeJudgment(FieldConfidence.High, JudgmentVerdict.Agrees, 95, note);
  }
  if (source === EnrichmentSource.OpenGraph) {
    return makeJudgment(FieldConfidence.High, JudgmentVerdict.Agrees, 90, 'sourced from website');
  }
  return null;
}

// ─── Dispatcher ────────────────────────────────────────────────────────────

export interface CorroborationFieldInput {
  field: FieldMetaKey;
  value: string | string[] | null;
  /** Enrichment-time provenance: `ai` / `scrapingdog` / `open-graph`. */
  source?: string;
  /** Enrichment-time self-assessed confidence: `high` / `medium` / `low`. */
  enrichmentConfidence?: string;
  /**
   * True when `fieldsMeta[<field>].status === ChangedByUser`. Consumed by
   * per-field "user trusted" fallbacks — the team lead put it there, we
   * can't independently verify, but we trust the user's authority over
   * their own contact channel rather than queueing for review forever.
   */
  isUserOwned?: boolean;
}

/**
 * Stage 1.5 dispatcher. The actual rule registry + dispatch lives in
 * team-enrichment-judge-pipeline.ts — see `runStage15Rules`. This name
 * is re-exported from there for back-compat with existing callers.
 */
export { runCorroboration } from './team-enrichment-judge-pipeline';
