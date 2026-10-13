import { renderCandidateIntroEmail, type CandidateIntroEmailInput } from './candidate-intro-email';

const UTM = (content: string) =>
  `utm_source=job_suggested_candidate_intro_email&utm_medium=email&utm_content=${content}&job_uid=role-1`;
const attr = (url: string) => `href="${url.replace(/&/g, '&amp;')}"`;

const baseInput = (overrides: Partial<CandidateIntroEmailInput> = {}): CandidateIntroEmailInput => ({
  leadName: 'Ada Lovelace',
  leadEmail: 'ada@example.com',
  roleTitle: 'Rust Engineer',
  teamName: 'Analytical Engines',
  message: 'Hi Grace,\n\nYour compiler work caught my eye.\nFree next week?',
  roleUrl: 'https://directory.example/jobs/openings/role-1',
  leadProfileUrl: 'https://directory.example/members/lead-1',
  ...overrides,
});

describe('renderCandidateIntroEmail', () => {
  it('names the lead, the team and the role in the subject and the body', () => {
    const { subject, html, text } = renderCandidateIntroEmail(baseInput());
    expect(subject).toBe('Ada Lovelace from Analytical Engines would like to talk about Rust Engineer');
    expect(html).toContain('Ada Lovelace would like to talk with you');
    for (const body of [html, text]) {
      expect(body).toContain('Ada Lovelace');
      expect(body).toContain('Analytical Engines');
      expect(body).toContain('Rust Engineer');
    }
  });

  it("carries the lead's message, paragraphs and line breaks kept", () => {
    const { html, text } = renderCandidateIntroEmail(baseInput());
    expect(html).toMatch(/>Hi Grace,<\/p>/);
    expect(html).toContain('Your compiler work caught my eye.<br />Free next week?</p>');
    expect(text).toContain('Hi Grace,\n\nYour compiler work caught my eye.\nFree next week?');
  });

  it('links to the role page and the lead profile with the intro email UTM tags', () => {
    const { html, text } = renderCandidateIntroEmail(baseInput());
    const role = `https://directory.example/jobs/openings/role-1?${UTM('role')}`;
    const profile = `https://directory.example/members/lead-1?${UTM('profile')}`;
    expect(html).toContain(`${attr(role)} style="display: inline-block; background-color: #156FF7;`);
    expect(html).toContain('>View the role</a>');
    expect(html).toContain(attr(profile));
    expect(html).toContain('>View Ada Lovelace&#39;s profile</a>');
    expect(text).toContain(`View the role: ${role}`);
    expect(text).toContain(`View Ada Lovelace's profile: ${profile}`);
  });

  it('keeps a query the caller put on a URL', () => {
    const { text } = renderCandidateIntroEmail(
      baseInput({ roleUrl: 'https://directory.example/jobs/openings/role-1?x=1' })
    );
    expect(text).toContain(`https://directory.example/jobs/openings/role-1?x=1&${UTM('role')}`);
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
        leadName: '<b>Ada</b>',
        roleTitle: 'Rust & "Go" Engineer',
        teamName: "Ada's <Team>",
        roleUrl: 'https://directory.example/jobs/openings/role-1?a=1&b="2"',
      })
    );
    expect(html).not.toContain('<b>Ada</b>');
    expect(html).not.toContain('<Team>');
    expect(html).toContain('&lt;b&gt;Ada&lt;/b&gt;');
    expect(html).toContain('Rust &amp; &quot;Go&quot; Engineer');
    expect(html).toContain('Ada&#39;s &lt;Team&gt;');
    expect(html).toContain(
      'href="https://directory.example/jobs/openings/role-1?a=1&amp;b=&quot;2&quot;&amp;utm_source='
    );
  });

  it('tells the candidate to reply when Reply-To reaches the lead, and never prints the address', () => {
    const { html, text } = renderCandidateIntroEmail(baseInput());
    expect(text).toContain('Reply to this email to answer Ada Lovelace directly.');
    expect(html).not.toContain('ada@example.com');
    expect(text).not.toContain('ada@example.com');
  });

  it('points to the profile instead of Reply when the sender has no email', () => {
    const { html, text } = renderCandidateIntroEmail(baseInput({ leadEmail: '' }));
    expect(text).not.toContain('Reply to this email');
    expect(text).toContain('To answer, reach Ada Lovelace through their profile.');
    expect(html).not.toContain('()');
  });

  it('leaves no "undefined" and no empty paragraph when the message is blank', () => {
    const { html, text } = renderCandidateIntroEmail(baseInput({ message: '   ' }));
    expect(`${html}${text}`).not.toMatch(/undefined|null/);
    expect(html).not.toMatch(/<p[^>]*>\s*<\/p>/);
    expect(html).not.toContain('border-left: 3px');
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

  it('is an email-safe document with absolute URLs only', () => {
    const { html } = renderCandidateIntroEmail(baseInput());
    expect(html).toContain('<table role="presentation"');
    expect(html).not.toMatch(/<style|<link|class="/);
    for (const [, ref] of html.matchAll(/(?:href|src)="([^"]*)"/g)) expect(ref).toMatch(/^https:\/\//);
  });
});
