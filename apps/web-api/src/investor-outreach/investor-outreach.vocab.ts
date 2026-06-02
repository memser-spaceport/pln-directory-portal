/** Mirrors apps_script DROPDOWNS + SECTOR_TAGS in pln-investor-outreach-enrichment; DB stores plain strings. */

export const INVESTOR_OUTREACH_SOURCES = [
  'W26',
  'OpenVC',
  'Ramp',
  'Visible',
  'AlphaGrowth',
  'Dealroom',
  'RootData',
  'Exa',
  'Manual',
  'Pitchbook',
  'Tracxn',
  'Foundersuite',
  'Crunchbase',
  'SecEdgar',
  'GitHub',
  'FirmTeam',
] as const;

export const INVESTOR_OUTREACH_EMAIL_STATUS = ['verified', 'unverified', 'invalid', 'catch_all', 'unknown'] as const;

export const INVESTOR_OUTREACH_INVESTOR_TYPES = [
  'fund',
  'angel',
  'hybrid',
  'family_office',
  'syndicate',
  'unknown',
] as const;

export const INVESTOR_OUTREACH_AUM_RANGES = ['<50M', '50-100M', '100-500M', '500M-1B', '1B+', 'unknown'] as const;

export const INVESTOR_OUTREACH_CHECK_SIZE_RANGES = ['<100K', '100-500K', '500K-1M', '1M-5M', '5M+', 'unknown'] as const;

export const INVESTOR_OUTREACH_STAGE_FOCUS = ['pre-seed', 'seed', 'series-a', 'series-b+', 'all', 'unknown'] as const;
export const INVESTOR_OUTREACH_RAISING_NOW = ['yes', 'unknown'] as const;

export const INVESTOR_OUTREACH_ENGAGEMENT_TIER = ['T1_registered', 'T2_clicked', 'T3_opened', 'T4_cold'] as const;

export const INVESTOR_OUTREACH_ENRICHMENT_STATUS = [
  'pending',
  'in_progress',
  'enriched',
  'partial',
  'failed',
  'skipped',
] as const;

export const INVESTOR_OUTREACH_ATTRIBUTION_FUNDS = ['PL Capital', 'PLVS'] as const;

export const INVESTOR_OUTREACH_SECTOR_TAGS = [
  'ai',
  'crypto',
  'defi',
  'infrastructure',
  'frontier-tech',
  'consumer',
  'desci',
  'robotics',
  'neurotech',
  'fintech',
  'biotech',
  'climate',
  'gaming',
  'saas',
  'other',
] as const;

function toStringSet(arr: readonly string[]): Set<string> {
  return new Set(arr);
}

const SOURCE_SET = toStringSet(INVESTOR_OUTREACH_SOURCES);
const EMAIL_STATUS_SET = toStringSet(INVESTOR_OUTREACH_EMAIL_STATUS);
const INVESTOR_TYPE_SET = toStringSet(INVESTOR_OUTREACH_INVESTOR_TYPES);
const AUM_SET = toStringSet(INVESTOR_OUTREACH_AUM_RANGES);
const CHECK_SET = toStringSet(INVESTOR_OUTREACH_CHECK_SIZE_RANGES);
const STAGE_SET = toStringSet(INVESTOR_OUTREACH_STAGE_FOCUS);
const RAISING_NOW_SET = toStringSet(INVESTOR_OUTREACH_RAISING_NOW);
const ENGAGEMENT_SET = toStringSet(INVESTOR_OUTREACH_ENGAGEMENT_TIER);
const ENRICHMENT_SET = toStringSet(INVESTOR_OUTREACH_ENRICHMENT_STATUS);
const SECTOR_TAG_SET = toStringSet(INVESTOR_OUTREACH_SECTOR_TAGS);
const ATTRIBUTION_FUND_SET = toStringSet(INVESTOR_OUTREACH_ATTRIBUTION_FUNDS);

export function isAllowedInvestorSource(v: string): boolean {
  return SOURCE_SET.has(v);
}

export function isAllowedEmailStatus(v: string): boolean {
  return EMAIL_STATUS_SET.has(v);
}

export function isAllowedInvestorType(v: string): boolean {
  return INVESTOR_TYPE_SET.has(v);
}

export function isAllowedAumRange(v: string): boolean {
  return AUM_SET.has(v);
}

export function isAllowedCheckSizeRange(v: string): boolean {
  return CHECK_SET.has(v);
}

export function isAllowedStageFocus(v: string): boolean {
  return STAGE_SET.has(v);
}

export function isAllowedRaisingNow(v: string): boolean {
  return RAISING_NOW_SET.has(v);
}

export function normalizeRaisingNow(raw: string | undefined): {
  raisingNow: string | null;
  raisingStage: string | null;
} {
  if (raw == null || raw.trim() === '') {
    return { raisingNow: null, raisingStage: null };
  }

  const value = raw.trim();
  if (isAllowedRaisingNow(value)) {
    return { raisingNow: value, raisingStage: null };
  }

  if (isAllowedStageFocus(value)) {
    return { raisingNow: 'yes', raisingStage: value };
  }

  throw new Error(`raising_now invalid: ${value}`);
}

export function isAllowedEngagementTier(v: string): boolean {
  return ENGAGEMENT_SET.has(v);
}

export function isAllowedEnrichmentStatus(v: string): boolean {
  return ENRICHMENT_SET.has(v);
}

export function isAllowedAttributionFund(v: string): boolean {
  return ATTRIBUTION_FUND_SET.has(v);
}

export function parseSectorTagsList(
  raw: string | undefined
): { ok: true; value: string } | { ok: false; reason: string } {
  if (raw == null || raw.trim() === '') {
    return { ok: true, value: '' };
  }
  const parts = raw
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const bad = parts.filter((p) => !SECTOR_TAG_SET.has(p));
  if (bad.length) {
    return { ok: false, reason: `Invalid sector_tags: ${bad.join(', ')}` };
  }
  return { ok: true, value: parts.join(',') };
}
