import { extractBlueskyHandleFromText } from './member-enrichment-bluesky.util';

describe('extractBlueskyHandleFromText', () => {
  it('returns undefined for null/undefined/empty text', () => {
    expect(extractBlueskyHandleFromText(null)).toBeUndefined();
    expect(extractBlueskyHandleFromText(undefined)).toBeUndefined();
    expect(extractBlueskyHandleFromText('')).toBeUndefined();
  });

  it('returns undefined when no Bluesky mention is present', () => {
    expect(extractBlueskyHandleFromText('Engineer at Acme. Find me on Twitter @acmejane.')).toBeUndefined();
  });

  it('extracts a handle from a bsky.app profile URL', () => {
    expect(extractBlueskyHandleFromText('Also on Bluesky: https://bsky.app/profile/jane.bsky.social')).toBe(
      'jane.bsky.social'
    );
  });

  it('extracts a handle from a bare bsky.app URL without scheme', () => {
    expect(extractBlueskyHandleFromText('bsky.app/profile/jane.bsky.social')).toBe('jane.bsky.social');
  });

  it('extracts a bare "<handle>.bsky.social" mention', () => {
    expect(extractBlueskyHandleFromText('You can also find me at jane.bsky.social for updates.')).toBe(
      'jane.bsky.social'
    );
  });

  it('prefers the bsky.app URL over a coincidental bare mention', () => {
    expect(
      extractBlueskyHandleFromText('Bluesky: https://bsky.app/profile/handle.bsky.social, also jane.bsky.social')
    ).toBe('handle.bsky.social');
  });
});
