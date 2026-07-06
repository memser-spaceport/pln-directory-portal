import {
  appendOverlapToHopChain,
  applySocialOverlapScoreBump,
  buildSocialOverlapCacheKey,
  extractPlPeopleFromHopChain,
  lookupSocialOverlapForPath,
  resolveTargetInvestorPersonKeys,
  SOCIAL_OVERLAP_SCORE_MULTIPLIER,
  type PathHopChain,
  type SocialOverlapEntry,
} from './social-overlap-seed.util';

const RAW_SEQUOIA_F_PATH: PathHopChain = {
  nodes: [
    { id: 'PL', label: 'Protocol Labs', type: 'org' },
    { id: 'f_asta_li', label: 'Asta Li', type: 'org' },
    { id: 'lp_sequoia_capital', label: 'Sequoia Capital', type: 'org' },
  ],
  edges: [
    { from: 'PL', to: 'f_asta_li', connectorType: 'F' },
    { from: 'f_asta_li', to: 'lp_sequoia_capital', connectorType: 'F' },
  ],
  contact: { name: 'Sequoia Capital', role: 'investor in Privy' },
  connectorTeam: {
    name: 'Sequoia Capital',
    leads: [
      { name: 'Sequoia Capital', role: 'investor in Privy' },
      { name: 'Konstantine Buhler', role: 'LP @ Sequoia Capital (co-invested Privy)' },
    ],
  },
  routeNodes: [
    { label: 'Protocol Labs', variant: 'org' },
    {
      label: 'Sequoia Capital',
      orgName: 'Sequoia Capital',
      variant: 'external',
      contacts: [{ name: 'Konstantine Buhler', role: 'LP @ Sequoia Capital (co-invested Privy)' }],
    },
  ],
};

const HYDRATED_ALPHA_SQUARE: PathHopChain = {
  connectorTeam: {
    name: 'Sebastian Zhou',
    leads: [
      { name: 'Square Peg Capital', role: 'investor in Anytype' },
      { name: 'Sebastian Zhou', role: 'LP @ Alpha Square Group (co-invested Anytype)' },
    ],
  },
  routeNodes: [
    { label: 'Protocol Labs', variant: 'org' },
    {
      label: 'Lacey Wisdom',
      variant: 'member',
      memberUid: 'cldvo71g904plu21kruxzfekt',
      contacts: [
        {
          name: 'Lacey Wisdom',
          role: 'Protocol Labs',
          memberUid: 'cldvo71g904plu21kruxzfekt',
        },
      ],
    },
    {
      label: 'Zhanna Sharipova',
      variant: 'member',
      orgName: 'Sebastian Zhou',
      memberUid: 'cldvol01g09b7u21ko3qjjv54',
      contacts: [
        {
          name: 'Zhanna Sharipova',
          role: 'Founder',
          memberUid: 'cldvol01g09b7u21ko3qjjv54',
        },
      ],
    },
    {
      label: 'Sebastian Zhou',
      orgName: 'Alpha Square Group',
      variant: 'external',
      contacts: [
        {
          name: 'Sebastian Zhou',
          role: 'LP @ Alpha Square Group (co-invested Anytype)',
          affinityId: '118239754',
        },
      ],
    },
  ],
  plConnector: { name: 'Brad Holden', internalId: 118269819 },
};

function overlapEntry(
  partial: Partial<SocialOverlapEntry> & Pick<SocialOverlapEntry, 'kind' | 'label' | 'plPersonKey'>,
): SocialOverlapEntry {
  return {
    targetSet: 'neuro-fund-i',
    targetInvestorId: 'lp_sequoia_capital',
    rank: 1,
    plName: 'PL person',
    confidence: 'high',
    affectsScore: true,
    evidenceUrls: [],
    ...partial,
  };
}

describe('buildSocialOverlapCacheKey', () => {
  it('matches enrichment cache key format', () => {
    expect(
      buildSocialOverlapCacheKey({
        targetSet: 'neuro-fund-i',
        targetInvestorId: 'lp_sequoia_capital',
        rank: 1,
        plPersonKey: 'member:clxxx',
      }),
    ).toBe('neuro-fund-i|lp_sequoia_capital|rank:1|pl:member:clxxx');
  });
});

describe('extractPlPeopleFromHopChain', () => {
  it('extracts founder nodes and excludes target-side contacts', () => {
    const exclude = resolveTargetInvestorPersonKeys(RAW_SEQUOIA_F_PATH, 'lp_sequoia_capital');
    const people = extractPlPeopleFromHopChain(RAW_SEQUOIA_F_PATH, exclude);
    expect(people.map((p) => p.source)).toEqual(['nodes.founder']);
    expect(people[0].name).toBe('Asta Li');
  });

  it('extracts plConnector and member routeNodes', () => {
    const exclude = resolveTargetInvestorPersonKeys(HYDRATED_ALPHA_SQUARE, 'lp_alpha_square');
    const people = extractPlPeopleFromHopChain(HYDRATED_ALPHA_SQUARE, exclude);
    expect(people.map((p) => p.personKey).sort()).toEqual(
      ['investor:118269819', 'member:cldvol01g09b7u21ko3qjjv54', 'member:cldvo71g904plu21kruxzfekt'].sort(),
    );
    expect(people.find((p) => p.source === 'hopChain.plConnector')?.name).toBe('Brad Holden');
    expect(people.filter((p) => p.source === 'routeNodes.member')).toHaveLength(2);
  });
});

describe('appendOverlapToHopChain', () => {
  const label = 'Alice and Bob both worked at Acme (2018–2020)';

  it('appends overlap label as one sentence', () => {
    const out = appendOverlapToHopChain(
      { explanation: 'Existing note.' },
      overlapEntry({ kind: 'concurrent_employment', label, plPersonKey: 'm:1' }),
    );
    expect(out.explanation).toBe(`Existing note. ${label}.`);
  });

  it('is idempotent when label substring already present', () => {
    const hopChain = { explanation: `Warm path. ${label}.` };
    const out = appendOverlapToHopChain(
      hopChain,
      overlapEntry({ kind: 'concurrent_employment', label, plPersonKey: 'm:1' }),
    );
    expect(out.explanation).toBe(hopChain.explanation);
  });
});

describe('applySocialOverlapScoreBump', () => {
  it('bumps score only when affectsScore is true', () => {
    expect(applySocialOverlapScoreBump(0.8, null)).toBe(0.8);
    expect(
      applySocialOverlapScoreBump(
        0.8,
        overlapEntry({ kind: 'same_school_unknown_dates', label: 'x', plPersonKey: 'm:1', affectsScore: false }),
      ),
    ).toBe(0.8);
    expect(
      applySocialOverlapScoreBump(
        0.8,
        overlapEntry({ kind: 'concurrent_employment', label: 'x', plPersonKey: 'm:1', affectsScore: true }),
      ),
    ).toBeCloseTo(0.8 * SOCIAL_OVERLAP_SCORE_MULTIPLIER);
  });

  it('caps at 1.0', () => {
    expect(
      applySocialOverlapScoreBump(
        0.99,
        overlapEntry({ kind: 'concurrent_employment', label: 'x', plPersonKey: 'm:1', affectsScore: true }),
      ),
    ).toBe(1.0);
  });
});

describe('lookupSocialOverlapForPath', () => {
  it('picks highest-priority overlap when multiple PL people hit', () => {
    const cache = {
      [buildSocialOverlapCacheKey({
        targetSet: 'neuro-fund-i',
        targetInvestorId: 'lp_sequoia_capital',
        rank: 1,
        plPersonKey: 'member:founder',
      })]: overlapEntry({
        kind: 'same_school',
        label: 'school overlap',
        plPersonKey: 'member:founder',
        affectsScore: true,
      }),
      [buildSocialOverlapCacheKey({
        targetSet: 'neuro-fund-i',
        targetInvestorId: 'lp_sequoia_capital',
        rank: 1,
        plPersonKey: 'investor:118239754',
      })]: overlapEntry({
        kind: 'concurrent_employment',
        label: 'work overlap',
        plPersonKey: 'investor:118239754',
        affectsScore: true,
      }),
    };

    const hopChain: PathHopChain = {
      nodes: [
        { id: 'f_brad', label: 'Brad Holden', type: 'org' },
        { id: 'lp_sequoia_capital', label: 'Sequoia', type: 'org' },
      ],
      edges: [{ from: 'PL', to: 'f_brad', connectorType: 'F' }],
      plConnector: { name: 'Lacey Wisdom', internalId: 118239754 },
    };

    const targetPersonKeys = resolveTargetInvestorPersonKeys(hopChain, 'lp_sequoia_capital');
    const winner = lookupSocialOverlapForPath(cache, {
      targetSet: 'neuro-fund-i',
      targetInvestorId: 'lp_sequoia_capital',
      rank: 1,
      hopChain,
      targetPersonKeys,
    });

    expect(winner?.kind).toBe('concurrent_employment');
    expect(winner?.label).toBe('work overlap');
  });
});
