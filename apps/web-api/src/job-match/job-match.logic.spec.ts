import { JobOpeningStatus } from '@prisma/client';
import { createHash } from 'crypto';
import {
  GOOD_FIT,
  STRONG_FIT,
  blurbPrompt,
  leadPromptLine,
  TOP_N,
  MATCH_JOB_SELECT,
  companyKey,
  currentRoleTextHash,
  enabledCriteria,
  asCriteria,
  criteriaLabelPrompt,
  criteriaPrompt,
  criterionStatements,
  flaggedCriteria,
  fitsFromAnswers,
  hasSignal,
  isEmailDryRun,
  isLegacyCriteriaPayload,
  isLiveOpening,
  jevQuestions,
  jobMatchBlocker,
  labelFor,
  mapPool,
  pickSuggestedEmail,
  normalizeTeamUids,
  parseCandidateNotes,
  normalizeCriterionGroup,
  normalizeCriterionLabel,
  parseCriteria,
  parseCriteriaLabels,
  parseEmailTeamAllowlist,
  pickInterestNote,
  planTeamWork,
  profileText,
  profileTextHash,
  reusableFits,
  rolePosting,
  roleTextHash,
  scoreHash,
  selectTop,
  withCriterionMeta,
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
    expect(
      criterionStatements(parseCriteria('notes [" Go ", "Senior", "Remote", "Postgres", "extra", "sixth", "seventh"]'))
    ).toEqual(['Go', 'Senior', 'Remote', 'Postgres', 'extra', 'sixth']);
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

describe('criteria overrides (LAB-2846)', () => {
  const all = ['Rust', '5+ years', 'Remote EU'];

  it('MATCH_JOB_SELECT lists every MatchJob field', () => {
    expect(Object.keys(MATCH_JOB_SELECT).sort()).toEqual(Object.keys(job).sort());
  });

  it('currentRoleTextHash is the hash of the posting', () => {
    expect(currentRoleTextHash(job)).toBe(roleTextHash(rolePosting(job)));
  });

  it('enabledCriteria drops disabled texts and keeps order', () => {
    expect(enabledCriteria(all, ['5+ years'])).toEqual(['Rust', 'Remote EU']);
    expect(enabledCriteria(all, [])).toEqual(all);
    expect(enabledCriteria(all, ['Kubernetes'])).toEqual(all);
  });

  it('enabledCriteria falls back to all when every criterion is disabled', () => {
    expect(enabledCriteria(all, all)).toEqual(all);
  });

  it('scoreHash is the posting hash for a role with no override', () => {
    expect(scoreHash('posting-hash', all, all)).toBe('posting-hash');
    expect(scoreHash('posting-hash', enabledCriteria(all, []), all)).toBe('posting-hash');
  });

  it('scoreHash changes with the enabled set', () => {
    const one = scoreHash('posting-hash', ['Rust', '5+ years'], all);
    const two = scoreHash('posting-hash', ['Rust', 'Remote EU'], all);
    expect(one).not.toBe('posting-hash');
    expect(one).not.toBe(two);
    expect(scoreHash('posting-hash', ['Rust', '5+ years'], all)).toBe(one);
    expect(scoreHash('other-posting', ['Rust', '5+ years'], all)).not.toBe(one);
  });

  describe('criteria prompt (LAB-2853)', () => {
    const sha = (text: string) => createHash('sha256').update(text).digest('hex');

    it('scoreHash keeps the posting hash for a role with nothing disabled and no prompt', () => {
      expect(scoreHash('posting-hash', all, all, null)).toBe('posting-hash');
      expect(scoreHash('posting-hash', all, all, '')).toBe('posting-hash');
    });

    it('scoreHash of a prompt-less override is unchanged from before prompts existed', () => {
      expect(scoreHash('posting-hash', ['Rust', '5+ years'], all, null)).toBe(sha('posting-hash\nRust\n5+ years'));
    });

    it('scoreHash changes with a prompt, also when nothing is disabled', () => {
      const withPrompt = scoreHash('posting-hash', all, all, 'Shipped Rust in production.');
      expect(withPrompt).not.toBe('posting-hash');
      expect(scoreHash('posting-hash', all, all, 'Shipped Rust in production.')).toBe(withPrompt);
      expect(scoreHash('posting-hash', all, all, 'Knows Go.')).not.toBe(withPrompt);
      const disabledOnly = scoreHash('posting-hash', ['Rust'], all);
      expect(scoreHash('posting-hash', ['Rust'], all, 'Shipped Rust in production.')).not.toBe(disabledOnly);
      expect(scoreHash('posting-hash', ['Rust'], all, 'Shipped Rust in production.')).not.toBe(withPrompt);
    });

    it('leadPromptLine quotes the prompt on one line, and is empty without one', () => {
      expect(leadPromptLine('  Shipped "Rust"\n\nin   production. ')).toBe(
        'The hiring lead adds: "Shipped \\"Rust\\" in production."'
      );
      expect(leadPromptLine(null)).toBe('');
      expect(leadPromptLine('  \n ')).toBe('');
    });

    it('jevQuestions adds the prompt line to its own role only', () => {
      const questions = jevQuestions(
        [job, { ...job, uid: 'role-2', roleTitle: 'Designer' }],
        new Map([[job.uid, ['Go']]]),
        new Map([[job.uid, 'Shipped Rust in production.']])
      );
      expect(questions['role-1'].instructions).toContain('The hiring lead adds: "Shipped Rust in production."');
      expect(questions['role-2'].instructions).not.toContain('The hiring lead adds');
    });

    it('blurbPrompt adds the prompt line, and omits it without one', () => {
      const ranked: { member: MatchMember; fit: number }[] = [];
      expect(blurbPrompt(job, ['Go'], ranked, 'Shipped Rust in production.')).toContain(
        'The hiring lead adds: "Shipped Rust in production."'
      );
      expect(blurbPrompt(job, ['Go'], ranked)).not.toContain('The hiring lead adds');
    });
  });

  it('flaggedCriteria marks disabled texts in extraction order', () => {
    expect(flaggedCriteria(asCriteria(all), ['Remote EU'])).toEqual([
      { text: 'Rust', enabled: true },
      { text: '5+ years', enabled: true },
      { text: 'Remote EU', enabled: false },
    ]);
  });

  it('flaggedCriteria carries label and group, and omits the keys when unknown (LAB-2854)', () => {
    const flagged = flaggedCriteria(
      [
        { statement: 'Has shipped Rust in production', label: 'Rust in production', group: 'Skills' },
        { statement: 'Based in the EU' },
      ],
      ['Based in the EU']
    );
    expect(flagged).toEqual([
      { text: 'Has shipped Rust in production', enabled: true, label: 'Rust in production', group: 'Skills' },
      { text: 'Based in the EU', enabled: false },
    ]);
    expect(Object.keys(flagged[1])).toEqual(['text', 'enabled']);
  });
});

describe('structured criteria (LAB-2854)', () => {
  const structured = [
    { statement: 'Has shipped Rust in production', label: 'Rust in production', group: 'Skills' },
    { statement: '5+ years building backends', label: '5+ years backend', group: 'Experience' },
    { statement: 'Senior or staff level', label: 'Senior+', group: 'Seniority' },
    { statement: 'Based in the EU', label: 'EU-based', group: 'Location' },
  ];

  it('the extraction prompt asks for statement, label and group, naming every group', () => {
    const prompt = criteriaPrompt('Title: Backend Engineer');
    expect(prompt).toContain('statement, label, and group');
    expect(prompt).toContain('at most 40 characters');
    expect(prompt).toContain('Skills, Experience, Seniority, Location, Other');
    expect(prompt).toContain('Title: Backend Engineer');
  });

  it('parseCriteria reads structured items', () => {
    expect(parseCriteria(`Here you go: ${JSON.stringify(structured)}`)).toEqual(structured);
  });

  it('parseCriteria normalises: unknown group to Other, label trimmed and cut, empty and repeated statements dropped', () => {
    const long = 'A label that is far too long to fit in forty characters';
    const parsed = parseCriteria(
      JSON.stringify([
        { statement: '  Rust  ', label: '  Rust   lang ', group: 'skills' },
        { statement: 'Go', label: long, group: 'Languages' },
        { statement: '   ', label: 'Blank', group: 'Skills' },
        { statement: 'Rust', label: 'Again', group: 'Skills' },
        { statement: 'Senior', label: '', group: 'Seniority' },
        { statement: 'Remote', group: null },
        'Postgres',
      ])
    );
    expect(parsed).toEqual([
      { statement: 'Rust', label: 'Rust lang', group: 'Skills' },
      { statement: 'Go', label: `${long.slice(0, 39).trimEnd()}…`, group: 'Other' },
      { statement: 'Senior', group: 'Seniority' },
      { statement: 'Remote', group: 'Other' },
      { statement: 'Postgres', group: 'Other' },
    ]);
    expect(parsed[1].label?.length).toBeLessThanOrEqual(40);
  });

  it('parseCriteria keeps at most 6 and rejects fewer than 4 after dropping empties', () => {
    const many = Array.from({ length: 8 }, (_, index) => ({
      statement: `C${index}`,
      label: `L${index}`,
      group: 'Skills',
    }));
    expect(parseCriteria(JSON.stringify(many))).toHaveLength(6);
    expect(() =>
      parseCriteria(JSON.stringify([{ statement: 'A' }, { statement: 'B' }, { statement: ' ' }, { statement: 'A' }]))
    ).toThrow(/at least 4/);
    expect(() => parseCriteria('no array here')).toThrow(/not a JSON array/);
  });

  it('normalizeCriterionGroup and normalizeCriterionLabel', () => {
    expect(normalizeCriterionGroup('LOCATION')).toBe('Location');
    expect(normalizeCriterionGroup('Culture')).toBe('Other');
    expect(normalizeCriterionGroup(undefined)).toBe('Other');
    expect(normalizeCriterionLabel(' x '.repeat(30))?.length).toBeLessThanOrEqual(40);
    expect(normalizeCriterionLabel('   ')).toBeUndefined();
    expect(normalizeCriterionLabel(42)).toBeUndefined();
  });

  it('asCriteria reads a legacy string[] payload as unlabelled statements', () => {
    expect(asCriteria([' Rust ', '', '5+ years'])).toEqual([{ statement: 'Rust' }, { statement: '5+ years' }]);
    expect(isLegacyCriteriaPayload(['Rust', '5+ years'])).toBe(true);
  });

  it('asCriteria reads the structured payload, keeping only a valid label and group', () => {
    expect(asCriteria(structured)).toEqual(structured);
    expect(isLegacyCriteriaPayload(structured)).toBe(false);
    expect(
      asCriteria([
        { statement: 'A', label: 'x'.repeat(41), group: 'Skills' },
        { statement: 'B', label: 'Bee', group: 'Hobbies' },
        { statement: 'C', label: null, group: null },
        { statement: '  ', label: 'Gone' },
        { label: 'No statement' },
      ])
    ).toEqual([{ statement: 'A', group: 'Skills' }, { statement: 'B', label: 'Bee' }, { statement: 'C' }]);
  });

  it('asCriteria tolerates a missing or non-array payload', () => {
    expect(asCriteria(null)).toEqual([]);
    expect(asCriteria(undefined)).toEqual([]);
    expect(asCriteria({ statement: 'A' })).toEqual([]);
    expect(isLegacyCriteriaPayload(null)).toBe(false);
  });

  it('a legacy list and its labelled successor give the same statements, so the same score hash', () => {
    const legacy = structured.map((item) => item.statement);
    const fromLegacy = criterionStatements(asCriteria(legacy));
    const fromLabelled = criterionStatements(asCriteria(structured));
    expect(fromLabelled).toEqual(fromLegacy);
    const enabled = fromLegacy.slice(0, 3);
    expect(scoreHash('posting-hash', enabled, fromLabelled)).toBe(scoreHash('posting-hash', enabled, fromLegacy));
  });

  describe('legacy labelling', () => {
    const statements = structured.map((item) => item.statement);

    it('the label prompt lists every statement verbatim and asks for them unchanged', () => {
      const prompt = criteriaLabelPrompt('Backend Engineer', statements);
      for (const statement of statements) expect(prompt).toContain(JSON.stringify(statement));
      expect(prompt).toContain('character for character');
      expect(prompt).toContain('Skills, Experience, Seniority, Location, Other');
    });

    it('applies labels and groups to the exact statements, in the given order', () => {
      const answer = JSON.stringify([...structured].reverse());
      expect(parseCriteriaLabels(answer, statements)).toEqual(structured);
    });

    it('normalises the answer: unknown group to Other, long label cut', () => {
      const answer = JSON.stringify(
        statements.map((statement, index) => ({ statement, label: index ? 'ok' : 'y'.repeat(60), group: 'Misc' }))
      );
      const labelled = parseCriteriaLabels(answer, statements);
      expect(labelled?.map((item) => item.group)).toEqual(['Other', 'Other', 'Other', 'Other']);
      expect(labelled?.[0].label?.length).toBe(40);
    });

    it('returns null when a statement comes back changed', () => {
      const reworded = structured.map((item, index) =>
        index === 2 ? { ...item, statement: 'Senior or Staff level' } : item
      );
      expect(parseCriteriaLabels(JSON.stringify(reworded), statements)).toBeNull();
      const trimmedDifferently = structured.map((item, index) =>
        index === 0 ? { ...item, statement: ` ${item.statement}` } : item
      );
      expect(parseCriteriaLabels(JSON.stringify(trimmedDifferently), statements)).toBeNull();
    });

    it('returns null when a statement is dropped, added or repeated, or the answer is not an array', () => {
      expect(parseCriteriaLabels(JSON.stringify(structured.slice(0, 3)), statements)).toBeNull();
      expect(parseCriteriaLabels(JSON.stringify([...structured, { statement: 'Extra' }]), statements)).toBeNull();
      expect(
        parseCriteriaLabels(JSON.stringify([structured[0], structured[0], structured[1], structured[2]]), statements)
      ).toBeNull();
      expect(parseCriteriaLabels('sorry, no', statements)).toBeNull();
      expect(parseCriteriaLabels(JSON.stringify(statements), statements)).toBeNull();
    });
  });

  it('withCriterionMeta joins stored suggestion criteria to the current criteria by statement', () => {
    const marked = [
      { text: 'Has shipped Rust in production', matched: true },
      { text: 'A criterion from an older posting', matched: false },
    ];
    const joined = withCriterionMeta(marked, [...asCriteria(structured), { statement: 'Unlabelled' }]);
    expect(joined).toEqual([
      { text: 'Has shipped Rust in production', matched: true, label: 'Rust in production', group: 'Skills' },
      { text: 'A criterion from an older posting', matched: false },
    ]);
    expect(Object.keys(joined[1])).toEqual(['text', 'matched']);
  });
});

describe('pickSuggestedEmail (LAB-2837 feedback)', () => {
  const listed = ['a', 'b', 'c', 'd'].map((memberUid, index) => ({ memberUid, rank: index + 1 }));
  const none = new Set<string>();
  const uids = (items: { memberUid: string }[]) => items.map((item) => item.memberUid);
  const pick = (
    history: { kind: 'first' | 'new' | 'reminder'; memberUids: string[] }[],
    extra: { notLooking?: Set<string>; contacted?: Set<string>; list?: typeof listed } = {}
  ) =>
    pickSuggestedEmail({
      listed: extra.list ?? listed,
      notLooking: extra.notLooking ?? none,
      history,
      contacted: extra.contacted ?? none,
    });

  it('first: everyone listed, in rank order, when the lead was never emailed about the role', () => {
    const result = pick([]);
    expect(result?.kind).toBe('first');
    expect(uids(result!.candidates)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('never names or counts a "Not looking" member, and sends nothing when nobody else is listed', () => {
    expect(uids(pick([], { notLooking: new Set(['b']) })!.candidates)).toEqual(['a', 'c', 'd']);
    const result = pick([{ kind: 'first', memberUids: ['a'] }], { notLooking: new Set(['c']) });
    expect(result).toEqual({ kind: 'new', candidates: [listed[1], listed[3]], alreadySeenCount: 1 });
    expect(pick([], { notLooking: new Set(['a', 'b', 'c', 'd']) })).toBeNull();
  });

  it('new: only the people never named in any earlier email, plus how many seen ones are listed', () => {
    const result = pick([
      { kind: 'new', memberUids: ['c'] },
      { kind: 'first', memberUids: ['a', 'z'] },
    ]);
    expect(result?.kind).toBe('new');
    expect(uids(result!.candidates)).toEqual(['b', 'd']);
    expect(result).toMatchObject({ alreadySeenCount: 2 });
  });

  it('new: someone named weeks ago who drops out and comes back is not new again', () => {
    // b was in the first email, dropped out the week c and d were new, and is listed again now.
    const result = pick([
      { kind: 'new', memberUids: ['c', 'd'] },
      { kind: 'first', memberUids: ['a', 'b'] },
    ]);
    expect(result?.kind).toBe('reminder');
    expect(uids(result!.candidates)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('new: counts contacted people among the already seen — they are still on the page', () => {
    const result = pick([{ kind: 'first', memberUids: ['a', 'b'] }], { contacted: new Set(['a']) });
    expect(result).toMatchObject({ kind: 'new', alreadySeenCount: 2 });
    expect(uids(result!.candidates)).toEqual(['c', 'd']);
  });

  it('reminder: nobody new, after a first or new email, naming who is listed and not contacted', () => {
    for (const kind of ['first', 'new'] as const) {
      const result = pick([{ kind, memberUids: ['a', 'b', 'c', 'd'] }], { contacted: new Set(['b']) });
      expect(result?.kind).toBe('reminder');
      expect(uids(result!.candidates)).toEqual(['a', 'c', 'd']);
    }
  });

  it('reminder: once — nothing after a reminder until someone new appears', () => {
    const all = ['a', 'b', 'c', 'd'];
    expect(
      pick([
        { kind: 'reminder', memberUids: all },
        { kind: 'first', memberUids: all },
      ])
    ).toBeNull();
    const back = pick(
      [
        { kind: 'reminder', memberUids: all },
        { kind: 'first', memberUids: all },
      ],
      { list: [...listed, { memberUid: 'e', rank: 5 }] }
    );
    expect(back?.kind).toBe('new');
    expect(uids(back!.candidates)).toEqual(['e']);
  });

  it('reminder: nothing when everyone listed has been contacted', () => {
    expect(
      pick([{ kind: 'first', memberUids: ['a', 'b', 'c', 'd'] }], { contacted: new Set(['a', 'b', 'c', 'd']) })
    ).toBeNull();
  });

  it('reads only the newest email for the reminder rule, whatever came before', () => {
    const result = pick([
      { kind: 'new', memberUids: ['d'] },
      { kind: 'reminder', memberUids: ['a'] },
      { kind: 'first', memberUids: ['a', 'b', 'c'] },
    ]);
    expect(result?.kind).toBe('reminder');
  });
});

describe('parseEmailTeamAllowlist (LAB-2850)', () => {
  it('is empty when unset or blank', () => {
    expect(parseEmailTeamAllowlist(undefined).size).toBe(0);
    expect(parseEmailTeamAllowlist('').size).toBe(0);
    expect(parseEmailTeamAllowlist(' , ,').size).toBe(0);
  });

  it('trims and dedupes', () => {
    expect([...parseEmailTeamAllowlist(' team-1 ,team-2,, team-1 ')]).toEqual(['team-1', 'team-2']);
  });
});

describe('isEmailDryRun (LAB-2850)', () => {
  it('is on only for the exact string true', () => {
    expect(isEmailDryRun('true')).toBe(true);
    expect(isEmailDryRun(undefined)).toBe(false);
    expect(isEmailDryRun('')).toBe(false);
    expect(isEmailDryRun('TRUE')).toBe(false);
    expect(isEmailDryRun('1')).toBe(false);
    expect(isEmailDryRun('false')).toBe(false);
  });
});
