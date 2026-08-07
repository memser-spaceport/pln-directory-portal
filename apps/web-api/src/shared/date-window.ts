const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Resolve an optional list date window.
 * - `since` (ISO) wins when parseable
 * - else `windowDays` > 0 → now − N days
 * - else null (no date filter)
 */
export function resolveDateWindowCutoff(
  query: { since?: string; windowDays?: number | string },
  nowMs: number = Date.now()
): Date | null {
  if (query.since) {
    const explicit = new Date(query.since);
    if (!Number.isNaN(explicit.getTime())) {
      return explicit;
    }
  }

  const days = typeof query.windowDays === 'string' ? Number(query.windowDays) : query.windowDays;

  if (typeof days === 'number' && Number.isFinite(days) && days > 0) {
    return new Date(nowMs - days * MS_PER_DAY);
  }

  return null;
}
