import {
  NAME_MATCH_CONFIDENCE,
  buildMemberMatchIndex,
  buildTeamMatchIndex,
  matchCompanySidecar,
  matchMember,
  matchTeam,
  normalizeCompanyMatchName,
  normalizeDomain,
  normalizeEmail,
  normalizeMatchName,
} from './affinity-match.util';

describe('affinity-match.util', () => {
  describe('normalizeEmail', () => {
    it('lowercases and trims', () => {
      expect(normalizeEmail('  Foo@Bar.COM ')).toBe('foo@bar.com');
    });
  });

  describe('normalizeDomain', () => {
    it('extracts hostname from url', () => {
      expect(normalizeDomain('https://www.example.com/path')).toBe('example.com');
    });
  });

  describe('normalizeCompanyMatchName', () => {
    it('strips legal suffix and punctuation', () => {
      expect(normalizeCompanyMatchName('Acme, Inc.')).toBe('acme');
    });
  });

  describe('matchTeam', () => {
    const index = buildTeamMatchIndex([
      { uid: 'team-1', name: 'Acme Inc.', airtableRecId: 'recABC', website: 'https://acme.io' },
      { uid: 'team-2', name: 'Beta Labs', airtableRecId: null, website: null },
    ]);
    index.byExistingAffinityOrgId.set('999', 'team-1');

    it('matches airtable rec id', () => {
      const r = matchTeam({ affinityOrgId: '1', name: 'Other', buildersFunnelRecordId: 'recABC' }, index);
      expect(r).toEqual({ uid: 'team-1', method: 'AIRTABLE_REC_ID', confidence: 1 });
    });

    it('matches domain', () => {
      const r = matchTeam({ affinityOrgId: '2', name: 'Other', domain: 'acme.io' }, index);
      expect(r).toEqual({ uid: 'team-1', method: 'DOMAIN', confidence: 1 });
    });

    it('matches existing affinity org link', () => {
      const r = matchTeam({ affinityOrgId: '999', name: 'Other' }, index);
      expect(r?.method).toBe('AFFINITY_ID');
    });

    it('matches company name as last resort with low confidence', () => {
      const r = matchTeam({ affinityOrgId: '3', name: 'Beta Labs' }, index);
      expect(r).toEqual({ uid: 'team-2', method: 'NAME', confidence: NAME_MATCH_CONFIDENCE });
    });

    it('prefers domain over name', () => {
      const r = matchTeam({ affinityOrgId: '4', name: 'Acme Inc.', domain: 'acme.io' }, index);
      expect(r?.method).toBe('DOMAIN');
    });

    it('returns null when no match', () => {
      expect(matchTeam({ affinityOrgId: 'none', name: 'Unknown Co' }, index)).toBeNull();
    });
  });

  describe('matchMember', () => {
    const index = buildMemberMatchIndex([
      { uid: 'clmember1', name: 'Jane Founder', email: 'founder@acme.io', airtableRecId: 'recMEM' },
      { uid: 'clmember2', name: 'Ada Lovelace', email: 'ada@example.com', airtableRecId: null },
    ]);

    it('matches email', () => {
      const r = matchMember(
        {
          affinityPersonId: '1',
          fullName: 'Someone Else',
          primaryEmail: 'founder@acme.io',
        },
        index
      );
      expect(r).toEqual({ uid: 'clmember1', method: 'EMAIL', confidence: 1 });
    });

    it('matches directory uid in builders funnel field', () => {
      const r = matchMember({ affinityPersonId: '2', buildersFunnelRecordId: 'clmember1' }, index);
      expect(r?.method).toBe('DIRECTORY_UID');
    });

    it('matches full name with low confidence when unique', () => {
      const r = matchMember(
        {
          affinityPersonId: '3',
          firstName: 'Ada',
          lastName: 'Lovelace',
        },
        index
      );
      expect(r).toEqual({ uid: 'clmember2', method: 'NAME', confidence: NAME_MATCH_CONFIDENCE });
    });

    it('skips ambiguous member names', () => {
      const ambiguous = buildMemberMatchIndex([
        { uid: 'a', name: 'John Smith', email: 'a@x.com', airtableRecId: null },
        { uid: 'b', name: 'John Smith', email: 'b@x.com', airtableRecId: null },
      ]);
      expect(matchMember({ affinityPersonId: '9', fullName: 'John Smith' }, ambiguous)).toBeNull();
    });
  });

  describe('matchCompanySidecar', () => {
    it('returns company uid by org id', () => {
      const uid = matchCompanySidecar('org-1', {
        byAffinityOrgId: new Map([['org-1', 'comp-uid']]),
      });
      expect(uid).toBe('comp-uid');
    });
  });
});
