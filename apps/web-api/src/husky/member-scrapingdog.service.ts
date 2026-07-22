import { Injectable, Logger } from '@nestjs/common';

/**
 * ScrapingDog client for *member* (person) profiles, used by the AI bio
 * refresh flow. Kept separate from `TeamEnrichmentScrapingDogService`, which
 * is company/team-scoped — the two features share only the vendor.
 *
 * Person endpoint: GET https://api.scrapingdog.com/profile?type=profile&id=<slug>
 * (a person scrape is ScrapingDog's most expensive call, 50-100 credits —
 * callers must exhaust free signals before fetching).
 * X endpoint: GET https://api.scrapingdog.com/x/profile?parsed=true (cheap).
 */

/**
 * Normalized LinkedIn person profile. Field picks are validated against a
 * real `/profile?type=profile` response (see member-scrapingdog.service.spec.ts
 * fixture): top level has `fullName`, `first_name`, `last_name`,
 * `public_identifier`, `headline`, `location`, `about`, `experience[]`
 * (`position`, `company_name`, `location`, `summary`, `starts_at`, `ends_at`,
 * `duration`), `education[]` (`college_name`, `college_degree`,
 * `college_degree_field`).
 */
export interface ScrapingDogPersonProfile {
  fullName: string | null;
  firstName: string | null;
  lastName: string | null;
  publicIdentifier: string | null;
  headline: string | null;
  about: string | null;
  location: string | null;
  experiences: Array<{
    title: string | null;
    company: string | null;
    location: string | null;
    duration: string | null;
    summary: string | null;
  }>;
  education: string[];
}

/** Minimal X profile slice the bio flow needs (pronoun scan + bio context). */
export interface ScrapingDogMemberXProfile {
  username: string | null;
  name: string | null;
  description: string | null;
}

export type FetchPersonProfileResult =
  | { kind: 'ok'; profile: ScrapingDogPersonProfile }
  | { kind: 'not-found' }
  | { kind: 'error'; reason: string };

export type FetchMemberXProfileResult =
  | { kind: 'ok'; profile: ScrapingDogMemberXProfile }
  | { kind: 'not-found' }
  | { kind: 'error'; reason: string };

const SCRAPINGDOG_TIMEOUT_MS = 15000;

@Injectable()
export class MemberScrapingDogService {
  private readonly logger = new Logger(MemberScrapingDogService.name);
  private static readonly API_URL = 'https://api.scrapingdog.com/profile';
  private static readonly X_API_URL = 'https://api.scrapingdog.com/x/profile';

  isConfigured(): boolean {
    return Boolean(process.env.SCRAPINGDOG_API_KEY);
  }

  async fetchPersonProfile(linkedinHandler: string): Promise<FetchPersonProfileResult> {
    const apiKey = process.env.SCRAPINGDOG_API_KEY;
    if (!apiKey) {
      this.logger.debug('SCRAPINGDOG_API_KEY not set, skipping ScrapingDog person profile fetch');
      return { kind: 'error', reason: 'api key not configured' };
    }

    const id = this.extractPersonHandleId(linkedinHandler);
    if (!id) {
      this.logger.warn(`Could not extract LinkedIn person id from handler: "${linkedinHandler}"`);
      return { kind: 'error', reason: 'could not extract handle id' };
    }

    const url = new URL(MemberScrapingDogService.API_URL);
    url.searchParams.set('api_key', apiKey);
    url.searchParams.set('id', id);
    url.searchParams.set('type', 'profile');

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), SCRAPINGDOG_TIMEOUT_MS);

    try {
      const response = await fetch(url.toString(), {
        method: 'GET',
        signal: controller.signal,
        headers: { 'User-Agent': 'PLNEnrichment/1.0' },
      });

      if (!response.ok) {
        this.logger.warn(`ScrapingDog person returned HTTP ${response.status} for id "${id}"`);
        return { kind: 'error', reason: `HTTP ${response.status}` };
      }

      let body: unknown;
      try {
        body = await response.json();
      } catch (parseError) {
        this.logger.warn(`ScrapingDog person returned malformed JSON for id "${id}": ${parseError.message}`);
        return { kind: 'error', reason: 'malformed json' };
      }

      // The person endpoint wraps the profile in a single-element array.
      const raw = Array.isArray(body) ? (body[0] as unknown) : body;
      if (!raw || typeof raw !== 'object') {
        this.logger.warn(`ScrapingDog person returned empty/invalid payload for id "${id}"`);
        return { kind: 'error', reason: 'empty or invalid payload' };
      }

      if (this.isNotFoundBody(raw)) {
        this.logger.warn(`ScrapingDog reports person profile not found for id "${id}"`);
        return { kind: 'not-found' };
      }

      const profile = this.normalizePersonProfile(raw as Record<string, unknown>);

      // Defensive: 200 with an empty shell (no name/identifier) is "not found".
      if (!profile.fullName && !profile.firstName && !profile.publicIdentifier) {
        this.logger.warn(
          `ScrapingDog returned person profile with no name/public_identifier for id "${id}", treating as not-found`
        );
        return { kind: 'not-found' };
      }

      return { kind: 'ok', profile };
    } catch (error) {
      const reason = error?.name === 'AbortError' ? 'timeout' : error?.message || 'unknown error';
      this.logger.warn(`ScrapingDog person fetch failed for id "${id}": ${reason}`);
      return { kind: 'error', reason };
    } finally {
      clearTimeout(timeout);
    }
  }

  async fetchXProfile(handle: string): Promise<FetchMemberXProfileResult> {
    const apiKey = process.env.SCRAPINGDOG_API_KEY;
    if (!apiKey) {
      this.logger.debug('SCRAPINGDOG_API_KEY not set, skipping ScrapingDog X profile fetch');
      return { kind: 'error', reason: 'api key not configured' };
    }

    const id = this.extractXHandle(handle);
    if (!id) {
      this.logger.warn(`Could not extract X handle from: "${handle}"`);
      return { kind: 'error', reason: 'could not extract handle id' };
    }

    const url = new URL(MemberScrapingDogService.X_API_URL);
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
      const profileBlock = r.profile && typeof r.profile === 'object' ? (r.profile as Record<string, unknown>) : r;
      const profile = this.normalizeXProfile(profileBlock);

      if (!profile.username && !profile.name) {
        this.logger.warn(`ScrapingDog X returned profile with no username/name for handle "${id}", treating as not-found`);
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

  /**
   * Extracts the person slug from a member `linkedinHandler` — either a full
   * `linkedin.com/in/<slug>` URL or a bare slug. Person slugs allow a wider
   * charset than company ids (unicode names arrive percent-encoded). Company
   * URLs are rejected: this fetch must never scrape a company by accident.
   */
  private extractPersonHandleId(handler: string): string | null {
    if (!handler) return null;
    const trimmed = handler.trim();
    if (!trimmed) return null;
    if (/linkedin\.com\//i.test(trimmed)) {
      const m = trimmed.match(/linkedin\.com\/in\/([a-zA-Z0-9_%.\-]+)/i);
      return m ? m[1].replace(/\/+$/, '') : null;
    }
    const cleaned = trimmed
      .replace(/^in\//i, '')
      .replace(/[\/?#].*$/, '')
      .trim();
    return /^[a-zA-Z0-9_%.\-]+$/.test(cleaned) ? cleaned : null;
  }

  /**
   * Normalizes a `twitterHandler` value into the bare username form expected
   * by ScrapingDog's X profile endpoint (1-15 alphanumeric + underscore).
   */
  private extractXHandle(handler: string): string | null {
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

  private normalizePersonProfile(raw: Record<string, unknown>): ScrapingDogPersonProfile {
    const nonEmpty = (value: unknown): string | null => {
      if (typeof value !== 'string') return null;
      const trimmed = value.trim();
      return trimmed.length > 0 ? trimmed : null;
    };
    const pick = (...values: unknown[]): string | null => {
      for (const value of values) {
        const v = nonEmpty(value);
        if (v) return v;
      }
      return null;
    };

    const experiences: ScrapingDogPersonProfile['experiences'] = [];
    if (Array.isArray(raw.experience)) {
      for (const entry of raw.experience) {
        if (!entry || typeof entry !== 'object') continue;
        const e = entry as Record<string, unknown>;
        const title = pick(e.position, e.title);
        const company = pick(e.company_name, e.company);
        if (!title && !company) continue;
        const startsAt = pick(e.starts_at, e.start_date);
        const endsAt = pick(e.ends_at, e.end_date);
        experiences.push({
          title,
          company,
          location: pick(e.location),
          duration: pick(e.duration) ?? (startsAt ? `${startsAt} - ${endsAt || 'Present'}` : null),
          summary: pick(e.summary, e.description),
        });
      }
    }

    const education: string[] = [];
    if (Array.isArray(raw.education)) {
      for (const entry of raw.education) {
        if (!entry || typeof entry !== 'object') continue;
        const e = entry as Record<string, unknown>;
        const school = pick(e.college_name, e.school_name, e.school);
        const degree = [nonEmpty(e.college_degree) ?? nonEmpty(e.degree), nonEmpty(e.college_degree_field)]
          .filter(Boolean)
          .join(', ');
        const line = [school, degree || null].filter(Boolean).join(' — ');
        if (line) education.push(line);
      }
    }

    return {
      fullName: pick(raw.fullName, raw.full_name, raw.name),
      firstName: pick(raw.first_name, raw.firstName),
      lastName: pick(raw.last_name, raw.lastName),
      publicIdentifier: pick(raw.public_identifier, raw.publicIdentifier),
      headline: pick(raw.headline),
      about: pick(raw.about, raw.summary),
      location: pick(raw.location),
      experiences,
      education,
    };
  }

  private normalizeXProfile(raw: Record<string, unknown>): ScrapingDogMemberXProfile {
    const nonEmpty = (value: unknown): string | null => {
      if (typeof value !== 'string') return null;
      const trimmed = value.trim();
      return trimmed.length > 0 ? trimmed : null;
    };

    const rawUsername = nonEmpty(raw.username);
    return {
      username: rawUsername ? rawUsername.replace(/^@/, '') : null,
      name: nonEmpty(raw.name),
      description: nonEmpty(raw.description),
    };
  }
}
