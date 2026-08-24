import { Injectable, Logger } from '@nestjs/common';
import { CoresignalEmployeeProfile, CoresignalFetchResult } from './coresignal.types';

/**
 * Shared Coresignal client — usable by any enrichment pipeline (member and,
 * potentially, team enrichment).
 *
 * Uses the Clean Employee API (10 credits/call, half of Multi-source's 20 —
 * Multi-source's extra "AI-enriched" cross-source aggregation isn't worth the
 * cost since this pipeline already runs its own AI enrichment/judgment): GET
 * https://api.coresignal.com/cdapi/v2/employee_clean/collect/<linkedin
 * shorthand name or URL>, `apikey` header. `/search/*` endpoints are free but
 * only return a preview subset (no full experience), so this client never
 * calls them — callers must already know the person's LinkedIn identifier.
 */
const CORESIGNAL_DEFAULT_TIMEOUT_MS = 15000;

@Injectable()
export class CoresignalService {
  private readonly logger = new Logger(CoresignalService.name);
  private static readonly COLLECT_URL = 'https://api.coresignal.com/cdapi/v2/employee_clean/collect';

  isConfigured(): boolean {
    return Boolean(process.env.CORESIGNAL_API_KEY);
  }

  async fetchEmployeeProfile(linkedinIdentifier: string): Promise<CoresignalFetchResult> {
    const apiKey = process.env.CORESIGNAL_API_KEY;
    if (!apiKey) {
      this.logger.debug('CORESIGNAL_API_KEY not set, skipping Coresignal fetch');
      return { kind: 'not-configured' };
    }

    const identifier = this.extractIdentifier(linkedinIdentifier);
    if (!identifier) {
      this.logger.warn(`Could not extract a LinkedIn identifier from: "${linkedinIdentifier}"`);
      return { kind: 'error', reason: 'could not extract identifier' };
    }

    const url = `${CoresignalService.COLLECT_URL}/${encodeURIComponent(identifier)}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.getTimeoutMs());

    try {
      const response = await fetch(url, {
        method: 'GET',
        signal: controller.signal,
        headers: { accept: 'application/json', apikey: apiKey },
      });

      if (response.status === 404) {
        this.logger.warn(`Coresignal reports no profile for identifier "${identifier}"`);
        return { kind: 'not-found' };
      }
      if (!response.ok) {
        this.logger.warn(`Coresignal returned HTTP ${response.status} for identifier "${identifier}"`);
        return { kind: 'error', reason: `HTTP ${response.status}` };
      }

      let body: unknown;
      try {
        body = await response.json();
      } catch (parseError) {
        this.logger.warn(`Coresignal returned malformed JSON for identifier "${identifier}": ${parseError.message}`);
        return { kind: 'error', reason: 'malformed json' };
      }

      const raw = Array.isArray(body) ? (body[0] as unknown) : body;
      if (!raw || typeof raw !== 'object') {
        this.logger.warn(`Coresignal returned empty/invalid payload for identifier "${identifier}"`);
        return { kind: 'not-found' };
      }

      const profile = this.normalizeProfile(raw as Record<string, unknown>);

      // Defensive: 200 with an empty shell (no name/identifier, no experience) is "not found".
      if (!profile.fullName && !profile.firstName && !profile.publicIdentifier && profile.experiences.length === 0) {
        this.logger.warn(
          `Coresignal returned an empty profile shell for identifier "${identifier}", treating as not-found`
        );
        return { kind: 'not-found' };
      }

      return { kind: 'ok', profile };
    } catch (error) {
      const reason = error?.name === 'AbortError' ? 'timeout' : error?.message || 'unknown error';
      this.logger.warn(`Coresignal fetch failed for identifier "${identifier}": ${reason}`);
      return { kind: 'error', reason };
    } finally {
      clearTimeout(timeout);
    }
  }

  private getTimeoutMs(): number {
    const raw = process.env.CORESIGNAL_TIMEOUT_MS?.trim();
    const parsed = raw ? Number.parseInt(raw, 10) : NaN;
    return Number.isInteger(parsed) && parsed > 0 ? parsed : CORESIGNAL_DEFAULT_TIMEOUT_MS;
  }

  /**
   * Extracts the LinkedIn shorthand name Coresignal's `/collect` endpoint
   * accepts directly — either a full `linkedin.com/in/<slug>` URL or a bare
   * slug. Same extraction rules as `MemberScrapingDogService`'s person-handle
   * parsing (same source data — `Member.linkedinHandler` — same slug charset).
   */
  private extractIdentifier(handler: string): string | null {
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

  private normalizeProfile(raw: Record<string, unknown>): CoresignalEmployeeProfile {
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

    // Coresignal's `experience[]` is observed most-recent-first, but sort by
    // `order_in_profile` (ascending) defensively so callers that assume
    // experiences[0] is the current position (matching ScrapingDog's
    // documented ordering) can rely on it regardless of API response order.
    const rawExperience = Array.isArray(raw.experience) ? [...(raw.experience as unknown[])] : [];
    rawExperience.sort((a, b) => {
      const orderA = a && typeof a === 'object' ? Number((a as Record<string, unknown>).order_in_profile) : NaN;
      const orderB = b && typeof b === 'object' ? Number((b as Record<string, unknown>).order_in_profile) : NaN;
      if (Number.isNaN(orderA) || Number.isNaN(orderB)) return 0;
      return orderA - orderB;
    });

    const experiences: CoresignalEmployeeProfile['experiences'] = [];
    for (const entry of rawExperience) {
      if (!entry || typeof entry !== 'object') continue;
      const e = entry as Record<string, unknown>;
      const title = pick(e.title);
      const company = pick(e.company_name);
      if (!title && !company) continue;
      // Clean Employee API gives numeric date_from_year/date_from_month (plus an
      // is_current flag) rather than a ready-made "Mon YYYY" string — build one so
      // this stays byte-compatible with parseLinkedinDateString's expected input,
      // without widening that shared, already-tested parser.
      const startsAt = this.formatMonthYear(e.date_from_year, e.date_from_month);
      const isCurrent = e.is_current === true;
      const endsAt = isCurrent ? null : this.formatMonthYear(e.date_to_year, e.date_to_month);
      experiences.push({
        title,
        company,
        location: pick(e.location),
        duration: startsAt ? `${startsAt} - ${endsAt || 'Present'}` : null,
        summary: pick(e.description),
        startsAt,
        endsAt,
      });
    }

    const education: string[] = [];
    if (Array.isArray(raw.education)) {
      for (const entry of raw.education) {
        if (!entry || typeof entry !== 'object') continue;
        const e = entry as Record<string, unknown>;
        const school = pick(e.institution_name);
        const degree = pick(e.degree);
        const line = [school, degree].filter(Boolean).join(' — ');
        if (line) education.push(line);
      }
    }

    const shorthandNames = Array.isArray(raw.linkedin_shorthand_names)
      ? (raw.linkedin_shorthand_names as unknown[]).find((v) => typeof v === 'string')
      : undefined;

    return {
      fullName: pick(raw.full_name),
      firstName: pick(raw.first_name),
      lastName: pick(raw.last_name),
      publicIdentifier: pick(raw.linkedin_canonical_shorthand_name, shorthandNames),
      headline: pick(raw.headline),
      about: pick(raw.summary),
      location: pick(raw.location, raw.location_full),
      experiences,
      education,
    };
  }

  private static readonly MONTH_ABBREVIATIONS = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];

  /** Builds a "Mon YYYY" string (e.g. "Oct 2024") from Clean Employee API's separate
   *  year/month integer fields, or just "YYYY" when only the year is present. */
  private formatMonthYear(year: unknown, month: unknown): string | null {
    const y = Number(year);
    if (!Number.isInteger(y) || y <= 0) return null;
    const m = Number(month);
    if (Number.isInteger(m) && m >= 1 && m <= 12) {
      return `${CoresignalService.MONTH_ABBREVIATIONS[m - 1]} ${y}`;
    }
    return `${y}`;
  }
}
