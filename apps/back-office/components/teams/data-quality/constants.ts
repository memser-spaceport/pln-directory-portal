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

// Unjudged fields default — treated as high-quality so they're excluded from the low-score filter
export const UNJUDGED_SCORE = 100;

// Eliminates the repeated `key === 'logo' ? team.logo : team.fields[key]` ternary
export function getEntry(team: EnrichmentTeam, key: FieldKey): FieldEntry | undefined {
  return key === 'logo' ? team.logo : team.fields[key];
}

// A field is AI-enriched if its source is automated AND the user hasn't overridden it
export function isAIEnriched(entry: FieldEntry): boolean {
  return (AI_SOURCES as ReadonlyArray<string>).includes(entry.metadata.source ?? '') &&
    entry.metadata.status !== 'ChangedByUser';
}
