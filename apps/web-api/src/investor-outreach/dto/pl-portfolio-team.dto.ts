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
  sectors: string[];
  geo: string | null;
  coInvestors: PlPortfolioTeamCoInvestorDto[];
}
