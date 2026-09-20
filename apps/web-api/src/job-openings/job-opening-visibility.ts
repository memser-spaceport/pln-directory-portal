import { JobOpeningStatus } from '@prisma/client';
import { HIDDEN_JOB_OPENING_STATUSES } from './job-openings-query.service';

/** A row is visible on the board when its status is outside the hidden set. */
export function isVisibleStatus(status: JobOpeningStatus | null | undefined): boolean {
  return status != null && !HIDDEN_JOB_OPENING_STATUSES.includes(status);
}

/**
 * Stamp rule for `publishedAt`, shared by the crawler ingest and the integration
 * routes: set when a row is created visible, and when an update takes it from
 * hidden to visible. `undefined` means "leave as is". `existingStatus` is null
 * for a row being created.
 */
export function resolvePublishedAt(
  existingStatus: JobOpeningStatus | null,
  nextStatus: JobOpeningStatus,
  now: Date
): Date | null | undefined {
  if (existingStatus === null) {
    return isVisibleStatus(nextStatus) ? now : null;
  }
  if (!isVisibleStatus(existingStatus) && isVisibleStatus(nextStatus)) {
    return now;
  }
  return undefined;
}
