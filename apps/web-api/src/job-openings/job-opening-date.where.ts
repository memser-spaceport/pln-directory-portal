import { Prisma } from '@prisma/client';
import { resolveDateWindowCutoff } from '../shared/date-window';

/**
 * Filter by the same display date used for sort=newest:
 * postedDate ?? detectionDate.
 */
export function buildJobOpeningDateWhere(
  query: { since?: string; windowDays?: number },
  nowMs: number = Date.now()
): Prisma.JobOpeningWhereInput | null {
  const cutoff = resolveDateWindowCutoff(query, nowMs);
  if (!cutoff) {
    return null;
  }

  return {
    OR: [{ postedDate: { gte: cutoff } }, { AND: [{ postedDate: null }, { detectionDate: { gte: cutoff } }] }],
  };
}
