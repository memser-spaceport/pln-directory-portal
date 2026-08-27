/** Latest story per For You team (eventDate, then createdAt). Mirrors portal-v2 `selectForYouItems`. */
export function selectForYouNewsItems<T extends { teamUid: string; eventDate: string; createdAt: string }>(
  items: T[],
  teamUids: ReadonlySet<string>
): T[] {
  if (teamUids.size === 0) return [];

  const selected: T[] = [];
  const seen = new Set<string>();
  const ranked = items
    .filter((item) => teamUids.has(item.teamUid))
    .slice()
    .sort((a, b) => {
      const byEventDate = b.eventDate.localeCompare(a.eventDate);
      if (byEventDate !== 0) return byEventDate;
      return b.createdAt.localeCompare(a.createdAt);
    });

  for (const item of ranked) {
    if (seen.has(item.teamUid)) continue;
    seen.add(item.teamUid);
    selected.push(item);
  }
  return selected;
}
