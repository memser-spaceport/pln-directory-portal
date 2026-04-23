import { Injectable, Logger } from '@nestjs/common';
import {
  FieldConfidence,
  FieldJudgment,
  FieldMetaKey,
  JudgmentSource,
  JudgmentVerdict,
  NameMatchTier,
} from './team-enrichment.types';

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

export type FetchCompanyProfileResult =
  | { kind: 'ok'; profile: ScrapingDogCompanyProfile }
  | { kind: 'not-found' }
  | { kind: 'error'; reason: string };

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
        this.logger.warn(`ScrapingDog returned profile with no company_name/universal_name_id for id "${id}", treating as not-found`);
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

    const result: Partial<Record<FieldMetaKey, FieldJudgment>> = {};
    const now = new Date().toISOString();
    const mkJudgment = (
      confidence: FieldConfidence,
      verdict: JudgmentVerdict,
      score: number,
      rationale: string
    ): FieldJudgment => ({
      confidence: nameMatch === 'partial' && confidence === FieldConfidence.High ? FieldConfidence.Medium : confidence,
      score,
      verdict,
      rationale,
      judgedAt: now,
      judgedVia: JudgmentSource.ScrapingDog,
    });

    // website — URL host match (strip www.)
    if (team.website && profile.website) {
      const teamHost = this.extractHost(team.website);
      const profileHost = this.extractHost(profile.website);
      if (teamHost && profileHost) {
        if (teamHost === profileHost) {
          result.website = mkJudgment(
            FieldConfidence.High,
            JudgmentVerdict.Agrees,
            95,
            `Team website host "${teamHost}" matches LinkedIn's canonical website "${profileHost}".`
          );
        } else {
          result.website = mkJudgment(
            FieldConfidence.Low,
            JudgmentVerdict.Disagrees,
            20,
            `Team website "${team.website}" does not match LinkedIn's canonical website "${profile.website}".`
          );
        }
      }
    }

    // linkedinHandler — normalized equality with universal_name_id
    if (team.linkedinHandler && profile.universalNameId) {
      const teamHandle = this.normalizeHandleForCompare(team.linkedinHandler);
      const profileHandle = this.normalizeHandleForCompare(profile.universalNameId);
      if (teamHandle === profileHandle) {
        result.linkedinHandler = mkJudgment(
          FieldConfidence.High,
          JudgmentVerdict.Agrees,
          100,
          `Team LinkedIn handle matches LinkedIn's universal name id "${profile.universalNameId}".`
        );
      } else {
        result.linkedinHandler = mkJudgment(
          FieldConfidence.Low,
          JudgmentVerdict.Disagrees,
          15,
          `Team LinkedIn handle "${team.linkedinHandler}" does not match LinkedIn's universal name id "${profile.universalNameId}".`
        );
      }
    }

    // shortDescription — tagline overlap
    if (team.shortDescription && profile.tagline) {
      if (this.textsOverlap(team.shortDescription, profile.tagline, 0.2)) {
        result.shortDescription = mkJudgment(
          FieldConfidence.High,
          JudgmentVerdict.Agrees,
          85,
          'Team short description overlaps with LinkedIn tagline.'
        );
      } else {
        result.shortDescription = mkJudgment(
          FieldConfidence.Medium,
          JudgmentVerdict.Uncertain,
          50,
          `Team short description differs from LinkedIn tagline ("${this.truncateForRationale(profile.tagline)}"). Deferring to AI judge.`
        );
      }
    }

    // longDescription — about sentence overlap
    if (team.longDescription && profile.about) {
      if (this.sentenceOverlap(team.longDescription, profile.about, 0.4)) {
        result.longDescription = mkJudgment(
          FieldConfidence.High,
          JudgmentVerdict.Agrees,
          85,
          'Team long description shares sentences with LinkedIn about text.'
        );
      } else {
        result.longDescription = mkJudgment(
          FieldConfidence.Medium,
          JudgmentVerdict.Uncertain,
          50,
          'Team long description shows low overlap with LinkedIn about text. Deferring to AI judge.'
        );
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
          result.industryTags = mkJudgment(
            FieldConfidence.High,
            JudgmentVerdict.Agrees,
            80,
            'Team industry tags overlap with LinkedIn industries/specialties.'
          );
        } else {
          result.industryTags = mkJudgment(
            FieldConfidence.Medium,
            JudgmentVerdict.Uncertain,
            45,
            'Team industry tags have no overlap with LinkedIn industries/specialties. Deferring to AI judge.'
          );
        }
      }
    }

    // moreDetails — contains founded year or HQ city
    if (team.moreDetails && (profile.founded || profile.headquarters)) {
      const text = team.moreDetails.toLowerCase();
      const foundedHit = !!profile.founded && text.includes(profile.founded.toLowerCase());
      const hqHit = !!profile.headquarters && this.extractCity(profile.headquarters).some((c) => text.includes(c));
      if (foundedHit || hqHit) {
        result.moreDetails = mkJudgment(
          FieldConfidence.Medium,
          JudgmentVerdict.Agrees,
          70,
          'Team moreDetails mentions LinkedIn founded year or headquarters city.'
        );
      } else {
        result.moreDetails = mkJudgment(
          FieldConfidence.Medium,
          JudgmentVerdict.Uncertain,
          50,
          'Team moreDetails does not mention LinkedIn founded year or HQ city. Deferring to AI judge.'
        );
      }
    }

    return result;
  }

  private extractHandleId(handler: string): string | null {
    if (!handler) return null;
    const match = handler.match(/(?:linkedin\.com\/)?(?:company\/)?([a-zA-Z0-9_-]+)/);
    return match ? match[1] : null;
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

  private normalizeHandleForCompare(s: string): string {
    return s
      .toLowerCase()
      .replace(/^https?:\/\/(www\.)?linkedin\.com\//, '')
      .replace(/^company\//, '')
      .replace(/[\/\s]+$/, '')
      .trim();
  }

  private extractHost(url: string): string | null {
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

  private truncateForRationale(s: string): string {
    return s.length > 80 ? s.substring(0, 77) + '...' : s;
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
