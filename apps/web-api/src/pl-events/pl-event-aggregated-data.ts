const LOCATION_EVENT_LISTS = ['events', 'pastEvents', 'upcomingEvents'] as const;

type LocationRecord = { subscribers?: unknown };

type AggregatedData = { locations?: LocationRecord[] | null };

/**
 * Signed-out location lists (`GET /v1/irl/aggregated-data` and `GET /v1/home/featured`)
 * drop follower members and guest members. An empty `subscribers` list is what the
 * location card reads, so it shows Follow with no count and no faces.
 * A signed-in caller gets the payload unchanged. The internal route does not call this.
 */
export function presentAggregatedData<T extends AggregatedData>(data: T, loggedInMember: unknown): T;
export function presentAggregatedData<T extends AggregatedData>(
  data: T | null | undefined,
  loggedInMember: unknown
): T | null | undefined;
export function presentAggregatedData<T extends AggregatedData>(
  data: T | null | undefined,
  loggedInMember: unknown
): T | null | undefined {
  if (loggedInMember || !data?.locations) {
    return data;
  }
  return {
    ...data,
    locations: data.locations.map(withoutLocationMembers),
  };
}

function withoutLocationMembers<T extends LocationRecord>(location: T): T {
  const next = { ...location, subscribers: [] } as T & Record<(typeof LOCATION_EVENT_LISTS)[number], unknown>;
  for (const key of LOCATION_EVENT_LISTS) {
    const events = next[key];
    if (!Array.isArray(events)) continue;
    next[key] = events.map(withoutEventGuestMembers);
  }
  return next;
}

function withoutEventGuestMembers(event: unknown): unknown {
  if (!event || typeof event !== 'object' || !Array.isArray((event as { eventGuests?: unknown }).eventGuests)) {
    return event;
  }
  return { ...(event as Record<string, unknown>), eventGuests: [] };
}
