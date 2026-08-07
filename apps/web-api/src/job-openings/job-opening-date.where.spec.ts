import { buildJobOpeningDateWhere } from './job-opening-date.where';

describe('buildJobOpeningDateWhere', () => {
  const NOW = Date.parse('2026-08-05T12:00:00.000Z');
  const cutoff = new Date('2026-07-22T12:00:00.000Z');

  it('returns null when no window is requested', () => {
    expect(buildJobOpeningDateWhere({}, NOW)).toBeNull();
  });

  it('filters by postedDate ?? detectionDate for windowDays', () => {
    expect(buildJobOpeningDateWhere({ windowDays: 14 }, NOW)).toEqual({
      OR: [{ postedDate: { gte: cutoff } }, { AND: [{ postedDate: null }, { detectionDate: { gte: cutoff } }] }],
    });
  });

  it('uses since when provided', () => {
    const since = '2026-07-01T00:00:00.000Z';
    expect(buildJobOpeningDateWhere({ since, windowDays: 14 }, NOW)).toEqual({
      OR: [
        { postedDate: { gte: new Date(since) } },
        {
          AND: [{ postedDate: null }, { detectionDate: { gte: new Date(since) } }],
        },
      ],
    });
  });
});
