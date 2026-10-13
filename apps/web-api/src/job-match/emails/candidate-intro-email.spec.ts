import { renderCandidateIntroEmail } from './candidate-intro-email';

describe('renderCandidateIntroEmail (stub until LAB-2848)', () => {
  const input = {
    leadName: '<b>Ada</b>',
    leadEmail: 'ada@example.com',
    roleTitle: 'Rust & "Go" Engineer',
    teamName: "Ada's <Team>",
    message: 'Hi <script>alert(1)</script>\n\nLet us talk.',
    roleUrl: 'https://directory.example/jobs/role-1?a=1&b="2"',
    leadProfileUrl: 'https://directory.example/members/lead-1',
  };

  it('escapes every field in the html part', () => {
    const { html } = renderCandidateIntroEmail(input);
    expect(html).not.toContain('<b>Ada</b>');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<Team>');
    expect(html).toContain('&lt;b&gt;Ada&lt;/b&gt;');
    expect(html).toContain('Rust &amp; &quot;Go&quot; Engineer');
    expect(html).toContain('href="https://directory.example/jobs/role-1?a=1&amp;b=&quot;2&quot;"');
    expect(html).toContain('&lt;script&gt;');
  });

  it('returns a subject and a plain-text part with the links', () => {
    const out = renderCandidateIntroEmail(input);
    expect(out.subject).toContain(input.roleTitle);
    expect(out.text).toContain(input.message);
    expect(out.text).toContain(input.roleUrl);
    expect(out.text).toContain(input.leadProfileUrl);
  });

  it('leaves the email out when the sender has none', () => {
    const { html, text } = renderCandidateIntroEmail({ ...input, leadEmail: '' });
    expect(html).not.toContain('()');
    expect(text).not.toContain('()');
  });
});
