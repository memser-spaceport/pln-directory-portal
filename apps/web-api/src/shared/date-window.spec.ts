import { resolveDateWindowCutoff } from './date-window';

describe('resolveDateWindowCutoff', () => {
  const NOW = Date.parse('2026-08-05T12:00:00.000Z');

  it('returns null when neither since nor windowDays is set', () => {
    expect(resolveDateWindowCutoff({}, NOW)).toBeNull();
  });

  it('uses since when provided', () => {
    const since = '2026-07-22T00:00:00.000Z';
    expect(resolveDateWindowCutoff({ since, windowDays: 14 }, NOW)).toEqual(new Date(since));
  });

  it('ignores invalid since and falls back to windowDays', () => {
    expect(resolveDateWindowCutoff({ since: 'not-a-date', windowDays: 14 }, NOW)).toEqual(
      new Date(NOW - 14 * 24 * 60 * 60 * 1000)
    );
  });

  it('computes cutoff from windowDays', () => {
    expect(resolveDateWindowCutoff({ windowDays: 14 }, NOW)).toEqual(new Date('2026-07-22T12:00:00.000Z'));
  });

  it('accepts windowDays as a query string', () => {
    expect(resolveDateWindowCutoff({ windowDays: '7' }, NOW)).toEqual(new Date('2026-07-29T12:00:00.000Z'));
  });

  it('returns null for non-positive windowDays', () => {
    expect(resolveDateWindowCutoff({ windowDays: 0 }, NOW)).toBeNull();
    expect(resolveDateWindowCutoff({ windowDays: -3 }, NOW)).toBeNull();
  });
});
