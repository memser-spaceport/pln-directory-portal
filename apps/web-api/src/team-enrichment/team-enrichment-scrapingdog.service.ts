import { Injectable, Logger } from '@nestjs/common';

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

@Injectable()
export class TeamEnrichmentScrapingDogService {
  private readonly logger = new Logger(TeamEnrichmentScrapingDogService.name);
  private static readonly API_URL = 'https://api.scrapingdog.com/profile';
  private static readonly TIMEOUT_MS = 15000;

  isConfigured(): boolean {
    return Boolean(process.env.SCRAPINGDOG_API_KEY);
  }

  async fetchCompanyProfile(linkedinHandler: string): Promise<ScrapingDogCompanyProfile | null> {
    const apiKey = process.env.SCRAPINGDOG_API_KEY;
    if (!apiKey) {
      this.logger.debug('SCRAPINGDOG_API_KEY not set, skipping ScrapingDog enrichment');
      return null;
    }

    const id = this.extractHandleId(linkedinHandler);
    if (!id) {
      this.logger.warn(`Could not extract LinkedIn id from handler: "${linkedinHandler}"`);
      return null;
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
        return null;
      }

      const body = await response.json();
      const raw = Array.isArray(body) ? body[0] : body;
      if (!raw || typeof raw !== 'object') {
        this.logger.warn(`ScrapingDog returned empty/invalid payload for id "${id}"`);
        return null;
      }

      return this.normalize(raw);
    } catch (error) {
      this.logger.warn(`ScrapingDog fetch failed for id "${id}": ${error.message}`);
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }

  private extractHandleId(handler: string): string | null {
    if (!handler) return null;
    const match = handler.match(/(?:linkedin\.com\/)?(?:company\/)?([a-zA-Z0-9_-]+)/);
    return match ? match[1] : null;
  }

  private normalize(raw: any): ScrapingDogCompanyProfile {
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
