import { Injectable } from '@nestjs/common';
import { PrismaService } from '../shared/prisma.service';
import { AIUsageEntry, TeamDataEnrichment } from './team-enrichment.types';

export interface AiReportFilter {
  /** ISO timestamp; only count stage usage where lastRunAt >= since. Per-stage filtering. */
  since?: string;
  /** 1-based page index for the `teams` list. Defaults to 1. Out-of-range falls back to 1. */
  page?: number;
  /** Page size for the `teams` list. Defaults to 10, capped at 100. */
  pageSize?: number;
}

export interface StageTotals {
  teams: number;
  runs: number;
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
  totalTokens: number;
  costUsd: number;
}

export interface AiReportResponse {
  generatedAt: string;
  filter: { since: string | null };
  /** Pagination state for the `teams` list. `totals` and `byModel` are NOT paginated — they always reflect the full result set. */
  pagination: {
    page: number;
    pageSize: number;
    totalTeams: number;
    totalPages: number;
  };
  totals: {
    teamsWithUsage: number;
    enrichment: StageTotals;
    judge: StageTotals;
    grandTotal: { totalTokens: number; costUsd: number };
  };
  byModel: Array<{
    aiModel: string;
    stage: 'enrichment' | 'judge';
    teams: number;
    runs: number;
    totalTokens: number;
    costUsd: number;
  }>;
  /** Current-page slice of teams with in-window usage, sorted by combined cost desc. */
  teams: Array<{
    uid: string;
    name: string;
    enrichment: AIUsageEntry | null;
    judge: AIUsageEntry | null;
    grandTotalCostUsd: number;
  }>;
}

const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 100;

@Injectable()
export class TeamEnrichmentReportService {
  constructor(private readonly prisma: PrismaService) {}

  async generateReport(filter: AiReportFilter = {}): Promise<AiReportResponse> {
    const sinceTs = filter.since ? Date.parse(filter.since) : NaN;
    const sinceValid = Number.isFinite(sinceTs);

    // dataEnrichment is JSONB on TeamEnrichment; in-app filtering is fine here — team counts
    // are bounded (hundreds, not millions). Joining via the relation keeps the team's name +
    // uid alongside the enrichment metadata.
    const candidates = await this.prisma.teamEnrichment.findMany({
      where: { dataEnrichment: { not: { equals: null as any } } },
      select: { team: { select: { uid: true, name: true } }, dataEnrichment: true },
    });

    const enrichment = emptyTotals();
    const judge = emptyTotals();

    // Map key is `${stage}|${aiModel}` so enrichment and judge counters stay separate per model.
    const byModel = new Map<string, ByModelBucket>();

    type TeamRow = AiReportResponse['teams'][number];
    const teamRows: TeamRow[] = [];

    for (const row of candidates) {
      const t = row.team;
      const meta = parseEnrichment(row.dataEnrichment);
      const usage = meta?.usage;
      if (!usage) continue;

      const enrichEntry = stageInWindow(usage.enrichment, sinceValid ? sinceTs : null);
      const judgeEntry = stageInWindow(usage.judge, sinceValid ? sinceTs : null);
      if (!enrichEntry && !judgeEntry) continue;

      if (enrichEntry) {
        addToTotals(enrichment, enrichEntry);
        addToByModel(byModel, 'enrichment', enrichEntry, t.uid);
      }
      if (judgeEntry) {
        addToTotals(judge, judgeEntry);
        addToByModel(byModel, 'judge', judgeEntry, t.uid);
      }

      teamRows.push({
        uid: t.uid,
        name: t.name,
        enrichment: enrichEntry,
        judge: judgeEntry,
        grandTotalCostUsd: roundCents((enrichEntry?.costUsd ?? 0) + (judgeEntry?.costUsd ?? 0)),
      });
    }

    teamRows.sort((a, b) => b.grandTotalCostUsd - a.grandTotalCostUsd);

    // Pagination — totals/byModel above were already computed across the full set,
    // which is the intent: "totals" should always reflect everything, even when the
    // caller is just paging through the team list.
    const pageSize = clampPageSize(filter.pageSize);
    const totalTeams = teamRows.length;
    const totalPages = totalTeams === 0 ? 0 : Math.ceil(totalTeams / pageSize);
    const page = clampPage(filter.page, totalPages);
    const start = (page - 1) * pageSize;
    const pagedTeams = teamRows.slice(start, start + pageSize);

    const byModelOut = [...byModel.values()]
      .map((m) => ({
        aiModel: m.aiModel,
        stage: m.stage,
        teams: m.teams.size,
        runs: m.runs,
        totalTokens: m.totalTokens,
        costUsd: roundCents(m.costUsd),
      }))
      .sort((a, b) => b.costUsd - a.costUsd);

    return {
      generatedAt: new Date().toISOString(),
      filter: { since: sinceValid ? new Date(sinceTs).toISOString() : null },
      pagination: { page, pageSize, totalTeams, totalPages },
      totals: {
        teamsWithUsage: totalTeams,
        enrichment,
        judge,
        grandTotal: {
          totalTokens: enrichment.totalTokens + judge.totalTokens,
          costUsd: roundCents(enrichment.costUsd + judge.costUsd),
        },
      },
      byModel: byModelOut,
      teams: pagedTeams,
    };
  }
}

function clampPageSize(raw: number | undefined): number {
  if (raw === undefined || !Number.isFinite(raw)) return DEFAULT_PAGE_SIZE;
  const n = Math.floor(raw);
  if (n < 1) return DEFAULT_PAGE_SIZE;
  return Math.min(n, MAX_PAGE_SIZE);
}

function clampPage(raw: number | undefined, totalPages: number): number {
  if (raw === undefined || !Number.isFinite(raw)) return 1;
  const n = Math.floor(raw);
  if (n < 1) return 1;
  // No teams at all → page 1 (response will have an empty teams array).
  if (totalPages === 0) return 1;
  return Math.min(n, totalPages);
}

function stageInWindow(entry: AIUsageEntry | undefined, sinceTs: number | null): AIUsageEntry | null {
  if (!entry) return null;
  if (sinceTs === null) return entry;
  const ts = Date.parse(entry.lastRunAt);
  if (!Number.isFinite(ts)) return null;
  return ts >= sinceTs ? entry : null;
}

function addToTotals(target: StageTotals, entry: AIUsageEntry): void {
  target.teams += 1;
  target.runs += entry.runs;
  target.inputTokens += entry.inputTokens;
  target.outputTokens += entry.outputTokens;
  target.cachedInputTokens += entry.cachedInputTokens ?? 0;
  target.totalTokens += entry.totalTokens;
  target.costUsd = roundCents(target.costUsd + entry.costUsd);
}

interface ByModelBucket {
  aiModel: string;
  stage: 'enrichment' | 'judge';
  teams: Set<string>;
  runs: number;
  totalTokens: number;
  costUsd: number;
}

function addToByModel(
  map: Map<string, ByModelBucket>,
  stage: 'enrichment' | 'judge',
  entry: AIUsageEntry,
  teamUid: string
): void {
  const key = `${stage}|${entry.aiModel}`;
  let bucket = map.get(key);
  if (!bucket) {
    bucket = { aiModel: entry.aiModel, stage, teams: new Set(), runs: 0, totalTokens: 0, costUsd: 0 };
    map.set(key, bucket);
  }
  bucket.teams.add(teamUid);
  bucket.runs += entry.runs;
  bucket.totalTokens += entry.totalTokens;
  bucket.costUsd += entry.costUsd;
}

function emptyTotals(): StageTotals {
  return {
    teams: 0,
    runs: 0,
    inputTokens: 0,
    outputTokens: 0,
    cachedInputTokens: 0,
    totalTokens: 0,
    costUsd: 0,
  };
}

function parseEnrichment(raw: unknown): TeamDataEnrichment | null {
  if (!raw) return null;
  try {
    const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return data as TeamDataEnrichment;
  } catch {
    return null;
  }
}

function roundCents(amount: number): number {
  return Math.round(amount * 1_000_000) / 1_000_000;
}
