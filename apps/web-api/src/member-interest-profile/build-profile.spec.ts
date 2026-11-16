import { buildProfile, ProfileLookups, ProfileSources, SignalRow } from './build-profile';

const NOW = new Date('2026-11-04T00:00:00Z');
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000);
const OPTIONS = { now: NOW, halfLifeDays: 90 };

const TOPICS = new Set(['ai', 'defi', 'storage', 'digital-human-rights']);

function lookups(overrides: Partial<ProfileLookups> = {}): ProfileLookups {
  return {
    teamTopics: (uid) =>
      (({ ai_team: ['ai'], own_team: ['storage'], past_team: ['defi'] } as Record<string, string[]>)[uid] ?? []),
    projectTopics: (uid) => (uid === 'p1' ? ['defi'] : []),
    memberTeams: (uid) => (uid === 'm2' ? ['ai_team'] : []),
    newsItem: (uid) =>
      ((
        {
          n_other: { teamUid: 'ai_team', tags: ['ai', 'launch'] },
          n_own: { teamUid: 'own_team', tags: ['storage'] },
        } as Record<string, { teamUid: string; tags: string[] }>
      )[uid]),
    jobTeam: (uid) => (uid === 'j1' ? 'ai_team' : undefined),
    eventTeams: (uid) =>
      (({ e_ai: ['ai_team'], e_mixed: ['own_team', 'ai_team'], e_bare: [] } as Record<string, string[]>)[uid] ?? []),
    isTopic: (slug) => TOPICS.has(slug),
    slugify: (value) => value.trim().toLowerCase().replace(/\s+/g, '-'),
    isExcludedMember: (uid) => uid === 'bot',
    ...overrides,
  };
}

function sources(overrides: Partial<ProfileSources> = {}): ProfileSources {
  return {
    memberUid: 'm1',
    currentTeamUids: [],
    pastTeams: [],
    signals: [],
    heldMeetings: [],
    eventTopics: [],
    referrals: [],
    declaredInterests: [],
    savedNewsTags: [],
    ownPosts: [],
    ...overrides,
  };
}

const signal = (action: string, entityType: string, entityUid: string, ageDays: number, own = false): SignalRow => ({
  action,
  entityType,
  entityUid,
  own,
  createdAt: daysAgo(ageDays),
});

const score = (entries: ReturnType<typeof buildProfile>, kind: string, key: string) =>
  entries.find((e) => e.kind === kind && e.key === key)?.score;

describe('buildProfile (LAB-3122)', () => {
  it('a follow of an AI team gives a topic score for ai and an entity score for the team', () => {
    const profile = buildProfile(sources({ signals: [signal('follow', 'TEAM', 'ai_team', 0)] }), lookups(), OPTIONS);

    expect(score(profile, 'TOPIC', 'ai')).toBe(5);
    expect(score(profile, 'ENTITY', 'TEAM:ai_team')).toBe(5);
  });

  it('halves weight every half-life and never drops an old action', () => {
    const profile = buildProfile(
      sources({ signals: [signal('follow', 'TEAM', 'ai_team', 90), signal('follow', 'PROJECT', 'p1', 900)] }),
      lookups(),
      OPTIONS
    );

    expect(score(profile, 'ENTITY', 'TEAM:ai_team')).toBeCloseTo(2.5, 4);
    expect(score(profile, 'ENTITY', 'PROJECT:p1')).toBeGreaterThan(0);
  });

  it('an upvote 10 days ago adds more than one 100 days ago', () => {
    const recent = buildProfile(
      sources({ signals: [signal('news-upvote', 'NEWS_ITEM', 'n_other', 10)] }),
      lookups(),
      OPTIONS
    );
    const old = buildProfile(
      sources({ signals: [signal('news-upvote', 'NEWS_ITEM', 'n_other', 100)] }),
      lookups(),
      OPTIONS
    );

    expect(score(recent, 'TOPIC', 'ai') ?? 0).toBeGreaterThan(score(old, 'TOPIC', 'ai') ?? 0);
    expect(score(old, 'TOPIC', 'ai') ?? 0).toBeGreaterThan(0);
  });

  it('each repeat on the same item adds half of the one before; different items count in full', () => {
    const repeated = buildProfile(
      sources({
        signals: [
          signal('search-result-click', 'TEAM', 'ai_team', 0),
          signal('search-result-click', 'TEAM', 'ai_team', 0),
          signal('search-result-click', 'TEAM', 'ai_team', 0),
        ],
      }),
      lookups(),
      OPTIONS
    );
    expect(score(repeated, 'ENTITY', 'TEAM:ai_team')).toBeCloseTo(2 + 1 + 0.5, 4);

    const distinct = buildProfile(
      sources({ signals: [signal('view', 'PROJECT', 'p1', 0), signal('view', 'PROJECT', 'p2', 0)] }),
      lookups(),
      OPTIONS
    );
    expect(score(distinct, 'ENTITY', 'PROJECT:p1')).toBe(1);
    expect(score(distinct, 'ENTITY', 'PROJECT:p2')).toBe(1);
  });

  it('a removal cancels earlier actions; a later follow counts again', () => {
    const unfollowed = buildProfile(
      sources({ signals: [signal('follow', 'TEAM', 'ai_team', 10), signal('unfollow', 'TEAM', 'ai_team', 5)] }),
      lookups(),
      OPTIONS
    );
    expect(score(unfollowed, 'ENTITY', 'TEAM:ai_team')).toBeUndefined();

    const refollowed = buildProfile(
      sources({
        signals: [
          signal('follow', 'TEAM', 'ai_team', 10),
          signal('unfollow', 'TEAM', 'ai_team', 5),
          signal('follow', 'TEAM', 'ai_team', 0),
        ],
      }),
      lookups(),
      OPTIONS
    );
    expect(score(refollowed, 'ENTITY', 'TEAM:ai_team')).toBe(5);
  });

  it('a removal only cancels its own action', () => {
    const profile = buildProfile(
      sources({
        signals: [
          signal('view', 'TEAM', 'ai_team', 1),
          signal('follow', 'TEAM', 'ai_team', 1),
          signal('unfollow', 'TEAM', 'ai_team', 0),
        ],
      }),
      lookups(),
      OPTIONS
    );
    expect(score(profile, 'ENTITY', 'TEAM:ai_team')).toBeCloseTo(Math.pow(0.5, 1 / 90), 4);
  });

  it('a founder liking their own team news does not raise interest in that team', () => {
    const profile = buildProfile(
      sources({
        currentTeamUids: ['own_team'],
        signals: Array.from({ length: 10 }, (_, i) => signal('news-like', 'NEWS_ITEM', `n_own`, i, true)),
      }),
      lookups(),
      OPTIONS
    );

    expect(score(profile, 'ENTITY', 'TEAM:own_team')).toBeUndefined();
    expect(score(profile, 'TOPIC', 'storage')).toBe(1);
  });

  it('the current team adds its focus areas at a low weight and is never an entity, even via jobs or past roles', () => {
    const profile = buildProfile(
      sources({
        currentTeamUids: ['ai_team'],
        pastTeams: [{ teamUid: 'ai_team', endDate: daysAgo(0) }],
        signals: [signal('job-saved', 'JOB_OPENING', 'j1', 0)],
      }),
      lookups(),
      OPTIONS
    );

    expect(score(profile, 'ENTITY', 'TEAM:ai_team')).toBeUndefined();
    expect(score(profile, 'TOPIC', 'ai')).toBe(1);
  });

  it('a past team counts as a weak interest', () => {
    const profile = buildProfile(
      sources({ pastTeams: [{ teamUid: 'past_team', endDate: daysAgo(0) }] }),
      lookups(),
      OPTIONS
    );

    expect(score(profile, 'ENTITY', 'TEAM:past_team')).toBe(2);
    expect(score(profile, 'TOPIC', 'defi')).toBe(2);
  });

  it('own posts and own-team comments go to expertise, not interests', () => {
    const profile = buildProfile(
      sources({
        ownPosts: [{ tags: ['ai', 'launch'], createdAt: daysAgo(0) }],
        signals: [signal('news-comment', 'NEWS_ITEM', 'n_own', 0, true)],
      }),
      lookups(),
      OPTIONS
    );

    expect(score(profile, 'EXPERTISE', 'ai')).toBe(3);
    expect(score(profile, 'EXPERTISE', 'storage')).toBe(1);
    expect(score(profile, 'TOPIC', 'ai')).toBeUndefined();
    expect(score(profile, 'EXPERTISE', 'launch')).toBeUndefined();
  });

  it('news adds its focus-area tags as topics and half its weight to the news team', () => {
    const profile = buildProfile(
      sources({ signals: [signal('news-upvote', 'NEWS_ITEM', 'n_other', 0)] }),
      lookups(),
      OPTIONS
    );

    expect(score(profile, 'TOPIC', 'ai')).toBe(2);
    expect(score(profile, 'TOPIC', 'launch')).toBeUndefined();
    expect(score(profile, 'ENTITY', 'TEAM:ai_team')).toBe(1);
  });

  it('member interactions score the member and half to their teams topics; excluded members add nothing', () => {
    const profile = buildProfile(
      sources({
        signals: [signal('contact-copy', 'MEMBER', 'm2', 0), signal('view', 'MEMBER', 'bot', 0)],
        heldMeetings: [{ targetMemberUid: 'm2', createdAt: daysAgo(0) }],
        referrals: [{ referredMemberUid: 'bot', jobTeamUid: null, createdAt: daysAgo(0) }],
      }),
      lookups(),
      OPTIONS
    );

    expect(score(profile, 'ENTITY', 'MEMBER:m2')).toBe(5 + 8);
    expect(score(profile, 'TOPIC', 'ai')).toBe((5 + 8) / 2);
    expect(score(profile, 'ENTITY', 'MEMBER:bot')).toBeUndefined();
  });

  it('saved news tags, declared interests and IRL topics add topics; unmatched values add nothing', () => {
    const profile = buildProfile(
      sources({
        savedNewsTags: ['defi', 'not-a-topic'],
        declaredInterests: ['Digital Human Rights', 'Underwater basket weaving'],
        eventTopics: [{ topics: ['AI', 'Cooking'], createdAt: daysAgo(0) }],
      }),
      lookups(),
      OPTIONS
    );

    expect(score(profile, 'TOPIC', 'defi')).toBe(4);
    expect(score(profile, 'TOPIC', 'digital-human-rights')).toBe(3);
    expect(score(profile, 'TOPIC', 'ai')).toBe(3);
    expect(profile.map((e) => e.key)).not.toEqual(expect.arrayContaining(['not-a-topic', 'cooking']));
  });

  it('a member with no sources has an empty profile', () => {
    expect(buildProfile(sources(), lookups(), OPTIONS)).toEqual([]);
  });

  it('own view rows (own profile, own team) are ignored', () => {
    const profile = buildProfile(
      sources({ signals: [signal('view', 'MEMBER', 'm1', 0, true), signal('view', 'TEAM', 'own_team', 0, true)] }),
      lookups(),
      OPTIONS
    );
    expect(profile).toEqual([]);
  });
});

describe('buildProfile: news, job and event signals (LAB-3267)', () => {
  const build = (signals: SignalRow[], overrides: Partial<ProfileSources> = {}) =>
    buildProfile(sources({ signals, ...overrides }), lookups(), OPTIONS);

  it('an opened news item adds its tags and half its weight to the news team', () => {
    const profile = build([signal('view', 'NEWS_ITEM', 'n_other', 0)]);

    expect(score(profile, 'TOPIC', 'ai')).toBe(1);
    expect(score(profile, 'ENTITY', 'TEAM:ai_team')).toBe(0.5);
  });

  it('a job view and an Apply click each add the job team, with their own weights', () => {
    const profile = build([signal('view', 'JOB_OPENING', 'j1', 0), signal('job-apply-click', 'JOB_OPENING', 'j1', 0)]);

    expect(score(profile, 'ENTITY', 'TEAM:ai_team')).toBe(6);
    expect(score(profile, 'TOPIC', 'ai')).toBe(6);
  });

  it('a job with no team adds nothing', () => {
    expect(build([signal('view', 'JOB_OPENING', 'j_no_team', 0)])).toEqual([]);
  });

  it("an event adds its linked team in full and that team's focus areas at half", () => {
    const profile = build([signal('view', 'EVENT', 'e_ai', 0)]);

    expect(score(profile, 'ENTITY', 'TEAM:ai_team')).toBe(1);
    expect(score(profile, 'TOPIC', 'ai')).toBe(0.5);
  });

  it('an event search click has its own weight', () => {
    const profile = build([signal('search-result-click', 'EVENT', 'e_ai', 0)]);

    expect(score(profile, 'ENTITY', 'TEAM:ai_team')).toBe(2);
    expect(score(profile, 'TOPIC', 'ai')).toBe(1);
  });

  it('an event with no linked team, or an unknown event, adds nothing', () => {
    expect(build([signal('view', 'EVENT', 'e_bare', 0), signal('view', 'EVENT', 'ghost', 0)])).toEqual([]);
  });

  it('an event skips the current team of the member and keeps the other linked teams', () => {
    const profile = build([signal('view', 'EVENT', 'e_mixed', 0)], { currentTeamUids: ['own_team'] });

    expect(score(profile, 'ENTITY', 'TEAM:own_team')).toBeUndefined();
    expect(score(profile, 'ENTITY', 'TEAM:ai_team')).toBe(1);
    // storage comes only from the fixed current-team weight, not from the event.
    expect(score(profile, 'TOPIC', 'storage')).toBe(1);
  });

  it('damps repeat views of the same news item and decays an old event view', () => {
    const repeats = build([
      signal('view', 'NEWS_ITEM', 'n_other', 0),
      signal('view', 'NEWS_ITEM', 'n_other', 0),
      signal('view', 'NEWS_ITEM', 'n_other', 0),
    ]);
    const old = build([signal('view', 'EVENT', 'e_ai', 90)]);

    expect(score(repeats, 'TOPIC', 'ai')).toBe(1.75);
    expect(score(old, 'ENTITY', 'TEAM:ai_team')).toBeCloseTo(0.5, 4);
  });

  it('own news, job and event rows add nothing', () => {
    const profile = build([
      signal('view', 'NEWS_ITEM', 'n_other', 0, true),
      signal('view', 'JOB_OPENING', 'j1', 0, true),
      signal('job-apply-click', 'JOB_OPENING', 'j1', 0, true),
      signal('view', 'EVENT', 'e_ai', 0, true),
    ]);

    expect(profile).toEqual([]);
  });

  it('a news view weight changes news views only', () => {
    jest.resetModules();
    jest.doMock('./member-interest-profile.constants', () => {
      const actual = jest.requireActual('./member-interest-profile.constants');
      const weights = { ...actual.SIGNAL_ENTITY_WEIGHTS, 'view:NEWS_ITEM': 3 };
      return {
        ...actual,
        SIGNAL_ENTITY_WEIGHTS: weights,
        signalWeight: (action: string, entityType: string) =>
          weights[`${action}:${entityType}`] ?? actual.SIGNAL_WEIGHTS[action] ?? 0,
      };
    });
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { buildProfile: tuned } = require('./build-profile') as typeof import('./build-profile');

    const profile = tuned(
      sources({ signals: [signal('view', 'NEWS_ITEM', 'n_other', 0), signal('view', 'PROJECT', 'p1', 0)] }),
      lookups(),
      OPTIONS
    );
    jest.dontMock('./member-interest-profile.constants');

    expect(score(profile, 'TOPIC', 'ai')).toBe(3);
    expect(score(profile, 'ENTITY', 'PROJECT:p1')).toBe(1);
  });
});
