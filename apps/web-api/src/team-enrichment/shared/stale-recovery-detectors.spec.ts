import { isPersonalLinkedinHandle } from './handle.util';
import { isLikelyPersonalContactEmail } from './validators.util';

/**
 * Detectors for the judge's stale-user-recovery sub-pipeline. Both are pure
 * structural checks — `isPersonalLinkedinHandle` flags the `in/<slug>` LinkedIn
 * URL form that's only valid for personal profiles (teams should be on
 * `company/<slug>`); `isLikelyPersonalContactEmail` flags addresses at known
 * consumer providers that aren't on the team's lead-member roster.
 */
describe('isPersonalLinkedinHandle', () => {
  it('flags `in/<slug>` paths', () => {
    expect(isPersonalLinkedinHandle('in/jane-doe')).toBe(true);
    expect(isPersonalLinkedinHandle('IN/Jane-Doe')).toBe(true);
  });
  it('flags full LinkedIn personal URLs', () => {
    expect(isPersonalLinkedinHandle('https://linkedin.com/in/jane-doe')).toBe(true);
    expect(isPersonalLinkedinHandle('https://www.linkedin.com/in/jane-doe/')).toBe(true);
    expect(isPersonalLinkedinHandle('https://linkedin.com/in/jane-doe/details/')).toBe(true);
  });
  it('does NOT flag `company/<slug>`', () => {
    expect(isPersonalLinkedinHandle('company/acme')).toBe(false);
    expect(isPersonalLinkedinHandle('https://linkedin.com/company/acme')).toBe(false);
  });
  it('does NOT flag bare slugs (could be a company slug)', () => {
    // Bare slug is ambiguous — could be a company. We only trigger recovery
    // on the unambiguous `in/` form, so bare slugs stay in the existing
    // judge path.
    expect(isPersonalLinkedinHandle('acme')).toBe(false);
    expect(isPersonalLinkedinHandle('jane-doe')).toBe(false);
  });
  it('does NOT flag school slugs', () => {
    expect(isPersonalLinkedinHandle('school/stanford')).toBe(false);
  });
  it('handles empty / null / non-string', () => {
    expect(isPersonalLinkedinHandle('')).toBe(false);
    expect(isPersonalLinkedinHandle(null)).toBe(false);
    expect(isPersonalLinkedinHandle(undefined)).toBe(false);
  });
});

describe('isLikelyPersonalContactEmail', () => {
  const leadEmails = new Set(['jane@acme.com', 'founder@acme.com']);
  const empty = new Set<string>();

  it('flags emails at known consumer providers', () => {
    expect(isLikelyPersonalContactEmail('random@gmail.com', empty)).toBe(true);
    expect(isLikelyPersonalContactEmail('user@yahoo.com', empty)).toBe(true);
    expect(isLikelyPersonalContactEmail('user@outlook.com', empty)).toBe(true);
    expect(isLikelyPersonalContactEmail('user@icloud.com', empty)).toBe(true);
    expect(isLikelyPersonalContactEmail('user@proton.me', empty)).toBe(true);
  });

  it('does NOT flag emails on the team-lead roster, even at consumer providers', () => {
    // Pre-seed teams legitimately register the founder's `jane@gmail.com` as
    // the team's TeamMemberRole lead. Stage 1.5's founder-contact rule will
    // auto-promote that, and recovery shouldn't second-guess it.
    const leads = new Set(['jane@gmail.com']);
    expect(isLikelyPersonalContactEmail('jane@gmail.com', leads)).toBe(false);
  });

  it('does NOT flag corporate-domain emails', () => {
    expect(isLikelyPersonalContactEmail('hello@acme.com', empty)).toBe(false);
    expect(isLikelyPersonalContactEmail('support@stripe.com', empty)).toBe(false);
  });

  it('does NOT flag non-email values', () => {
    expect(isLikelyPersonalContactEmail('https://acme.com/contact', empty)).toBe(false);
    expect(isLikelyPersonalContactEmail('@acmehq', empty)).toBe(false);
    expect(isLikelyPersonalContactEmail('discord.gg/acme', empty)).toBe(false);
  });

  it('handles empty / null / non-string', () => {
    expect(isLikelyPersonalContactEmail('', empty)).toBe(false);
    expect(isLikelyPersonalContactEmail(null, empty)).toBe(false);
    expect(isLikelyPersonalContactEmail(undefined, empty)).toBe(false);
  });

  it('is case-insensitive on the email domain', () => {
    expect(isLikelyPersonalContactEmail('User@Gmail.com', empty)).toBe(true);
  });

  it('respects the leadEmails set independent of the consumer-domain list', () => {
    // Founder using a corporate email is also not "personal" — the helper
    // hits the consumer-domain gate first, but the lead check covers both
    // paths defensively.
    expect(isLikelyPersonalContactEmail('jane@acme.com', leadEmails)).toBe(false);
  });
});
