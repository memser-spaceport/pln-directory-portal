import {
  extractDomain,
  extractPublicationSlug,
  normalizeSourceUrl,
  urlSearchVariants,
} from './url-normalize';

describe('normalizeSourceUrl', () => {
  it('lowercases the host', () => {
    expect(normalizeSourceUrl('https://Example.COM/Path')).toBe('https://example.com/Path');
  });

  it('strips tracking query params but keeps meaningful ones', () => {
    expect(normalizeSourceUrl('https://example.com/post?utm_source=x&ref=y')).toBe(
      'https://example.com/post'
    );
    expect(normalizeSourceUrl('https://example.com/post?page=2&utm_campaign=x')).toBe(
      'https://example.com/post?page=2'
    );
  });

  it('strips fragment', () => {
    expect(normalizeSourceUrl('https://example.com/post#section')).toBe('https://example.com/post');
  });

  it('strips trailing slash but preserves bare-domain root', () => {
    expect(normalizeSourceUrl('https://example.com/post/')).toBe('https://example.com/post');
    expect(normalizeSourceUrl('https://example.com/')).toBe('https://example.com/');
  });

  it('treats different tracking params on same path as the same canonical URL', () => {
    const a = normalizeSourceUrl('https://akave.com/blog/x?utm_source=tw');
    const b = normalizeSourceUrl('https://akave.com/blog/x?utm_source=fb');
    expect(a).toBe(b);
  });

  it('canonicalizes YouTube watch and youtu.be URLs by video id', () => {
    expect(normalizeSourceUrl('https://www.youtube.com/watch?v=knM7yHFH67o&t=12s')).toBe(
      'https://youtube.com/watch?v=knM7yHFH67o'
    );
    expect(normalizeSourceUrl('https://youtu.be/knM7yHFH67o')).toBe(
      'https://youtube.com/watch?v=knM7yHFH67o'
    );
    expect(normalizeSourceUrl('https://www.youtube.com/embed/knM7yHFH67o')).toBe(
      'https://youtube.com/watch?v=knM7yHFH67o'
    );
  });

  it('keeps different YouTube videos distinct', () => {
    const a = normalizeSourceUrl('https://www.youtube.com/watch?v=aaaaaaaaaaa');
    const b = normalizeSourceUrl('https://www.youtube.com/watch?v=bbbbbbbbbbb');
    expect(a).not.toBe(b);
  });

  it('canonicalizes gov.uk publication path variants to the publication slug', () => {
    const a = normalizeSourceUrl(
      'https://www.gov.uk/government/publications/aria-annual-report-and-accounts-2025-to-2026'
    );
    const b = normalizeSourceUrl(
      'https://www.gov.uk/government/publications/aria-annual-report-and-accounts-2025-to-2026/aria-annual-report-and-accounts-2025-to-2026--2'
    );
    expect(a).toBe(b);
    expect(a).toBe(
      'https://gov.uk/government/publications/aria-annual-report-and-accounts-2025-to-2026'
    );
  });

  it('handles non-URL strings without throwing', () => {
    expect(normalizeSourceUrl('not a url')).toBe('not a url');
  });
});

describe('extractPublicationSlug', () => {
  it('returns the publication slug for gov.uk paths', () => {
    expect(
      extractPublicationSlug(
        'https://www.gov.uk/government/publications/aria-annual-report-and-accounts-2025-to-2026/page-2'
      )
    ).toBe('aria-annual-report-and-accounts-2025-to-2026');
  });

  it('returns null for non-gov.uk hosts', () => {
    expect(extractPublicationSlug('https://example.com/government/publications/x')).toBeNull();
  });
});

describe('urlSearchVariants', () => {
  it('includes www and non-www forms plus youtube short links', () => {
    const variants = urlSearchVariants(['https://www.youtube.com/watch?v=knM7yHFH67o']);
    expect(variants).toEqual(
      expect.arrayContaining([
        'https://youtube.com/watch?v=knM7yHFH67o',
        'https://www.youtube.com/watch?v=knM7yHFH67o',
        'https://youtu.be/knM7yHFH67o',
      ])
    );
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
