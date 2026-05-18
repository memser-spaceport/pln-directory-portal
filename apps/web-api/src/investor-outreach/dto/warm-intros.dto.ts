import { InvestorDto } from './investor.dto';
import { PlPortfolioTeamDto } from './pl-portfolio-team.dto';

export type WarmIntroTier = 'co_invested' | 'engaged' | 'cold_match';

export interface WarmIntroCandidateDto {
  investor: InvestorDto;
  tier: WarmIntroTier;
  /** Human-readable explanation for the ranking. */
  reason: string;
  /** 0–100 score. Higher = better fit. */
  fitScore: number;
  /** Short evidence chips for the row. */
  evidence: string[];
}

export interface WarmIntrosResponseDto {
  /** Populated when a teamId was provided. */
  team?: PlPortfolioTeamDto;
  total: number;
  candidates: WarmIntroCandidateDto[];
}
