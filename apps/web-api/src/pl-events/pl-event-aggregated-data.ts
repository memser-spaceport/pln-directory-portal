type LocationWithSubscribers = { subscribers?: unknown };

/**
 * Signed-out `GET /v1/irl/aggregated-data` keeps one entry per subscriber so the
 * events cards can still show the count, and drops every member uid, name and photo.
 */
export function withoutSubscriberMembers<T extends LocationWithSubscribers>(locations: T[]): T[] {
  return locations.map((location) => ({
    ...location,
    subscribers: blankSubscribers(location.subscribers),
  }));
}

export function presentAggregatedData<T extends { locations?: LocationWithSubscribers[] } | undefined>(
  data: T,
  loggedInMember: unknown
): T {
  if (loggedInMember || !data?.locations) {
    return data;
  }
  return {
    ...data,
    locations: withoutSubscriberMembers(data.locations),
  };
}

function blankSubscribers(subscribers: unknown): Record<string, never>[] {
  const count = Array.isArray(subscribers) ? subscribers.length : 0;
  return Array.from({ length: count }, () => ({}));
}
