import { FieldMetaKey, EnrichableField } from '../team-enrichment.types';

/** Stuck-row recovery TTL for both enrichment and judge in-progress states. */
export const TEAM_ENRICHMENT_STUCK_TTL_MINUTES_DEFAULT = 180;

/** Timeouts (ms). */
export const WEBSITE_PROBE_TIMEOUT_MS = 8000;
export const WEBSITE_FETCH_TIMEOUT_MS = 8000;
export const SCRAPINGDOG_TIMEOUT_MS = 15000;
export const LOGO_FETCH_TIMEOUT_MS = 5000;
export const IMAGE_DOWNLOAD_TIMEOUT_MS = 15000;

/**
 * Status codes that almost always mean "real site, our headers look like a bot"
 * rather than "site is down". Treated as inconclusive (`reachable: null`), not
 * as a negative — many real team sites sit behind full Cloudflare protection
 * and 403 every non-browser fetch.
 */
export const BOT_BLOCK_STATUS_CODES: ReadonlySet<number> = new Set([401, 403, 429, 451, 503]);

/** Text-overlap thresholds for ScrapingDog deterministic field comparators. */
export const TAGLINE_LEVENSHTEIN_RATIO = 0.2;
export const ABOUT_SENTENCE_OVERLAP_RATIO = 0.4;
export const MIN_SENTENCE_LENGTH_CHARS = 12;

/** AI model knobs. */
export const AI_JUDGE_TEMPERATURE = 0.1;
export const AI_JUDGE_MAX_STEPS = 3;

/** Chrome major version advertised in browser-mimic headers. */
export const BROWSER_CHROME_MAJOR_VERSION = 125;

/**
 * Stopword list used by the substantive-token name overlap helpers. Words too
 * generic to identify a team on their own ("inc", "labs", "ai", "the", etc.).
 */
export const COMPANY_STOPWORDS: ReadonlySet<string> = new Set([
  'inc',
  'llc',
  'ltd',
  'co',
  'corp',
  'corporation',
  'company',
  'the',
  'and',
  'of',
  'for',
  'lab',
  'labs',
  'ai',
  'io',
  'app',
  'apps',
  'team',
  'group',
  'network',
  'protocol',
  'foundation',
  'ventures',
  'capital',
  'partners',
  'fund',
  'studio',
  'studios',
  'project',
  'platform',
  'systems',
  'solutions',
  'technologies',
  'tech',
  'global',
  'international',
  'world',
  'pte',
  'gmbh',
  'sa',
  'bv',
  'sl',
  'ag',
]);

/** Minimum substantive-token length (in chars). Anything shorter is stopword-class. */
export const MIN_SUBSTANTIVE_TOKEN_LENGTH = 3;

/** Fields that must parse as a URL with explicit scheme to be judgable. */
export const URL_FIELDS: ReadonlySet<FieldMetaKey> = new Set<FieldMetaKey>(['website', 'blog']);

/** Fields that may be an email (validity pass only checks email shape when value looks email-like). */
export const MAYBE_EMAIL_FIELDS: ReadonlySet<FieldMetaKey> = new Set<FieldMetaKey>(['contactMethod']);

/** Six fields treated as "core" for thin-evidence detection in quality scoring. */
export const CORE_FIELDS: ReadonlySet<EnrichableField> = new Set<EnrichableField>([
  'website',
  'linkedinHandler',
  'twitterHandler',
  'telegramHandler',
  'contactMethod',
  'shortDescription',
]);

/** Stage-2 / AI-judge user-overridable field keys. Anything else ChangedByUser is left alone. */
export const USER_JUDGABLE_FIELD_KEYS: ReadonlySet<FieldMetaKey> = new Set<FieldMetaKey>([
  'website',
  'blog',
  'contactMethod',
  'twitterHandler',
  'linkedinHandler',
  'telegramHandler',
]);

/** Full list of field keys the judge will look at (drives Stage 1/1.5/2 iteration order). */
export const JUDGABLE_FIELD_KEYS: readonly FieldMetaKey[] = [
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
