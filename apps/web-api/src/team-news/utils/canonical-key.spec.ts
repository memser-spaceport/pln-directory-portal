import { computeCanonicalKey } from './canonical-key';

describe('computeCanonicalKey', () => {
  const teamUid = 'team-123';
  const date = new Date('2026-04-16T00:00:00Z');

  it('produces a stable hex digest', () => {
    const key = computeCanonicalKey(teamUid, 'https://example.com/post', date);
    expect(key).toMatch(/^[a-f0-9]{64}$/);
    expect(key).toBe(computeCanonicalKey(teamUid, 'https://example.com/post', date));
  });

  it('treats different query strings on the same article as the same key', () => {
    const a = computeCanonicalKey(teamUid, 'https://example.com/x?utm=tw', date);
    const b = computeCanonicalKey(teamUid, 'https://example.com/x?utm=fb', date);
    expect(a).toBe(b);
  });

  it('treats different host casing as the same key', () => {
    const a = computeCanonicalKey(teamUid, 'https://Example.COM/x', date);
    const b = computeCanonicalKey(teamUid, 'https://example.com/x', date);
    expect(a).toBe(b);
  });

  it('treats trailing-slash variants as the same key', () => {
    const a = computeCanonicalKey(teamUid, 'https://example.com/x/', date);
    const b = computeCanonicalKey(teamUid, 'https://example.com/x', date);
    expect(a).toBe(b);
  });

  it('changes when the team changes', () => {
    const a = computeCanonicalKey('team-a', 'https://example.com/x', date);
    const b = computeCanonicalKey('team-b', 'https://example.com/x', date);
    expect(a).not.toBe(b);
  });

  it('changes when the day changes', () => {
    const a = computeCanonicalKey(teamUid, 'https://example.com/x', new Date('2026-04-15T00:00:00Z'));
    const b = computeCanonicalKey(teamUid, 'https://example.com/x', new Date('2026-04-16T00:00:00Z'));
    expect(a).not.toBe(b);
  });

  it('ignores time-of-day on the same date', () => {
    const morning = new Date('2026-04-16T01:00:00Z');
    const evening = new Date('2026-04-16T22:30:00Z');
    expect(computeCanonicalKey(teamUid, 'https://example.com/x', morning)).toBe(
      computeCanonicalKey(teamUid, 'https://example.com/x', evening)
    );
  });
});
