import { decodeHtmlEntities } from './html-entities';

describe('decodeHtmlEntities', () => {
  it('leaves entity-free text untouched', () => {
    expect(decodeHtmlEntities('Plain text.')).toBe('Plain text.');
    expect(decodeHtmlEntities('')).toBe('');
  });

  it('decodes quotes in both named and numeric forms', () => {
    expect(decodeHtmlEntities('He led &quot;Project X&quot;.')).toBe('He led "Project X".');
    expect(decodeHtmlEntities('He led &#34;Project X&#034;.')).toBe('He led "Project X".');
  });

  it('decodes both apostrophe forms, including zero-padded numeric', () => {
    expect(decodeHtmlEntities('O&#39;Brien&apos;s &#039;work&apos;')).toBe("O'Brien's 'work'");
  });

  it('decodes angle brackets', () => {
    expect(decodeHtmlEntities('Ships &lt;1s builds &gt;99% of the time')).toBe('Ships <1s builds >99% of the time');
  });

  it('decodes &nbsp; to a plain space, case-insensitively', () => {
    expect(decodeHtmlEntities('A&nbsp;B&NBSP;C')).toBe('A B C');
  });

  it('decodes &amp; last so double-encoded entities survive exactly one level', () => {
    // Decoding &amp; first would collapse `&amp;quot;` to `"` instead of `&quot;`.
    expect(decodeHtmlEntities('&amp;quot;hi&amp;quot; and R&amp;D')).toBe('&quot;hi&quot; and R&D');
  });
});
