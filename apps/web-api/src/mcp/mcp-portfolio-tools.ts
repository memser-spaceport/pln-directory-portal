import { z } from 'zod';
import type { PlNetworkPortfolioService } from '../spv-spotlights/pl-network-portfolio.service';
import { McpToolDef } from './mcp-tools';

const PORTFOLIO_LIMIT_MAX = 50;
const PORTFOLIO_LIMIT_DEFAULT = 20;

function clampLimit(value: unknown): number {
  const num = Number(value);
  if (!Number.isFinite(num)) return PORTFOLIO_LIMIT_DEFAULT;
  return Math.min(Math.max(Math.trunc(num), 1), PORTFOLIO_LIMIT_MAX);
}

function stringArg(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

type PortfolioTeam = Awaited<ReturnType<PlNetworkPortfolioService['list']>>['teams'][number];

/** The API row minus `id`, which repeats `teamUid`. */
function agentRow(team: PortfolioTeam) {
  return {
    teamUid: team.teamUid,
    name: team.name,
    oneLiner: team.oneLiner,
    stage: team.stage,
    website: team.website,
    logoUrl: team.logoUrl,
    mapLogoUrl: team.mapLogoUrl,
    island: team.island,
    startYear: team.startYear,
    endYear: team.endYear,
  };
}

/** The Networks Map's Directory data (`GET /v1/explore-pl-network/portfolio`), for agents. */
export function portfolioTools(portfolio: PlNetworkPortfolioService): McpToolDef[] {
  return [
    {
      name: 'list_portfolio_teams',
      description:
        'List the PL Portfolio teams shown on the Networks Map (Explore PL Network), excluding inactive (L0) teams, ordered by name. Filter by name (q) or island. Each row: teamUid, name, oneLiner, stage, website, logoUrl (colour logo), mapLogoUrl (white map logo), island, startYear, endYear; missing values are null. total counts all matching teams. Page with limit (max 50) and offset; nextOffset is null on the last page. Call get_team with a teamUid for the full team page.',
      visibility: 'always',
      inputSchema: {
        q: z.string().optional().describe('Case-insensitive substring on team name'),
        island: z.string().optional().describe('Only teams on this map island, e.g. digital-human-rights'),
        limit: z.number().int().min(1).max(PORTFOLIO_LIMIT_MAX).optional().describe('Max rows (default 20, max 50)'),
        offset: z.number().int().min(0).optional().describe('Pagination offset (use nextOffset from the last page)'),
      },
      execute: async (_ctx, args = {}) => {
        const q = stringArg(args.q)?.toLowerCase();
        const island = stringArg(args.island);
        const limit = clampLimit(args.limit);
        const offset = Math.max(Math.trunc(Number(args.offset ?? 0)) || 0, 0);

        const { teams } = await portfolio.list();
        const matching = teams.filter(
          (team) => (!q || team.name.toLowerCase().includes(q)) && (!island || team.island === island)
        );
        const page = matching.slice(offset, offset + limit).map(agentRow);
        const nextOffset = offset + page.length < matching.length ? offset + page.length : null;

        return { teams: page, total: matching.length, limit, offset, nextOffset };
      },
    },
  ];
}
