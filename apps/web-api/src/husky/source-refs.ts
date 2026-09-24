import { HuskySourceRef } from 'libs/contracts/src/schema/husky-chat';

const MARKER_TYPE = {
  TeamLink: 'team',
  MemberLink: 'member',
  ProjectLink: 'project',
  EventLink: 'event',
  JobLink: 'job',
  NewsLink: 'news',
  ForumLink: 'forum',
} as const;

type DirectoryType = typeof MARKER_TYPE[keyof typeof MARKER_TYPE];

const LABEL_TYPES: Record<string, DirectoryType[]> = {
  source: ['news'],
  website: ['team', 'event'],
  linkedin: ['member'],
  apply: ['job'],
  'forum link': ['forum'],
};

const MARKER_RE = /\[(TeamLink|MemberLink|ProjectLink|EventLink|JobLink|NewsLink|ForumLink)\]\(([^)]+)\)/g;
const LABEL_RE = /\*{0,2}(Source|Website|LinkedIn|Apply|Forum Link)\*{0,2}:\s*(https?:\/\/[^\s)]+)/gi;
const CITATION_RE = /\[(\d+)\]\(([^)\s]+)\)/g;

interface CatalogEntry {
  type: DirectoryType;
  title: string;
  directoryLink: string;
  externalUrl?: string;
  offset: number;
}

export interface BuiltSourceRefs {
  sourceRefs: HuskySourceRef[];
  mismatches: string[];
}

function cleanTitle(raw: string): string {
  return raw
    .replace(/^[-*]\s+/, '')
    .replace(/^(Topic|Name|Title|Team|Project|Member|Event):\s*/i, '')
    .trim();
}

function titleForMarker(record: string, markerIndex: number): string {
  const lineStart = record.lastIndexOf('\n', markerIndex - 1) + 1;
  const lineEnd = record.indexOf('\n', markerIndex);
  const line = record.slice(lineStart, lineEnd === -1 ? undefined : lineEnd);
  const sameLine = cleanTitle(line.slice(0, markerIndex - lineStart));
  if (sameLine) return sameLine;

  const nextLine = record.slice(lineEnd === -1 ? record.length : lineEnd + 1).split('\n')[0] ?? '';
  const nameMatch = nextLine.match(/^\s*(?:\*\*)?(?:Name|Title)(?:\*\*)?:\s*(.+)$/i);
  return nameMatch ? cleanTitle(nameMatch[1]) : '';
}

function sameLine(record: string, a: number, b: number): boolean {
  const start = Math.min(a, b);
  const end = Math.max(a, b);
  return !record.slice(start, end).includes('\n');
}

function parseCatalog(toolResults: string): CatalogEntry[] {
  const entries: CatalogEntry[] = [];
  const normalized = toolResults.replace(/\*\*/g, '');
  for (const record of normalized.split(/\n\s*\n/)) {
    const recordEntries: CatalogEntry[] = [];
    for (const match of record.matchAll(MARKER_RE)) {
      const marker = match[1] as keyof typeof MARKER_TYPE;
      const directoryLink = match[2].trim();
      recordEntries.push({
        type: MARKER_TYPE[marker],
        title: titleForMarker(record, match.index ?? 0) || directoryLink,
        directoryLink,
        offset: match.index ?? 0,
      });
    }

    for (const match of record.matchAll(LABEL_RE)) {
      const types = LABEL_TYPES[match[1].toLowerCase()];
      const url = match[2];
      if (!types || !url) continue;
      const labelOffset = match.index ?? 0;
      const candidates = recordEntries.filter((entry) => types.includes(entry.type) && !entry.externalUrl);
      const sameLineCandidates = candidates.filter((entry) => sameLine(record, entry.offset, labelOffset));
      const pool = sameLineCandidates.length ? sameLineCandidates : candidates;
      if (!pool.length) continue;
      const target = pool.reduce((nearest, entry) =>
        Math.abs(entry.offset - labelOffset) < Math.abs(nearest.offset - labelOffset) ? entry : nearest
      );
      target.externalUrl = url;
    }

    entries.push(...recordEntries);
  }
  return entries;
}

function urlKeys(url: string): string[] {
  const trimmed = url.trim();
  const keys = new Set<string>([trimmed, trimmed.replace(/\/$/, '')]);
  try {
    const parsed = trimmed.startsWith('/') ? new URL(trimmed, 'https://directory.local') : new URL(trimmed);
    const path = `${parsed.pathname}${parsed.search}`;
    keys.add(path);
    keys.add(path.replace(/\/$/, ''));
  } catch {
    // Keep the raw value when it is not a URL.
  }
  return [...keys];
}

function sharesKey(left: string, right: string): boolean {
  const rightKeys = new Set(urlKeys(right));
  return urlKeys(left).some((key) => rightKeys.has(key));
}

function findEntry(catalog: CatalogEntry[], cited: string): CatalogEntry | undefined {
  return catalog.find(
    (entry) =>
      sharesKey(cited, entry.directoryLink) || (entry.externalUrl ? sharesKey(cited, entry.externalUrl) : false)
  );
}

function remember(seen: Set<string>, url?: string) {
  if (!url) return;
  for (const key of urlKeys(url)) seen.add(key);
}

function alreadyRepresented(seen: Set<string>, url: string): boolean {
  return urlKeys(url).some((key) => seen.has(key));
}

/**
 * Aligns [N](url) citations in the answer to tool link markers.
 * LLM `sources` that were not cited are appended as external refs.
 */
export function buildSourceRefs(input: {
  content: string;
  toolResults: string;
  llmSources?: string[];
}): BuiltSourceRefs {
  const catalog = parseCatalog(input.toolResults);
  const sourceRefs: HuskySourceRef[] = [];
  const mismatches: string[] = [];
  const seenIndexes = new Set<number>();
  const seenUrls = new Set<string>();

  for (const match of input.content.matchAll(CITATION_RE)) {
    const index = Number(match[1]);
    const cited = match[2];
    if (seenIndexes.has(index)) continue;
    seenIndexes.add(index);

    const entry = findEntry(catalog, cited);
    if (!entry) {
      sourceRefs.push({ index, title: cited, type: 'external', externalUrl: cited });
      remember(seenUrls, cited);
      continue;
    }

    const citedDirectory = sharesKey(cited, entry.directoryLink);
    if (!citedDirectory && entry.externalUrl) {
      mismatches.push(`citation [${index}](${cited}) resolved to ${entry.directoryLink}`);
    }
    sourceRefs.push({
      index,
      title: entry.title,
      type: entry.type,
      directoryLink: entry.directoryLink,
      ...(entry.externalUrl ? { externalUrl: entry.externalUrl } : {}),
    });
    remember(seenUrls, entry.directoryLink);
    remember(seenUrls, entry.externalUrl);
  }

  let nextIndex = sourceRefs.reduce((max, ref) => Math.max(max, ref.index), 0);
  for (const source of input.llmSources ?? []) {
    const url = source?.trim();
    if (!url || alreadyRepresented(seenUrls, url)) continue;
    nextIndex += 1;
    mismatches.push(`LLM source ${url} was not cited; appended as external`);
    sourceRefs.push({ index: nextIndex, title: url, type: 'external', externalUrl: url });
    remember(seenUrls, url);
  }

  return { sourceRefs, mismatches };
}
