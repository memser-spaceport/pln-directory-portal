import { normalizeBlueskyHandler, normalizeCrunchbaseHandler } from './team-handle-normalizer';

describe('normalizeBlueskyHandler', () => {
  it('returns undefined for empty/null/undefined input', () => {
    expect(normalizeBlueskyHandler(undefined)).toBeUndefined();
    expect(normalizeBlueskyHandler(null)).toBeUndefined();
    expect(normalizeBlueskyHandler('')).toBeUndefined();
  });

  it('strips a leading @', () => {
    expect(normalizeBlueskyHandler('@team.bsky.social')).toBe('team.bsky.social');
  });

  it('passes through a bare handle unchanged', () => {
    expect(normalizeBlueskyHandler('team.bsky.social')).toBe('team.bsky.social');
  });

  it('extracts the handle from a full profile URL', () => {
    expect(normalizeBlueskyHandler('https://bsky.app/profile/team.bsky.social')).toBe('team.bsky.social');
  });

  it('extracts the handle from a schemeless profile URL', () => {
    expect(normalizeBlueskyHandler('bsky.app/profile/team.bsky.social')).toBe('team.bsky.social');
  });
});

describe('normalizeCrunchbaseHandler', () => {
  it('returns undefined for empty/null/undefined input', () => {
    expect(normalizeCrunchbaseHandler(undefined)).toBeUndefined();
    expect(normalizeCrunchbaseHandler(null)).toBeUndefined();
    expect(normalizeCrunchbaseHandler('')).toBeUndefined();
  });

  it('passes through a bare slug unchanged', () => {
    expect(normalizeCrunchbaseHandler('protocol-labs')).toBe('protocol-labs');
  });

  it('strips an organization/ path prefix', () => {
    expect(normalizeCrunchbaseHandler('organization/protocol-labs')).toBe('protocol-labs');
  });

  it('extracts the slug from a full crunchbase.com URL', () => {
    expect(normalizeCrunchbaseHandler('https://www.crunchbase.com/organization/protocol-labs')).toBe(
      'protocol-labs'
    );
  });

  it('extracts the slug from a schemeless crunchbase.com URL', () => {
    expect(normalizeCrunchbaseHandler('crunchbase.com/organization/protocol-labs')).toBe('protocol-labs');
  });
});
