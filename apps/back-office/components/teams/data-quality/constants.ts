import { EnrichmentTeam, FieldEntry, FieldKey } from '../../../hooks/teams/useTeamsEnrichmentReview';

export const FIELD_KEYS: FieldKey[] = [
  'website',
  'logo',
  'shortDescription',
  'longDescription',
  'contactMethod',
  'twitterHandler',
  'linkedinHandler',
  'blog',
];

export const FIELD_LABELS: Record<FieldKey, string> = {
  website: 'Website',
  logo: 'Logo',
  shortDescription: 'Short Description',
  longDescription: 'Long Description',
  contactMethod: 'Contact Method',
  twitterHandler: 'Twitter',
  linkedinHandler: 'LinkedIn',
  blog: 'Blog',
};

export const AI_SOURCES = ['ai', 'open-graph', 'scrapingdog'] as const;

// Eliminates the repeated `key === 'logo' ? team.logo : team.fields[key]` ternary
export function getEntry(team: EnrichmentTeam, key: FieldKey): FieldEntry | undefined {
  return key === 'logo' ? team.logo : team.fields[key];
}

// A field is AI-enriched if its source is automated AND the user hasn't overridden it
export function isAIEnriched(entry: FieldEntry): boolean {
  return (AI_SOURCES as ReadonlyArray<string>).includes(entry.metadata.source ?? '') &&
    entry.metadata.status !== 'ChangedByUser';
}

// Mirrors the API's inclusion rule (apps/web-api .../team-enrichment.service.ts listEnrichmentsForReview).
// A field/logo needs review iff it has NOT been auto-approved at verdict=agrees + confidence=high
// — the same pair the judge promotes on and admin approval normalizes to. Score is intentionally
// NOT consulted (ScrapingDog/AI can emit score=90 at medium confidence — not promoted — and
// score=85 at high — promoted).
//
//  - Non-logo fields: read fields[key].judgment. If absent, the field hasn't been judged yet
//    and isn't review-ready (matches the API, which skips unjudged entries).
//  - Logo: there is no field-level judgment; the equivalent signal is the latest
//    TeamLogoVerificationResult exposed as logo.verification. A team's logo needs review when
//    it has content and verification is missing or not (verified + high).
export function needsReview(team: EnrichmentTeam, key: FieldKey): boolean {
  if (key === 'logo') {
    const logo = team.logo;
    if (!logo?.content) return false;
    const v = logo.verification;
    return !(v?.verdict === 'verified' && v?.confidence === 'high');
  }
  const entry = team.fields[key];
  if (!entry?.judgment) return false;
  return !(entry.judgment.verdict === 'agrees' && entry.judgment.confidence === 'high');
}
