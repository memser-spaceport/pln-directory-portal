import { Prisma } from '@prisma/client';

interface Input<T> {
  tx: Prisma.TransactionClient;
  teamUid: string | null;
  data: T;
}

const dedupe = (values: string[]) => {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = value.toLowerCase();
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
};

const clean = (values: unknown[]) =>
  dedupe(
    values
      .filter((value): value is string => typeof value === 'string')
      .map((value) => value.trim())
      .filter(Boolean)
  );

/**
 * `Team.location` is the HQ and always equals `locations[0]`. A write that sends `locations` sets both; one that
 * sends only `location` (back-office, enrichment, frontends that predate the list) replaces the HQ and keeps the rest.
 */
export async function syncTeamLocations<T extends { location?: unknown; locations?: unknown }>(
  input: Input<T>
): Promise<T> {
  const { tx, teamUid, data } = input;

  if (Array.isArray(data.locations)) {
    const locations = clean(data.locations);
    return { ...data, locations, location: locations[0] ?? null };
  }

  if (data.location === undefined) {
    return data;
  }

  const current = teamUid
    ? (await tx.team.findUnique({ where: { uid: teamUid }, select: { locations: true } }))?.locations ?? []
    : [];
  const primary = typeof data.location === 'string' ? data.location.trim() : '';
  const locations = clean(primary ? [primary, ...current.slice(1)] : current.slice(1));
  return { ...data, locations, location: locations[0] ?? null };
}
