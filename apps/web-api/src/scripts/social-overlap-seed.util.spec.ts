import {
  appendOverlapToHopChain,
  applyLinkedInPathWarmth,
  applyPathAttributionAndWarmth,
  applySocialOverlapScoreBump,
  buildAffinityAttributionText,
  buildAttributionLines,
  buildLinkedInOnlyPath,
  buildSocialOverlapCacheKey,
  extractFounderNodes,
  extractPlPeopleFromHopChain,
  isVerifiedSocialOverlap,
  linkedInBonusForOverlap,
  linkedInBonusForOverlaps,
  LINKEDIN_BONUS_UNVERIFIED,
  LINKEDIN_BONUS_VERIFIED,
  lookupAllSocialOverlapsForPath,
  lookupSocialOverlapForPath,
  lookupSocialOverlapForPair,
  pickBestLinkedInOnlyOverlap,
  resolveFounderPersonKey,
  resolvePlConnectorPersonKey,
  resolveTargetInvestorPersonKeys,
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
    investorId: '118269892',
    plName: 'PL person',
    confidence: 'high',
    affectsScore: true,
    evidenceUrls: [],
    ...partial,
  };
}

describe('buildSocialOverlapCacheKey', () => {
  it('uses pair-scoped investor and pl person keys', () => {
    expect(
      buildSocialOverlapCacheKey({
        investorId: '118269892',
        plPersonKey: 'investor:118239754',
      }),
    ).toBe('pair:investor:118269892|pl:investor:118239754');
  });
});

describe('resolvePlConnectorPersonKey', () => {
  it('maps internalId to investor person key', () => {
    expect(resolvePlConnectorPersonKey({ name: 'Lacey Wisdom', internalId: 118239754 })).toBe(
      'investor:118239754',
    );
  });
});

describe('extractFounderNodes', () => {
  it('uses founder-scoped personKey on raw F-path', () => {
    const founders = extractFounderNodes(RAW_SEQUOIA_F_PATH);
    expect(founders).toEqual([
      {
        personKey: 'founder:f_asta_li',
        name: 'Asta Li',
        memberUid: undefined,
        source: 'nodes.founder',
      },
    ]);
    expect(resolveFounderPersonKey('f_asta_li')).toBe('founder:f_asta_li');
  });
});

describe('extractPlPeopleFromHopChain', () => {
  it('extracts founder nodes and excludes target-side contacts', () => {
    const exclude = resolveTargetInvestorPersonKeys(RAW_SEQUOIA_F_PATH, 'lp_sequoia_capital');
    const people = extractPlPeopleFromHopChain(RAW_SEQUOIA_F_PATH, exclude);
    expect(people.map((p) => p.source)).toEqual(['nodes.founder']);
    expect(people[0]).toMatchObject({
      name: 'Asta Li',
      personKey: 'founder:f_asta_li',
    });
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

describe('linkedInBonus', () => {
  it('gives +0.25 for verified concurrent employment', () => {
    expect(
      linkedInBonusForOverlap(
        overlapEntry({ kind: 'concurrent_employment', label: 'x', plPersonKey: 'p:1' }),
      ),
    ).toBe(LINKEDIN_BONUS_VERIFIED);
    expect(isVerifiedSocialOverlap(overlapEntry({ kind: 'concurrent_employment', label: 'x', plPersonKey: 'p:1' }))).toBe(
      true,
    );
  });

  it('gives +0.25 for same_school with overlapYears', () => {
    expect(
      linkedInBonusForOverlap(
        overlapEntry({
          kind: 'same_school',
          label: 'school',
          plPersonKey: 'p:1',
          overlapYears: { start: 2010, end: 2012 },
          affectsScore: false,
        }),
      ),
    ).toBe(LINKEDIN_BONUS_VERIFIED);
  });

  it('gives +0.10 for unverified company/school', () => {
    expect(
      linkedInBonusForOverlap(
        overlapEntry({ kind: 'same_company_unknown_dates', label: 'x', plPersonKey: 'p:1', affectsScore: false }),
      ),
    ).toBe(LINKEDIN_BONUS_UNVERIFIED);
    expect(
      linkedInBonusForOverlap(
        overlapEntry({ kind: 'same_school_unknown_dates', label: 'x', plPersonKey: 'p:1', affectsScore: false }),
      ),
    ).toBe(LINKEDIN_BONUS_UNVERIFIED);
    expect(
      linkedInBonusForOverlap(
        overlapEntry({ kind: 'same_school', label: 'no years', plPersonKey: 'p:1', affectsScore: false }),
      ),
    ).toBe(LINKEDIN_BONUS_UNVERIFIED);
  });

  it('takes max across people, does not stack', () => {
    const bonus = linkedInBonusForOverlaps([
      overlapEntry({
        kind: 'same_school_unknown_dates',
        label: 'founder weak',
        plPersonKey: 'founder:f_a',
        affectsScore: false,
      }),
      overlapEntry({
        kind: 'concurrent_employment',
        label: 'connector strong',
        plPersonKey: 'investor:1',
      }),
    ]);
    expect(bonus).toBe(LINKEDIN_BONUS_VERIFIED);
  });

  it('caps pathWarmth at 1.0', () => {
    expect(
      applyLinkedInPathWarmth(0.9, [
        overlapEntry({ kind: 'concurrent_employment', label: 'x', plPersonKey: 'p:1' }),
      ]),
    ).toBe(1.0);
  });

  it('applySocialOverlapScoreBump uses additive model (compat wrapper)', () => {
    expect(
      applySocialOverlapScoreBump(
        0.5,
        overlapEntry({ kind: 'concurrent_employment', label: 'x', plPersonKey: 'p:1' }),
      ),
    ).toBeCloseTo(0.75);
  });
});

describe('attribution lines', () => {
  it('builds Affinity line with recency and tie', () => {
    expect(
      buildAffinityAttributionText({
        name: 'Brad Holden',
        strength: 0.1,
        recencyDays: 120,
        evidenceKind: 'last_email',
      }),
    ).toBe('Brad Holden last emailed ~4 months ago (tie 0.10)');
  });

  it('builds Affinity + LinkedIn lines without stacking into explanation', () => {
    const lines = buildAttributionLines({
      affinityConnector: {
        name: 'Lacey Wisdom',
        strength: 0.45,
        recencyDays: 150,
        evidenceKind: 'last_email',
      },
      overlaps: [
        overlapEntry({
          kind: 'concurrent_employment',
          label: 'Lacey and Dan worked at Eniac Ventures (2021–2022)',
          plPersonKey: 'investor:118239754',
        }),
      ],
    });
    expect(lines).toEqual([
      { source: 'Affinity', text: 'Lacey Wisdom last emailed ~5 months ago (tie 0.45)' },
      { source: 'LinkedIn', text: 'Lacey and Dan worked at Eniac Ventures (2021–2022)' },
    ]);
  });

  it('applyPathAttributionAndWarmth keeps explanation untouched', () => {
    const out = applyPathAttributionAndWarmth({
      hopChain: { explanation: 'Filecoin ecosystem investor.' },
      pathScore: 0.5,
      affinityConnector: {
        name: 'Brad Holden',
        strength: 0.1,
        recencyDays: 120,
        evidenceKind: 'last_email',
      },
      overlaps: [],
    });
    expect(out.hopChain.explanation).toBe('Filecoin ecosystem investor.');
    expect(out.hopChain.attributionLines).toEqual([
      { source: 'Affinity', text: 'Brad Holden last emailed ~4 months ago (tie 0.10)' },
    ]);
    expect(out.score).toBe(0.5);
  });
});

describe('buildLinkedInOnlyPath', () => {
  it('emits F path for founder overlap', () => {
    const path = buildLinkedInOnlyPath({
      targetInvestorId: '118270077',
      overlap: overlapEntry({
        kind: 'same_company_unknown_dates',
        label: 'worked together',
        plPersonKey: 'founder:f_emma_cui',
        plName: 'Emma Cui',
        affectsScore: false,
        evidenceUrls: [
          'https://www.linkedin.com/in/investor',
          'https://www.linkedin.com/in/emma-cui',
        ],
      }),
    });
    expect(path.connectorType).toBe('F');
    expect(path.hops).toBe(2);
    expect(path.proximityCode).toBe('F+2B');
    expect(path.score).toBe(0);
    expect((path.hopChain.attributionLines as { source: string }[])[0].source).toBe('LinkedIn');
    expect((path.hopChain as { contact?: { name: string; linkedin?: string } }).contact).toEqual({
      name: 'Emma Cui',
      role: 'Founder',
      source: 'linkedin-overlap',
      linkedin: 'https://www.linkedin.com/in/emma-cui',
    });
  });

  it('emits PL path for venture-lead overlap', () => {
    const path = buildLinkedInOnlyPath({
      targetInvestorId: '118270075',
      overlap: overlapEntry({
        kind: 'concurrent_employment',
        label: 'work overlap',
        plPersonKey: 'investor:118239754',
        plName: 'Lacey Wisdom',
      }),
    });
    expect(path.connectorType).toBe('PL');
    expect(path.proximityCode).toBe('PL+1B');
    expect((path.hopChain as { plConnector?: { name: string } }).plConnector?.name).toBe('Lacey Wisdom');
  });

  it('pickBestLinkedInOnlyOverlap prefers verified bonus', () => {
    const best = pickBestLinkedInOnlyOverlap([
      overlapEntry({
        kind: 'same_school_unknown_dates',
        label: 'weak',
        plPersonKey: 'founder:f_a',
        affectsScore: false,
      }),
      overlapEntry({
        kind: 'concurrent_employment',
        label: 'strong',
        plPersonKey: 'investor:1',
      }),
    ]);
    expect(best?.label).toBe('strong');
  });
});

describe('lookupSocialOverlapForPath', () => {
  it('hits cache for founder on F-path', () => {
    const cache = {
      [buildSocialOverlapCacheKey({
        investorId: '118269892',
        plPersonKey: 'founder:f_asta_li',
      })]: overlapEntry({
        kind: 'same_school',
        label: 'school overlap with Asta',
        plPersonKey: 'founder:f_asta_li',
        plName: 'Asta Li',
      }),
    };

    const hit = lookupSocialOverlapForPath(cache, {
      investorId: '118269892',
      hopChain: RAW_SEQUOIA_F_PATH,
    });

    expect(hit?.plPersonKey).toBe('founder:f_asta_li');
    expect(hit?.label).toBe('school overlap with Asta');
  });

  it('returns all founder + connector overlaps', () => {
    const cache = {
      [buildSocialOverlapCacheKey({
        investorId: '118269892',
        plPersonKey: 'founder:f_asta_li',
      })]: overlapEntry({
        kind: 'same_school',
        label: 'founder overlap',
        plPersonKey: 'founder:f_asta_li',
      }),
      [buildSocialOverlapCacheKey({
        investorId: '118269892',
        plPersonKey: 'investor:118269819',
      })]: overlapEntry({
        kind: 'concurrent_employment',
        label: 'connector overlap',
        plPersonKey: 'investor:118269819',
      }),
    };

    const hits = lookupAllSocialOverlapsForPath(cache, {
      investorId: '118269892',
      hopChain: {
        ...RAW_SEQUOIA_F_PATH,
        plConnector: { name: 'Brad Holden', internalId: 118269819 },
      },
    });

    expect(hits.map((h) => h.label).sort()).toEqual(['connector overlap', 'founder overlap']);
  });

  it('falls back to PL connector on affinity-direct paths', () => {
    const cache = {
      [buildSocialOverlapCacheKey({
        investorId: '118269892',
        plPersonKey: 'investor:118239754',
      })]: overlapEntry({
        kind: 'concurrent_employment',
        label: 'work overlap',
        plPersonKey: 'investor:118239754',
      }),
    };

    const hit = lookupSocialOverlapForPath(cache, {
      investorId: '118269892',
      hopChain: {
        plConnector: { name: 'Lacey Wisdom', internalId: 118239754 },
      },
    });

    expect(hit?.label).toBe('work overlap');
  });
});

describe('lookupSocialOverlapForPair', () => {
  it('finds pair overlap from plConnector even when path had no founder overlap', () => {
    const cache = {
      [buildSocialOverlapCacheKey({
        investorId: '118269892',
        plPersonKey: 'investor:118239754',
      })]: overlapEntry({
        kind: 'concurrent_employment',
        label: 'work overlap',
        plPersonKey: 'investor:118239754',
        affectsScore: true,
      }),
    };

    const hopChain: PathHopChain = {
      plConnector: { name: 'Lacey Wisdom', internalId: 118239754 },
    };

    const hit = lookupSocialOverlapForPair(cache, {
      investorId: '118269892',
      plConnector: hopChain.plConnector!,
    });

    expect(hit?.kind).toBe('concurrent_employment');
    expect(hit?.label).toBe('work overlap');
  });

  it('returns null when plConnector is missing', () => {
    const cache = {
      [buildSocialOverlapCacheKey({
        investorId: '118269892',
        plPersonKey: 'investor:118239754',
      })]: overlapEntry({
        kind: 'concurrent_employment',
        label: 'work overlap',
        plPersonKey: 'investor:118239754',
      }),
    };

    expect(
      lookupSocialOverlapForPair(cache, {
        investorId: '118269892',
        plConnector: {},
      }),
    ).toBeNull();
  });
});
