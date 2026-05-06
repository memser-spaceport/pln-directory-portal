import { NewsEventType } from '@prisma/client';

/**
 * Ported verbatim from dorothea/dashboard/build-news.mjs (BOOST_PATTERNS).
 * First match drives eventType; every match contributes a tag.
 */
export const BOOST_PATTERNS: Array<{ re: RegExp; tag: string }> = [
  { re: /\$[\d.,]+[BMKm]/, tag: '$' },
  { re: /\$[\d,.]+\s*(?:million|billion|M\b|B\b)/i, tag: '$' },
  { re: /\braised?\b/i, tag: 'raise' },
  { re: /\blaunch(?:ed|es)?\b/i, tag: 'launch' },
  { re: /\bannounced?\b/i, tag: 'announce' },
  { re: /\bacquired?\b/i, tag: 'acquire' },
  { re: /\bpartner(?:ship|ed)?\b/i, tag: 'partner' },
  { re: /\bfund(?:ed|ing|s)?\b/i, tag: 'fund' },
  { re: /\bdeployed?\b/i, tag: 'deploy' },
  { re: /\bwon?\b|\bwins?\b/i, tag: 'win' },
  { re: /\bjoined?\b/i, tag: 'join' },
  { re: /\bpublished?\b/i, tag: 'publish' },
  { re: /\bgranted?\b/i, tag: 'grant' },
  { re: /\bintegrat(?:ed|ion)\b/i, tag: 'integrate' },
  { re: /\bpilot\b/i, tag: 'pilot' },
  { re: /\bversion\b|v\d+\.\d+/i, tag: 'release' },
  { re: /\d+[KMB]\+?\s+(?:users?|holders?|wallets?|farms?|nodes?)/i, tag: 'scale' },
];

/** Ported from dorothea/dashboard/build-news.mjs. Match → reject. */
export const NOISE_PATTERNS: RegExp[] = [
  /active\s+github/i,
  /last\s+(?:push|commit)/i,
  /daily\s+commits?/i,
  /active\s+development/i,
  /twitter\s+account\s+created/i,
  /\bfetch_content\b/i,
  /\bweb\s+search\b/i,
  /^\|\s*(?:date|event|source)\s*\|/i,
];

export function isNoise(text: string): boolean {
  return NOISE_PATTERNS.some((p) => p.test(text));
}

export function extractTags(text: string): string[] {
  const tags: string[] = [];
  for (const b of BOOST_PATTERNS) {
    if (b.re.test(text) && !tags.includes(b.tag)) {
      tags.push(b.tag);
    }
  }
  return tags;
}

/**
 * First-match-wins mapping from boost tags to NewsEventType.
 * Mirrors the newsType buckets in build-news.mjs:
 *   funding → FUNDING
 *   launches → LAUNCH
 *   partnerships → PARTNERSHIP
 *   announcements → ANNOUNCEMENT
 *   milestones → MILESTONE
 *   other → OTHER
 */
export function classifyEventType(tags: string[]): NewsEventType {
  if (tags.some((t) => ['$', 'raise', 'fund', 'grant'].includes(t))) return NewsEventType.FUNDING;
  if (tags.some((t) => ['launch', 'deploy', 'release'].includes(t))) return NewsEventType.LAUNCH;
  if (tags.some((t) => ['partner', 'integrate', 'join'].includes(t))) return NewsEventType.PARTNERSHIP;
  if (tags.some((t) => ['announce', 'publish'].includes(t))) return NewsEventType.ANNOUNCEMENT;
  if (tags.some((t) => ['win', 'scale', 'acquire', 'pilot'].includes(t))) return NewsEventType.MILESTONE;
  return NewsEventType.OTHER;
}

export function classifyText(text: string): { eventType: NewsEventType; tags: string[] } {
  const tags = extractTags(text);
  return { eventType: classifyEventType(tags), tags };
}
