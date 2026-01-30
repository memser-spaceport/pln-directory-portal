import { InvestorProfileType, Prisma } from '@prisma/client';

/**
 * Seed InvestorProfile records for demo day testing.
 * Linked to demo day members 0-2.
 */
export const demoDayInvestorProfiles: Prisma.InvestorProfileCreateManyInput[] = [
  // Investor 0: ANGEL type, focus on DeFi/Developer Tooling/AI, $50k check size
  {
    uid: 'demo-investor-profile-0',
    memberUid: 'demo-investor-0',
    type: InvestorProfileType.ANGEL,
    investmentFocus: ['DeFi', 'Developer Tooling', 'AI'],
    investInStartupStages: ['Pre-Seed', 'Seed'],
    typicalCheckSize: 50000,
    isInvestViaFund: false,
    secRulesAccepted: true,
    secRulesAcceptedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  // Investor 1: FUND type, focus on Frontier Tech/Data Tooling, $250k check size
  {
    uid: 'demo-investor-profile-1',
    memberUid: 'demo-investor-1',
    type: InvestorProfileType.FUND,
    investmentFocus: ['Frontier Tech', 'Data Tooling'],
    investInStartupStages: ['Seed', 'Series A'],
    investInFundTypes: ['Venture'],
    typicalCheckSize: 250000,
    isInvestViaFund: true,
    secRulesAccepted: true,
    secRulesAcceptedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  // Investor 2: ANGEL_AND_FUND type, focus on Gaming/Metaverse/NFT, $100k check size
  {
    uid: 'demo-investor-profile-2',
    memberUid: 'demo-investor-2',
    type: InvestorProfileType.ANGEL_AND_FUND,
    investmentFocus: ['Gaming', 'Metaverse', 'NFT'],
    investInStartupStages: ['Pre-Seed', 'Seed', 'Series A'],
    typicalCheckSize: 100000,
    isInvestViaFund: true,
    secRulesAccepted: true,
    secRulesAcceptedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  },
];
