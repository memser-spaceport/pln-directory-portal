import { loadProfileBatch } from './profile-sources.loader';
import { buildNewsTagVocabulary } from '../team-news/news-tag-vocabulary.service';

describe('loadProfileBatch (LAB-3122)', () => {
  const NOW = new Date('2026-11-04T00:00:00Z');
  const findMany = (rows: unknown[] = []) => jest.fn(async () => rows);

  function prisma() {
    // Read-only by construction: only findMany exists, so any write would throw.
    return {
      memberSignal: {
        findMany: findMany([
          { memberUid: 'm1', action: 'follow', entityType: 'TEAM', entityUid: 't9', own: false, createdAt: NOW },
        ]),
      },
      teamMemberRole: {
        findMany: jest.fn(async ({ where }: { where: { memberUid: { in: string[] } } }) =>
          where.memberUid.in.includes('m1')
            ? [
                { memberUid: 'm1', teamUid: 't1', endDate: null },
                { memberUid: 'm1', teamUid: 't0', endDate: new Date('2025-01-01') },
              ]
            : []
        ),
      },
      memberInteraction: { findMany: findMany() },
      pLEventGuest: { findMany: findMany() },
      jobReferral: { findMany: findMany() },
      teamNewsItem: { findMany: findMany() },
      member: { findMany: findMany() },
      jobOpening: { findMany: findMany() },
      teamFocusArea: {
        findMany: findMany([
          { teamUid: 't9', focusArea: { title: 'Data Ownership' }, ancestorArea: { title: 'Digital Human Rights' } },
        ]),
      },
      projectFocusArea: { findMany: findMany() },
    };
  }

  it('batches each source with an in-query and maps roles, saved tags and declared interests', async () => {
    const p = prisma();
    const vocabulary = buildNewsTagVocabulary([
      { uid: 'a', title: 'Digital Human Rights', parentUid: null },
      { uid: 'b', title: 'Data Ownership', parentUid: 'a' },
    ]);

    const { sources, lookups } = await loadProfileBatch(
      p as never,
      [
        {
          uid: 'm1',
          preferences: { newsTags: ['defi'] },
          customSkills: ['Rust'],
          ohInterest: ['AI'],
          skills: [{ title: 'Go' }],
        },
      ],
      vocabulary,
      NOW
    );

    expect(p.memberSignal.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { memberUid: { in: ['m1'] } } })
    );
    expect(sources[0]).toEqual(
      expect.objectContaining({
        currentTeamUids: ['t1'],
        pastTeams: [{ teamUid: 't0', endDate: new Date('2025-01-01') }],
        savedNewsTags: ['defi'],
        declaredInterests: ['Go', 'Rust', 'AI'],
      })
    );
    expect([...lookups.teamTopics('t9')].sort()).toEqual(['data-ownership', 'digital-human-rights']);
    expect(lookups.isTopic('data-ownership')).toBe(true);
    expect(lookups.isTopic('rust')).toBe(false);
  });

  it('treats unknown target members as excluded', async () => {
    const p = prisma();
    p.memberSignal.findMany = findMany([
      { memberUid: 'm1', action: 'view', entityType: 'MEMBER', entityUid: 'ghost', own: false, createdAt: NOW },
    ]);

    const { lookups } = await loadProfileBatch(
      p as never,
      [{ uid: 'm1', preferences: null, customSkills: [], ohInterest: [], skills: [] }],
      buildNewsTagVocabulary([]),
      NOW
    );

    expect(lookups.isExcludedMember('ghost')).toBe(true);
  });
});
