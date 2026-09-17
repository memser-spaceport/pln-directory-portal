import { JobOpeningStatus } from '@prisma/client';
import { isVisibleStatus, resolvePublishedAt } from './job-opening-visibility';

const NOW = new Date('2026-03-01T00:00:00.000Z');

describe('isVisibleStatus', () => {
  it('treats NEW, CONFIRMED and ROUTED_TO_WS4 as visible', () => {
    for (const s of [JobOpeningStatus.NEW, JobOpeningStatus.CONFIRMED, JobOpeningStatus.ROUTED_TO_WS4]) {
      expect(isVisibleStatus(s)).toBe(true);
    }
  });

  it('treats STALE and every CLOSED_* status as hidden, and null as hidden', () => {
    for (const s of [
      JobOpeningStatus.STALE,
      JobOpeningStatus.CLOSED_DUPLICATE,
      JobOpeningStatus.CLOSED_INCORRECT_SIGNAL,
      JobOpeningStatus.CLOSED_NOT_HIRING_SIGNAL,
      JobOpeningStatus.CLOSED_ROLE_FILLED,
    ]) {
      expect(isVisibleStatus(s)).toBe(false);
    }
    expect(isVisibleStatus(null)).toBe(false);
    expect(isVisibleStatus(undefined)).toBe(false);
  });
});

describe('resolvePublishedAt', () => {
  it('stamps now when a row is created visible', () => {
    expect(resolvePublishedAt(null, JobOpeningStatus.CONFIRMED, NOW)).toBe(NOW);
  });

  it('stores null when a row is created hidden', () => {
    expect(resolvePublishedAt(null, JobOpeningStatus.STALE, NOW)).toBeNull();
  });

  it('stamps now on a hidden to visible transition', () => {
    expect(resolvePublishedAt(JobOpeningStatus.STALE, JobOpeningStatus.CONFIRMED, NOW)).toBe(NOW);
    expect(resolvePublishedAt(JobOpeningStatus.CLOSED_ROLE_FILLED, JobOpeningStatus.NEW, NOW)).toBe(NOW);
  });

  it('leaves publishedAt alone on visible to visible', () => {
    expect(resolvePublishedAt(JobOpeningStatus.NEW, JobOpeningStatus.CONFIRMED, NOW)).toBeUndefined();
  });

  it('leaves publishedAt alone on visible to hidden', () => {
    expect(resolvePublishedAt(JobOpeningStatus.CONFIRMED, JobOpeningStatus.STALE, NOW)).toBeUndefined();
  });

  it('leaves publishedAt alone on hidden to hidden', () => {
    expect(resolvePublishedAt(JobOpeningStatus.STALE, JobOpeningStatus.CLOSED_ROLE_FILLED, NOW)).toBeUndefined();
  });
});
