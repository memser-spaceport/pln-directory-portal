import { InvestorDto } from './dto/investor.dto';
import { WarmIntroTier } from './dto/warm-intros.dto';

/**
 * Pure scoring function ported from the frontend mock at
 * `pln-directory-portal-v2/services/investors/investors.mock.ts:115-178` (the `scoreCandidate` fn).
 * Backend is the single source of truth — keep this file behaviourally identical to that mock so
 * the parity tests in `warm-intros.scorer.spec.ts` continue to validate the contract.
 *
 * Point table (cap at 100, drops cold rows with zero sector overlap):
 *   Same-team co-invest                                              +50  (tier=co_invested)
 *   Any other PL portfolio team co-invest                            +35  (tier=co_invested)
 *   T1 Registered for last Demo Day                                  +30  (tier=engaged)
 *   T2 Clicked recent outreach                                       +22  (tier=engaged)
 *   T3 Opened recent outreach                                        +14  (tier=engaged)
 *   Each sector overlap (target ∩ investor.sectorTags)               +10 each
 *   Stage matches target (or investor.stageFocus === 'all')          +10
 *   Email status === 'verified'                                      +5
 */

export interface ScoreInputs {
  investor: InvestorDto;
  targetTeamUid?: string;
  targetTeamName?: string;
  targetSectors: string[];
  targetStage?: string;
  /** uid → display name; used to format "Co-invested on <team>" reason text for any-team matches. */
  portfolioTeamsByUid: Map<string, string>;
}

export interface ScoreResult {
  tier: WarmIntroTier;
  score: number;
  reason: string;
  evidence: string[];
}

export function scoreCandidate(inputs: ScoreInputs): ScoreResult {
  const { investor, targetTeamUid, targetTeamName, targetSectors, targetStage, portfolioTeamsByUid } = inputs;

  let score = 0;
  const evidence: string[] = [];
  let tier: WarmIntroTier = 'cold_match';
  let reason = '';

  // ---- Warmth signal ----
  if (targetTeamUid && investor.coInvestedTeamIds.includes(targetTeamUid)) {
    tier = 'co_invested';
    score += 50;
    reason = `Co-invested on ${targetTeamName ?? targetTeamUid}`;
    evidence.push(`Same team: ${targetTeamName ?? targetTeamUid}`);
  } else if (investor.coInvestedTeamIds.length > 0) {
    tier = 'co_invested';
    score += 35;
    const firstUid = investor.coInvestedTeamIds[0];
    const otherName = portfolioTeamsByUid.get(firstUid) ?? 'PL portfolio team';
    reason = `Co-invested on ${otherName}`;
    if (investor.coInvestedTeamIds.length > 1) {
      evidence.push(`+ ${investor.coInvestedTeamIds.length - 1} more`);
    }
  } else if (investor.engagementTier === 'T1_registered' || investor.engagementTier === 'T2_clicked') {
    tier = 'engaged';
    score += investor.engagementTier === 'T1_registered' ? 30 : 22;
    reason = investor.engagementTier === 'T1_registered' ? 'Registered for last Demo Day' : 'Clicked recent outreach';
    evidence.push(investor.engagementTier.replace('_', ' '));
  } else if (investor.engagementTier === 'T3_opened') {
    tier = 'engaged';
    score += 14;
    reason = 'Opened recent outreach';
    evidence.push('T3 Opened');
  } else {
    tier = 'cold_match';
    reason = 'Stage + sector match · no prior touch';
  }

  // ---- Sector match ----
  if (targetSectors.length > 0) {
    const overlap = investor.sectorTags.filter((s) => targetSectors.includes(s));
    if (overlap.length > 0) {
      score += 10 * overlap.length;
      evidence.push(`Sector match: ${overlap.join(', ')}`);
    } else if (tier === 'cold_match') {
      // No sector overlap and no warm path: drop from results
      score = 0;
    }
  }

  // ---- Stage match ----
  if (targetStage && (investor.stageFocus === targetStage || investor.stageFocus === 'all')) {
    score += 10;
  }

  // ---- Email deliverability bonus ----
  if (investor.emailStatus === 'verified') {
    score += 5;
  }

  if (score > 100) score = 100;

  return { tier, score, reason, evidence };
}
