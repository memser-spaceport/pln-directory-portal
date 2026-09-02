import { toSupportEmailHtml, toSupportTelegramText } from './contact-support-html';

describe('toSupportEmailHtml', () => {
  it('escapes plain text and preserves newlines', () => {
    expect(toSupportEmailHtml('a < b\nc')).toBe('a &lt; b<br>c');
  });

  it('sanitizes HTML and keeps headings and images', () => {
    const html = toSupportEmailHtml(
      '<h2>Bug</h2><p>See <img src="https://cdn.test/shot.png" alt="shot"></p><script>alert(1)</script>'
    );
    expect(html).toContain('<h2>Bug</h2>');
    expect(html).toContain('https://cdn.test/shot.png');
    expect(html).not.toMatch(/script/i);
  });
});

describe('toSupportTelegramText', () => {
  it('leaves plain text unchanged', () => {
    expect(toSupportTelegramText('hello <world>')).toBe('hello <world>');
  });

  it('strips tags and keeps image URLs as their own lines', () => {
    const text = toSupportTelegramText('<p>See this</p><p><img src="https://cdn.test/shot.png" alt="shot"></p>');
    expect(text).toContain('See this');
    expect(text).toContain('https://cdn.test/shot.png');
    expect(text).not.toMatch(/<[^>]+>/);
  });
});
