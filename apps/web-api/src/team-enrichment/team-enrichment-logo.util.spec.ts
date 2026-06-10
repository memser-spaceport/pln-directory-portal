import { resolveLogoMetaOnFetchFailure } from './team-enrichment-logo.util';
import { EnrichmentSource, FieldConfidence, FieldEnrichmentStatus } from './team-enrichment.types';

describe('resolveLogoMetaOnFetchFailure', () => {
  it('returns CannotEnrich when there is genuinely no logo on record', () => {
    expect(resolveLogoMetaOnFetchFailure(null, undefined)).toEqual({
      status: FieldEnrichmentStatus.CannotEnrich,
    });
    expect(resolveLogoMetaOnFetchFailure(undefined, undefined)).toEqual({
      status: FieldEnrichmentStatus.CannotEnrich,
    });
  });

  it('preserves an existing logo candidate instead of orphaning it (status stays Enriched)', () => {
    const meta = resolveLogoMetaOnFetchFailure('img-uid-123', {
      status: FieldEnrichmentStatus.Enriched,
      source: EnrichmentSource.OpenGraph,
      confidence: FieldConfidence.Medium,
    });
    expect(meta.status).toBe(FieldEnrichmentStatus.Enriched);
    expect(meta.source).toBe(EnrichmentSource.OpenGraph);
    expect(meta.confidence).toBe(FieldConfidence.Medium);
  });

  it('heals a stale CannotEnrich status when the logoUid is still populated (the prod bug)', () => {
    // Repro of the prod inconsistency: a prior run left TeamEnrichment.logoUid set
    // but a later failed re-fetch flipped status to CannotEnrich.
    const meta = resolveLogoMetaOnFetchFailure('cmpgz9kyd01uyma4gxqdnitrw', {
      status: FieldEnrichmentStatus.CannotEnrich,
      source: EnrichmentSource.OpenGraph,
      confidence: FieldConfidence.Medium,
    });
    expect(meta.status).toBe(FieldEnrichmentStatus.Enriched);
    expect(meta.source).toBe(EnrichmentSource.OpenGraph);
  });

  it('defaults source/confidence when the prior meta lacked them', () => {
    const meta = resolveLogoMetaOnFetchFailure('img-uid-123', undefined);
    expect(meta).toEqual({
      status: FieldEnrichmentStatus.Enriched,
      source: EnrichmentSource.OpenGraph,
      confidence: FieldConfidence.Medium,
    });
  });

  it('keeps an existing high confidence / scrapingdog source rather than downgrading', () => {
    const meta = resolveLogoMetaOnFetchFailure('img-uid-123', {
      status: FieldEnrichmentStatus.Enriched,
      source: EnrichmentSource.ScrapingDog,
      confidence: FieldConfidence.High,
    });
    expect(meta.source).toBe(EnrichmentSource.ScrapingDog);
    expect(meta.confidence).toBe(FieldConfidence.High);
  });
});
