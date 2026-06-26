/**
 * Load merged LP prestige cache for pathfinder seeds (Neuro + Gold person records).
 */
import { readFileSync } from 'fs';

export interface PrestigeEntry {
  name?: string;
  aum?: string | null;
  notableInvestments?: string[] | null;
  bio?: string | null;
  thesis?: string | null;
  fundFocus?: string | null;
  sources?: string[] | null;
  enrichedVia?: string;
  enrichedAt?: string;
}

const norm = (s: string): string =>
  (s || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export function loadPrestigeByName(cachePath: string): Map<string, PrestigeEntry> {
  const byName = new Map<string, PrestigeEntry>();
  try {
    const raw = JSON.parse(readFileSync(cachePath, 'utf-8')) as Record<string, PrestigeEntry>;
    for (const [key, e] of Object.entries(raw)) {
      const name = e.name ?? key.split('||')[0];
      if (name && !byName.has(norm(name))) byName.set(norm(name), e);
    }
  } catch {
    console.warn(`(no prestige cache at ${cachePath} — records will have no enrichment)`);
  }
  return byName;
}

export function toEnrichment(e: PrestigeEntry): Record<string, unknown> | undefined {
  const enrichment: Record<string, unknown> = {};
  if (e.bio) enrichment.bio = e.bio;
  if (e.fundFocus) enrichment.fundFocus = e.fundFocus;
  if (e.aum) enrichment.aum = e.aum;
  if (e.notableInvestments?.length) enrichment.notableInvestments = e.notableInvestments;
  if (e.thesis) enrichment.thesis = e.thesis;
  if (e.sources?.length) enrichment.sources = e.sources;
  if (Object.keys(enrichment).length === 0) return undefined;
  enrichment.enrichedVia = e.enrichedVia ?? 'perplexity+gemini+exa+firecrawl';
  enrichment.fetchedAt = e.enrichedAt ?? '2026-06-06';
  return enrichment;
}
