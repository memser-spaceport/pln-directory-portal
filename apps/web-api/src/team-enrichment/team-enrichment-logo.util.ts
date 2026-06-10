import {
  EnrichmentSource,
  FieldConfidence,
  FieldEnrichmentMeta,
  FieldEnrichmentStatus,
} from './team-enrichment.types';

/**
 * Resolves the `fieldsMeta.logo` value to write when a logo (re)fetch comes up
 * empty during enrichment.
 *
 * A failed fetch must NOT orphan a previously-discovered logo: if a logo
 * candidate already exists (`TeamEnrichment.logoUid`, or a logo on `Team`), we
 * keep it and heal its status to `Enriched` rather than flipping to
 * `CannotEnrich`. Otherwise `status` would say "no logo" while
 * `TeamEnrichment.logoUid` still points at a real `Image` — the exact
 * inconsistency that confuses the logo-verification job, which keys off the
 * stored `logoUid`. Only when there is genuinely no logo on record do we record
 * `CannotEnrich`.
 *
 * @param existingLogoUid the logo currently on record (`TeamEnrichment.logoUid`
 *   ?? `Team.logoUid`), or null if none.
 * @param existingLogoMeta the prior `fieldsMeta.logo`, if any — its `source` /
 *   `confidence` are preserved when healing.
 */
export function resolveLogoMetaOnFetchFailure(
  existingLogoUid: string | null | undefined,
  existingLogoMeta: FieldEnrichmentMeta | undefined
): FieldEnrichmentMeta {
  if (!existingLogoUid) {
    return { status: FieldEnrichmentStatus.CannotEnrich };
  }
  return {
    ...(existingLogoMeta ?? {}),
    status: FieldEnrichmentStatus.Enriched,
    source: existingLogoMeta?.source ?? EnrichmentSource.OpenGraph,
    confidence: existingLogoMeta?.confidence ?? FieldConfidence.Medium,
  };
}
