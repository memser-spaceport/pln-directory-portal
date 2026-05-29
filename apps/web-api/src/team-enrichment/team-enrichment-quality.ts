/**
 * Team-level quality scoring.
 *
 * Ported from `pln-data-enrichment/apps/signal-sourcing/src/quality/quality.util.ts`.
 * Pure functions; no I/O. Computed at judge time and persisted to
 * `dataEnrichment.judgment.quality` so admins (and the back-office UI) can
 * surface "thin evidence" teams separately from teams whose AI judge simply
 * said "uncertain" — both classes are currently lumped into the same review
 * list, which is one of the reasons the queue is too noisy.
 *
 * `thinEvidence` is the single load-bearing flag: it fires when a team has
 * <2 distinct enrichment sources OR fewer than 3 of the six core fields
 * populated. A team with high-confidence-looking judgments built on sparse
 * data deserves a different review treatment than a richly-attested team
 * with one mid-confidence field.
 */

import {
  EnrichableField,
  EnrichmentSource,
  FieldEnrichmentMeta,
  FieldEnrichmentStatus,
  FieldMetaKey,
  FieldJudgment,
  TeamQuality,
} from './team-enrichment.types';

/** The six fields treated as "core" for thin-evidence detection. */
const CORE_FIELDS: EnrichableField[] = [
  'website',
  'linkedinHandler',
  'twitterHandler',
  'telegramHandler',
  'contactMethod',
  'shortDescription',
];

/** Fields the validity pass URL-shape-checks. */
const URL_FIELDS = new Set<FieldMetaKey>(['website', 'blog']);

/** Fields the validity pass email-shape-checks (only when value looks like an email). */
const MAYBE_EMAIL_FIELDS = new Set<FieldMetaKey>(['contactMethod']);

export interface QualityInput {
  /** Map of field → enrichment meta entry. Source comes from FieldEnrichmentMeta.source. */
  fieldsMeta: Partial<Record<FieldMetaKey, FieldEnrichmentMeta>>;
  /** Per-field current values (Team or TeamEnrichment, whichever is canonical) — used for completeness + validity. */
  fieldValues: Partial<Record<FieldMetaKey, string | string[] | null | undefined>>;
  /** ISO timestamp of the most recent enrichment run. */
  enrichedAt?: string | null;
  /** Whether `dataEnrichment.websiteSignals` was populated — counts as a distinct source. */
  hasWebsiteSignals: boolean;
  /** Stage 1.5 anchors that fired during this judge run — surfaced in `anchorsFired`. */
  stage15Verdicts: Partial<Record<FieldMetaKey, FieldJudgment>>;
}

function isUrl(v: string): boolean {
  try {
    new URL(v);
    return true;
  } catch {
    return false;
  }
}

function isEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@.]+\.[^\s@]+$/.test(v.trim());
}

function looksLikeEmail(v: string): boolean {
  return /@/.test(v) && !v.startsWith('http');
}

function isPopulated(v: string | string[] | null | undefined): boolean {
  if (v === null || v === undefined) return false;
  if (Array.isArray(v)) return v.length > 0;
  return v.trim().length > 0;
}

/**
 * Counts distinct enrichment sources across all populated fields, plus the
 * website-signals second source (when present). Mirrors pln-data-enrichment's
 * `distinctSources` count — the multiplier behind the accuracy dimension.
 *
 * Sources we recognize: `ai`, `open-graph`, `scrapingdog`, and the synthetic
 * `website-signals` (when `dataEnrichment.websiteSignals` is non-null). User
 * input (`ChangedByUser`) also counts as a source for completeness purposes
 * but lives outside `EnrichmentSource` — we treat it as one additional source.
 */
function countDistinctSources(input: QualityInput): number {
  const sources = new Set<string>();
  let hasUserInput = false;
  for (const [, meta] of Object.entries(input.fieldsMeta) as Array<[FieldMetaKey, FieldEnrichmentMeta | undefined]>) {
    if (!meta) continue;
    if (meta.status === FieldEnrichmentStatus.ChangedByUser) hasUserInput = true;
    if (meta.source) sources.add(meta.source);
  }
  if (input.hasWebsiteSignals) sources.add('website-signals');
  if (hasUserInput) sources.add('user');
  return sources.size;
}

function computeCompleteness(input: QualityInput): number {
  const enrichableFields: FieldMetaKey[] = [
    'website',
    'blog',
    'contactMethod',
    'twitterHandler',
    'linkedinHandler',
    'telegramHandler',
    'shortDescription',
    'longDescription',
    'moreDetails',
    'industryTags',
    'investmentFocus',
  ];
  const populated = enrichableFields.filter((f) => isPopulated(input.fieldValues[f])).length;
  return populated / enrichableFields.length;
}

function computeValidity(input: QualityInput): number {
  let checked = 0;
  let passed = 0;
  for (const [key, value] of Object.entries(input.fieldValues) as Array<[FieldMetaKey, unknown]>) {
    if (typeof value !== 'string' || value.trim().length === 0) continue;
    if (URL_FIELDS.has(key)) {
      checked++;
      if (isUrl(value)) passed++;
    } else if (MAYBE_EMAIL_FIELDS.has(key) && looksLikeEmail(value)) {
      checked++;
      if (isEmail(value)) passed++;
    }
  }
  return checked === 0 ? 1 : passed / checked;
}

function computeFreshness(enrichedAt: string | null | undefined): number {
  if (!enrichedAt) return 0;
  const enriched = Date.parse(enrichedAt);
  if (Number.isNaN(enriched)) return 0;
  const days = (Date.now() - enriched) / (1000 * 60 * 60 * 24);
  const value = 1 - days / 365;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function countCoreFieldsPopulated(input: QualityInput): number {
  return CORE_FIELDS.filter((f) => isPopulated(input.fieldValues[f])).length;
}

function collectAnchorsFired(verdicts: Partial<Record<FieldMetaKey, FieldJudgment>>): string[] {
  const out = new Set<string>();
  for (const v of Object.values(verdicts)) {
    if (v?.note) out.add(v.note);
  }
  return [...out].sort();
}

export function computeTeamQuality(input: QualityInput): TeamQuality {
  const distinctSources = countDistinctSources(input);
  const coreFieldsPopulated = countCoreFieldsPopulated(input);
  return {
    completeness: round2(computeCompleteness(input)),
    validity: round2(computeValidity(input)),
    freshness: round2(computeFreshness(input.enrichedAt)),
    distinctSources,
    thinEvidence: distinctSources < 2 || coreFieldsPopulated < 3,
    anchorsFired: collectAnchorsFired(input.stage15Verdicts),
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// Re-export EnrichmentSource for callers that build a fieldsMeta from primitives.
export { EnrichmentSource };
