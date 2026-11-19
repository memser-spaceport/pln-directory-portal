import { PLEventStatus } from '@prisma/client';

/**
 * The one rule for which events a read may return (LAB-3281): approved and not deleted.
 *
 * Every read of `PLEvent` spreads this fragment into its `where`: the events list, upcoming events, gathering
 * events, the event read, home, the digest, AI search, MCP tools, profile events, recommendations and push
 * notifications. A read that must see other events (the submitter's own events, the sync, the write path) says why
 * in a `pl-event-visibility:` comment right above the call. `pl-event-visibility.spec.ts` scans the source and fails
 * for a `pLEvent` read that has neither.
 */
export const VISIBLE_PL_EVENT_WHERE: { status: 'APPROVED'; isDeleted: false } = {
  status: PLEventStatus.APPROVED,
  isDeleted: false,
};

/** The same rule for raw SQL, for the `"PLEvent"` alias given (`e` → `e."status" = 'APPROVED' AND e."isDeleted" = false`). */
export function visiblePLEventSql(alias: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(alias)) {
    throw new Error(`Invalid SQL alias: ${alias}`);
  }
  return `${alias}."status" = '${PLEventStatus.APPROVED}' AND ${alias}."isDeleted" = false`;
}

/**
 * Columns of an event that only its submitter, a directory admin and a curator read: who submitted it, the review
 * note and the private contact data. A read that returns whole `PLEvent` rows passes them through
 * `withoutPrivateEventFields`, so a new column here never reaches a public response by accident.
 */
export const PRIVATE_PL_EVENT_FIELDS = [
  'submitterUid',
  'sourceTeamUid',
  'reviewedAt',
  'reviewNote',
  'privateDetails',
] as const;

function looksLikeEvent(value: Record<string, unknown>): boolean {
  return 'slugURL' in value && 'startDate' in value;
}

/**
 * A copy of `value` with the private columns removed from every event row in it, however deep the row sits
 * (an event included under a guest, a gathering or an association). Dates and other class instances are kept as
 * they are.
 */
export function withoutPrivateEventFields<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => withoutPrivateEventFields(item)) as unknown as T;
  }
  if (value === null || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype) {
    return value;
  }
  const source = value as Record<string, unknown>;
  const isEvent = looksLikeEvent(source);
  const copy: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(source)) {
    if (isEvent && (PRIVATE_PL_EVENT_FIELDS as readonly string[]).includes(key)) continue;
    copy[key] = withoutPrivateEventFields(item);
  }
  return copy as T;
}
