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

/**
 * For You by news tags (LAB-2999): stories from the member's own or followed
 * teams, plus stories sharing any of their tags, then the latest story per team.
 * `tags` holds focus-area slugs only, so a legacy verb tag (`launch`) never matches.
 * `categories` (LAB-3140) also keeps a story whose category the member picked.
 * An empty set adds nothing.
 */
export function selectNewsItemsByTagsAndTeams<
  T extends { teamUid: string; eventDate: string; createdAt: string; tags?: string[] | null; eventType?: string | null }
>(
  items: T[],
  ownTeamUids: ReadonlySet<string>,
  tags: ReadonlySet<string>,
  categories: ReadonlySet<string> = new Set()
): T[] {
  const matched = items.filter(
    (item) =>
      ownTeamUids.has(item.teamUid) ||
      (item.tags ?? []).some((tag) => tags.has(tag.trim().toLowerCase())) ||
      (categories.size > 0 && !!item.eventType && categories.has(item.eventType))
  );
  return selectForYouNewsItems(matched, new Set(matched.map((item) => item.teamUid)));
}

/**
 * Drops stories that carry one of the member's muted tags (LAB-3263), except
 * stories from a team the member belongs to or follows.
 */
export function skipMutedNewsItems<T extends { teamUid: string; tags?: string[] | null }>(
  items: T[],
  ownTeamUids: ReadonlySet<string>,
  mutedTags: ReadonlySet<string>
): T[] {
  if (mutedTags.size === 0) return items;
  return items.filter(
    (item) => ownTeamUids.has(item.teamUid) || !(item.tags ?? []).some((tag) => mutedTags.has(tag.trim().toLowerCase()))
  );
}
