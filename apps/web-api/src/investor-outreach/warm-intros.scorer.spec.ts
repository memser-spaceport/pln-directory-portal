import { InvestorDto } from './dto/investor.dto';
import { scoreCandidate } from './warm-intros.scorer';

function investor(overrides: Partial<InvestorDto> = {}): InvestorDto {
  return {
    investorId: 'INV-1',
    canonicalId: null,
    dedupeKey: 'a@b.com',
    source: 'Manual',
    firstName: 'A',
    lastName: 'B',
    email: 'a@b.com',
    emailStatus: 'unknown',
    linkedinUrl: null,
    firm: null,
    firmDomain: null,
    title: null,
    investorType: 'fund',
    fundThesis: null,
    aumRange: null,
    checkSizeRange: null,
    stageFocus: 'seed',
    sectorTags: [],
    geoFocus: null,
    recentDeals: [],
    outreachTouches: 0,
    outreachCampaigns: [],
    opened: 0,
    clicked: 0,
    registered: 0,
    firstSentDate: null,
    lastSentDate: null,
    engagementTier: 'T4_cold',
    enrichmentStatus: 'pending',
    enrichmentDate: null,
    lastEnrichmentAttempt: null,
    enrichmentNotes: null,
    tags: [],
    labOsProfile: null,
    coInvestedTeamIds: [],
    createdAt: '',
    updatedAt: '',
    ...overrides,
  };
}

const emptyMap = new Map<string, string>();

describe('scoreCandidate', () => {
  it('co_invested with same team scores 50 + sector + stage + email', () => {
    const out = scoreCandidate({
      investor: investor({
        coInvestedTeamIds: ['team-a'],
        sectorTags: ['ai', 'crypto'],
        stageFocus: 'seed',
        emailStatus: 'verified',
      }),
      targetTeamUid: 'team-a',
      targetTeamName: 'Apex',
      targetSectors: ['ai', 'crypto'],
      targetStage: 'seed',
      portfolioTeamsByUid: new Map([['team-a', 'Apex']]),
    });
    // 50 (same team) + 20 (2 sector matches) + 10 (stage) + 5 (verified) = 85
    expect(out.tier).toBe('co_invested');
    expect(out.score).toBe(85);
    expect(out.reason).toBe('Co-invested on Apex');
    expect(out.evidence).toContain('Same team: Apex');
    expect(out.evidence).toContain('Sector match: ai, crypto');
  });

  it('co_invested with different team scores 35 and lists "+N more"', () => {
    const out = scoreCandidate({
      investor: investor({ coInvestedTeamIds: ['team-x', 'team-y', 'team-z'] }),
      targetTeamUid: 'team-a',
      targetSectors: [],
      portfolioTeamsByUid: new Map([['team-x', 'Lattice Labs']]),
    });
    expect(out.tier).toBe('co_invested');
    expect(out.score).toBe(35);
    expect(out.reason).toBe('Co-invested on Lattice Labs');
    expect(out.evidence).toContain('+ 2 more');
  });

  it('falls back to "PL portfolio team" when first uid has no name in map', () => {
    const out = scoreCandidate({
      investor: investor({ coInvestedTeamIds: ['team-unknown'] }),
      targetSectors: [],
      portfolioTeamsByUid: emptyMap,
    });
    expect(out.reason).toBe('Co-invested on PL portfolio team');
  });

  it('T1 registered scores 30, tier engaged', () => {
    const out = scoreCandidate({
      investor: investor({ engagementTier: 'T1_registered' }),
      targetSectors: [],
      portfolioTeamsByUid: emptyMap,
    });
    expect(out.tier).toBe('engaged');
    expect(out.score).toBe(30);
    expect(out.reason).toBe('Registered for last Demo Day');
    expect(out.evidence).toContain('T1 registered');
  });

  it('T2 clicked scores 22, tier engaged', () => {
    const out = scoreCandidate({
      investor: investor({ engagementTier: 'T2_clicked' }),
      targetSectors: [],
      portfolioTeamsByUid: emptyMap,
    });
    expect(out.tier).toBe('engaged');
    expect(out.score).toBe(22);
    expect(out.reason).toBe('Clicked recent outreach');
  });

  it('T3 opened scores 14, tier engaged', () => {
    const out = scoreCandidate({
      investor: investor({ engagementTier: 'T3_opened' }),
      targetSectors: [],
      portfolioTeamsByUid: emptyMap,
    });
    expect(out.tier).toBe('engaged');
    expect(out.score).toBe(14);
    expect(out.reason).toBe('Opened recent outreach');
    expect(out.evidence).toContain('T3 Opened');
  });

  it('drops cold_match with target sectors and zero overlap', () => {
    const out = scoreCandidate({
      investor: investor({ sectorTags: ['fintech'] }),
      targetSectors: ['ai'],
      portfolioTeamsByUid: emptyMap,
    });
    expect(out.tier).toBe('cold_match');
    expect(out.score).toBe(0);
  });

  it('keeps cold_match when no target sectors are specified', () => {
    const out = scoreCandidate({
      investor: investor({ stageFocus: 'all', emailStatus: 'verified' }),
      targetSectors: [],
      targetStage: 'seed',
      portfolioTeamsByUid: emptyMap,
    });
    // No sector criteria → no zero-out. +10 stage (all matches anything) + +5 email = 15.
    expect(out.tier).toBe('cold_match');
    expect(out.score).toBe(15);
    expect(out.reason).toBe('Stage + sector match · no prior touch');
  });

  it('stage match awards +10 when investor stage matches target', () => {
    const out = scoreCandidate({
      investor: investor({ stageFocus: 'series-a', engagementTier: 'T2_clicked' }),
      targetSectors: [],
      targetStage: 'series-a',
      portfolioTeamsByUid: emptyMap,
    });
    expect(out.score).toBe(32); // 22 (T2) + 10 (stage)
  });

  it('stage match awards +10 when investor is stage-agnostic ("all")', () => {
    const out = scoreCandidate({
      investor: investor({ stageFocus: 'all', engagementTier: 'T2_clicked' }),
      targetSectors: [],
      targetStage: 'seed',
      portfolioTeamsByUid: emptyMap,
    });
    expect(out.score).toBe(32);
  });

  it('verified email adds +5', () => {
    const out = scoreCandidate({
      investor: investor({ engagementTier: 'T3_opened', emailStatus: 'verified' }),
      targetSectors: [],
      portfolioTeamsByUid: emptyMap,
    });
    expect(out.score).toBe(19); // 14 (T3) + 5
  });

  it('caps score at 100', () => {
    const out = scoreCandidate({
      investor: investor({
        coInvestedTeamIds: ['team-a'],
        sectorTags: ['ai', 'crypto', 'defi', 'infrastructure', 'fintech'],
        stageFocus: 'seed',
        emailStatus: 'verified',
      }),
      targetTeamUid: 'team-a',
      targetTeamName: 'Apex',
      targetSectors: ['ai', 'crypto', 'defi', 'infrastructure', 'fintech'],
      targetStage: 'seed',
      portfolioTeamsByUid: new Map([['team-a', 'Apex']]),
    });
    // 50 + 50 (5 sectors) + 10 + 5 = 115 → capped at 100
    expect(out.score).toBe(100);
  });

  it('warmth signal wins over engagement tier', () => {
    const out = scoreCandidate({
      investor: investor({
        coInvestedTeamIds: ['team-x'],
        engagementTier: 'T1_registered',
      }),
      targetSectors: [],
      portfolioTeamsByUid: new Map([['team-x', 'Modular Globe']]),
    });
    // Co-invested branch fires first; T1 doesn't add anything on top.
    expect(out.tier).toBe('co_invested');
    expect(out.score).toBe(35);
  });
});
