import {
  normalizeAdditionalEmails,
  normalizeEmailKey,
  resolveAdditionalEmails,
  resolvePrimaryEmail,
  rosterNormalizedEmails,
} from './investor-email.util';

describe('normalizeEmailKey', () => {
  it('lowercases and strips plus-tags', () => {
    expect(normalizeEmailKey('Alice+tag@AcmeVC.com')).toBe('alice@acmevc.com');
  });

  it('returns empty for invalid input', () => {
    expect(normalizeEmailKey('')).toBe('');
    expect(normalizeEmailKey('not-an-email')).toBe('');
  });
});

describe('resolvePrimaryEmail', () => {
  it('prefers primaryEmailAddress over emailAddresses', () => {
    expect(
      resolvePrimaryEmail({
        primaryEmailAddress: 'a@firm.com',
        emailAddresses: ['b@firm.com'],
      })
    ).toBe('a@firm.com');
  });

  it('falls back to first emailAddresses entry', () => {
    expect(
      resolvePrimaryEmail({
        primaryEmailAddress: null,
        emailAddresses: ['b@firm.com', 'c@firm.com'],
      })
    ).toBe('b@firm.com');
  });
});

describe('resolveAdditionalEmails', () => {
  it('returns all roster emails except primary', () => {
    expect(
      resolveAdditionalEmails('yoni9091@gmail.com', {
        primaryEmailAddress: 'yoni9091@gmail.com',
        emailAddresses: ['yoni9091@gmail.com', 'benshimonmia@gmail.com'],
      })
    ).toEqual(['benshimonmia@gmail.com']);
  });

  it('dedupes and excludes placeholders', () => {
    expect(
      resolveAdditionalEmails('a@firm.com', {
        primaryEmailAddress: 'a@firm.com',
        emailAddresses: ['a@firm.com', 'b@firm.com', 'aff-1@lp.local', 'b@firm.com'],
      })
    ).toEqual(['b@firm.com']);
  });
});

describe('rosterNormalizedEmails', () => {
  it('collects unique normalized emails', () => {
    expect(
      rosterNormalizedEmails({
        primaryEmailAddress: 'md@coinshares.com',
        emailAddresses: ['md@coinshares.com', 'meltem@cruciblecap.xyz'],
      })
    ).toEqual(['md@coinshares.com', 'meltem@cruciblecap.xyz']);
  });
});

describe('normalizeAdditionalEmails', () => {
  it('strips primary and dedupes ingest values', () => {
    expect(normalizeAdditionalEmails('alice@acme.com', ['Alice+1@acme.com', 'bob@acme.com', 'bob@acme.com'])).toEqual([
      'bob@acme.com',
    ]);
  });
});
