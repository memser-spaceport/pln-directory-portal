import {
  clipTelegramText,
  stripInlineDataImages,
  TELEGRAM_MESSAGE_MAX_LENGTH,
  toSupportEmailHtml,
  toSupportTelegramText,
} from './contact-support-html';

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

  it('omits inline data-URI images', () => {
    const html = toSupportEmailHtml('<p>Hi</p><p><img src="data:image/png;base64,AAAA"></p>');
    expect(html).toContain('Hi');
    expect(html).toContain('[image omitted]');
    expect(html).not.toContain('data:image');
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

  it('replaces data-URI images with a placeholder instead of the payload', () => {
    const text = toSupportTelegramText('<p>Shot</p><p><img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA"></p>');
    expect(text).toContain('Shot');
    expect(text).toContain('[image]');
    expect(text).not.toContain('data:image');
    expect(text).not.toContain('iVBORw0KGgo');
  });
});

describe('stripInlineDataImages', () => {
  it('leaves plain text and hosted images alone', () => {
    expect(stripInlineDataImages('just text')).toBe('just text');
    const hosted = '<p><img src="https://cdn.test/a.png"></p>';
    expect(stripInlineDataImages(hosted)).toBe(hosted);
  });

  it('replaces data-URI images', () => {
    expect(stripInlineDataImages('<p><img src="data:image/png;base64,AAAA"></p>')).toBe('<p> [image omitted] </p>');
  });
});

describe('clipTelegramText', () => {
  it('leaves short text unchanged', () => {
    expect(clipTelegramText('hello')).toBe('hello');
  });

  it('truncates to the Telegram limit', () => {
    const text = 'x'.repeat(TELEGRAM_MESSAGE_MAX_LENGTH + 10);
    const clipped = clipTelegramText(text);
    expect(clipped.length).toBe(TELEGRAM_MESSAGE_MAX_LENGTH);
    expect(clipped.endsWith('…')).toBe(true);
  });
});
