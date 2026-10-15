import { renderCandidateIntroEmail, type CandidateIntroEmailInput } from './candidate-intro-email';

const BASE = 'https://directory.example';
const UTM = (content: string) =>
  `utm_source=job_suggested_candidate_intro_email&utm_medium=email&utm_content=${content}&job_uid=role-1`;
const attr = (url: string) => `href="${url.replace(/&/g, '&amp;')}"`;
const ROLE = `${BASE}/jobs/openings/role-1?${UTM('role')}`;
const PROFILE = `${BASE}/members/lead-1?${UTM('profile')}`;

const baseInput = (overrides: Partial<CandidateIntroEmailInput> = {}): CandidateIntroEmailInput => ({
  candidateName: 'Grace Hopper',
  leadName: 'Ada Lovelace',
  leadRole: 'Head of Engineering',
  leadEmail: 'ada@example.com',
  roleTitle: 'Rust Engineer',
  teamName: 'Analytical Engines',
  message: 'Hi Grace,\n\nYour compiler work caught my eye.\nFree next week?',
  roleUrl: `${BASE}/jobs/openings/role-1`,
  leadProfileUrl: `${BASE}/members/lead-1`,
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

/** `<a href="url" style="...">text</a>`, with the href escaped as in the html. */
const anchor = (url: string, text: string) =>
  new RegExp(
    `${attr(url).replace(/[?.]/g, '\\$&')} style="[^"]*color: #1b4dff; text-decoration: underline;">${text}</a>`
  );

describe('renderCandidateIntroEmail', () => {
  // The shared layout's images are served from the web UI domain (LAB-2855), as every link already is.
  const env = process.env.WEB_UI_BASE_URL;
  beforeEach(() => {
    process.env.WEB_UI_BASE_URL = BASE;
  });
  afterEach(() => {
    process.env.WEB_UI_BASE_URL = env;
  });

  it('loads the 193x44 logo from the directory domain (LAB-2855)', () => {
    const { html } = renderCandidateIntroEmail(baseInput());
    expect(html).toContain(
      `<img src="${BASE}/images/email/email-logo-protocol-labs@2x.png" width="193" height="44" alt="Protocol Labs"`
    );
    expect(html).not.toContain('protocol-labs-logo-246');
    expect(html).not.toContain('pfps.plnetwork.io');
  });

  it('keeps the subject', () => {
    const { subject } = renderCandidateIntroEmail(baseInput());
    expect(subject).toBe('Ada Lovelace from Analytical Engines would like to talk about Rust Engineer');
  });

  describe('copy', () => {
    it('greets the candidate by first name', () => {
      const { html, text } = renderCandidateIntroEmail(baseInput());
      expect(visibleText(html)).toContain(' Hi Grace, ');
      expect(text.startsWith('Hi Grace,\n')).toBe(true);
      expect(visibleText(html)).not.toContain('Hopper');
    });

    it('says "Hi," when the candidate has no name', () => {
      const { html, text } = renderCandidateIntroEmail(baseInput({ candidateName: ' ' }));
      expect(visibleText(html)).toContain(' Hi, Ada Lovelace');
      expect(text.startsWith('Hi,\n')).toBe(true);
    });

    it('links the lead name to their profile and the role title to its page, with the lead role and team between', () => {
      const { html, text } = renderCandidateIntroEmail(baseInput());
      expect(html).toMatch(anchor(PROFILE, 'Ada Lovelace'));
      expect(html).toMatch(anchor(ROLE, 'Rust Engineer'));
      expect(visibleText(html)).toContain(
        'Ada Lovelace — Head of Engineering, Analytical Engines thinks you will be a good fit for Rust Engineer role.'
      );
      expect(text).toContain(
        'Ada Lovelace — Head of Engineering, Analytical Engines thinks you will be a good fit for Rust Engineer role.'
      );
      expect(text).toContain(`Ada Lovelace: ${PROFILE}`);
      expect(text).toContain(`Rust Engineer: ${ROLE}`);
    });

    it('leaves the lead role out when it is null or blank', () => {
      for (const leadRole of [null, '  ']) {
        const { html, text } = renderCandidateIntroEmail(baseInput({ leadRole }));
        const sentence = 'Ada Lovelace — Analytical Engines thinks you will be a good fit for Rust Engineer role.';
        expect(visibleText(html)).toContain(sentence);
        expect(text).toContain(sentence);
      }
    });

    it('introduces the message with the lead first name and keeps its paragraphs and line breaks', () => {
      const { html, text } = renderCandidateIntroEmail(baseInput());
      expect(html).toMatch(/color: #667085;">Ada wrote:<\/p>/);
      expect(html).toMatch(/>Hi Grace,<\/p>/);
      expect(html).toContain('Your compiler work caught my eye.<br />Free next week?</p>');
      expect(text).toContain('Ada wrote:\nHi Grace,\n\nYour compiler work caught my eye.\nFree next week?');
    });

    it('tells the candidate to reply to the lead by first name, and never prints the address', () => {
      const { html, text } = renderCandidateIntroEmail(baseInput());
      expect(html).toMatch(
        /text-align: center;[^"]*color: #8897ae;">Reply to this email to respond to Ada directly\.<\/p>/
      );
      expect(text).toContain('Reply to this email to respond to Ada directly.');
      expect(html).not.toContain('ada@example.com');
      expect(text).not.toContain('ada@example.com');
    });

    it('points to the profile instead of Reply when the sender has no email', () => {
      const { html, text } = renderCandidateIntroEmail(baseInput({ leadEmail: '' }));
      expect(`${html}${text}`).not.toContain('Reply to this email');
      expect(visibleText(html)).toContain('You can reach Ada through their profile');
      expect(html).toContain('>their profile</a>.</p>');
      expect(html).toMatch(new RegExp(`${attr(PROFILE).replace(/[?.]/g, '\\$&')} style="[^"]*">their profile</a>`));
      expect(text).toContain(`You can reach Ada through their profile. ${PROFILE}`);
    });

    it('falls back to "A team lead" when the lead has no name', () => {
      const { html, text } = renderCandidateIntroEmail(baseInput({ leadName: ' ' }));
      expect(visibleText(html)).toContain('A team lead — Head of Engineering');
      expect(visibleText(html)).toContain('The team lead wrote:');
      expect(text).toContain('Reply to this email to respond to the team lead directly.');
    });

    it('drops the old heading, buttons and per-email reason', () => {
      const { html, text } = renderCandidateIntroEmail(baseInput());
      expect(html).not.toContain('<h1');
      for (const body of [html, text]) {
        expect(body).not.toContain('View the role');
        expect(body).not.toContain('would like to talk with you');
        expect(body).not.toContain('found your profile a match');
      }
    });
  });

  describe('footer', () => {
    it('signs off from the LabOS team, gives the network reason and has Manage only', () => {
      const { html, text } = renderCandidateIntroEmail(baseInput());
      expect(visibleText(html)).toContain(
        'Cheers, The LabOS Team You received this email because you are a member of the Protocol Labs network. Manage your email preferences.'
      );
      expect(html).toMatch(
        new RegExp(
          `<a href="${BASE}/settings/email" style="[^"]*text-decoration: underline;">Manage</a> your email preferences\\.`
        )
      );
      expect(`${html}${text}`).not.toMatch(/unsubscribe/i);
      expect(text).toContain(`Manage your email preferences: ${BASE}/settings/email\n`);
    });
  });

  it('keeps a query the caller put on a URL', () => {
    const { text } = renderCandidateIntroEmail(baseInput({ roleUrl: `${BASE}/jobs/openings/role-1?x=1` }));
    expect(text).toContain(`${BASE}/jobs/openings/role-1?x=1&${UTM('role')}`);
  });

  it('scenario: a message with <b> or & shows the characters as plain text', () => {
    const { html, text } = renderCandidateIntroEmail(
      baseInput({ message: 'Let us <b>talk</b> & <script>x()</script>' })
    );
    expect(html).not.toContain('<b>talk</b>');
    expect(html).not.toContain('<script>');
    expect(html).toContain('Let us &lt;b&gt;talk&lt;/b&gt; &amp; &lt;script&gt;x()&lt;/script&gt;');
    expect(text).toContain('Let us <b>talk</b> & <script>x()</script>');
  });

  it('escapes every other field in the html part', () => {
    const { html } = renderCandidateIntroEmail(
      baseInput({
        candidateName: '<i>Grace</i> Hopper',
        leadName: '<b>Ada</b> Lovelace',
        leadRole: 'CTO & <u>Founder</u>',
        roleTitle: 'Rust & "Go" Engineer',
        teamName: "Ada's <Team>",
        leadEmail: '',
        roleUrl: `${BASE}/jobs/openings/role-1?a=1&b="2"`,
      })
    );
    for (const raw of ['<b>Ada</b>', '<Team>', '<i>Grace', '<u>Founder']) expect(html).not.toContain(raw);
    expect(html).toContain('Hi &lt;i&gt;Grace&lt;/i&gt;,');
    expect(html).toContain('&lt;b&gt;Ada&lt;/b&gt; Lovelace</a>');
    expect(html).toContain('CTO &amp; &lt;u&gt;Founder&lt;/u&gt;, Ada&#39;s &lt;Team&gt; thinks');
    expect(html).toContain('Rust &amp; &quot;Go&quot; Engineer</a>');
    expect(html).toContain('&lt;b&gt;Ada&lt;/b&gt; wrote:');
    expect(html).toContain('You can reach &lt;b&gt;Ada&lt;/b&gt; through');
    expect(html).toContain(`href="${BASE}/jobs/openings/role-1?a=1&amp;b=&quot;2&quot;&amp;utm_source=`);
  });

  it('escapes the lead first name in the reply line', () => {
    const { html } = renderCandidateIntroEmail(baseInput({ leadName: '<b>Ada</b> Lovelace' }));
    expect(html).toContain('Reply to this email to respond to &lt;b&gt;Ada&lt;/b&gt; directly.');
  });

  it('leaves no "undefined", no "wrote:" and no empty paragraph when the message is blank', () => {
    const { html, text } = renderCandidateIntroEmail(baseInput({ message: '   ', leadRole: null }));
    expect(`${html}${text}`).not.toMatch(/undefined|null/);
    expect(`${html}${text}`).not.toContain('wrote:');
    expect(html).not.toMatch(/<p[^>]*>\s*<\/p>/);
    expect(text).not.toMatch(/\n\n\n/);
  });

  it('never mentions job-search status', () => {
    const { html, text } = renderCandidateIntroEmail(baseInput());
    expect(`${html}\n${text}`).not.toMatch(/looking|job[- ]search/i);
  });

  it.each(['roleUrl', 'leadProfileUrl'] as const)(
    'throws rather than send a broken link when %s is missing',
    (field) => {
      expect(() => renderCandidateIntroEmail(baseInput({ [field]: '' }))).toThrow(
        `renderCandidateIntroEmail: ${field} is required`
      );
    }
  );

  it('is an email-safe document: tables, a 418px content block, absolute URLs only', () => {
    const { html } = renderCandidateIntroEmail(baseInput());
    expect(html).toContain('<table role="presentation"');
    expect(html).toMatch(/class="email-fluid" role="presentation" width="418"/);
    expect(html).not.toMatch(/display:\s*(flex|grid)/);
    expect(html.match(/<link /g)).toHaveLength(1);
    for (const [, ref] of html.matchAll(/(?:href|src)="([^"]*)"/g)) expect(ref).toMatch(/^https:\/\//);
  });
});
