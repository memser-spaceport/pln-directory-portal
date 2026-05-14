import { FieldKey } from '../../../hooks/teams/useTeamsEnrichmentReview';

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
