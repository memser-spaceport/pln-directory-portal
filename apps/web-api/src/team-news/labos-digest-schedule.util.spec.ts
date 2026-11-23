import { nextDigestSendAt } from './labos-digest-schedule.util';

/** LAB-3288: the next send, mirroring the notification service crons (daily 11:00 UTC, weekly Wednesday 11:00 UTC). */
describe('nextDigestSendAt', () => {
  const at = (iso: string) => new Date(iso);

  it('daily: today at 11:00 before 11:00, tomorrow from 11:00', () => {
    expect(nextDigestSendAt('daily', at('2026-11-17T10:59:00Z')).toISOString()).toBe('2026-11-17T11:00:00.000Z');
    expect(nextDigestSendAt('daily', at('2026-11-17T11:00:00Z')).toISOString()).toBe('2026-11-18T11:00:00.000Z');
  });

  it('weekly: the next Wednesday at 11:00', () => {
    // 2026-11-17 is a Tuesday.
    expect(nextDigestSendAt('weekly', at('2026-11-17T15:00:00Z')).toISOString()).toBe('2026-11-18T11:00:00.000Z');
    expect(nextDigestSendAt('weekly', at('2026-11-18T09:00:00Z')).toISOString()).toBe('2026-11-18T11:00:00.000Z');
    expect(nextDigestSendAt('weekly', at('2026-11-18T11:00:00Z')).toISOString()).toBe('2026-11-25T11:00:00.000Z');
    expect(nextDigestSendAt('weekly', at('2026-11-21T08:00:00Z')).toISOString()).toBe('2026-11-25T11:00:00.000Z');
  });

  it('weekly: crosses a month end', () => {
    expect(nextDigestSendAt('weekly', at('2026-11-26T12:00:00Z')).toISOString()).toBe('2026-12-02T11:00:00.000Z');
  });
});
