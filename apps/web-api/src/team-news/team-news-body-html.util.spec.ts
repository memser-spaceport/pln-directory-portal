import {
  hasRichTextContent,
  isSafeHttpUrl,
  sanitizeTeamNewsBodyHtml,
  stripHtmlToPlainText,
} from './team-news-body-html.util';

describe('team-news-body-html.util', () => {
  it('sanitizes allowed tags and strips scripts', () => {
    expect(sanitizeTeamNewsBodyHtml('<p>Hello <strong>world</strong></p><script>alert(1)</script>')).toBe(
      '<p>Hello <strong>world</strong></p>'
    );
  });

  it('returns null for empty rich text', () => {
    expect(sanitizeTeamNewsBodyHtml('<p><br></p>')).toBeNull();
  });

  it('strips html to plain text', () => {
    expect(stripHtmlToPlainText('<p>Hello <em>world</em></p>')).toBe('Hello world');
  });

  it('detects rich text content', () => {
    expect(hasRichTextContent('<p>Hi</p>')).toBe(true);
    expect(hasRichTextContent('<p></p>')).toBe(false);
  });

  it('accepts only http(s) urls', () => {
    expect(isSafeHttpUrl('https://example.com/a')).toBe(true);
    expect(isSafeHttpUrl('javascript:alert(1)')).toBe(false);
  });
});
