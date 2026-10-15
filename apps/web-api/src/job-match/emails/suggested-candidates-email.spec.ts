import { renderSuggestedCandidatesEmail, type SuggestedCandidatesEmailInput } from './suggested-candidates-email';

type Candidate = SuggestedCandidatesEmailInput['candidates'][number];

const BASE = 'https://directory.example';
const UTM = (content: string) =>
  `utm_source=job_suggested_candidates_email&utm_medium=email&utm_content=${content}&job_uid=role-1`;
/** An href as it appears in the html: `&` is escaped inside the attribute. */
const attr = (url: string) => `href="${url.replace(/&/g, '&amp;')}"`;

const CRITERIA: Candidate['criteria'] = [
  { label: 'Distributed systems', statement: 'Runs a retrieval path at scale', matched: true },
  { label: 'Protocol experience', statement: 'Contributed to IPFS', matched: false },
  { label: 'Rust or Go', statement: 'Rust and Go on the profile', matched: true },
];

const candidate = (overrides: Partial<Candidate> = {}): Candidate => ({
  memberUid: 'm1',
  name: 'Grace Hopper',
  role: 'Engineer at Navy',
  imageUrl: 'https://img.example/grace.png',
  label: 'Strong match',
  blurb: 'Compilers and COBOL.',
  location: 'Boston, United States',
  criteria: CRITERIA,
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

/** Visible text of the html, head, tags and the hidden preheader removed, entities left as-is. */
const visibleText = (html: string) =>
  html
    .replace(/<head>[\s\S]*?<\/head>/, '')
    .replace(/<div style="display: none;[^"]*">[\s\S]*?<\/div>/, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ');

/** The html of one card: from the candidate's name to its View profile link. */
const cardOf = (html: string, name: string) => {
  const at = html.indexOf(`>${name}</td>`);
  if (at < 0) throw new Error(`no card for ${name}`);
  const start = html.lastIndexOf('<td', at);
  return html.slice(start, html.indexOf('>View profile</a>', start));
};

/** The criterion lines of a card, in order, as "label|statement|met" (statement '' when absent). */
const criteriaOf = (cardHtml: string) =>
  [
    ...cardHtml.matchAll(
      /<p style="margin: 0; [^"]*color: (#[0-9a-f]{6});">([^<]*)<\/p>(?:<p style="margin: 0; [^"]*">([^<]*)<\/p>)?<\/td>/g
    ),
  ].map(
    ([, color, title, statement]) =>
      `${title}|${statement ?? ''}|${color === '#0a0c11' ? 'met' : color === '#a0a7b4' ? 'unmet' : color}`
  );

describe('renderSuggestedCandidatesEmail', () => {
  const env = process.env.WEB_UI_BASE_URL;
  beforeEach(() => {
    process.env.WEB_UI_BASE_URL = `${BASE}/`;
  });
  afterEach(() => {
    process.env.WEB_UI_BASE_URL = env;
  });

  describe('scenario: 3 new suggested candidates and 12 total matches', () => {
    it('shows 3 cards, each with a View profile link, then the "All 12 matches for this role" button', () => {
      const { html, text } = renderSuggestedCandidatesEmail(baseInput());
      expect(html.match(/>View profile<\/a>/g)).toHaveLength(3);
      expect(html).toContain('>All 12 matches for this role</a>');
      expect(text).toContain('All 12 matches for this role');
      expect(html).toContain('>Edit criteria</a>');
    });

    it('titles each card with the candidate name, in rank order, with the band and the role below the name', () => {
      const { html, text } = renderSuggestedCandidatesEmail(baseInput());
      for (const body of [html, text]) {
        expect(body.indexOf('Grace Hopper')).toBeLessThan(body.indexOf('Linus Torvalds'));
        expect(body.indexOf('Linus Torvalds')).toBeLessThan(body.indexOf('Barbara Liskov'));
        expect(body).toContain('Strong match');
        expect(body).toContain('Good match');
      }
      const grace = cardOf(html, 'Grace Hopper');
      expect(grace).toMatch(/font-size: 16px; line-height: 24px; font-weight: 500;[^"]*">Grace Hopper<\/td>/);
      expect(grace).toMatch(/border-radius: 26px;[^"]*">Strong match<\/span>/);
      expect(grace).toMatch(
        /font-size: 14px; line-height: 22px; font-weight: 400; color: #667085;">Engineer at Navy<\/p>/
      );
      expect(grace.indexOf('Strong match')).toBeLessThan(grace.indexOf('Engineer at Navy'));
      expect(text).toContain('Grace Hopper · Strong match\nEngineer at Navy\n');
    });

    it('paints the bands: the Strong gradient and the Good gradient, each over a flat fill', () => {
      const { html } = renderSuggestedCandidatesEmail(baseInput());
      expect(cardOf(html, 'Grace Hopper')).toContain(
        'background-color: #2b76b9; background-image: linear-gradient(-26deg, rgb(61, 51, 147) 8.3%'
      );
      expect(cardOf(html, 'Linus Torvalds')).toContain(
        'background-color: #71c4b0; background-image: linear-gradient(90deg, #70b2bc, #71dda6);'
      );
    });

    it('greets the lead by first name and states how many members match the role at the team', () => {
      const { subject, html, text } = renderSuggestedCandidatesEmail(baseInput());
      expect(subject).toBe('3 new suggested candidates for Rust Engineer');
      const sentence =
        '3 members of the Protocol Labs network match your Rust Engineer role at Analytical Engines. They have not applied yet.';
      expect(visibleText(html)).toContain(`Hi Ada, ${sentence}`);
      expect(text).toContain(`Hi Ada,\n\n${sentence}`);
      expect(visibleText(html)).not.toContain('Lovelace');
    });

    it('drops the old heading, blurb and "at most one a week" lines', () => {
      const { html, text } = renderSuggestedCandidatesEmail(baseInput());
      expect(html).not.toContain('<h1');
      expect(visibleText(html)).not.toContain('3 new suggested candidates');
      for (const body of [html, text]) {
        expect(body).not.toContain('Compilers and COBOL.');
        expect(body).not.toContain('At most one a week');
      }
    });
  });

  describe('headline', () => {
    it('reads singular for one card: "1 member ... matches your ..."', () => {
      const { html } = renderSuggestedCandidatesEmail(baseInput({ candidates: [candidate()], totalMatchCount: 1 }));
      expect(visibleText(html)).toContain(
        '1 member of the Protocol Labs network matches your Rust Engineer role at Analytical Engines. They have not applied yet.'
      );
    });

    it('counts the cards shown, not the new candidates beyond the cap', () => {
      const many = Array.from({ length: 7 }, (_, i) => candidate({ memberUid: `m${i}`, name: `Person ${i}` }));
      const { subject, html } = renderSuggestedCandidatesEmail(baseInput({ candidates: many, totalMatchCount: 20 }));
      expect(subject).toBe('7 new suggested candidates for Rust Engineer');
      expect(visibleText(html)).toContain('5 members of the Protocol Labs network match your');
    });

    it('says "Hi," when the lead has no name', () => {
      const { html, text } = renderSuggestedCandidatesEmail(baseInput({ leadName: '  ' }));
      expect(visibleText(html)).toContain(' Hi, 3 members');
      expect(text.startsWith('Hi,\n')).toBe(true);
    });
  });

  describe('requirements and location', () => {
    it('counts met criteria of all criteria, and shows the location after a map pin', () => {
      const { html, text } = renderSuggestedCandidatesEmail(baseInput());
      const grace = cardOf(html, 'Grace Hopper');
      expect(grace).toContain('>2 of 3 requirements</td>');
      expect(grace).toContain(`src="${BASE}/images/email/email-icon-map-pin@2x.png" width="14" height="14"`);
      expect(grace).toMatch(/color: #455468;">Boston, United States<\/td>/);
      expect(grace.indexOf('2 of 3 requirements')).toBeLessThan(grace.indexOf('Boston'));
      expect(text).toContain('2 of 3 requirements · Boston, United States');
    });

    it('omits the pin and the location when the location is null or blank', () => {
      for (const location of [null, '  ']) {
        const { html, text } = renderSuggestedCandidatesEmail(baseInput({ candidates: [candidate({ location })] }));
        expect(html).not.toContain('email-icon-map-pin');
        expect(cardOf(html, 'Grace Hopper')).toContain('>2 of 3 requirements</td>');
        expect(text).toContain('2 of 3 requirements\n');
      }
    });

    it('shows the location alone, with no requirements text, when there are no criteria', () => {
      const { html, text } = renderSuggestedCandidatesEmail(baseInput({ candidates: [candidate({ criteria: [] })] }));
      expect(html).not.toContain('requirements');
      expect(html).toContain('email-icon-map-pin');
      expect(text).toContain('Engineer at Navy\nBoston, United States\nView profile: ');
    });
  });

  describe('"Why we suggested"', () => {
    it('lists met criteria first, in their order, then unmet ones, each with a check icon', () => {
      const { html, text } = renderSuggestedCandidatesEmail(baseInput({ candidates: [candidate()] }));
      const grace = cardOf(html, 'Grace Hopper');
      expect(grace).toContain('>Why we suggested</p>');
      expect(criteriaOf(grace)).toEqual([
        'Distributed systems|Runs a retrieval path at scale|met',
        'Rust or Go|Rust and Go on the profile|met',
        'Protocol experience|Contributed to IPFS|unmet',
      ]);
      expect(grace.match(/email-icon-check@2x\.png/g)).toHaveLength(3);
      expect(text).toContain(
        'Why we suggested:\n✓ Distributed systems: Runs a retrieval path at scale\n✓ Rust or Go: Rust and Go on the profile\n– Protocol experience: Contributed to IPFS (not met)\n'
      );
    });

    it('fades unmet criteria: lighter text colours (Outlook-safe) and a 40% icon', () => {
      const { html } = renderSuggestedCandidatesEmail(baseInput({ candidates: [candidate()] }));
      const grace = cardOf(html, 'Grace Hopper');
      expect(grace).toMatch(
        /color: #a0a7b4;">Protocol experience<\/p><p style="[^"]*color: #b4bac6;">Contributed to IPFS/
      );
      expect(grace).toMatch(
        /color: #0a0c11;">Distributed systems<\/p><p style="[^"]*color: #455468;">Runs a retrieval/
      );
      expect(grace.match(/opacity: 0\.4;/g)).toHaveLength(1);
    });

    it('lists at most three criteria, keeping every met one ahead of the unmet', () => {
      const criteria = [
        { label: 'U1', statement: 'unmet one', matched: false },
        { label: 'M1', statement: 'met one', matched: true },
        { label: 'U2', statement: 'unmet two', matched: false },
        { label: 'M2', statement: 'met two', matched: true },
        { label: 'M3', statement: 'met three', matched: true },
        { label: 'M4', statement: 'met four', matched: true },
      ];
      const { html } = renderSuggestedCandidatesEmail(baseInput({ candidates: [candidate({ criteria })] }));
      const grace = cardOf(html, 'Grace Hopper');
      expect(criteriaOf(grace)).toEqual(['M1|met one|met', 'M2|met two|met', 'M3|met three|met']);
      expect(grace).toContain('>4 of 6 requirements</td>');
    });

    it('shows the statement as the main line, with no grey line, when a criterion has no label', () => {
      const criteria = [
        { statement: 'Ships compilers', matched: true },
        { label: '  ', statement: 'Writes COBOL', matched: false },
      ];
      const { html, text } = renderSuggestedCandidatesEmail(baseInput({ candidates: [candidate({ criteria })] }));
      expect(criteriaOf(cardOf(html, 'Grace Hopper'))).toEqual(['Ships compilers||met', 'Writes COBOL||unmet']);
      expect(text).toContain('✓ Ships compilers\n– Writes COBOL (not met)\n');
    });

    it('hides the block and the requirements text when there are no criteria', () => {
      const { html, text } = renderSuggestedCandidatesEmail(
        baseInput({ candidates: [candidate({ criteria: [], location: null })] })
      );
      expect(html).not.toContain('Why we suggested');
      expect(html).not.toContain('email-icon-check');
      expect(html).not.toContain('requirements');
      expect(text).not.toContain('Why we suggested');
      expect(text).toContain('Grace Hopper · Strong match\nEngineer at Navy\nView profile: ');
    });
  });

  describe('images', () => {
    it('loads the 193x44 logo and the 14px icons from the directory domain, not pfps.plnetwork.io', () => {
      const { html } = renderSuggestedCandidatesEmail(baseInput());
      expect(html).toContain(
        `<img src="${BASE}/images/email/email-logo-protocol-labs@2x.png" width="193" height="44" alt="Protocol Labs"`
      );
      for (const name of ['check', 'map-pin', 'arrow']) {
        expect(html).toContain(`src="${BASE}/images/email/email-icon-${name}@2x.png" width="14" height="14"`);
      }
      expect(html).not.toContain('protocol-labs-logo-246');
      expect(html).not.toContain('pfps.plnetwork.io');
      expect(html).not.toContain('.svg');
    });

    it('draws no candidate photo', () => {
      const { html } = renderSuggestedCandidatesEmail(baseInput());
      expect(html).not.toContain('img.example');
    });
  });

  describe('links', () => {
    it("opens each card on that person on the role's Candidates page, tagged utm_content=profile", () => {
      const { html, text } = renderSuggestedCandidatesEmail(baseInput());
      for (const uid of ['m1', 'm2', 'm3']) {
        const url = `${BASE}/teams/team-1/applicants?role=role-1&tab=suggested&suggested=${uid}&${UTM('profile')}`;
        expect(html).toContain(attr(url));
        expect(text).toContain(`View profile: ${url}`);
      }
    });

    it('draws View profile in blue with a bottom rule, followed by the arrow linking to the same profile', () => {
      const { html } = renderSuggestedCandidatesEmail(baseInput({ candidates: [candidate()] }));
      const url = attr(`${BASE}/teams/team-1/applicants?role=role-1&tab=suggested&suggested=m1&${UTM('profile')}`);
      expect(html).toMatch(
        new RegExp(
          `${url.replace(
            /[?.]/g,
            '\\$&'
          )} style="[^"]*font-weight: 500; color: #1b4dff; text-decoration: none; border-bottom: 1px solid #1b4dff;">View profile</a><a ${url.replace(
            /[?.]/g,
            '\\$&'
          )}[^>]*><img src="${BASE}/images/email/email-icon-arrow@2x\\.png"`
        )
      );
    });

    it('opens the Suggested tab for "All N matches" (all) and Edit criteria (criteria, with the modal open)', () => {
      const { html, text } = renderSuggestedCandidatesEmail(baseInput());
      const all = `${BASE}/teams/team-1/applicants?role=role-1&tab=suggested&${UTM('all')}`;
      const criteria = `${BASE}/teams/team-1/applicants?role=role-1&tab=suggested&edit=criteria&${UTM('criteria')}`;
      expect(html).toMatch(new RegExp(`${attr(all).replace(/[?.]/g, '\\$&')} style="[^"]*">All 12 matches`));
      expect(html).toMatch(new RegExp(`${attr(criteria).replace(/[?.]/g, '\\$&')} style="[^"]*">Edit criteria`));
      expect(text).toContain(`All 12 matches for this role: ${all}`);
      expect(text).toContain(`Edit criteria: ${criteria}`);
    });

    it('draws "All N matches" as a bulletproof blue button: the cell paints the colour too', () => {
      const { html } = renderSuggestedCandidatesEmail(baseInput());
      expect(html).toMatch(
        /<td align="center" bgcolor="#1b4dff" style="background-color: #1b4dff; border: 1px solid rgba\(14, 15, 17, 0\.12\); border-radius: 8px;">\s*<a href="[^"]*utm_content=all[^"]*" style="display: inline-block; padding: 10px 20px;[^"]*color: #ffffff;/
      );
    });

    it('encodes uids that would break the path or the query', () => {
      const { text } = renderSuggestedCandidatesEmail(
        baseInput({ teamUid: 'team/1', candidates: [candidate({ memberUid: 'm&1' })] })
      );
      expect(text).toContain(`${BASE}/teams/team%2F1/applicants?role=role-1&tab=suggested&suggested=m%261&`);
    });

    it('sends every Candidates-page link to the Suggested tab', () => {
      const { html } = renderSuggestedCandidatesEmail(baseInput());
      const pageLinks = [...html.matchAll(/href="([^"]*\/applicants\?[^"]*)"/g)].map((m) => m[1]);
      // Per card: View profile and its arrow; then All N matches and Edit criteria.
      expect(pageLinks).toHaveLength(8);
      for (const href of pageLinks) expect(href).toContain('?role=role-1&amp;tab=suggested&amp;');
    });

    it('uses absolute URLs only: no relative href or src', () => {
      const { html } = renderSuggestedCandidatesEmail(baseInput());
      const refs = [...html.matchAll(/(?:href|src)="([^"]*)"/g)].map((m) => m[1]);
      expect(refs.length).toBeGreaterThan(0);
      for (const ref of refs) expect(ref).toMatch(/^https:\/\//);
    });
  });

  describe('footer', () => {
    it('signs off from the LabOS team and gives the network reason', () => {
      const { html, text } = renderSuggestedCandidatesEmail(baseInput());
      expect(visibleText(html)).toContain(
        'Cheers, The LabOS Team You received this email because you are a member of the Protocol Labs network.'
      );
      expect(text).toContain(
        'Cheers,\nThe LabOS Team\n\nYou received this email because you are a member of the Protocol Labs network.\n'
      );
    });

    it('has Manage (preferences) and Unsubscribe, with the input URLs untouched', () => {
      const { html, text } = renderSuggestedCandidatesEmail(baseInput());
      expect(html).toMatch(
        new RegExp(
          `<a href="${BASE}/settings/email" style="[^"]*text-decoration: underline;">Manage</a> your email preferences &middot; <a href="${BASE}/settings/email/unsubscribed\\?token=v1\\.a\\.b" style="[^"]*">Unsubscribe</a>`
        )
      );
      expect(text).toContain(`Manage your email preferences: ${BASE}/settings/email\n`);
      expect(text).toContain(`Unsubscribe: ${BASE}/settings/email/unsubscribed?token=v1.a.b`);
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
    const bare = candidate({ role: null, imageUrl: null, blurb: null, location: null, criteria: [], name: 'Linus' });

    it('scenario: a bare candidate shows name and band with no empty line, and no "undefined"/"null"', () => {
      const { html, text } = renderSuggestedCandidatesEmail(baseInput({ candidates: [bare] }));
      for (const body of [html, text]) {
        expect(body).not.toMatch(/undefined|null/);
      }
      expect(html).toContain('>Linus</td>');
      expect(html).not.toMatch(/<p[^>]*>\s*<\/p>/);
      expect(html).not.toContain('color: #667085;">');
      expect(text).toContain('Linus · Strong match\nView profile: ');
    });

    it('treats a blank role like a missing one', () => {
      const { html, text } = renderSuggestedCandidatesEmail(
        baseInput({ candidates: [candidate({ role: '  ', criteria: [], location: null })] })
      );
      expect(html).not.toMatch(/<p[^>]*>\s*<\/p>/);
      expect(text).toContain('Grace Hopper · Strong match\nView profile: ');
    });

    it('tolerates criteria missing from the input', () => {
      const { html } = renderSuggestedCandidatesEmail(
        baseInput({ candidates: [candidate({ criteria: undefined as unknown as Candidate['criteria'] })] })
      );
      expect(html).not.toContain('Why we suggested');
    });
  });

  describe('escaping', () => {
    const hostile = baseInput({
      leadName: '<b>Ada</b> Lovelace',
      teamName: "Ada's <Team>",
      roleTitle: 'Rust & "Go" Engineer',
      candidates: [
        candidate({
          name: 'Grace <script>alert(1)</script>',
          role: '<i>CTO</i>',
          location: 'Boston <b>&</b> Co',
          criteria: [
            { label: '<u>Label</u>', statement: 'Met & <em>proven</em>', matched: true },
            { statement: '<s>No label</s>', matched: false },
          ],
        }),
      ],
      preferencesUrl: `${BASE}/settings/email?a=1&b="2"`,
      unsubscribeUrl: `${BASE}/settings/email/unsubscribed?token=v1.a.b&x=<y>`,
    });

    it('shows HTML special characters in every field as text', () => {
      const { html } = renderSuggestedCandidatesEmail(hostile);
      for (const raw of [
        '<b>Ada</b>',
        '<script>',
        '<Team>',
        '<i>',
        'x=<y>',
        'b="2"',
        '<u>',
        '<em>',
        '<s>',
        '<b>&</b>',
      ]) {
        expect(html).not.toContain(raw);
      }
      expect(html).toContain('Hi &lt;b&gt;Ada&lt;/b&gt;,');
      expect(html).toContain('Rust &amp; &quot;Go&quot; Engineer');
      expect(html).toContain('Ada&#39;s &lt;Team&gt;');
      expect(html).toContain('Grace &lt;script&gt;alert(1)&lt;/script&gt;');
      expect(html).toContain('&lt;i&gt;CTO&lt;/i&gt;');
      expect(html).toContain('Boston &lt;b&gt;&amp;&lt;/b&gt; Co');
      expect(html).toContain('&lt;u&gt;Label&lt;/u&gt;');
      expect(html).toContain('Met &amp; &lt;em&gt;proven&lt;/em&gt;');
      expect(html).toContain('&lt;s&gt;No label&lt;/s&gt;');
      expect(html).toContain('href="https://directory.example/settings/email?a=1&amp;b=&quot;2&quot;"');
      expect(html).toContain('token=v1.a.b&amp;x=&lt;y&gt;"');
    });

    it('keeps the subject and text part as plain text, one line per field', () => {
      const { subject, text } = renderSuggestedCandidatesEmail(
        baseInput({ roleTitle: 'Rust &\nGo', candidates: [candidate({ name: 'Grace\nHopper', location: 'Bos\nton' })] })
      );
      expect(subject).toBe('1 new suggested candidate for Rust & Go');
      expect(text).toContain('Grace Hopper · Strong match');
      expect(text).toContain('2 of 3 requirements · Bos ton');
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

  it('is an email-safe document: tables, inline styles, a 640px fluid column, no flex or grid', () => {
    const { html } = renderSuggestedCandidatesEmail(baseInput());
    expect(html.startsWith('<!DOCTYPE html>')).toBe(true);
    expect(html).toContain('<table role="presentation"');
    expect(html).toMatch(/class="email-container" role="presentation" width="640"/);
    expect(html).toContain('@media only screen and (max-width: 640px)');
    expect(html).toContain('background-color: #f6f7fb');
    expect(html).not.toMatch(/display:\s*(flex|grid)/);
    // The only stylesheet is the Google Fonts one; Arial/Helvetica stand in where a client drops it.
    expect(html.match(/<link /g)).toHaveLength(1);
    expect(html).toContain(
      '<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500&amp;family=Montserrat'
    );
    expect(html).toContain('font-family: Inter, Arial, Helvetica, sans-serif;');
    expect(html).toContain('font-family: Montserrat, Arial, Helvetica, sans-serif;');
  });
});
