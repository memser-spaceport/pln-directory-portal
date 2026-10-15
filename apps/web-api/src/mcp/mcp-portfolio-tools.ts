import type { PlNetworkPortfolioService } from '../spv-spotlights/pl-network-portfolio.service';
import { McpToolDef } from './mcp-tools';

/** The Networks Map's Directory data (`GET /v1/explore-pl-network/portfolio`), for agents. */
export function portfolioTools(portfolio: PlNetworkPortfolioService): McpToolDef[] {
  return [
    {
      name: 'list_portfolio_teams',
      description:
        'List the PL Portfolio teams that the Networks Map (Explore PL Network) shows from the Directory, excluding inactive (L0) teams, ordered by name. Each row: id, teamUid, name, oneLiner, stage, website, logoUrl (colour logo), mapLogoUrl (white map logo), island, startYear, endYear; missing values are null. Teams that exist only in the map fallback file are not included. Call get_team with a teamUid for the full team page.',
      visibility: 'always',
      execute: async () => {
        const { teams } = await portfolio.list();
        return { teams, total: teams.length };
      },
    },
  ];
}
