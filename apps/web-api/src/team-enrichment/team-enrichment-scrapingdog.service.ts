import { Injectable, Logger } from '@nestjs/common';
import {
  FieldConfidence,
  FieldJudgment,
  FieldMetaKey,
  JudgmentSource,
  JudgmentVerdict,
  NameMatchTier,
} from './team-enrichment.types';
import {
  ABOUT_SENTENCE_OVERLAP_RATIO,
  hostFirstLabelMatchesTeamName,
  makeJudgment,
  namesShareSubstantiveToken,
  normalizeHost,
  SCRAPINGDOG_TIMEOUT_MS,
  sentenceOverlap,
  TAGLINE_LEVENSHTEIN_RATIO,
  textsOverlap,
  validateHttpUrl,
} from './shared';

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
 * Normalized X/Twitter profile data from ScrapingDog's `/x/profile?parsed=true`.
 * X's `verified_type === "Business" | "Government"` is captured as a
 * corroborating identity signal (X manually verifies those tiers).
 */
export interface ScrapingDogTwitterProfile {
  username: string | null;
  name: string | null;
  description: string | null;
  website: string | null;
  userId: string | null;
  isVerifiedOrg: boolean;
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
 * Conservative patterns the X/Twitter description uses to declare that the
 * current handle is no longer the team's canonical account. Each pattern names
 * a successor handle so the recovery path can re-verify the team's identity
 * against the new account without an AI call.
 *
 * The set is intentionally narrow — only phrases that self-identify the
 * account as outdated and explicitly point at a replacement. Generic
 * mentions ("follow @ourpartners", "now hiring @recruiter") would
 * silently rebind a team's handle on a false positive, so we don't match
 * them. The matcher is run by the judge's stale-user-recovery pass; see
 * `attemptStaleUserRecovery` in `team-enrichment-judge.service.ts`.
 */
const SUPERSEDING_HANDLE_PATTERNS: Array<{ re: RegExp; label: string }> = [
  // "This is the old handle of @humntech" — the canonical case (clpr2ryag0002vg02fmgdd6ay).
  { re: /\bold\s+(?:handle|account|username)\s+(?:of|is|was)\s+@([A-Za-z0-9_]{1,15})\b/i, label: 'old handle of' },
  // "We've moved to @newco" / "Migrated to @newco" / "Switched to @newco".
  { re: /\b(?:moved|migrated|relocated|switched)\s+to\s+@([A-Za-z0-9_]{1,15})\b/i, label: 'moved to' },
  // "Rebranded to @newco" / "Renamed to @newco" / "Renamed as @newco".
  { re: /\b(?:rebranded|renamed)\s+(?:to|as)\s+@([A-Za-z0-9_]{1,15})\b/i, label: 'rebranded to' },
  // "Our new account is @newco" / "New handle: @newco" / "Main account is @newco".
  { re: /\b(?:new|current|main)\s+(?:account|handle)\s*(?:is|:)?\s*@([A-Za-z0-9_]{1,15})\b/i, label: 'new account is' },
  // "Follow us at @newco" — moderately restrictive (requires explicit "us at"
  // or "us on" pivot, not just "follow @X"). Catches retirement announcements
  // that keep the bio short.
  { re: /\bfollow\s+us\s+(?:at|on)\s+@([A-Za-z0-9_]{1,15})\b/i, label: 'follow us at' },
];

/**
 * Detects whether an X profile's description self-declares as superseded by a
 * different handle and returns the named successor. Pure; returns `null` when
 * nothing matches OR when the matched handle equals `currentHandle` (a
 * description that mentions its own handle isn't superseding itself).
 *
 * Result `pattern` is a short tag (matching the table in
 * `SUPERSEDING_HANDLE_PATTERNS`) used in the judge note so reviewers see
 * which phrase fired.
 */
export function extractSupersedingTwitterHandle(
  description: string | null | undefined,
  currentHandle: string | null | undefined
): { newHandle: string; pattern: string } | null {
  if (!description) return null;
  const normalizedCurrent = currentHandle
    ? currentHandle.trim().replace(/^@/, '').toLowerCase()
    : '';
  for (const { re, label } of SUPERSEDING_HANDLE_PATTERNS) {
    const m = description.match(re);
    if (!m) continue;
    const candidate = m[1].toLowerCase();
    if (!candidate || candidate === normalizedCurrent) continue;
    return { newHandle: candidate, pattern: label };
  }
  return null;
}

/**
 * Three-anchor identity check on an X/Twitter profile. Pure; returns the set
 * of anchors that fired. A single strong anchor (website host match) suffices
 * because both sides are independently-controlled team assets. The two weaker
 * anchors (X verification + name overlap, or handle prefix-match + name
 * overlap) require two converging signals.
 */
export function verifyTwitterProfileMatchesTeam(
  team: { name: string; website: string | null | undefined },
  profile: ScrapingDogTwitterProfile
): { verified: boolean; anchors: string[] } {
  const anchors: string[] = [];

  const teamHost = normalizeHost(team.website ?? null);
  const profileHost = normalizeHost(profile.website);
  if (teamHost && profileHost && teamHost === profileHost) {
    anchors.push('website host match');
    return { verified: true, anchors };
  }

  const nameMatches = !!profile.name && namesShareSubstantiveToken(team.name, profile.name);
  if (nameMatches) anchors.push('name match');

  if (nameMatches && profile.isVerifiedOrg) {
    anchors.push('x verified org');
    return { verified: true, anchors };
  }

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
    const timeout = setTimeout(() => controller.abort(), SCRAPINGDOG_TIMEOUT_MS);

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

      // Defensive: 200 with an empty company shell (no name/id) is "not found"
      // for our purposes — preserves classifyNameMatch's ability to trust 'ok'.
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
    const timeout = setTimeout(() => controller.abort(), SCRAPINGDOG_TIMEOUT_MS);

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

      // X endpoint nests data under `profile`. Defensive: also accept the
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
   * Deterministic field comparisons between a team's current values and the
   * ScrapingDog LinkedIn profile. When nameMatch === 'partial', a high verdict
   * is downshifted to medium unless the website host also corroborates —
   * partial-name-match alone doesn't establish identity.
   *
   * When the website host matches on both sides, `agrees + medium` verdicts
   * from fuzzy text-overlap comparators are lifted to `agrees + high` (the
   * identity is double-corroborated, so the comparator becomes the verification
   * rather than the identity proof).
   */
  compareProfileToTeam(
    team: TeamSnapshotForCompare,
    profile: ScrapingDogCompanyProfile,
    nameMatch: NameMatchTier
  ): Partial<Record<FieldMetaKey, FieldJudgment>> {
    if (nameMatch === 'none') return {};

    const teamHost = team.website ? normalizeHost(team.website) : null;
    const profileHost = profile.website ? normalizeHost(profile.website) : null;
    const websiteCorroborates = !!teamHost && !!profileHost && teamHost === profileHost;

    const result: Partial<Record<FieldMetaKey, FieldJudgment>> = {};
    const mkVerdict = (
      confidence: FieldConfidence,
      verdict: JudgmentVerdict,
      score: number,
      note: string
    ): FieldJudgment => {
      let finalConfidence = confidence;
      // Partial-name-match downshift: demote High to Medium unless the website
      // host corroborates (ARIA case: team "ARIA" ↔ profile "Advanced Research
      // + Invention Agency (ARIA)" with shared website `aria.org.uk`).
      if (
        nameMatch === 'partial' &&
        finalConfidence === FieldConfidence.High &&
        !websiteCorroborates
      ) {
        finalConfidence = FieldConfidence.Medium;
      }
      // Website-corroborated upshift: fuzzy text-overlap comparators start at
      // Medium even on a clean match; the website anchor lifts identity-
      // verified data to High.
      if (
        websiteCorroborates &&
        verdict === JudgmentVerdict.Agrees &&
        finalConfidence === FieldConfidence.Medium
      ) {
        finalConfidence = FieldConfidence.High;
      }
      return makeJudgment(finalConfidence, verdict, score, note, JudgmentSource.ScrapingDog);
    };

    // website — NOT judged here. LinkedIn often lists an outdated, aliased,
    // or product-subdomain URL even when the team's website is correct. The
    // AI judge (Stage 2) verifies website with web search instead.

    if (team.linkedinHandler && profile.companyName) {
      if (nameMatch === 'exact') {
        result.linkedinHandler = mkVerdict(
          FieldConfidence.High,
          JudgmentVerdict.Agrees,
          websiteCorroborates ? 100 : 95,
          websiteCorroborates ? 'name match and website' : 'name match'
        );
      } else {
        if (websiteCorroborates) {
          result.linkedinHandler = mkVerdict(
            FieldConfidence.High,
            JudgmentVerdict.Agrees,
            90,
            'name match partial and website'
          );
        } else {
          result.linkedinHandler = mkVerdict(
            FieldConfidence.Medium,
            JudgmentVerdict.Uncertain,
            55,
            'name match partial only'
          );
        }
      }
    }

    if (team.shortDescription && profile.tagline) {
      if (textsOverlap(team.shortDescription, profile.tagline, TAGLINE_LEVENSHTEIN_RATIO)) {
        result.shortDescription = mkVerdict(FieldConfidence.High, JudgmentVerdict.Agrees, 85, 'tagline overlap');
      } else {
        result.shortDescription = mkVerdict(FieldConfidence.Medium, JudgmentVerdict.Uncertain, 50, 'tagline differs');
      }
    }

    if (team.longDescription && profile.about) {
      if (sentenceOverlap(team.longDescription, profile.about, ABOUT_SENTENCE_OVERLAP_RATIO)) {
        result.longDescription = mkVerdict(FieldConfidence.High, JudgmentVerdict.Agrees, 85, 'about overlap');
      } else {
        result.longDescription = mkVerdict(FieldConfidence.Medium, JudgmentVerdict.Uncertain, 50, 'about low overlap');
      }
    }

    if (team.industryTags && team.industryTags.length > 0) {
      const linkedinTags = [...profile.industries, ...profile.specialties]
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean);
      if (linkedinTags.length > 0) {
        const teamTagsLower = team.industryTags.map((t) => t.title.toLowerCase());
        const overlap = teamTagsLower.some((t) => linkedinTags.some((l) => l.includes(t) || t.includes(l)));
        if (overlap) {
          result.industryTags = mkVerdict(FieldConfidence.High, JudgmentVerdict.Agrees, 80, 'tags overlap');
        } else {
          result.industryTags = mkVerdict(FieldConfidence.Medium, JudgmentVerdict.Uncertain, 45, 'tags no overlap');
        }
      }
    }

    if (team.moreDetails && (profile.founded || profile.headquarters)) {
      const text = team.moreDetails.toLowerCase();
      const foundedHit = !!profile.founded && text.includes(profile.founded.toLowerCase());
      const hqHit = !!profile.headquarters && this.extractCity(profile.headquarters).some((c) => text.includes(c));
      if (foundedHit || hqHit) {
        result.moreDetails = mkVerdict(FieldConfidence.Medium, JudgmentVerdict.Agrees, 70, 'details match');
      } else {
        result.moreDetails = mkVerdict(FieldConfidence.Medium, JudgmentVerdict.Uncertain, 50, 'details no match');
      }
    }

    return result;
  }

  private extractHandleId(handler: string): string | null {
    if (!handler) return null;
    const trimmed = handler.trim();
    if (!trimmed) return null;
    if (/linkedin\.com\//i.test(trimmed)) {
      const m = trimmed.match(/linkedin\.com\/company\/([a-zA-Z0-9_.-]+)/i);
      return m ? m[1].replace(/\/+$/, '') : null;
    }
    const cleaned = trimmed
      .replace(/^company\//i, '')
      .replace(/[\/?#].*$/, '')
      .trim();
    return /^[a-zA-Z0-9_.-]+$/.test(cleaned) ? cleaned : null;
  }

  /**
   * Normalizes a `twitterHandler` value into the bare username form expected
   * by ScrapingDog's X profile endpoint. Returns null when the input doesn't
   * pass X's username shape (1-15 alphanumeric + underscore).
   */
  private extractTwitterHandle(handler: string): string | null {
    if (!handler) return null;
    const trimmed = handler.trim();
    if (!trimmed) return null;
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
      profilePhoto: validateHttpUrl(raw.profile_photo),
      website: validateHttpUrl(raw.website),
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
   * Normalizes ScrapingDog's parsed X profile body. `verified_type` of
   * `"Business"` or `"Government"` flips `isVerifiedOrg` true — X manually
   * verifies those tiers, so they're a usable corroborating identity signal
   * (the boolean `verified` field is meaningful only on legacy blue-checks).
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
      website: validateHttpUrl(raw.website),
      userId: nonEmpty(raw.user_id),
      verifiedType,
      isVerifiedOrg: verifiedType?.toLowerCase() === 'business' || verifiedType?.toLowerCase() === 'government',
    };
  }
}
