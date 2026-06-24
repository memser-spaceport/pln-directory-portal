import {
  buildMemberMatchIndex,
  buildTeamMatchIndex,
  matchCompanySidecar,
  matchMember,
  matchTeam,
  normalizeDomain,
  normalizeEmail,
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

  describe('matchTeam', () => {
    const index = buildTeamMatchIndex([{ uid: 'team-1', airtableRecId: 'recABC', website: 'https://acme.io' }]);
    index.byExistingAffinityOrgId.set('999', 'team-1');

    it('matches airtable rec id', () => {
      const r = matchTeam({ affinityOrgId: '1', buildersFunnelRecordId: 'recABC' }, index);
      expect(r).toEqual({ uid: 'team-1', method: 'AIRTABLE_REC_ID', confidence: 1 });
    });

    it('matches domain', () => {
      const r = matchTeam({ affinityOrgId: '2', domain: 'acme.io' }, index);
      expect(r).toEqual({ uid: 'team-1', method: 'DOMAIN', confidence: 1 });
    });

    it('matches existing affinity org link', () => {
      const r = matchTeam({ affinityOrgId: '999' }, index);
      expect(r?.method).toBe('AFFINITY_ID');
    });

    it('returns null when no match', () => {
      expect(matchTeam({ affinityOrgId: 'none', name: 'Foo' } as any, index)).toBeNull();
    });
  });

  describe('matchMember', () => {
    const index = buildMemberMatchIndex([{ uid: 'clmember1', email: 'founder@acme.io', airtableRecId: 'recMEM' }]);

    it('matches email', () => {
      const r = matchMember(
        {
          affinityPersonId: '1',
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
