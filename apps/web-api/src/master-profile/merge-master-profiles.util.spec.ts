import {
  buildUidRemap,
  mergeMasterProfileFields,
  personKeyStrength,
  pickStrongestPersonKey,
  planEdgeRewire,
  planPathRewire,
  rewriteAlternateConnectorUids,
  rewriteHopChain,
  type ConnectionEdgeMergeRow,
  type MasterProfileMergeRow,
  type WarmPathV2MergeRow,
} from './merge-master-profiles.util';

function profile(
  partial: Partial<MasterProfileMergeRow> & Pick<MasterProfileMergeRow, 'uid' | 'personKey'>
): MasterProfileMergeRow {
  return {
    types: ['investor'],
    canonicalName: 'Ada',
    memberUid: null,
    affinityPersonId: null,
    investorOutreachId: null,
    emails: null,
    phones: null,
    socials: null,
    organizations: null,
    experience: null,
    education: null,
    investorMeta: null,
    funds: null,
    investedIn: null,
    locations: null,
    listMemberships: null,
    raw: null,
    sourceSnapshots: null,
    currentOrg: null,
    currentTitle: null,
    bio: null,
    contentHash: null,
    enrichmentVersion: null,
    enrichedAt: null,
    ...partial,
  };
}

function edge(
  partial: Partial<ConnectionEdgeMergeRow> & Pick<ConnectionEdgeMergeRow, 'uid' | 'fromProfileUid' | 'toProfileUid'>
): ConnectionEdgeMergeRow {
  return {
    relationKind: 'pl_direct',
    score: 0.5,
    confidence: 0.5,
    method: 'llm',
    reasons: [],
    hintsUsed: null,
    provider: null,
    model: null,
    promptVersion: null,
    runId: null,
    contentHash: null,
    ...partial,
  };
}

function path(
  partial: Partial<WarmPathV2MergeRow> &
    Pick<WarmPathV2MergeRow, 'uid' | 'targetProfileUid' | 'targetSet' | 'rank' | 'score'>
): WarmPathV2MergeRow {
  return {
    hopCount: 1,
    hopChain: { hops: [], alternates: [], relationKind: 'pl_direct' },
    bestConnectorProfileUid: null,
    alternateConnectorProfileUids: [],
    runId: null,
    computedAt: new Date('2026-01-01T00:00:00Z'),
    ...partial,
  };
}

describe('merge-master-profiles.util', () => {
  describe('personKeyStrength / pickStrongestPersonKey', () => {
    it('ranks email > linkedin > affinity > nameorg', () => {
      expect(personKeyStrength('email:a@b.com')).toBeGreaterThan(personKeyStrength('linkedin:x'));
      expect(personKeyStrength('linkedin:x')).toBeGreaterThan(personKeyStrength('affinity:1'));
      expect(personKeyStrength('affinity:1')).toBeGreaterThan(personKeyStrength('nameorg:a|b'));
      expect(pickStrongestPersonKey(['affinity:1', 'email:a@b.com', 'linkedin:x'])).toBe('email:a@b.com');
    });
  });

  describe('mergeMasterProfileFields', () => {
    it('takes strongest personKey, unions types, prefers canonical scalars', () => {
      const canonical = profile({
        uid: 'c',
        personKey: 'affinity:100',
        affinityPersonId: '100',
        currentOrg: 'a16z',
        types: ['investor'],
        listMemberships: [{ listSlug: 'neuro-fund-i', affinityPersonId: '100' }],
      });
      const dup = profile({
        uid: 'd',
        personKey: 'email:ma@a16z.com',
        affinityPersonId: '200',
        currentOrg: 'Oak HC/FT',
        currentTitle: 'Partner',
        types: ['investor', 'founder'],
        emails: [{ value: 'ma@a16z.com' }],
        listMemberships: [{ listSlug: 'neuro-fund-i', affinityPersonId: '200' }],
        socials: { linkedin: { value: 'https://linkedin.com/in/other' } },
      });

      const merged = mergeMasterProfileFields(canonical, [dup]);
      expect(merged.personKey).toBe('email:ma@a16z.com');
      expect(merged.affinityPersonId).toBe('100');
      expect(merged.currentOrg).toBe('a16z');
      expect(merged.currentTitle).toBe('Partner');
      expect(merged.types.sort()).toEqual(['founder', 'investor']);
      expect(merged.emails).toEqual([{ value: 'ma@a16z.com' }]);
      expect(merged.listMemberships).toHaveLength(2);
      expect(merged.socials).toEqual({
        linkedin: { value: 'https://linkedin.com/in/other' },
      });
    });
  });

  describe('rewriteHopChain', () => {
    it('rewrites profileUid on hops and alternates', () => {
      const remap = buildUidRemap('canon', ['dup']);
      const next = rewriteHopChain(
        {
          hops: [
            { profileUid: 'pl1', role: 'pl_connector' },
            { profileUid: 'dup', role: 'investor' },
          ],
          alternates: [{ profileUid: 'dup', score: 0.2 }],
          relationKind: 'pl_direct',
        },
        remap
      );
      expect(next).toEqual({
        hops: [
          { profileUid: 'pl1', role: 'pl_connector' },
          { profileUid: 'canon', role: 'investor' },
        ],
        alternates: [{ profileUid: 'canon', score: 0.2 }],
        relationKind: 'pl_direct',
      });
    });
  });

  describe('rewriteAlternateConnectorUids', () => {
    it('remaps and dedupes', () => {
      const remap = buildUidRemap('canon', ['dup']);
      expect(rewriteAlternateConnectorUids(['dup', 'pl2', 'canon'], remap)).toEqual(['canon', 'pl2']);
    });
  });

  describe('planEdgeRewire', () => {
    it('updates remapped edges and drops lower-score unique collisions', () => {
      const remap = buildUidRemap('canon', ['dup']);
      const plan = planEdgeRewire(
        [
          edge({ uid: 'e1', fromProfileUid: 'pl1', toProfileUid: 'dup', score: 0.9 }),
          edge({ uid: 'e2', fromProfileUid: 'pl1', toProfileUid: 'canon', score: 0.4 }),
          edge({ uid: 'e3', fromProfileUid: 'pl2', toProfileUid: 'dup', score: 0.7 }),
        ],
        remap
      );

      expect(plan.deleteUids).toEqual(['e2']);
      expect(plan.updates).toEqual(
        expect.arrayContaining([
          { uid: 'e1', fromProfileUid: 'pl1', toProfileUid: 'canon' },
          { uid: 'e3', fromProfileUid: 'pl2', toProfileUid: 'canon' },
        ])
      );
      expect(plan.updates).toHaveLength(2);
    });
  });

  describe('planPathRewire', () => {
    it('rewrites hopChain and collapses duplicate ranks per target+set', () => {
      const remap = buildUidRemap('canon', ['dup']);
      const plan = planPathRewire(
        [
          path({
            uid: 'p1',
            targetProfileUid: 'dup',
            targetSet: 'neuro-fund-i',
            rank: 1,
            score: 0.9,
            bestConnectorProfileUid: 'pl1',
            alternateConnectorProfileUids: ['pl2'],
            hopChain: {
              hops: [{ profileUid: 'pl1' }, { profileUid: 'dup' }],
              alternates: [{ profileUid: 'pl2', score: 0.5 }],
              relationKind: 'pl_direct',
            },
          }),
          path({
            uid: 'p2',
            targetProfileUid: 'canon',
            targetSet: 'neuro-fund-i',
            rank: 1,
            score: 0.3,
            bestConnectorProfileUid: 'pl3',
            hopChain: { hops: [{ profileUid: 'pl3' }], alternates: [], relationKind: 'pl_direct' },
          }),
          path({
            uid: 'p3',
            targetProfileUid: 'dup',
            targetSet: 'gold-co-investors',
            rank: 1,
            score: 0.6,
            bestConnectorProfileUid: 'pl1',
            hopChain: {
              hops: [{ profileUid: 'dup', role: 'investor' }],
              alternates: [],
              relationKind: 'pl_direct',
            },
          }),
        ],
        remap
      );

      expect(plan.deleteUids).toEqual(['p2']);
      expect(plan.updates).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            uid: 'p1',
            targetProfileUid: 'canon',
            rank: 1,
            bestConnectorProfileUid: 'pl1',
            hopChain: {
              hops: [{ profileUid: 'pl1' }, { profileUid: 'canon' }],
              alternates: [{ profileUid: 'pl2', score: 0.5 }],
              relationKind: 'pl_direct',
            },
          }),
          expect.objectContaining({
            uid: 'p3',
            targetProfileUid: 'canon',
            rank: 1,
            hopChain: {
              hops: [{ profileUid: 'canon', role: 'investor' }],
              alternates: [],
              relationKind: 'pl_direct',
            },
          }),
        ])
      );
    });
  });
});
