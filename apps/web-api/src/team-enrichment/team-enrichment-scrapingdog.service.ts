import { Injectable, Logger } from '@nestjs/common';
import {
  FieldConfidence,
  FieldJudgment,
  FieldMetaKey,
  JudgmentSource,
  JudgmentVerdict,
  NameMatchTier,
} from './team-enrichment.types';
import { hostFirstLabelMatchesTeamName, namesShareSubstantiveToken } from './team-enrichment-corroboration';

export interface ScrapingDogCompanyProfile {
  universalNameId: string | null;
  companyName: string | null;
  profilePhoto: string | null;
  website: string | null;
  tagline: string | null;
  about: string | null;
  industries: string[];
  specialties: string[];
  founded: string | null;
  headquarters: string | null;
  linkedinInternalId: string | null;
}

/**
 * Normalized X/Twitter profile data from ScrapingDog's `/x/profile?parsed=true`
 * endpoint. Used by the team-enrichment pipeline to verify whether an
 * AI-supplied or previously-stored `twitterHandler` actually belongs to the
 * team — by comparing the profile's listed `website` to `team.website` and
 * the profile's `name` to `team.name`. X's own org-verification flag
 * (`verified_type === "Business"`) is captured as a corroborating signal.
 */
export interface ScrapingDogTwitterProfile {
  /** Lowercased username, no leading `@`. */
  username: string | null;
  /** Display name (e.g. "Science Corporation"). */
  name: string | null;
  /** Profile bio. */
  description: string | null;
  /** Listed website URL. Validated as http(s) before being returned. */
  website: string | null;
  /** Internal user id from X. */
  userId: string | null;
  /** True when X marks the account as a verified organization / business. */
  isVerifiedOrg: boolean;
  /** Raw `verified_type` value (e.g. "Business", "Government"). */
  verifiedType: string | null;
}

export type FetchCompanyProfileResult =
  | { kind: 'ok'; profile: ScrapingDogCompanyProfile }
  | { kind: 'not-found' }
  | { kind: 'error'; reason: string };

export type FetchTwitterProfileResult =
  | { kind: 'ok'; profile: ScrapingDogTwitterProfile }
  | { kind: 'not-found' }
  | { kind: 'error'; reason: string };

/**
 * Three-anchor identity check on an X/Twitter profile. Pure: takes the team's
 * name + website and the normalized profile, returns the set of anchors that
 * fired. The caller treats `verified === true` as the auto-promotion gate.
 *
 * Doctrine: a single strong anchor (website host match) suffices because both
 * sides — the listed website on the X profile and the team's stored website —
 * are independent team-controlled assets. The two weaker anchors (X
 * Business/Government verification AND name overlap, or handle prefix-match
 * AND name overlap) require two converging signals, mirroring how the
 * Stage 1.5 corroboration rules establish high-confidence verdicts.
 */
export function verifyTwitterProfileMatchesTeam(
  team: { name: string; website: string | null | undefined },
  profile: ScrapingDogTwitterProfile
): { verified: boolean; anchors: string[] } {
  const anchors: string[] = [];

  const normalizeHost = (url: string | null | undefined): string | null => {
    if (!url) return null;
    try {
      return new URL(url).host.replace(/^www\./, '').toLowerCase();
    } catch {
      return null;
    }
  };

  // Anchor 1 (sufficient alone): listed website host equals team website host.
  // Both sides are independently-controlled team assets — a match is decisive.
  const teamHost = normalizeHost(team.website ?? null);
  const profileHost = normalizeHost(profile.website);
  if (teamHost && profileHost && teamHost === profileHost) {
    anchors.push('website host match');
    return { verified: true, anchors };
  }

  const nameMatches = !!profile.name && namesShareSubstantiveToken(team.name, profile.name);
  if (nameMatches) anchors.push('name match');

  // Anchor 2: X-verified org (Business / Government) AND substantive-token
  // name overlap. X manually verifies these accounts, so the verification
  // tier is a high-quality second signal.
  if (nameMatches && profile.isVerifiedOrg) {
    anchors.push('x verified org');
    return { verified: true, anchors };
  }

  // Anchor 3: handle prefix-matches a team token AND substantive-token name
  // overlap. Mirrors Stage 1.5's existing `name in twitter handle` rule, but
  // anchored against the second-source profile name to keep the safety guard.
  if (nameMatches && profile.username && hostFirstLabelMatchesTeamName(team.name, profile.username)) {
    anchors.push('handle prefix match');
    return { verified: true, anchors };
  }

  return { verified: false, anchors };
}

export interface TeamSnapshotForCompare {
  name: string;
  website?: string | null;
  linkedinHandler?: string | null;
  shortDescription?: string | null;
  longDescription?: string | null;
  moreDetails?: string | null;
  industryTags?: Array<{ title: string }>;
}

@Injectable()
export class TeamEnrichmentScrapingDogService {
  private readonly logger = new Logger(TeamEnrichmentScrapingDogService.name);
  private static readonly API_URL = 'https://api.scrapingdog.com/profile';
  private static readonly X_API_URL = 'https://api.scrapingdog.com/x/profile';
  private static readonly TIMEOUT_MS = 15000;

  isConfigured(): boolean {
    return Boolean(process.env.SCRAPINGDOG_API_KEY);
  }

  async fetchCompanyProfile(linkedinHandler: string): Promise<FetchCompanyProfileResult> {
    const apiKey = process.env.SCRAPINGDOG_API_KEY;
    if (!apiKey) {
      this.logger.debug('SCRAPINGDOG_API_KEY not set, skipping ScrapingDog enrichment');
      return { kind: 'error', reason: 'api key not configured' };
    }

    const id = this.extractHandleId(linkedinHandler);
    if (!id) {
      this.logger.warn(`Could not extract LinkedIn id from handler: "${linkedinHandler}"`);
      return { kind: 'error', reason: 'could not extract handle id' };
    }

    const url = new URL(TeamEnrichmentScrapingDogService.API_URL);
    url.searchParams.set('api_key', apiKey);
    url.searchParams.set('id', id);
    url.searchParams.set('type', 'company');

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TeamEnrichmentScrapingDogService.TIMEOUT_MS);

    try {
      const response = await fetch(url.toString(), {
        method: 'GET',
        signal: controller.signal,
        headers: { 'User-Agent': 'PLNEnrichment/1.0' },
      });

      if (!response.ok) {
        this.logger.warn(`ScrapingDog returned HTTP ${response.status} for id "${id}"`);
        return { kind: 'error', reason: `HTTP ${response.status}` };
      }

      let body: unknown;
      try {
        body = await response.json();
      } catch (parseError) {
        this.logger.warn(`ScrapingDog returned malformed JSON for id "${id}": ${parseError.message}`);
        return { kind: 'error', reason: 'malformed json' };
      }

      const raw = Array.isArray(body) ? (body[0] as unknown) : body;
      if (!raw || typeof raw !== 'object') {
        this.logger.warn(`ScrapingDog returned empty/invalid payload for id "${id}"`);
        return { kind: 'error', reason: 'empty or invalid payload' };
      }

      if (this.isNotFoundBody(raw)) {
        this.logger.warn(`ScrapingDog reports profile not found for id "${id}"`);
        return { kind: 'not-found' };
      }

      const profile = this.normalize(raw as Record<string, unknown>);

      // Defensive: if ScrapingDog returned 200 with an empty company shell (no name or id),
      // treat as not-found rather than ok. Preserves the original callers' ability to trust
      // classifyNameMatch on an 'ok' response.
      if (!profile.companyName && !profile.universalNameId) {
        this.logger.warn(
          `ScrapingDog returned profile with no company_name/universal_name_id for id "${id}", treating as not-found`
        );
        return { kind: 'not-found' };
      }

      return { kind: 'ok', profile };
    } catch (error) {
      const reason = error?.name === 'AbortError' ? 'timeout' : error?.message || 'unknown error';
      this.logger.warn(`ScrapingDog fetch failed for id "${id}": ${reason}`);
      return { kind: 'error', reason };
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Fetches and normalizes an X/Twitter profile via ScrapingDog's
   * `/x/profile?parsed=true` endpoint. Used to verify a candidate
   * `twitterHandler` belongs to the team by comparing the profile's listed
   * `website` against the team's website and the profile's `name` against the
   * team name. The tagged-union result mirrors `fetchCompanyProfile` so callers
   * can switch on `kind`.
   *
   * Tagged outcomes:
   *   - `ok`         — usable profile returned.
   *   - `not-found`  — ScrapingDog returned `success: false` (typically with
   *                    "not found" / "doesn't exist") or a payload with no
   *                    username + no user_id. Treated as an invalid handle.
   *   - `error`      — HTTP non-200, timeout, malformed JSON, missing API key,
   *                    or an empty/invalid payload. State is left untouched.
   */
  async fetchTwitterProfile(handle: string): Promise<FetchTwitterProfileResult> {
    const apiKey = process.env.SCRAPINGDOG_API_KEY;
    if (!apiKey) {
      this.logger.debug('SCRAPINGDOG_API_KEY not set, skipping ScrapingDog X profile fetch');
      return { kind: 'error', reason: 'api key not configured' };
    }

    const id = this.extractTwitterHandle(handle);
    if (!id) {
      this.logger.warn(`Could not extract Twitter/X handle from: "${handle}"`);
      return { kind: 'error', reason: 'could not extract handle id' };
    }

    const url = new URL(TeamEnrichmentScrapingDogService.X_API_URL);
    url.searchParams.set('api_key', apiKey);
    url.searchParams.set('profileId', id);
    url.searchParams.set('parsed', 'true');

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TeamEnrichmentScrapingDogService.TIMEOUT_MS);

    try {
      const response = await fetch(url.toString(), {
        method: 'GET',
        signal: controller.signal,
        headers: { 'User-Agent': 'PLNEnrichment/1.0' },
      });

      if (!response.ok) {
        this.logger.warn(`ScrapingDog X returned HTTP ${response.status} for handle "${id}"`);
        return { kind: 'error', reason: `HTTP ${response.status}` };
      }

      let body: unknown;
      try {
        body = await response.json();
      } catch (parseError) {
        this.logger.warn(`ScrapingDog X returned malformed JSON for handle "${id}": ${parseError.message}`);
        return { kind: 'error', reason: 'malformed json' };
      }

      const raw = Array.isArray(body) ? (body[0] as unknown) : body;
      if (!raw || typeof raw !== 'object') {
        this.logger.warn(`ScrapingDog X returned empty/invalid payload for handle "${id}"`);
        return { kind: 'error', reason: 'empty or invalid payload' };
      }

      if (this.isNotFoundBody(raw)) {
        this.logger.warn(`ScrapingDog X reports profile not found for handle "${id}"`);
        return { kind: 'not-found' };
      }

      // X endpoint nests the data under `profile`. Defensive: also accept the
      // top-level shape in case the API ever flattens it.
      const r = raw as Record<string, unknown>;
      const profileBlock =
        r.profile && typeof r.profile === 'object' ? (r.profile as Record<string, unknown>) : r;

      const profile = this.normalizeTwitterProfile(profileBlock);

      if (!profile.username && !profile.userId) {
        this.logger.warn(
          `ScrapingDog X returned profile with no username/user_id for handle "${id}", treating as not-found`
        );
        return { kind: 'not-found' };
      }

      return { kind: 'ok', profile };
    } catch (error) {
      const reason = error?.name === 'AbortError' ? 'timeout' : error?.message || 'unknown error';
      this.logger.warn(`ScrapingDog X fetch failed for handle "${id}": ${reason}`);
      return { kind: 'error', reason };
    } finally {
      clearTimeout(timeout);
    }
  }

  /** Classifies how well the ScrapingDog profile name matches the team name. */
  classifyNameMatch(teamName: string, profile: ScrapingDogCompanyProfile): NameMatchTier {
    const needle = this.normalizeName(teamName);
    const candidates = [profile.companyName, profile.universalNameId]
      .filter((v): v is string => !!v)
      .map((v) => this.normalizeName(v));
    if (candidates.length === 0 || !needle) return 'none';
    if (candidates.some((c) => c === needle)) return 'exact';
    if (candidates.some((c) => c.includes(needle) || needle.includes(c))) return 'partial';
    return 'none';
  }

  /**
   * Deterministic field-by-field comparisons between a team's current enriched values and the
   * ScrapingDog LinkedIn profile. Returns verdicts keyed by FieldMetaKey. Used by both the judge
   * (Stage 1) and the enrichment-time confidence upgrade.
   *
   * When nameMatch === 'partial', any 'high' verdict is downshifted to 'medium' to reflect the
   * reduced identity confidence.
   */
  compareProfileToTeam(
    team: TeamSnapshotForCompare,
    profile: ScrapingDogCompanyProfile,
    nameMatch: NameMatchTier
  ): Partial<Record<FieldMetaKey, FieldJudgment>> {
    if (nameMatch === 'none') return {};

    // Website-host equality is a deterministic second identity anchor: when the
    // team's website host equals the LinkedIn profile's listed website host,
    // both ends declare each other (the team claims this domain, the LinkedIn
    // company profile lists this domain). With that anchor in hand the entity
    // identity is double-corroborated and downstream field comparisons are
    // looking at data from the verified team — so the per-field comparison
    // method becomes the verification, not the identity proof.
    const websiteCorroborates =
      !!team.website &&
      !!profile.website &&
      this.extractHost(team.website) === this.extractHost(profile.website);

    const result: Partial<Record<FieldMetaKey, FieldJudgment>> = {};
    const mkJudgment = (
      confidence: FieldConfidence,
      verdict: JudgmentVerdict,
      score: number,
      note: string
    ): FieldJudgment => {
      let finalConfidence = confidence;
      // Partial-name-match downshift: a partial-only match (e.g. team "Acme"
      // vs profile "Acme Beauty Salon") doesn't establish identity by itself —
      // demote High to Medium. The downshift is skipped when the website host
      // corroborates: that's the second anchor that lifts partial to a real
      // identity match (bench case ARIA: team `ARIA` ↔ profile
      // `Advanced Research + Invention Agency (ARIA)` with shared website
      // `aria.org.uk` — partial in normalize-then-compare, but the website
      // host match nails it).
      if (
        nameMatch === 'partial' &&
        finalConfidence === FieldConfidence.High &&
        !websiteCorroborates
      ) {
        finalConfidence = FieldConfidence.Medium;
      }
      // Website-corroborated upshift: when the website anchor is in hand AND
      // the comparator emitted `agrees + medium` (text overlap on tagline /
      // about / details / industry tags is intrinsically a fuzzy method, so
      // the comparator starts at Medium even on a clean match), lift to High.
      // The text-overlap quality drives whether we say `agrees` vs `uncertain`;
      // the WEBSITE ANCHOR drives the identity confidence — and an `agrees`
      // verdict on identity-verified data is high-confidence by construction.
      if (
        websiteCorroborates &&
        verdict === JudgmentVerdict.Agrees &&
        finalConfidence === FieldConfidence.Medium
      ) {
        finalConfidence = FieldConfidence.High;
      }
      return {
        confidence: finalConfidence,
        score,
        verdict,
        note,
        judgedVia: JudgmentSource.ScrapingDog,
      };
    };

    // website — intentionally not judged here. A LinkedIn-vs-team URL host comparison is too
    // noisy: LinkedIn often lists an outdated, aliased, or product-subdomain URL even when the
    // team's website is correct. The AI judge (Stage 2) can verify the website with web search instead.

    // linkedinHandler — corroborated by company_name match (and optionally website host).
    // The actual identity signal is that ScrapingDog returned a profile whose `company_name` matches the team.
    // Website host equality is a strong corroborating signal when both sides declare a website.
    if (team.linkedinHandler && profile.companyName) {
      if (nameMatch === 'exact') {
        result.linkedinHandler = mkJudgment(
          FieldConfidence.High,
          JudgmentVerdict.Agrees,
          websiteCorroborates ? 100 : 95,
          websiteCorroborates ? 'name match and website' : 'name match'
        );
      } else {
        // nameMatch === 'partial'. A partial-only match (e.g. "Acme Inc" vs "Acme BV")
        // is too risky to mark as Agrees on its own — surface it for review.
        if (websiteCorroborates) {
          result.linkedinHandler = mkJudgment(
            FieldConfidence.High,
            JudgmentVerdict.Agrees,
            90,
            'name match partial and website'
          );
        } else {
          result.linkedinHandler = mkJudgment(
            FieldConfidence.Medium,
            JudgmentVerdict.Uncertain,
            55,
            'name match partial only'
          );
        }
      }
    }

    // shortDescription — tagline overlap
    if (team.shortDescription && profile.tagline) {
      if (this.textsOverlap(team.shortDescription, profile.tagline, 0.2)) {
        result.shortDescription = mkJudgment(FieldConfidence.High, JudgmentVerdict.Agrees, 85, 'tagline overlap');
      } else {
        result.shortDescription = mkJudgment(FieldConfidence.Medium, JudgmentVerdict.Uncertain, 50, 'tagline differs');
      }
    }

    // longDescription — about sentence overlap
    if (team.longDescription && profile.about) {
      if (this.sentenceOverlap(team.longDescription, profile.about, 0.4)) {
        result.longDescription = mkJudgment(FieldConfidence.High, JudgmentVerdict.Agrees, 85, 'about overlap');
      } else {
        result.longDescription = mkJudgment(FieldConfidence.Medium, JudgmentVerdict.Uncertain, 50, 'about low overlap');
      }
    }

    // industryTags — set intersection with industries + specialties
    if (team.industryTags && team.industryTags.length > 0) {
      const linkedinTags = [...profile.industries, ...profile.specialties]
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean);
      if (linkedinTags.length > 0) {
        const teamTagsLower = team.industryTags.map((t) => t.title.toLowerCase());
        const overlap = teamTagsLower.some((t) => linkedinTags.some((l) => l.includes(t) || t.includes(l)));
        if (overlap) {
          result.industryTags = mkJudgment(FieldConfidence.High, JudgmentVerdict.Agrees, 80, 'tags overlap');
        } else {
          result.industryTags = mkJudgment(FieldConfidence.Medium, JudgmentVerdict.Uncertain, 45, 'tags no overlap');
        }
      }
    }

    // moreDetails — contains founded year or HQ city
    if (team.moreDetails && (profile.founded || profile.headquarters)) {
      const text = team.moreDetails.toLowerCase();
      const foundedHit = !!profile.founded && text.includes(profile.founded.toLowerCase());
      const hqHit = !!profile.headquarters && this.extractCity(profile.headquarters).some((c) => text.includes(c));
      if (foundedHit || hqHit) {
        result.moreDetails = mkJudgment(FieldConfidence.Medium, JudgmentVerdict.Agrees, 70, 'details match');
      } else {
        result.moreDetails = mkJudgment(FieldConfidence.Medium, JudgmentVerdict.Uncertain, 50, 'details no match');
      }
    }

    return result;
  }

  private extractHandleId(handler: string): string | null {
    if (!handler) return null;
    const trimmed = handler.trim();
    if (!trimmed) return null;
    // Full or partial LinkedIn URL — only accept company paths.
    if (/linkedin\.com\//i.test(trimmed)) {
      const m = trimmed.match(/linkedin\.com\/company\/([a-zA-Z0-9_.-]+)/i);
      return m ? m[1].replace(/\/+$/, '') : null;
    }
    // Otherwise treat as a bare handle (optionally prefixed with `company/`), stripping query/path.
    const cleaned = trimmed
      .replace(/^company\//i, '')
      .replace(/[\/?#].*$/, '')
      .trim();
    return /^[a-zA-Z0-9_.-]+$/.test(cleaned) ? cleaned : null;
  }

  /**
   * Normalizes a raw `twitterHandler` value (which may be a bare handle, an
   * `@`-prefixed handle, or a full twitter.com / x.com URL) into the bare
   * username form expected by ScrapingDog's X profile endpoint. Returns null
   * when the input doesn't pass X's username shape rules (1-15 alphanumeric
   * + underscore characters).
   */
  private extractTwitterHandle(handler: string): string | null {
    if (!handler) return null;
    const trimmed = handler.trim();
    if (!trimmed) return null;
    // Full / partial twitter.com or x.com URL — pull the first path segment.
    if (/(?:twitter|x)\.com\//i.test(trimmed)) {
      const m = trimmed.match(/(?:twitter|x)\.com\/([A-Za-z0-9_]+)/i);
      return m && /^[A-Za-z0-9_]{1,15}$/.test(m[1]) ? m[1] : null;
    }
    const cleaned = trimmed
      .replace(/^@/, '')
      .replace(/[\/?#].*$/, '')
      .trim();
    return /^[A-Za-z0-9_]{1,15}$/.test(cleaned) ? cleaned : null;
  }

  private isNotFoundBody(raw: unknown): boolean {
    if (!raw || typeof raw !== 'object') return false;
    const r = raw as Record<string, unknown>;
    if (r.success === false) {
      const message = typeof r.message === 'string' ? r.message : '';
      if (/not found/i.test(message)) return true;
    }
    return false;
  }

  private normalizeName(s: string): string {
    return s
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Normalizes a URL to a comparable host string (strips `www.`, lowercases).
   * Public so the judge can match a probe's redirect-final host against the same
   * normalization the deterministic comparator uses.
   */
  extractHost(url: string): string | null {
    try {
      const parsed = new URL(url);
      return parsed.host.replace(/^www\./, '').toLowerCase();
    } catch {
      return null;
    }
  }

  private textsOverlap(a: string, b: string, levenshteinRatio: number): boolean {
    const an = a.toLowerCase().replace(/\s+/g, ' ').trim();
    const bn = b.toLowerCase().replace(/\s+/g, ' ').trim();
    if (!an || !bn) return false;
    if (an.includes(bn) || bn.includes(an)) return true;
    const longer = an.length >= bn.length ? an : bn;
    const shorter = an.length >= bn.length ? bn : an;
    const distance = this.levenshtein(longer, shorter);
    const maxAllowed = Math.ceil(longer.length * levenshteinRatio);
    return distance <= maxAllowed;
  }

  private sentenceOverlap(a: string, b: string, threshold: number): boolean {
    const split = (s: string) =>
      s
        .split(/[.!?]\s+/)
        .map((p) => p.replace(/\s+/g, ' ').trim().toLowerCase())
        .filter((p) => p.length >= 12);
    const aParts = split(a);
    const bParts = split(b);
    if (aParts.length === 0 || bParts.length === 0) return false;
    const shorter = aParts.length <= bParts.length ? aParts : bParts;
    const longer = aParts.length <= bParts.length ? bParts : aParts;
    const longerText = longer.join(' ');
    const hits = shorter.filter((s) => longerText.includes(s)).length;
    return hits / shorter.length >= threshold;
  }

  private levenshtein(a: string, b: string): number {
    if (a === b) return 0;
    if (!a.length) return b.length;
    if (!b.length) return a.length;
    const prev = new Array(b.length + 1).fill(0).map((_, i) => i);
    const curr = new Array(b.length + 1).fill(0);
    for (let i = 1; i <= a.length; i++) {
      curr[0] = i;
      for (let j = 1; j <= b.length; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
      }
      for (let j = 0; j <= b.length; j++) prev[j] = curr[j];
    }
    return prev[b.length];
  }

  private extractCity(headquarters: string): string[] {
    return headquarters
      .split(',')
      .map((p) => p.trim().toLowerCase())
      .filter((p) => p.length > 0);
  }

  private normalize(raw: Record<string, unknown>): ScrapingDogCompanyProfile {
    const splitList = (value: unknown): string[] => {
      if (!value || typeof value !== 'string') return [];
      return value
        .split(/[,;]/)
        .map((s) => s.trim())
        .filter(Boolean);
    };

    const nonEmpty = (value: unknown): string | null => {
      if (typeof value !== 'string') return null;
      const trimmed = value.trim();
      return trimmed.length > 0 ? trimmed : null;
    };

    return {
      universalNameId: nonEmpty(raw.universal_name_id),
      companyName: nonEmpty(raw.company_name),
      profilePhoto: this.validateUrl(raw.profile_photo),
      website: this.validateUrl(raw.website),
      tagline: nonEmpty(raw.tagline),
      about: nonEmpty(raw.about),
      industries: splitList(raw.industries ?? raw.industry),
      specialties: splitList(raw.specialties),
      founded: nonEmpty(raw.founded),
      headquarters: nonEmpty(raw.headquarters),
      linkedinInternalId: nonEmpty(raw.linkedin_internal_id),
    };
  }

  /**
   * Normalizes ScrapingDog's parsed X profile body. Defensive against missing
   * keys — the parsed-true endpoint usually returns all of them but we never
   * trust that. `verified_type` of `"Business"` flips `isVerifiedOrg` true,
   * which the team-enrichment pipeline uses as a corroborating identity signal
   * (X manually verifies official org accounts).
   */
  private normalizeTwitterProfile(raw: Record<string, unknown>): ScrapingDogTwitterProfile {
    const nonEmpty = (value: unknown): string | null => {
      if (typeof value !== 'string') return null;
      const trimmed = value.trim();
      return trimmed.length > 0 ? trimmed : null;
    };

    const rawUsername = nonEmpty(raw.username);
    const cleanedUsername = rawUsername ? rawUsername.replace(/^@/, '').toLowerCase() : null;
    const verifiedType = nonEmpty(raw.verified_type);

    return {
      username: cleanedUsername,
      name: nonEmpty(raw.name),
      description: nonEmpty(raw.description),
      website: this.validateUrl(raw.website),
      userId: nonEmpty(raw.user_id),
      verifiedType,
      // X uses verified_type to mark business / government / news org accounts.
      // The boolean `verified` field is meaningful only on legacy blue-check
      // accounts; the org class is what we actually trust as an identity signal.
      isVerifiedOrg: verifiedType?.toLowerCase() === 'business' || verifiedType?.toLowerCase() === 'government',
    };
  }

  private validateUrl(url: unknown): string | null {
    if (typeof url !== 'string' || !url.trim()) return null;
    try {
      const parsed = new URL(url.trim());
      if (!['http:', 'https:'].includes(parsed.protocol)) return null;
      return parsed.toString();
    } catch {
      return null;
    }
  }
}
