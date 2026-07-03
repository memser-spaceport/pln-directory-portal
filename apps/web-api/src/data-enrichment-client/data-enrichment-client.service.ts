import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';

export interface AffinityMemberEnrichmentClientResult {
  runId: string;
  affinityPersonId: string;
  dryRun: boolean;
  pull: { found: boolean };
  relationship: { enriched: number; interactionErrors: number };
  ingest: {
    runId: string;
    received: { companies: number; persons: number };
    ingested: { companies: number; persons: number };
    linked: { companiesToTeam: number; personsToMember: number; personsToCompany: number };
    unmatched: { companies: number; persons: number };
    failed: number;
    errors?: string[];
  };
}

@Injectable()
export class DataEnrichmentClientService {
  private readonly logger = new Logger(DataEnrichmentClientService.name);

  private baseUrl(): string {
    const url = process.env.DATA_ENRICHMENT_API_BASE_URL?.trim();
    if (!url) {
      throw new InternalServerErrorException('DATA_ENRICHMENT_API_BASE_URL is not configured');
    }
    return url.replace(/\/+$/, '');
  }

  async triggerAffinityMemberEnrichment(
    affinityPersonId: string,
  ): Promise<AffinityMemberEnrichmentClientResult> {
    const url = `${this.baseUrl()}/api/v1/affinity-enrichment/members/${encodeURIComponent(affinityPersonId)}/run`;
    const headers: Record<string, string> = { Accept: 'application/json' };
    const apiKey = process.env.DATA_ENRICHMENT_API_KEY?.trim();
    if (apiKey) {
      headers.Authorization = `Bearer ${apiKey}`;
    }

    const res = await fetch(url, { method: 'POST', headers });
    const text = await res.text();
    let body: unknown = null;
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        body = text;
      }
    }

    if (res.status === 404) {
      throw new NotFoundException(
        typeof body === 'object' && body && 'message' in body
          ? String((body as { message: string }).message)
          : `Affinity person ${affinityPersonId} not found in founder lists`,
      );
    }
    if (res.status === 409) {
      throw new ConflictException(
        typeof body === 'object' && body && 'message' in body
          ? String((body as { message: string }).message)
          : `Affinity enrichment already in progress for person ${affinityPersonId}`,
      );
    }
    if (!res.ok) {
      this.logger.error(`Data enrichment affinity member run failed: ${res.status} ${text.slice(0, 300)}`);
      throw new InternalServerErrorException('Failed to trigger affinity enrichment');
    }

    return body as AffinityMemberEnrichmentClientResult;
  }
}
