/**
 * The weight maths behind "More like this", "Less like this" and Undo on the digest page (LAB-3263).
 *
 * A choice moves the member's interest profile `TOPIC` weights for the story's focus-area tags: More adds one step,
 * Less takes one step off, never below 0. It never changes the member's saved news tags. Pure: the page service reads
 * the weights under a row lock, calls these and writes the result; the daily profile rebuild calls
 * `digestChoiceTopicDeltas` to keep active choices in the rebuilt profile.
 */

/** Topic weights, focus-area slug → score. A missing slug is 0 (the profile stores no row below its minimum). */
export type TopicWeights = Record<string, number>;

export type DigestChoiceValue = 'more' | 'less';

/** Two weights closer than this are the same (the rebuild rounds scores to 4 decimals). */
const EPSILON = 0.0001;

const round = (score: number) => Math.round(score * 10000) / 10000;

const weightOf = (weights: TopicWeights, slug: string) => weights[slug] ?? 0;

/** The story's tags that are focus-area slugs, de-duplicated, in story order. */
export function storyFocusTags(tags: string[] | null | undefined, isFocusArea: (slug: string) => boolean): string[] {
  return [...new Set((tags ?? []).map((tag) => tag.trim().toLowerCase()).filter(isFocusArea))];
}

/** The weights of `topics` after one press: + step for More, - step for Less, never below 0. */
export function applyChoiceToWeights(
  current: TopicWeights,
  topics: string[],
  choice: DigestChoiceValue,
  step: number
): TopicWeights {
  const delta = choice === 'more' ? step : -step;
  return Object.fromEntries(topics.map((slug) => [slug, round(Math.max(0, weightOf(current, slug) + delta))]));
}

/**
 * Undoes one choice, topic by topic. A weight that is still what the choice left goes back to what it was before.
 * A weight that changed since (a later choice, or the daily rebuild) loses only this choice's own change, so later
 * changes stay. Never below 0.
 */
export function undoChoiceWeights(current: TopicWeights, before: TopicWeights, after: TopicWeights): TopicWeights {
  const slugs = new Set([...Object.keys(before), ...Object.keys(after)]);
  return Object.fromEntries(
    [...slugs].map((slug) => {
      const now = weightOf(current, slug);
      const left = weightOf(after, slug);
      if (Math.abs(now - left) < EPSILON) return [slug, weightOf(before, slug)];
      return [slug, round(Math.max(0, now - (left - weightOf(before, slug))))];
    })
  );
}

/**
 * What the active choices add to each topic in the daily rebuild: + step per More, - step per Less, no decay.
 * The rebuild adds these to the built scores and keeps each score at 0 or more.
 */
export function digestChoiceTopicDeltas(
  choices: { choice: 'MORE' | 'LESS'; tags: string[] | null | undefined }[],
  isFocusArea: (slug: string) => boolean,
  step: number
): Map<string, number> {
  const deltas = new Map<string, number>();
  for (const { choice, tags } of choices) {
    const delta = choice === 'MORE' ? step : -step;
    for (const slug of storyFocusTags(tags, isFocusArea)) deltas.set(slug, (deltas.get(slug) ?? 0) + delta);
  }
  return deltas;
}

/** Reads a stored `beforeWeights` / `afterWeights` JSON object, or undefined for rows saved before weights. */
export function jsonToWeights(value: unknown): TopicWeights | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).filter(
      (entry): entry is [string, number] => typeof entry[1] === 'number' && Number.isFinite(entry[1])
    )
  );
}

/** True when the two weight maps differ on any slug. */
export function weightsDiffer(a: TopicWeights, b: TopicWeights): boolean {
  const slugs = new Set([...Object.keys(a), ...Object.keys(b)]);
  return [...slugs].some((slug) => Math.abs(weightOf(a, slug) - weightOf(b, slug)) >= EPSILON);
}
