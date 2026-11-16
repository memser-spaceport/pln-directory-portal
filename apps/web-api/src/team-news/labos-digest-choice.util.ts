/**
 * The preference maths behind "More like this", "Less like this" and Undo on the digest page (LAB-3263).
 * Pure: the service reads the member's stored lists under a row lock, calls these, and writes the result.
 */

/** What is stored now: `undefined` means the key is absent from `Member.preferences`. */
export type StoredNewsLists = { newsTags: string[] | undefined; muted: string[] | undefined };

export type NewsLists = { newsTags: string[]; muted: string[] };

export type ChoiceDelta = {
  addedTags: string[];
  removedTags: string[];
  mutedAdded: string[];
  mutedRemoved: string[];
};

export type AppliedChoice = { after: NewsLists; delta: ChoiceDelta; changed: boolean };

const without = (list: string[], drop: Iterable<string>): string[] => {
  const dropSet = new Set(drop);
  return list.filter((tag) => !dropSet.has(tag));
};

const union = (list: string[], add: Iterable<string>): string[] => {
  const result = [...list];
  for (const tag of add) if (!result.includes(tag)) result.push(tag);
  return result;
};

const sameList = (a: string[] | undefined, b: string[] | undefined): boolean =>
  (a === undefined && b === undefined) ||
  (a !== undefined && b !== undefined && a.length === b.length && a.every((tag, i) => tag === b[i]));

/** The story's tags that are focus-area slugs, de-duplicated, in story order. */
export function storyFocusTags(tags: string[] | null | undefined, isFocusArea: (slug: string) => boolean): string[] {
  return [...new Set((tags ?? []).map((tag) => tag.trim().toLowerCase()).filter(isFocusArea))];
}

/**
 * Applies More or Less to the stored lists. The base is the saved news tags, or the starting tags (minus muted)
 * when the member has none saved; the result is always written as an explicit list.
 */
export function applyChoice(
  stored: StoredNewsLists,
  startingTags: string[],
  storyTags: string[],
  choice: 'more' | 'less'
): AppliedChoice {
  const mutedBefore = stored.muted ?? [];
  const hasSaved = (stored.newsTags ?? []).length > 0;
  const base = hasSaved ? (stored.newsTags as string[]) : without(startingTags, mutedBefore);

  const after: NewsLists =
    choice === 'more'
      ? { newsTags: union(base, storyTags), muted: without(mutedBefore, storyTags) }
      : { newsTags: without(base, storyTags), muted: union(mutedBefore, storyTags) };

  const storedTags = stored.newsTags ?? [];
  const delta: ChoiceDelta = {
    addedTags: without(after.newsTags, storedTags),
    removedTags: without(storedTags, after.newsTags),
    mutedAdded: without(after.muted, mutedBefore),
    mutedRemoved: without(mutedBefore, after.muted),
  };
  const changed =
    delta.addedTags.length + delta.removedTags.length + delta.mutedAdded.length + delta.mutedRemoved.length > 0;
  return { after, delta, changed };
}

/**
 * Undoes one choice. When the stored lists are still exactly what the choice left, the lists from before the
 * choice come back as they were, including an absent key. Otherwise only the choice's own delta is reverted,
 * so later changes stay.
 */
export function undoChoice(
  current: StoredNewsLists,
  recorded: { before: StoredNewsLists; after: NewsLists; delta: ChoiceDelta }
): StoredNewsLists {
  if (sameList(current.newsTags, recorded.after.newsTags) && sameList(current.muted, recorded.after.muted)) {
    return { newsTags: recorded.before.newsTags, muted: recorded.before.muted };
  }
  const newsTags = union(without(current.newsTags ?? [], recorded.delta.addedTags), recorded.delta.removedTags);
  const muted = union(without(current.muted ?? [], recorded.delta.mutedAdded), recorded.delta.mutedRemoved);
  return { newsTags, muted };
}

/** Reads a `before*` / `after*` JSON column back into a list, or `undefined` for null. */
export function jsonToList(value: unknown): string[] | undefined {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : undefined;
}
