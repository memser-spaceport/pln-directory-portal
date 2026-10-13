import { renderSuggestedCandidatesEmail, type SuggestedCandidatesEmailInput } from './suggested-candidates-email';

describe('renderSuggestedCandidatesEmail (stub until LAB-2848)', () => {
  const input: SuggestedCandidatesEmailInput = {
    leadName: '<b>Ada</b>',
    teamUid: 'team-1',
    teamName: "Ada's <Team>",
    roleUid: 'role-1',
    roleTitle: 'Rust & "Go" Engineer',
    candidates: [
      {
        memberUid: 'm1',
        name: 'Grace <script>alert(1)</script>',
        role: 'Engineer',
        imageUrl: 'https://img.example/a.png?x=1&y="2"',
        label: 'Strong match',
        blurb: 'Ships <i>fast</i>',
      },
      { memberUid: 'm2', name: 'Linus', role: null, imageUrl: null, label: 'Good match', blurb: null },
    ],
    totalMatchCount: 5,
    preferencesUrl: 'https://directory.example/settings/email',
    unsubscribeUrl: 'https://directory.example/settings/email/unsubscribed?token=v1.a.b&x=<y>',
  };

  it('escapes every field in the html part', () => {
    const { html } = renderSuggestedCandidatesEmail(input);
    expect(html).not.toContain('<b>Ada</b>');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<Team>');
    expect(html).not.toContain('<i>fast</i>');
    expect(html).not.toContain('x=<y>');
    expect(html).toContain('&lt;b&gt;Ada&lt;/b&gt;');
    expect(html).toContain('Rust &amp; &quot;Go&quot; Engineer');
  });

  it('names the new candidates in order, states the total and carries both links', () => {
    const { subject, html, text } = renderSuggestedCandidatesEmail(input);
    expect(subject).toBe('2 new suggested candidates for Rust & "Go" Engineer');
    expect(text.indexOf('Grace')).toBeLessThan(text.indexOf('Linus'));
    expect(text).toContain('5 in total');
    expect(text).toContain('Strong match');
    expect(text).toContain(input.preferencesUrl);
    expect(text).toContain(input.unsubscribeUrl);
    expect(html).toContain('href="https://directory.example/settings/email"');
  });
});
