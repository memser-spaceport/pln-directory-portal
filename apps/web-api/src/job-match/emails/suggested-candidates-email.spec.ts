import { renderSuggestedCandidatesEmail, type SuggestedCandidatesEmailInput } from './suggested-candidates-email';

type Candidate = SuggestedCandidatesEmailInput['candidates'][number];

const BASE = 'https://directory.example';
const UTM = (content: string) =>
  `utm_source=job_suggested_candidates_email&utm_medium=email&utm_content=${content}&job_uid=role-1`;
/** An href as it appears in the html: `&` is escaped inside the attribute. */
const attr = (url: string) => `href="${url.replace(/&/g, '&amp;')}"`;

const candidate = (overrides: Partial<Candidate> = {}): Candidate => ({
  memberUid: 'm1',
  name: 'Grace Hopper',
  role: 'Engineer at Navy',
  imageUrl: 'https://img.example/grace.png',
  label: 'Strong match',
  blurb: 'Compilers and COBOL.',
  ...overrides,
});

const baseInput = (overrides: Partial<SuggestedCandidatesEmailInput> = {}): SuggestedCandidatesEmailInput => ({
  leadName: 'Ada Lovelace',
  teamUid: 'team-1',
  teamName: 'Analytical Engines',
  roleUid: 'role-1',
  roleTitle: 'Rust Engineer',
  candidates: [
    candidate(),
    candidate({ memberUid: 'm2', name: 'Linus Torvalds', label: 'Good match' }),
    candidate({ memberUid: 'm3', name: 'Barbara Liskov' }),
  ],
  totalMatchCount: 12,
  preferencesUrl: `${BASE}/settings/email`,
  unsubscribeUrl: `${BASE}/settings/email/unsubscribed?token=v1.a.b`,
  ...overrides,
});

/** Visible text of the html, tags and the hidden preheader removed, entities left as-is. */
const visibleText = (html: string) =>
  html
    .replace(/<div style="display: none;[^"]*">[\s\S]*?<\/div>/, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ');

describe('renderSuggestedCandidatesEmail', () => {
  const env = process.env.WEB_UI_BASE_URL;
  beforeEach(() => {
    process.env.WEB_UI_BASE_URL = `${BASE}/`;
  });
  afterEach(() => {
    process.env.WEB_UI_BASE_URL = env;
  });

  describe('scenario: 3 new suggested candidates and 12 total matches', () => {
    it('shows 3 cards, each with a View profile button, and "All 12 matches for this role"', () => {
      const { html, text } = renderSuggestedCandidatesEmail(baseInput());
      expect(html.match(/>View profile<\/a>/g)).toHaveLength(3);
      expect(html).toContain('>All 12 matches for this role</a>');
      expect(text).toContain('All 12 matches for this role');
      expect(html).toContain('>Edit criteria</a>');
    });

    it('names the candidates in rank order with their band, role and reason', () => {
      const { html, text } = renderSuggestedCandidatesEmail(baseInput());
      for (const body of [html, text]) {
        expect(body.indexOf('Grace Hopper')).toBeLessThan(body.indexOf('Linus Torvalds'));
        expect(body.indexOf('Linus Torvalds')).toBeLessThan(body.indexOf('Barbara Liskov'));
        expect(body).toContain('Strong match');
        expect(body).toContain('Good match');
        expect(body).toContain('Engineer at Navy');
        expect(body).toContain('Compilers and COBOL.');
      }
      expect(html).toContain('src="https://img.example/grace.png"');
    });

    it('states the count and role in the subject, and greets the lead with the team', () => {
      const { subject, html, text } = renderSuggestedCandidatesEmail(baseInput());
      expect(subject).toBe('3 new suggested candidates for Rust Engineer');
      expect(text).toContain('Hi Ada Lovelace,');
      expect(text).toContain('Analytical Engines');
      expect(visibleText(html)).toContain('Hi Ada Lovelace, these members of the Protocol Labs network match your');
    });
  });

  describe('links', () => {
    it("opens each card on that person on the role's Candidates page, tagged utm_content=profile", () => {
      const { html, text } = renderSuggestedCandidatesEmail(baseInput());
      for (const uid of ['m1', 'm2', 'm3']) {
        const url = `${BASE}/teams/team-1/applicants?role=role-1&suggested=${uid}&${UTM('profile')}`;
        expect(html).toContain(attr(url));
        expect(text).toContain(`View profile: ${url}`);
      }
    });

    it('opens the whole role list for "All N matches" (all) and Edit criteria (criteria)', () => {
      const { html, text } = renderSuggestedCandidatesEmail(baseInput());
      const all = `${BASE}/teams/team-1/applicants?role=role-1&${UTM('all')}`;
      const criteria = `${BASE}/teams/team-1/applicants?role=role-1&${UTM('criteria')}`;
      expect(html).toContain(`${attr(all)} style="color: #156FF7; text-decoration: underline;">All 12 matches`);
      expect(html).toContain(`${attr(criteria)} style="color: #156FF7; text-decoration: underline;">Edit criteria`);
      expect(text).toContain(`All 12 matches for this role: ${all}`);
      expect(text).toContain(`Edit criteria: ${criteria}`);
    });

    it('encodes uids that would break the path or the query', () => {
      const { text } = renderSuggestedCandidatesEmail(
        baseInput({ teamUid: 'team/1', candidates: [candidate({ memberUid: 'm&1' })] })
      );
      expect(text).toContain(`${BASE}/teams/team%2F1/applicants?role=role-1&suggested=m%261&`);
    });

    it('carries the preferences and unsubscribe URLs from the input, untouched, in the footer', () => {
      const { html, text } = renderSuggestedCandidatesEmail(baseInput());
      expect(html).toContain(`href="${BASE}/settings/email"`);
      expect(html).toContain('>Email preferences</a>');
      expect(html).toContain(`href="${BASE}/settings/email/unsubscribed?token=v1.a.b"`);
      expect(html).toContain('>Unsubscribe</a>');
      expect(text).toContain(`Email preferences: ${BASE}/settings/email\n`);
      expect(text).toContain(`Unsubscribe: ${BASE}/settings/email/unsubscribed?token=v1.a.b`);
    });

    it('uses absolute URLs only: no relative href or src', () => {
      const { html } = renderSuggestedCandidatesEmail(baseInput());
      const refs = [...html.matchAll(/(?:href|src)="([^"]*)"/g)].map((m) => m[1]);
      expect(refs.length).toBeGreaterThan(0);
      for (const ref of refs) expect(ref).toMatch(/^https:\/\//);
    });
  });

  describe('pluralisation', () => {
    it('reads "All 1 match for this role" and a singular subject for one candidate and one match', () => {
      const { subject, html, text } = renderSuggestedCandidatesEmail(
        baseInput({ candidates: [candidate()], totalMatchCount: 1 })
      );
      expect(subject).toBe('1 new suggested candidate for Rust Engineer');
      expect(html).toContain('>All 1 match for this role</a>');
      expect(text).toContain('All 1 match for this role');
      expect(visibleText(html)).toContain('this member of the Protocol Labs network matches your');
      expect(visibleText(html)).toContain("hasn't applied yet");
    });

    it('reads "N matches" for more than one', () => {
      const { html } = renderSuggestedCandidatesEmail(baseInput({ candidates: [candidate()], totalMatchCount: 2 }));
      expect(html).toContain('>All 2 matches for this role</a>');
    });

    it('never states fewer total matches than the new candidates it shows', () => {
      const { html } = renderSuggestedCandidatesEmail(baseInput({ totalMatchCount: 0 }));
      expect(html).toContain('>All 3 matches for this role</a>');
    });
  });

  describe('missing optional fields', () => {
    const bare = candidate({ role: null, imageUrl: null, blurb: null, name: 'Linus Torvalds' });

    it('scenario: a candidate with no reason shows name and band with no empty line, and no "undefined"/"null"', () => {
      const { html, text } = renderSuggestedCandidatesEmail(baseInput({ candidates: [bare] }));
      for (const body of [html, text]) {
        expect(body).not.toMatch(/undefined|null/);
      }
      expect(html).toContain('Linus Torvalds');
      expect(html).not.toMatch(/<p[^>]*>\s*<\/p>/);
      expect(text).toContain('Linus Torvalds · Strong match\nView profile: ');
    });

    it('draws an initials disc in place of a missing photo', () => {
      const { html } = renderSuggestedCandidatesEmail(baseInput({ candidates: [bare] }));
      expect(html).not.toContain('src="https://img.example');
      expect(html).toMatch(/>LT<\/td>/);
    });

    it('treats a blank role or reason like a missing one', () => {
      const { html, text } = renderSuggestedCandidatesEmail(
        baseInput({ candidates: [candidate({ role: '  ', blurb: '' })] })
      );
      expect(html).not.toMatch(/<p[^>]*>\s*<\/p>/);
      expect(text).toContain('Grace Hopper · Strong match\nView profile: ');
    });
  });

  describe('escaping', () => {
    const hostile = baseInput({
      leadName: '<b>Ada</b>',
      teamName: "Ada's <Team>",
      roleTitle: 'Rust & "Go" Engineer',
      candidates: [
        candidate({
          name: 'Grace <script>alert(1)</script>',
          role: '<i>CTO</i>',
          imageUrl: 'https://img.example/a.png?x=1&y="2"',
          blurb: 'Ships <i>fast</i> & safe',
        }),
      ],
      unsubscribeUrl: `${BASE}/settings/email/unsubscribed?token=v1.a.b&x=<y>`,
    });

    it('shows HTML special characters in every field as text', () => {
      const { html } = renderSuggestedCandidatesEmail(hostile);
      for (const raw of ['<b>Ada</b>', '<script>', '<Team>', '<i>', 'x=<y>', 'y="2"']) {
        expect(html).not.toContain(raw);
      }
      expect(html).toContain('&lt;b&gt;Ada&lt;/b&gt;');
      expect(html).toContain('Rust &amp; &quot;Go&quot; Engineer');
      expect(html).toContain('Ada&#39;s &lt;Team&gt;');
      expect(html).toContain('Grace &lt;script&gt;alert(1)&lt;/script&gt;');
      expect(html).toContain('Ships &lt;i&gt;fast&lt;/i&gt; &amp; safe');
      expect(html).toContain('src="https://img.example/a.png?x=1&amp;y=&quot;2&quot;"');
    });

    it('keeps the subject and text part as plain text, one line per field', () => {
      const { subject, text } = renderSuggestedCandidatesEmail(
        baseInput({ roleTitle: 'Rust &\nGo', candidates: [candidate({ name: 'Grace\nHopper' })] })
      );
      expect(subject).toBe('1 new suggested candidate for Rust & Go');
      expect(text).toContain('Grace Hopper · Strong match');
    });
  });

  it('never mentions job-search status', () => {
    const { html, text } = renderSuggestedCandidatesEmail(baseInput());
    expect(`${html}\n${text}`).not.toMatch(/looking|job[- ]search/i);
  });

  describe('refuses to build an email with a broken link', () => {
    it('scenario: throws on no candidates', () => {
      expect(() => renderSuggestedCandidatesEmail(baseInput({ candidates: [] }))).toThrow(
        'renderSuggestedCandidatesEmail: at least one candidate is required'
      );
    });

    it.each(['teamUid', 'roleUid'] as const)('throws on a missing or blank %s', (field) => {
      for (const value of ['', '  ', undefined]) {
        expect(() => renderSuggestedCandidatesEmail(baseInput({ [field]: value as unknown as string }))).toThrow(
          `renderSuggestedCandidatesEmail: ${field} is required`
        );
      }
    });

    it('throws on a candidate without a memberUid', () => {
      expect(() => renderSuggestedCandidatesEmail(baseInput({ candidates: [candidate({ memberUid: '' })] }))).toThrow(
        'renderSuggestedCandidatesEmail: candidates[0].memberUid is required'
      );
    });
  });

  it('draws at most five cards', () => {
    const many = Array.from({ length: 7 }, (_, i) => candidate({ memberUid: `m${i}`, name: `Person ${i}` }));
    const { html } = renderSuggestedCandidatesEmail(baseInput({ candidates: many, totalMatchCount: 20 }));
    expect(html.match(/>View profile<\/a>/g)).toHaveLength(5);
    expect(html).not.toContain('Person 5');
  });

  it('is an email-safe document: table layout, inline styles, no stylesheet', () => {
    const { html } = renderSuggestedCandidatesEmail(baseInput());
    expect(html.startsWith('<!DOCTYPE html>')).toBe(true);
    expect(html).toContain('<table role="presentation"');
    expect(html).not.toMatch(/<style|<link|class="/);
  });
});
