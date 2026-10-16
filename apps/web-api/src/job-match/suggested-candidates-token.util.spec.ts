import { createHmac } from 'crypto';
import { issueJobAlertToken } from '../job-alerts/job-alerts-token.util';
import {
  issueSuggestedCandidatesUnsubscribeToken,
  verifySuggestedCandidatesUnsubscribeToken,
} from './suggested-candidates-token.util';

const DAY_MS = 24 * 60 * 60 * 1000;

describe('suggested-candidates-token.util', () => {
  const env = { ...process.env };

  beforeEach(() => {
    process.env.SUGGESTED_CANDIDATES_TOKEN_SECRET = 'suggested-candidates-test-secret';
    process.env.JOB_ALERTS_TOKEN_SECRET = 'job-alerts-test-secret';
  });

  afterEach(() => {
    process.env = { ...env };
  });

  it('round-trips a token for a member', () => {
    const token = issueSuggestedCandidatesUnsubscribeToken('member-1');
    expect(token.startsWith('v1.')).toBe(true);
    expect(verifySuggestedCandidatesUnsubscribeToken(token)).toMatchObject({
      purpose: 'suggested-candidates-unsubscribe',
      memberUid: 'member-1',
    });
  });

  it('accepts a token issued 10 days ago', () => {
    const token = issueSuggestedCandidatesUnsubscribeToken('member-1', Date.now() - 10 * DAY_MS);
    expect(verifySuggestedCandidatesUnsubscribeToken(token).memberUid).toBe('member-1');
  });

  it('rejects a tampered signature', () => {
    const token = issueSuggestedCandidatesUnsubscribeToken('member-1');
    const [v, body, sig] = token.split('.');
    const flipped = sig[0] === 'A' ? `B${sig.slice(1)}` : `A${sig.slice(1)}`;
    expect(() => verifySuggestedCandidatesUnsubscribeToken(`${v}.${body}.${flipped}`)).toThrow(/signature/i);
  });

  it('rejects a body swapped to another member', () => {
    const token = issueSuggestedCandidatesUnsubscribeToken('member-1');
    const other = issueSuggestedCandidatesUnsubscribeToken('member-2');
    const [v, , sig] = token.split('.');
    const [, otherBody] = other.split('.');
    expect(() => verifySuggestedCandidatesUnsubscribeToken(`${v}.${otherBody}.${sig}`)).toThrow(/signature/i);
  });

  it('rejects a correctly signed token with another purpose', () => {
    const body = Buffer.from(JSON.stringify({ purpose: 'unsubscribe', memberUid: 'member-1', iat: 1 }))
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/g, '');
    const sig = createHmac('sha256', 'suggested-candidates-test-secret')
      .update(`v1.${body}`)
      .digest('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/g, '');
    expect(() => verifySuggestedCandidatesUnsubscribeToken(`v1.${body}.${sig}`)).toThrow(/purpose/i);
  });

  it('rejects a job-alerts unsubscribe token', () => {
    const token = issueJobAlertToken({ purpose: 'unsubscribe', alertUid: 'member-1' });
    expect(() => verifySuggestedCandidatesUnsubscribeToken(token)).toThrow();
  });

  it('rejects a 91-day-old token', () => {
    const token = issueSuggestedCandidatesUnsubscribeToken('member-1', Date.now() - 91 * DAY_MS);
    expect(() => verifySuggestedCandidatesUnsubscribeToken(token)).toThrow(/expired/i);
  });

  it('rejects malformed input', () => {
    expect(() => verifySuggestedCandidatesUnsubscribeToken('nope')).toThrow(/malformed/i);
    expect(() => verifySuggestedCandidatesUnsubscribeToken('v2.a.b')).toThrow(/version/i);
  });

  it('throws when the secret is missing', () => {
    delete process.env.SUGGESTED_CANDIDATES_TOKEN_SECRET;
    expect(() => issueSuggestedCandidatesUnsubscribeToken('member-1')).toThrow(/SUGGESTED_CANDIDATES_TOKEN_SECRET/);
  });
});
