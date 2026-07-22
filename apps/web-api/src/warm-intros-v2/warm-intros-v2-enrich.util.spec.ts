import {
  buildPathSummary,
  matchesSearch,
  matchesSector,
  parseInvestorSectors,
  toInvestorSummary,
  unwrapPrimaryEmail,
} from './warm-intros-v2-enrich.util';

describe('warm-intros-v2-enrich.util', () => {
  describe('unwrapPrimaryEmail', () => {
    it('unwraps Sourced[] primary/first email', () => {
      expect(
        unwrapPrimaryEmail([
          { value: 'vitalik@ethereum.org', sources: [{ type: 'affinity' }] },
          { value: 'other@example.com', sources: [{ type: 'directory' }] },
        ])
      ).toBe('vitalik@ethereum.org');
    });

    it('accepts plain string[]', () => {
      expect(unwrapPrimaryEmail(['a@b.com'])).toBe('a@b.com');
    });

    it('returns null for empty/invalid', () => {
      expect(unwrapPrimaryEmail(null)).toBeNull();
      expect(unwrapPrimaryEmail([])).toBeNull();
    });
  });

  describe('parseInvestorSectors', () => {
    it('parses string[] sectors', () => {
      expect(parseInvestorSectors({ sectors: ['Crypto', 'AI'] })).toEqual(['Crypto', 'AI']);
    });

    it('dedupes case-insensitively', () => {
      expect(parseInvestorSectors({ sectors: ['crypto', 'Crypto', 'ai'] })).toEqual(['crypto', 'ai']);
    });
  });

  describe('toInvestorSummary', () => {
    it('maps investor email from Sourced[] fixture', () => {
      const summary = toInvestorSummary('inv1', {
        uid: 'inv1',
        personKey: 'email:vitalik@ethereum.org',
        canonicalName: 'Vitalik Buterin',
        emails: [{ value: 'vitalik@ethereum.org', sources: [{ type: 'affinity', id: '149762491' }] }],
        currentOrg: 'Ethereum Foundation',
        currentTitle: 'Founder',
        investorMeta: { sectors: ['crypto', 'public-goods'] },
        affinityPersonId: '149762491',
        memberUid: null,
      });

      expect(summary).toEqual({
        profileUid: 'inv1',
        personKey: 'email:vitalik@ethereum.org',
        name: 'Vitalik Buterin',
        email: 'vitalik@ethereum.org',
        currentOrg: 'Ethereum Foundation',
        currentTitle: 'Founder',
        sectors: ['crypto', 'public-goods'],
        affinityPersonId: '149762491',
        memberUid: null,
        imageUrl: null,
      });
    });

    it('passes through imageUrl when set', () => {
      const summary = toInvestorSummary('inv1', {
        uid: 'inv1',
        personKey: 'k',
        canonicalName: 'Jane',
        memberUid: 'm1',
        imageUrl: 'https://cdn.example/jane.png',
      });
      expect(summary.imageUrl).toBe('https://cdn.example/jane.png');
      expect(summary.memberUid).toBe('m1');
    });
  });

  describe('buildPathSummary', () => {
    it('takes first reason description and alternate count', () => {
      expect(
        buildPathSummary(
          {
            reasons: [{ description: 'Shared Protocol Labs history' }, { description: 'other' }],
            alternates: [{ profileUid: 'c2' }, { profileUid: 'c3' }],
          },
          ['c2']
        )
      ).toEqual({
        explanation: 'Shared Protocol Labs history',
        alternateCount: 2,
      });
    });
  });

  describe('matchesSearch / matchesSector', () => {
    const investor = toInvestorSummary('inv1', {
      uid: 'inv1',
      personKey: 'k',
      canonicalName: 'Vitalik Buterin',
      emails: [{ value: 'vitalik@ethereum.org', sources: [] }],
      investorMeta: { sectors: ['Crypto', 'AI'] },
    });

    it('filters by name (case-insensitive)', () => {
      expect(matchesSearch(investor, 'vitalik')).toBe(true);
      expect(matchesSearch(investor, 'BUTERIN')).toBe(true);
      expect(matchesSearch(investor, 'satoshi')).toBe(false);
    });

    it('filters by email', () => {
      expect(matchesSearch(investor, 'ethereum.org')).toBe(true);
    });

    it('filters by sector (case-insensitive)', () => {
      expect(matchesSector(investor, 'crypto')).toBe(true);
      expect(matchesSector(investor, 'AI')).toBe(true);
      expect(matchesSector(investor, 'biotech')).toBe(false);
    });
  });
});
