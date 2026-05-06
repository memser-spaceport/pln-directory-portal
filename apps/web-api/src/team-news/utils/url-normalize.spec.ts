import { extractDomain, normalizeSourceUrl } from './url-normalize';

describe('normalizeSourceUrl', () => {
  it('lowercases the host', () => {
    expect(normalizeSourceUrl('https://Example.COM/Path')).toBe('https://example.com/Path');
  });

  it('strips query string', () => {
    expect(normalizeSourceUrl('https://example.com/post?utm=x&ref=y')).toBe('https://example.com/post');
  });

  it('strips fragment', () => {
    expect(normalizeSourceUrl('https://example.com/post#section')).toBe('https://example.com/post');
  });

  it('strips trailing slash but preserves bare-domain root', () => {
    expect(normalizeSourceUrl('https://example.com/post/')).toBe('https://example.com/post');
    expect(normalizeSourceUrl('https://example.com/')).toBe('https://example.com/');
  });

  it('treats different query strings on same path as the same canonical URL', () => {
    const a = normalizeSourceUrl('https://akave.com/blog/x?utm_source=tw');
    const b = normalizeSourceUrl('https://akave.com/blog/x?utm_source=fb');
    expect(a).toBe(b);
  });

  it('handles non-URL strings without throwing', () => {
    expect(normalizeSourceUrl('not a url')).toBe('not a url');
  });
});

describe('extractDomain', () => {
  it('returns lowercased host without www', () => {
    expect(extractDomain('https://www.Example.com/path')).toBe('example.com');
    expect(extractDomain('https://blog.example.com/post')).toBe('blog.example.com');
  });

  it('returns null for invalid URLs', () => {
    expect(extractDomain('not-a-url')).toBeNull();
  });
});
