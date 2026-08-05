import { extractSocialImageUrl } from './og-image';

describe('extractSocialImageUrl', () => {
  const pageUrl = 'https://www.plrd.org/talks/jbp-allison-duettmann';

  it('prefers og:image over twitter:image', () => {
    const html = `
      <html><head>
        <meta property="og:image" content="/images/og.png" />
        <meta name="twitter:image" content="https://cdn.example.com/tw.jpg" />
      </head></html>
    `;
    expect(extractSocialImageUrl(html, pageUrl)).toBe('https://www.plrd.org/images/og.png');
  });

  it('falls back to twitter:image', () => {
    const html = `
      <meta name="twitter:image" content="https://cdn.example.com/tw.jpg" />
    `;
    expect(extractSocialImageUrl(html, pageUrl)).toBe('https://cdn.example.com/tw.jpg');
  });

  it('handles content attribute before property', () => {
    const html = `<meta content="https://cdn.example.com/a.jpg" property="og:image" />`;
    expect(extractSocialImageUrl(html, pageUrl)).toBe('https://cdn.example.com/a.jpg');
  });

  it('returns null when no social image meta is present', () => {
    expect(extractSocialImageUrl('<html></html>', pageUrl)).toBeNull();
  });
});
