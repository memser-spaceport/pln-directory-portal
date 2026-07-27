import { stripHtmlToPlainText } from './html-to-text';

describe('stripHtmlToPlainText', () => {
  it('returns an empty string for empty input', () => {
    expect(stripHtmlToPlainText('')).toBe('');
  });

  it('strips tags and decodes residual entities left by sanitize-html', () => {
    expect(stripHtmlToPlainText('<p>Fish &amp; Chips</p>')).toBe('Fish & Chips');
    expect(stripHtmlToPlainText('It&#39;s a test')).toBe("It's a test");
  });

  it('inserts whitespace at stripped block-tag boundaries instead of running words together', () => {
    expect(stripHtmlToPlainText('<p>Para1</p><p>Para2</p>')).toBe('Para1 Para2');
    expect(stripHtmlToPlainText('Line one<br>Line two')).toBe('Line one Line two');
  });

  it('collapses repeated whitespace and trims', () => {
    expect(stripHtmlToPlainText('  <div>  Hello   world  </div>  ')).toBe('Hello world');
  });
});
