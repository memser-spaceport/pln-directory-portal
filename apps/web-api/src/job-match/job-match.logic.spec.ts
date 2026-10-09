import { JobOpeningStatus } from '@prisma/client';
import {
  GOOD_FIT,
  STRONG_FIT,
  TOP_N,
  companyKey,
  fitsFromAnswers,
  hasSignal,
  isLiveOpening,
  jevQuestions,
  jobMatchBlocker,
  labelFor,
  mapPool,
  normalizeTeamUids,
  parseCandidateNotes,
  parseCriteria,
  pickInterestNote,
  planTeamWork,
  profileText,
  profileTextHash,
  reusableFits,
  rolePosting,
  roleTextHash,
  selectTop,
  type MatchJob,
  type MatchMember,
} from './job-match.logic';

const job: MatchJob = {
  uid: 'role-1',
  roleTitle: 'Backend Engineer',
  companyName: 'Prime Intellect',
  roleCategory: 'Engineering',
  seniority: 'Senior',
  summary: 'Build the platform.',
  descriptionHtml: '<p>Go and Postgres</p>',
  location: ['Remote'],
  workMode: 'Remote',
};

function member(overrides: Partial<MatchMember> = {}): MatchMember {
  return {
    uid: 'member-1',
    name: 'Ada Lovelace',
    role: 'Engineer',
    currentCompany: 'Analytical Engines',
    bio: 'Builds distributed systems.',
    aboutYou: null,
    customSkills: ['Postgres'],
    city: 'London',
    country: 'UK',
    skills: ['Go'],
    experiences: [{ title: 'Engineer', company: 'Analytical Engines', current: true, description: 'Led the stack' }],
    teams: [{ role: 'Engineer', team: 'Other Lab' }],
    ...overrides,
  };
}

describe('job match logic', () => {
  const env = { ...process.env };

  afterEach(() => {
    process.env = { ...env };
  });

  it('normalizes a company name the same way the team exclusion compares it', () => {
    expect(companyKey('  Prime   Intellect ')).toBe('prime intellect');
    expect(companyKey(null)).toBe('');
  });

  it('skips an empty profile', () => {
    expect(hasSignal(member())).toBe(true);
    expect(
      hasSignal(member({ bio: '  ', aboutYou: null, role: '', skills: [], customSkills: [], experiences: [] }))
    ).toBe(false);
  });

  it('builds the same profile text shape as the POC', () => {
    const text = profileText(member());
    expect(text).toContain('Role: Engineer');
    expect(text).toContain('Company: Analytical Engines');
    expect(text).toContain('Location: London, UK');
    expect(text).toContain('Skills: Go, Postgres');
    expect(text).toContain('Experience:');
    expect(text).toContain('- Engineer at Analytical Engines (current): Led the stack');
    expect(text).toContain('- Engineer at Other Lab');
  });

  it('hashes role text so an unchanged posting can reuse criteria', () => {
    const posting = rolePosting(job);
    expect(roleTextHash(posting)).toBe(roleTextHash(posting));
    expect(roleTextHash(posting)).not.toBe(roleTextHash(rolePosting({ ...job, summary: 'Changed' })));
  });

  it('parses 4 to 6 criteria and rejects a short list', () => {
    expect(parseCriteria('notes [" Go ", "Senior", "Remote", "Postgres", "extra", "sixth", "seventh"]')).toEqual([
      'Go',
      'Senior',
      'Remote',
      'Postgres',
      'extra',
      'sixth',
    ]);
    expect(() => parseCriteria('["only one"]')).toThrow(/at least 4/);
  });

  it('asks Jev one boolean per open role', () => {
    const questions = jevQuestions(
      [job, { ...job, uid: 'role-2', roleTitle: 'Designer' }],
      new Map([[job.uid, ['Go']]])
    );
    expect(Object.keys(questions)).toEqual(['role-1', 'role-2']);
    expect(questions['role-1'].type).toBe('boolean');
    expect(questions['role-1'].instructions).toContain('Go');
    expect(questions['role-1'].criteria.true).toContain('supported');
  });

  it('turns Jev probability into a 0-100 fit', () => {
    expect(fitsFromAnswers(['role-1', 'role-2'], { 'role-1': { probability: 0.91 } })).toEqual({
      'role-1': 91,
      'role-2': 0,
    });
  });

  it('keeps at most 5 and drops scores below the good-match floor', () => {
    const fits = new Map<string, Record<string, number>>([
      ['m-90', { 'role-1': 90 }],
      ['m-80', { 'role-1': 80 }],
      ['m-70', { 'role-1': 70 }],
      ['m-50', { 'role-1': 50 }],
      ['m-49', { 'role-1': 49 }],
      ['m-40', { 'role-1': 40 }],
      ['m-99', { 'role-1': 99 }],
      ['m-88', { 'role-1': 88 }],
    ]);
    const top = selectTop([...fits.keys()], fits, 'role-1');
    expect(top).toHaveLength(TOP_N);
    expect(top.map((row) => row.memberUid)).toEqual(['m-99', 'm-90', 'm-88', 'm-80', 'm-70']);
    expect(top[0].label).toBe('STRONG');
    expect(top[4].label).toBe('GOOD');
    expect(top.every((row) => row.fit >= GOOD_FIT)).toBe(true);
    expect(labelFor(STRONG_FIT)).toBe('STRONG');
    expect(labelFor(GOOD_FIT - 1)).toBeNull();
  });

  it('ranks an interested member first on a tie and marks each row (LAB-2788)', () => {
    const fits = new Map<string, Record<string, number>>([
      ['m-a', { 'role-1': 70 }],
      ['m-b', { 'role-1': 70 }],
      ['m-c', { 'role-1': 90 }],
      ['m-low', { 'role-1': 40 }],
    ]);
    const top = selectTop([...fits.keys()], fits, 'role-1', new Set(['m-b', 'm-low']));
    expect(top.map((row) => row.memberUid)).toEqual(['m-c', 'm-b', 'm-a']);
    expect(top.map((row) => row.interested)).toEqual([false, true, false]);
  });

  it('keeps the old order when nobody is interested (LAB-2788)', () => {
    const fits = new Map<string, Record<string, number>>([
      ['m-b', { 'role-1': 70 }],
      ['m-a', { 'role-1': 70 }],
    ]);
    const top = selectTop([...fits.keys()], fits, 'role-1');
    expect(top.map((row) => row.memberUid)).toEqual(['m-a', 'm-b']);
    expect(top.every((row) => row.interested === false)).toBe(true);
  });

  it('picks the role note over the team note, trimmed, and null when both are empty (LAB-2802)', () => {
    expect(pickInterestNote('  Love this role.  ', 'Big fan of the team.')).toBe('Love this role.');
    expect(pickInterestNote(null, ' Big fan of the team. ')).toBe('Big fan of the team.');
    expect(pickInterestNote('   ', 'Big fan of the team.')).toBe('Big fan of the team.');
    expect(pickInterestNote(undefined, undefined)).toBeNull();
    expect(pickInterestNote('', '  ')).toBeNull();
  });

  it('plans a same-day resume around finished teams, roles, and member scores', () => {
    const done = planTeamWork({
      teamFinished: true,
      roleUids: ['role-1'],
      finishedRoleUids: [],
      memberUids: ['m1'],
      scoresByMember: new Map(),
    });
    expect(done).toEqual({ skipTeam: true, membersToScore: [], rolesToFinish: [] });

    const resume = planTeamWork({
      teamFinished: false,
      roleUids: ['role-1', 'role-2'],
      finishedRoleUids: ['role-1'],
      memberUids: ['scored', 'new', 'stale'],
      scoresByMember: new Map<string, Record<string, number>>([
        ['scored', { 'role-1': 80, 'role-2': 10 }],
        ['stale', { 'role-1': 80 }],
      ]),
    });
    expect(resume.skipTeam).toBe(false);
    expect(resume.rolesToFinish).toEqual(['role-2']);
    expect(resume.membersToScore.sort()).toEqual(['new', 'stale']);
  });

  it('reuses a fit only when the profile text and the role text are unchanged', () => {
    const profileHash = profileTextHash(profileText(member()));
    const hash = roleTextHash(rolePosting(job));
    const payload = {
      profileHash,
      fits: {
        'role-1': { fit: 90, roleTextHash: hash },
        'role-2': { fit: 40, roleTextHash: 'old-role' },
      },
    };
    const roleHashes = new Map([
      ['role-1', hash],
      ['role-2', 'new-role'],
    ]);
    expect(reusableFits(payload, profileHash, roleHashes)).toEqual({ 'role-1': 90 });
    expect(reusableFits(payload, 'other-profile', roleHashes)).toEqual({});
  });

  it('accepts a team uid list and rejects an empty one', () => {
    expect(normalizeTeamUids(undefined)).toBeUndefined();
    expect(normalizeTeamUids([' team-a ', 'team-a', 'team-b'])).toEqual(['team-a', 'team-b']);
    expect(() => normalizeTeamUids([])).toThrow(/must not be empty/);
    expect(() => normalizeTeamUids(['  '])).toThrow(/must not be empty/);
    expect(() => normalizeTeamUids('team-a')).toThrow(/array of strings/);
  });

  it('parses per-candidate blurbs and criterion marks', () => {
    const notes = parseCandidateNotes('[{"memberUid":"m1","blurb":"Knows Go.","matched":[true,false,true,true]}]', [
      { memberUid: 'm1', criteriaCount: 4 },
    ]);
    expect(notes.get('m1')).toEqual({ blurb: 'Knows Go.', matched: [true, false, true, true] });
    expect(() =>
      parseCandidateNotes('[{"memberUid":"m1","blurb":"x","matched":[true]}]', [{ memberUid: 'm1', criteriaCount: 4 }])
    ).toThrow(/matched length/);
  });

  it('treats a published non-hidden role with a team as live', () => {
    expect(isLiveOpening({ status: JobOpeningStatus.CONFIRMED, publishedAt: new Date(), teamUid: 'team' })).toBe(true);
    expect(isLiveOpening({ status: JobOpeningStatus.STALE, publishedAt: new Date(), teamUid: 'team' })).toBe(false);
    expect(isLiveOpening({ status: JobOpeningStatus.CONFIRMED, publishedAt: null, teamUid: 'team' })).toBe(false);
  });

  it('requires the feature flag, the Jev key, and the Anthropic service account', () => {
    delete process.env.IS_JOB_MATCH_ENABLED;
    expect(jobMatchBlocker()?.code).toBe('disabled');
    process.env.IS_JOB_MATCH_ENABLED = 'true';
    delete process.env.VERCEL_AI_KEY;
    expect(jobMatchBlocker()?.message).toBe('VERCEL_AI_KEY missing');
    process.env.VERCEL_AI_KEY = 'test-key';
    process.env.ANTHROPIC_AUTH_MODE = 'api_key';
    expect(jobMatchBlocker()?.message).toContain('wif');
    process.env.ANTHROPIC_AUTH_MODE = 'wif';
    expect(jobMatchBlocker()).toBeNull();
  });

  it('skips the feature flag check when ignoreEnabledFlag is set', () => {
    delete process.env.IS_JOB_MATCH_ENABLED;
    process.env.VERCEL_AI_KEY = 'test-key';
    process.env.ANTHROPIC_AUTH_MODE = 'wif';
    expect(jobMatchBlocker({ ignoreEnabledFlag: true })).toBeNull();
    expect(jobMatchBlocker({ ignoreEnabledFlag: false })?.code).toBe('disabled');
    expect(jobMatchBlocker()?.code).toBe('disabled');
  });

  it('still requires the Jev key when ignoreEnabledFlag is set', () => {
    delete process.env.IS_JOB_MATCH_ENABLED;
    delete process.env.VERCEL_AI_KEY;
    expect(jobMatchBlocker({ ignoreEnabledFlag: true })).toEqual({
      code: 'misconfigured',
      message: 'VERCEL_AI_KEY missing',
    });
  });

  it('runs at most the pool limit at once', async () => {
    let active = 0;
    let peak = 0;
    await mapPool([1, 2, 3, 4, 5], 2, async () => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
    });
    expect(peak).toBe(2);
  });
});
