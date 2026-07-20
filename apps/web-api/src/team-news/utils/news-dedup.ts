import { normalizeSourceUrl } from './url-normalize';

/**
 * These words occur frequently in news copy but carry little information
 * about the actual event.
 *
 * Removing them prevents phrases such as "announces", "launches" or
 * "new platform" from making unrelated stories appear similar.
 */
const STOP_WORDS = new Set([
  'a',
  'an',
  'and',
  'are',
  'as',
  'at',
  'be',
  'been',
  'being',
  'by',
  'for',
  'from',
  'had',
  'has',
  'have',
  'in',
  'into',
  'is',
  'it',
  'its',
  'of',
  'on',
  'or',
  'our',
  'that',
  'the',
  'their',
  'them',
  'they',
  'this',
  'to',
  'via',
  'was',
  'were',
  'will',
  'with',

  // Generic news and product wording.
  'add',
  'added',
  'adds',
  'announce',
  'announced',
  'announces',
  'announcement',
  'bring',
  'bringing',
  'brings',
  'build',
  'building',
  'company',
  'companies',
  'ecosystem',
  'enable',
  'enabled',
  'enables',
  'expand',
  'expanded',
  'expanding',
  'expands',
  'introduce',
  'introduced',
  'introduces',
  'join',
  'joined',
  'joins',
  'launch',
  'launched',
  'launches',
  'layer',
  'milestone',
  'network',
  'new',
  'offer',
  'offering',
  'offers',
  'partner',
  'partners',
  'partnership',
  'platform',
  'provide',
  'provided',
  'provides',
  'publish',
  'published',
  'publishes',
  'release',
  'released',
  'releases',
  'support',
  'supported',
  'supports',
  'team',
  'teams',
  'update',
  'updated',
  'updates',
  'use',
  'used',
  'uses',
  'using',
  'user',
  'users',
]);

/**
 * Small deterministic alias table for common variants found in news copy.
 * This is deliberately limited and transparent; it is not an AI model.
 */
const TOKEN_ALIASES: Record<string, string> = {
  accessibility: 'access',
  accessible: 'access',
  accessed: 'access',

  accounting: 'account',
  accounts: 'account',

  applications: 'app',
  application: 'app',
  apps: 'app',

  businesses: 'business',

  equities: 'equity',

  listed: 'list',
  listing: 'list',
  lists: 'list',

  models: 'model',

  payments: 'payment',

  records: 'record',

  registered: 'register',

  trading: 'trade',
  trades: 'trade',
};

interface SimilarityMetrics {
  overlap: number;
  jaccard: number;
  containment: number;
}

interface StoryInput {
  sourceUrl: string;
  title: string;
  summary?: string | null;
}

export function normalizeNewsText(value: string): string {
  return value
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[^a-z0-9$]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * Lightweight English stemming.
 *
 * We intentionally avoid a dependency and only remove common suffixes.
 * The minimum token lengths reduce destructive transformations.
 */
function stemToken(value: string): string {
  const aliased = TOKEN_ALIASES[value];
  if (aliased) return aliased;

  const suffixes: Array<{ suffix: string; minStemLength: number }> = [
    { suffix: 'ization', minStemLength: 5 },
    { suffix: 'ations', minStemLength: 5 },
    { suffix: 'ation', minStemLength: 5 },
    { suffix: 'ments', minStemLength: 5 },
    { suffix: 'ment', minStemLength: 5 },
    { suffix: 'ingly', minStemLength: 5 },
    { suffix: 'edly', minStemLength: 5 },
    { suffix: 'ing', minStemLength: 5 },
    { suffix: 'ies', minStemLength: 4 },
    { suffix: 'ers', minStemLength: 4 },
    { suffix: 'ed', minStemLength: 4 },
    { suffix: 'es', minStemLength: 4 },
    { suffix: 's', minStemLength: 4 },
  ];

  for (const { suffix, minStemLength } of suffixes) {
    if (
      value.endsWith(suffix) &&
      value.length - suffix.length >= minStemLength
    ) {
      return value.slice(0, -suffix.length);
    }
  }

  return value;
}

function tokens(value: string): Set<string> {
  const result = new Set<string>();

  for (const token of normalizeNewsText(value).split(' ')) {
    if (token.length <= 2 || STOP_WORDS.has(token)) continue;

    const normalized = stemToken(token);

    if (
      normalized.length > 2 &&
      !STOP_WORDS.has(normalized)
    ) {
      result.add(normalized);
    }
  }

  return result;
}

function similarity(
  leftTokens: Set<string>,
  rightTokens: Set<string>
): SimilarityMetrics {
  if (leftTokens.size === 0 || rightTokens.size === 0) {
    return {
      overlap: 0,
      jaccard: 0,
      containment: 0,
    };
  }

  let overlap = 0;

  for (const token of leftTokens) {
    if (rightTokens.has(token)) {
      overlap++;
    }
  }

  const unionSize = new Set([
    ...leftTokens,
    ...rightTokens,
  ]).size;

  return {
    overlap,
    jaccard: unionSize > 0 ? overlap / unionSize : 0,
    containment:
      overlap / Math.min(leftTokens.size, rightTokens.size),
  };
}

function compareText(left: string, right: string): SimilarityMetrics {
  return similarity(tokens(left), tokens(right));
}

/**
 * Extracts the named target from relationship-style titles.
 *
 * Examples:
 * - "Cryptio integrates with DFNS custody platform" -> "dfns"
 * - "Cryptio integrates with Copper custody platform" -> "copper"
 *
 * These targets are important negative evidence: two integrations by the
 * same company are not duplicates when their counterparties differ.
 */
function relationshipTarget(title: string): string | null {
  const normalized = normalizeNewsText(title);

  const patterns = [
    /\bintegrat(?:e|es|ed|ing)\s+with\s+([a-z0-9$-]+)/,
    /\bpartner(?:s|ed|ing)?\s+with\s+([a-z0-9$-]+)/,
    /\bcollaborat(?:e|es|ed|ing)\s+with\s+([a-z0-9$-]+)/,
    /\bteam(?:s|ed|ing)?\s+up\s+with\s+([a-z0-9$-]+)/,
  ];

  for (const pattern of patterns) {
    const match = normalized.match(pattern);

    if (match?.[1]) {
      return stemToken(match[1]);
    }
  }

  return null;
}

function hasConflictingRelationshipTargets(
  leftTitle: string,
  rightTitle: string
): boolean {
  const leftTarget = relationshipTarget(leftTitle);
  const rightTarget = relationshipTarget(rightTitle);

  return Boolean(
    leftTarget &&
      rightTarget &&
      leftTarget !== rightTarget
  );
}

/**
 * Duplicate detection is intentionally based mostly on the title.
 *
 * Titles contain fewer incidental details than summaries and therefore give
 * a safer signal. Summaries are used as supporting evidence.
 *
 * Event type is not checked here because producer classification can vary
 * between OTHER, PARTNERSHIP, LAUNCH, MILESTONE, etc. for the same story.
 * Candidate selection by team and date window is handled by TeamNewsService.
 */
export function isDuplicateNewsStory(
  left: StoryInput,
  right: StoryInput
): boolean {
  if (
    normalizeSourceUrl(left.sourceUrl) ===
    normalizeSourceUrl(right.sourceUrl)
  ) {
    return true;
  }

  if (
    hasConflictingRelationshipTargets(
      left.title,
      right.title
    )
  ) {
    return false;
  }

  const title = compareText(left.title, right.title);
  const summary = compareText(
    left.summary ?? '',
    right.summary ?? ''
  );
  const combined = compareText(
    `${left.title} ${left.summary ?? ''}`,
    `${right.title} ${right.summary ?? ''}`
  );

  /*
   * Rule 1: titles are almost the same after normalization.
   *
   * Examples:
   * - ICNT listed on Bithumb...
   * - ICNT token listed on Bithumb...
   * - Cryptio adds support for Robinhood Chain...
   */
  if (
    title.overlap >= 3 &&
    title.containment >= 0.78 &&
    title.jaccard >= 0.5
  ) {
    return true;
  }

  /*
   * Rule 2: strong title match plus supporting overlap across the complete
   * article description.
   *
   * Examples:
   * - CoinList / Superstate tokenized equities
   * - Payy / Monaris private credit
   */
  if (
    title.overlap >= 3 &&
    title.containment >= 0.68 &&
    combined.containment >= 0.48 &&
    combined.jaccard >= 0.28
  ) {
    return true;
  }

  /*
   * Rule 3: both title and summary independently describe the same event.
   *
   * Requiring at least three shared title tokens protects against generic
   * matches such as "Acme launches..." appearing in unrelated stories.
   */
  if (
    title.overlap >= 3 &&
    title.containment >= 0.58 &&
    summary.overlap >= 3 &&
    summary.containment >= 0.48 &&
    combined.jaccard >= 0.32
  ) {
    return true;
  }

  return false;
}
