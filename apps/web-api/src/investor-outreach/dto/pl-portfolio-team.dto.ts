export interface PlPortfolioTeamCoInvestorDto {
  investorId: string;
  dealAmount: number | null;
  dealDate: string | null;
}

export interface PlPortfolioTeamDto {
  teamUid: string;
  teamName: string;
  logoUrl: string | null;
  plInvestedAt: string | null;
  plInvestedStage: string | null;
  raisingNow: string | null;
  raisingStage: string | null;
  lastRoundStage: string | null;
  lastRoundDate: string | null;
  raisingAsOf: string | null;
  raisingSource: string | null;
  sectors: string[];
  geo: string | null;
  coInvestors: PlPortfolioTeamCoInvestorDto[];
}
