/**
 * When the next LabOS digest goes out (LAB-3288), for "You're all caught up" on the digest page.
 *
 * Mirrors the cron jobs in pl-notification-service `apps/request-receiver/src/forum-digest/forum-digest.jobs.ts`:
 * the daily digest every day at 11:00 UTC, the weekly digest on Wednesdays at 11:00 UTC. Change both together.
 */
export const DIGEST_SEND_HOUR_UTC = 11;
/** 0 = Sunday, as in cron and `Date.getUTCDay()`. */
export const WEEKLY_DIGEST_DAY_UTC = 3;

/** The first send of `frequency` strictly after `now`. */
export function nextDigestSendAt(frequency: 'daily' | 'weekly', now: Date): Date {
  const next = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), DIGEST_SEND_HOUR_UTC, 0, 0, 0)
  );
  if (frequency === 'weekly') {
    next.setUTCDate(next.getUTCDate() + ((WEEKLY_DIGEST_DAY_UTC - next.getUTCDay() + 7) % 7));
  }
  if (next.getTime() <= now.getTime()) next.setUTCDate(next.getUTCDate() + (frequency === 'weekly' ? 7 : 1));
  return next;
}
