#!/usr/bin/env ts-node
/**
 * Seed team-news from a local dorothea checkout.
 *
 * NOTE: This script is a *producer*, not part of the directory's runtime.
 * It lives here transitionally because pln-data-enrichment doesn't exist yet.
 * When that repo is created, move this script (and apps/web-api/src/scripts/
 * dorothea/) over and delete from this repo. The directory's ingest endpoint
 * stays the same.
 *
 * Usage:
 *   ts-node apps/web-api/src/scripts/seed-team-news.ts \
 *     --from <dorothea-checkout> \
 *     [--full-history] [--dry-run] [--direct] [--limit N]
 *
 * Reads research/synthesis/news/<latest-DDMMYY>/*.md and research/**\/*.md,
 * extracts dated bullet items (BOOST_PATTERNS / NOISE_PATTERNS port from
 * dorothea), matches each markdown slug to a Directory team by name/slug,
 * classifies eventType + tags, and POSTs to the service ingest endpoint.
 * Unmatched slugs are printed at the end of the run.
 *
 * Defaults:
 *   - 14-day window (use --full-history to keep older items)
 *   - HTTP ingest via DIRECTORY_API_BASE_URL + INTERNAL_SERVICE_SECRET
 *   - --direct fallback for local dev (writes via PrismaClient, skips HTTP/auth)
 */
import * as dotenv from 'dotenv';
dotenv.config();

import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { basename, join } from 'path';
import { PrismaClient } from '@prisma/client';
import { BOOST_PATTERNS, NOISE_PATTERNS, classifyEventType } from './dorothea/classify';
import { computeCanonicalKey } from '../team-news/utils/canonical-key';
import { extractDomain, normalizeSourceUrl } from '../team-news/utils/url-normalize';

const WINDOW_DAYS_DEFAULT = 14;
const BATCH_SIZE = 100;

interface CliArgs {
  from: string;
  fullHistory: boolean;
  dryRun: boolean;
  direct: boolean;
  limit?: number;
}

interface ExtractedItem {
  slug: string;
  category: string;
  rawText: string;
  cleanText: string;
  date: Date;
  sourceUrl: string;
  tags: string[];
}

function parseArgs(): CliArgs {
  const argv = process.argv.slice(2);
  const args: CliArgs = { from: '', fullHistory: false, dryRun: false, direct: false };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--from') args.from = argv[++i] ?? '';
    else if (a === '--full-history') args.fullHistory = true;
    else if (a === '--dry-run') args.dryRun = true;
    else if (a === '--direct') args.direct = true;
    else if (a === '--limit') args.limit = Number(argv[++i] ?? '0') || undefined;
  }

  if (!args.from) {
    console.error(
      'Usage: ts-node apps/web-api/src/scripts/seed-team-news.ts --from <dorothea-checkout> [--full-history] [--dry-run] [--direct] [--limit N]'
    );
    process.exit(1);
  }
  if (!existsSync(args.from)) {
    console.error(`Path not found: ${args.from}`);
    process.exit(1);
  }
  return args;
}

// ─── Date pattern generation (port of dorothea/dashboard/build-news.mjs) ──────
function generateDatePatterns(): Array<{ re: RegExp; ts: string; year: number; month: number; day?: number }> {
  const patterns: Array<{ re: RegExp; ts: string; year: number; month: number; day?: number }> = [];
  const now = new Date();
  const monthShort = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const monthFull = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ];

  // Up to 24 months back so --full-history can pick up older items.
  for (let i = 0; i < 24; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const ts = `${yyyy}-${mm}`;
    const short = monthShort[d.getMonth()];
    const full = monthFull[d.getMonth()];

    const fullSuffix = full.slice(3);
    const datePattern =
      `\\b(${ts}(?:-\\d{1,2})?` +
      `|(?:\\d{1,2}\\s+)?${short}(?:${fullSuffix})?` +
      `(?:\\s+\\d{1,2}(?:[–—-]\\d{1,2})?,?)?\\s+${yyyy})\\b`;
    patterns.push({
      re: new RegExp(datePattern, 'i'),
      ts,
      year: yyyy,
      month: d.getMonth() + 1,
    });
  }
  return patterns;
}

const DATE_PATTERNS = generateDatePatterns();

function extractFirstDate(text: string): Date | null {
  // Try strict ISO first
  const iso = text.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (iso) {
    const d = new Date(`${iso[1]}-${iso[2]}-${iso[3]}T00:00:00Z`);
    if (!Number.isNaN(d.getTime())) return d;
  }

  // Day Month Year, e.g. "Apr 16, 2026" / "16 Apr 2026" / "Apr 9–10, 2026"
  const dayMonth = text.match(
    /\b(?:(\d{1,2})\s+)?(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(?:(\d{1,2})(?:[–—-]\d{1,2})?,?\s+)?(\d{4})\b/i
  );
  if (dayMonth) {
    const months: Record<string, number> = {
      jan: 0,
      feb: 1,
      mar: 2,
      apr: 3,
      may: 4,
      jun: 5,
      jul: 6,
      aug: 7,
      sep: 8,
      oct: 9,
      nov: 10,
      dec: 11,
    };
    const monthIdx = months[dayMonth[2].slice(0, 3).toLowerCase()] ?? 0;
    const year = Number(dayMonth[4]);
    const day = Number(dayMonth[1] ?? dayMonth[3] ?? '1');
    return new Date(Date.UTC(year, monthIdx, day));
  }

  // Year-month only — anchor to first of month
  for (const p of DATE_PATTERNS) {
    if (p.re.test(text)) {
      return new Date(Date.UTC(p.year, p.month - 1, 1));
    }
  }
  return null;
}

function isNoise(text: string): boolean {
  return NOISE_PATTERNS.some((p) => p.test(text));
}

function extractSourceUrl(text: string): string | null {
  const md = text.match(/\[([^\]]*)\]\((https?:\/\/[^)]+)\)/);
  if (md) return md[2].trim();
  const bare = text.match(/https?:\/\/[^\s)>\]]+/);
  if (bare) return bare[0].trim();
  return null;
}

function cleanDisplay(text: string): string {
  return text
    .replace(/\*\*/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

// ─── Item extraction (port of build-news.mjs:extractItems) ────────────────────
function extractItemsFromMarkdown(content: string, slug: string, category: string): ExtractedItem[] {
  const items: ExtractedItem[] = [];

  const consider = (rawText: string) => {
    if (rawText.length < 20) return;
    if (isNoise(rawText)) return;
    const date = extractFirstDate(rawText);
    if (!date) return;
    const sourceUrl = extractSourceUrl(rawText);
    if (!sourceUrl) return;

    const subject = `${rawText}`;
    const tags: string[] = [];
    for (const b of BOOST_PATTERNS) {
      if (b.re.test(subject) && !tags.includes(b.tag)) tags.push(b.tag);
    }

    items.push({
      slug,
      category,
      rawText,
      cleanText: cleanDisplay(rawText),
      date,
      sourceUrl: normalizeSourceUrl(sourceUrl),
      tags,
    });
  };

  const bulletSectionRe =
    /##\s+(?:Recent\s+)?(?:News(?:\s+&\s+Activities?)?|Activities?|(?:Recent\s+)?Activity|Highlights?|Key\s+(?:Updates?|Milestones?|Developments?))[^\n]*\n([\s\S]*?)(?=\n##\s|\n---|\n\*\*\*|$)/gi;
  for (const sec of content.matchAll(bulletSectionRe)) {
    for (const line of sec[1].split('\n')) {
      const t = line.trim();
      if (!t.startsWith('-') && !t.startsWith('*')) continue;
      consider(t.replace(/^[-*]\s+/, '').trim());
    }
  }

  for (const line of content.split('\n')) {
    const t = line.trim();
    if (!t.startsWith('- **')) continue;
    consider(t.replace(/^-\s+/, '').trim());
  }

  return items;
}

// ─── File loading ─────────────────────────────────────────────────────────────
function loadDir(rootDir: string, subdir: string, category: string): ExtractedItem[] {
  const dir = subdir ? join(rootDir, subdir) : rootDir;
  if (!existsSync(dir)) return [];
  const items: ExtractedItem[] = [];
  for (const file of readdirSync(dir)) {
    if (!file.endsWith('.md') || /^[A-Z]/.test(file)) continue;
    const fullPath = join(dir, file);
    if (!statSync(fullPath).isFile()) continue;
    try {
      const content = readFileSync(fullPath, 'utf8');
      const slug = `${category}-${basename(file, '.md')}`;
      items.push(...extractItemsFromMarkdown(content, slug, category));
    } catch {
      /* skip unreadable */
    }
  }
  return items;
}

function loadLatestSynthesisNews(rootDir: string): ExtractedItem[] {
  const synthesisDir = join(rootDir, 'research', 'synthesis', 'news');
  if (!existsSync(synthesisDir)) return [];
  const folders = readdirSync(synthesisDir)
    .filter((f) => /^\d{6}$/.test(f))
    .map((f) => {
      const dd = parseInt(f.slice(0, 2), 10);
      const mm = parseInt(f.slice(2, 4), 10);
      const yy = parseInt(f.slice(4, 6), 10);
      return { name: f, ts: Date.UTC(2000 + yy, mm - 1, dd) };
    })
    .sort((a, b) => b.ts - a.ts);
  if (folders.length === 0) return [];
  const latest = folders[0].name;
  const dir = join(synthesisDir, latest);
  console.log(`  ↳ synthesis: using latest folder ${latest}`);

  const items: ExtractedItem[] = [];
  for (const file of readdirSync(dir)) {
    if (!file.endsWith('.md') || /^[A-Z_]/.test(file)) continue;
    const content = readFileSync(join(dir, file), 'utf8');
    const catMatch = content.match(/\*\*Category:\*\*\s*([\w-]+)/);
    const category = catMatch ? catMatch[1].trim() : 'teams';
    const slug = `${category}-${basename(file, '.md')}`;
    items.push(...extractItemsFromMarkdown(content, slug, category));
  }
  return items;
}

function loadAllItems(rootDir: string): ExtractedItem[] {
  const researchDir = join(rootDir, 'research');
  if (!existsSync(researchDir)) {
    console.error(`Expected research/ subdir under ${rootDir}`);
    process.exit(1);
  }

  const all: ExtractedItem[] = [
    ...loadDir(researchDir, '', 'teams'),
    ...loadDir(researchDir, 'builders', 'builders'),
    ...loadDir(researchDir, 'portfolio', 'builders'),
    ...loadDir(researchDir, 'standards', 'builders'),
    ...loadLatestSynthesisNews(rootDir),
  ];

  // Dedupe within seed: same slug + first 80 chars of clean text.
  const seen = new Map<string, ExtractedItem>();
  for (const item of all) {
    const key = `${item.slug}::${item.cleanText.slice(0, 80)}`;
    if (!seen.has(key)) seen.set(key, item);
  }
  return [...seen.values()];
}

// ─── Slug ↔ team resolution ───────────────────────────────────────────────────
function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

async function buildSlugLookup(prisma: PrismaClient): Promise<Map<string, { uid: string; name: string }>> {
  const teams = await prisma.team.findMany({ select: { uid: true, name: true } });
  const map = new Map<string, { uid: string; name: string }>();
  for (const team of teams) {
    map.set(normalizeName(team.name), { uid: team.uid, name: team.name });
  }
  return map;
}

function dorotheaSlugToKey(slug: string): string {
  // strip `<category>-` prefix
  return slug.replace(/^(?:teams|builders|cofunders|institutions|talent|conveners|standards|portfolio)-/, '');
}

// ─── Ingest dispatch ──────────────────────────────────────────────────────────
async function postToIngest(
  baseUrl: string,
  secret: string,
  items: ExtractedItem[],
  byTeamUid: Map<ExtractedItem, string>,
  runId: string
): Promise<void> {
  const payload = {
    runId,
    source: 'dorothea-seed',
    enrichmentSource: 'dorothea-seed',
    items: items.map((it) => ({
      teamUid: byTeamUid.get(it) ?? '',
      eventDate: it.date.toISOString(),
      title: it.cleanText.split(' — ').slice(1).join(' — ').trim() || it.cleanText.slice(0, 200),
      summary: it.cleanText,
      sourceUrl: it.sourceUrl,
      eventType: classifyEventType(it.tags),
      tags: it.tags,
    })),
  };

  const res = await fetch(`${baseUrl.replace(/\/+$/, '')}/v1/service/team-news/ingest`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${secret}`,
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`ingest POST failed: ${res.status} ${text}`);
  }
  const body = (await res.json()) as Record<string, unknown>;
  console.log(`  ↳ batch ingested: ${JSON.stringify(body)}`);
}

async function directIngest(
  prisma: PrismaClient,
  items: ExtractedItem[],
  byTeamUid: Map<ExtractedItem, string>
): Promise<{ created: number; updated: number }> {
  let created = 0;
  let updated = 0;
  for (const item of items) {
    const teamUid = byTeamUid.get(item);
    if (!teamUid) continue;
    const canonicalKey = computeCanonicalKey(teamUid, item.sourceUrl, item.date);
    const eventType = classifyEventType(item.tags);
    const sourceDomain = extractDomain(item.sourceUrl);
    const title = item.cleanText.split(' — ').slice(1).join(' — ').trim() || item.cleanText.slice(0, 200);

    const data = {
      teamUid,
      canonicalKey,
      eventType,
      eventDate: item.date,
      title,
      summary: item.cleanText,
      sourceUrl: item.sourceUrl,
      sourceDomain,
      tags: item.tags,
    };

    const existing = await prisma.teamNewsItem.findUnique({ where: { canonicalKey } });
    const titlePreview = title.length > 70 ? `${title.slice(0, 67)}…` : title;
    if (existing) {
      await prisma.teamNewsItem.update({ where: { canonicalKey }, data });
      console.log(`  [updated] team=${teamUid} slug=${item.slug}  ${titlePreview}`);
      updated++;
    } else {
      await prisma.teamNewsItem.create({ data });
      console.log(`  [created] team=${teamUid} slug=${item.slug}  ${titlePreview}`);
      created++;
    }
  }
  return { created, updated };
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const args = parseArgs();
  const windowDays = args.fullHistory ? null : WINDOW_DAYS_DEFAULT;

  console.log(`📰 Reading dorothea checkout: ${args.from}`);
  const allItems = loadAllItems(args.from);
  console.log(`  ↳ extracted ${allItems.length} candidate items`);

  // Window filter
  let items = allItems;
  if (windowDays !== null) {
    const cutoff = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);
    items = items.filter((i) => i.date >= cutoff);
    console.log(`  ↳ ${items.length} within ${windowDays}-day window`);
  }
  if (args.limit && items.length > args.limit) {
    items = items.slice(0, args.limit);
    console.log(`  ↳ truncated to first ${args.limit} (--limit)`);
  }

  // Slug → team
  const prisma = new PrismaClient();
  let exitCode = 0;
  try {
    const slugLookup = await buildSlugLookup(prisma);
    const matched: ExtractedItem[] = [];
    const matchedUidByItem = new Map<ExtractedItem, string>();
    const matchedSlugs = new Map<string, { uid: string; name: string; count: number }>();
    const unmatched = new Map<string, { key: string; count: number }>();

    for (const item of items) {
      const key = normalizeName(dorotheaSlugToKey(item.slug));
      const team = slugLookup.get(key);
      if (!team) {
        const prev = unmatched.get(item.slug);
        unmatched.set(item.slug, { key, count: (prev?.count ?? 0) + 1 });
        continue;
      }
      matched.push(item);
      matchedUidByItem.set(item, team.uid);
      const slugStat = matchedSlugs.get(item.slug);
      if (slugStat) {
        slugStat.count++;
      } else {
        matchedSlugs.set(item.slug, { uid: team.uid, name: team.name, count: 1 });
      }
    }

    console.log(
      `\n  ↳ slug→team: matched ${matched.length} items across ${matchedSlugs.size} slugs, unmatched ${unmatched.size} slugs`
    );
    printMatchedSlugs(matchedSlugs);
    printUnmatchedSlugs(unmatched);

    if (args.dryRun) {
      console.log('\n--- DRY RUN: not writing anything ---');
      printSummary(matched.length, 0, 0, 0, 0);
      return;
    }

    if (matched.length === 0) {
      console.log('\nNothing to ingest.');
      printSummary(0, 0, 0, 0, 0);
      return;
    }

    if (args.direct) {
      console.log(`\nWriting ${matched.length} items directly via Prisma...`);
      const { created, updated } = await directIngest(prisma, matched, matchedUidByItem);
      printSummary(matched.length, created, updated, 0, 0);
      return;
    }

    const baseUrl = process.env.DIRECTORY_API_BASE_URL;
    const secret = process.env.INTERNAL_SERVICE_SECRET;
    if (!baseUrl || !secret) {
      console.error(
        'DIRECTORY_API_BASE_URL and INTERNAL_SERVICE_SECRET must be set, or pass --direct for local Prisma writes.'
      );
      process.exit(1);
    }

    const runId = `dorothea-seed-${new Date().toISOString().replace(/[:.]/g, '-')}`;
    for (let i = 0; i < matched.length; i += BATCH_SIZE) {
      const chunk = matched.slice(i, i + BATCH_SIZE);
      const teamUidsInChunk = [...new Set(chunk.map((it) => matchedUidByItem.get(it) ?? '').filter(Boolean))];
      console.log(`\nPosting batch ${i / BATCH_SIZE + 1} (${chunk.length} items, ${teamUidsInChunk.length} teams)...`);
      await postToIngest(baseUrl, secret, chunk, matchedUidByItem, runId);
    }

    printSummary(matched.length, 0, 0, 0, 0);
  } catch (err) {
    console.error(err);
    exitCode = 1;
  } finally {
    await prisma.$disconnect();
    process.exit(exitCode);
  }
}

const PRINT_LIMIT = 200;

function printMatchedSlugs(matched: Map<string, { uid: string; name: string; count: number }>) {
  if (matched.size === 0) return;
  console.log(`\n--- Matched slugs (${matched.size}) ---`);
  const rows = [...matched.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  for (const [slug, stat] of rows.slice(0, PRINT_LIMIT)) {
    console.log(`  ${slug}  →  ${stat.uid}  (${stat.name})  [${stat.count} item${stat.count === 1 ? '' : 's'}]`);
  }
  if (rows.length > PRINT_LIMIT) console.log(`  …and ${rows.length - PRINT_LIMIT} more`);
}

function printUnmatchedSlugs(unmatched: Map<string, { key: string; count: number }>) {
  if (unmatched.size === 0) {
    console.log('\nAll slugs matched a team.');
    return;
  }
  console.log(`\n--- Unmatched slugs (${unmatched.size}) ---`);
  const rows = [...unmatched.entries()].sort((a, b) => b[1].count - a[1].count);
  for (const [slug, info] of rows.slice(0, PRINT_LIMIT)) {
    console.log(`  ${slug}  (tried key="${info.key}", ${info.count} item${info.count === 1 ? '' : 's'})`);
  }
  if (rows.length > PRINT_LIMIT) console.log(`  …and ${rows.length - PRINT_LIMIT} more`);
}

function printSummary(posted: number, created: number, updated: number, rejected: number, failed: number) {
  console.log('\n--- Summary ---');
  console.log(`Posted/written: ${posted}`);
  if (created || updated) console.log(`Direct writes: created=${created} updated=${updated}`);
  if (rejected) console.log(`Server-rejected: ${rejected}`);
  if (failed) console.log(`Failed: ${failed}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
