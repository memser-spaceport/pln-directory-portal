import { issueJobAlertToken, verifyJobAlertToken } from './job-alerts-token.util';

describe('job-alerts-token.util', () => {
  const ORIGINAL_SECRET = process.env.JOB_ALERTS_TOKEN_SECRET;

  beforeAll(() => {
    process.env.JOB_ALERTS_TOKEN_SECRET = 'test-secret-must-be-long-enough-32chars';
  });

  afterAll(() => {
    if (ORIGINAL_SECRET === undefined) delete process.env.JOB_ALERTS_TOKEN_SECRET;
    else process.env.JOB_ALERTS_TOKEN_SECRET = ORIGINAL_SECRET;
  });

  it('round-trips a valid unsubscribe token', () => {
    const token = issueJobAlertToken({ purpose: 'unsubscribe', alertUid: 'alert-1' });
    const payload = verifyJobAlertToken(token, 'unsubscribe');
    expect(payload.alertUid).toBe('alert-1');
    expect(payload.purpose).toBe('unsubscribe');
  });

  it('round-trips a redirect token with jobUid + applyUrl', () => {
    const token = issueJobAlertToken({
      purpose: 'redirect',
      alertUid: 'alert-1',
      jobUid: 'job-2',
      applyUrl: 'https://example.com/apply',
    });
    const payload = verifyJobAlertToken(token, 'redirect');
    expect(payload.jobUid).toBe('job-2');
    expect(payload.applyUrl).toBe('https://example.com/apply');
  });

  it('rejects a wrong-purpose token', () => {
    const token = issueJobAlertToken({ purpose: 'unsubscribe', alertUid: 'alert-1' });
    expect(() => verifyJobAlertToken(token, 'redirect')).toThrow(/purpose/i);
  });

  it('rejects a tampered signature', () => {
    const token = issueJobAlertToken({ purpose: 'unsubscribe', alertUid: 'alert-1' });
    const parts = token.split('.');
    parts[2] = parts[2].slice(0, -1) + (parts[2].slice(-1) === 'a' ? 'b' : 'a');
    const tampered = parts.join('.');
    expect(() => verifyJobAlertToken(tampered, 'unsubscribe')).toThrow(/signature/i);
  });

  it('rejects a tampered body', () => {
    const original = issueJobAlertToken({ purpose: 'unsubscribe', alertUid: 'alert-1' });
    const otherToken = issueJobAlertToken({ purpose: 'unsubscribe', alertUid: 'alert-evil' });
    const [v, , sig] = original.split('.');
    const [, otherBody] = otherToken.split('.');
    const swapped = `${v}.${otherBody}.${sig}`;
    expect(() => verifyJobAlertToken(swapped, 'unsubscribe')).toThrow(/signature/i);
  });

  it('rejects an expired token', () => {
    const token = issueJobAlertToken({ purpose: 'unsubscribe', alertUid: 'alert-1' });
    expect(() => verifyJobAlertToken(token, 'unsubscribe', -1)).toThrow(/expired/i);
  });

  it('rejects a malformed token', () => {
    expect(() => verifyJobAlertToken('not-a-token', 'unsubscribe')).toThrow(/malformed/i);
    expect(() => verifyJobAlertToken('a.b', 'unsubscribe')).toThrow(/malformed/i);
  });

  it('rejects an unsupported version', () => {
    const token = issueJobAlertToken({ purpose: 'unsubscribe', alertUid: 'alert-1' });
    const parts = token.split('.');
    parts[0] = 'v999';
    expect(() => verifyJobAlertToken(parts.join('.'), 'unsubscribe')).toThrow(/version/i);
  });
});
