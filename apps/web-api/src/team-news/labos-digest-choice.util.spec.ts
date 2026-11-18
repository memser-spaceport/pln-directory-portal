import {
  applyChoiceToWeights,
  digestChoiceTopicDeltas,
  jsonToWeights,
  storyFocusTags,
  undoChoiceWeights,
  weightsDiffer,
} from './labos-digest-choice.util';

/** LAB-3263: More / Less like this on the digest page move topic weights, and Undo. */
describe('storyFocusTags', () => {
  it('keeps focus-area slugs only, lower-cased and de-duplicated', () => {
    const known = new Set(['ai', 'desci']);
    expect(storyFocusTags(['AI', 'funding', 'ai', ' desci '], (s) => known.has(s))).toEqual(['ai', 'desci']);
    expect(storyFocusTags(null, () => true)).toEqual([]);
  });
});

describe('applyChoiceToWeights', () => {
  it('More adds one step to each story topic, including one with no weight yet', () => {
    expect(applyChoiceToWeights({ ai: 6 }, ['ai', 'desci'], 'more', 2)).toEqual({ ai: 8, desci: 2 });
  });

  it('Less takes one step off and never goes below 0', () => {
    expect(applyChoiceToWeights({ ai: 6, desci: 1 }, ['ai', 'desci', 'web3'], 'less', 2)).toEqual({
      ai: 4,
      desci: 0,
      web3: 0,
    });
  });

  it('a story with no focus-area tag changes nothing', () => {
    expect(applyChoiceToWeights({ ai: 6 }, [], 'less', 2)).toEqual({});
  });
});

describe('undoChoiceWeights', () => {
  it('restores the weights from before when nothing changed since, including a floored Less', () => {
    const before = { ai: 6, desci: 1 };
    const after = applyChoiceToWeights(before, ['ai', 'desci'], 'less', 2);
    expect(undoChoiceWeights({ ...before, ...after }, before, after)).toEqual(before);
  });

  it('removes only its own change when the weight moved since, keeping the later change', () => {
    const before = { ai: 6 };
    const after = applyChoiceToWeights(before, ['ai'], 'less', 2); // ai 4
    // The daily rebuild then puts ai at 4.5 (a new upvote).
    expect(undoChoiceWeights({ ai: 4.5 }, before, after)).toEqual({ ai: 6.5 });
  });

  it('switching More to Less on the same story ends one step below the start', () => {
    const start = { ai: 6 };
    const more = applyChoiceToWeights(start, ['ai'], 'more', 2);
    const reverted = undoChoiceWeights({ ...start, ...more }, start, more);
    expect(applyChoiceToWeights(reverted, ['ai'], 'less', 2)).toEqual({ ai: 4 });
  });
});

describe('digestChoiceTopicDeltas', () => {
  it('sums + step per More and - step per Less, on focus-area tags only', () => {
    const known = new Set(['ai', 'desci']);
    const deltas = digestChoiceTopicDeltas(
      [
        { choice: 'MORE', tags: ['AI', 'launch'] },
        { choice: 'MORE', tags: ['ai', 'desci'] },
        { choice: 'LESS', tags: ['desci'] },
      ],
      (s) => known.has(s),
      2
    );
    expect(Object.fromEntries(deltas)).toEqual({ ai: 4, desci: 0 });
  });
});

describe('jsonToWeights and weightsDiffer', () => {
  it('reads stored weights and ignores rows saved before weights', () => {
    expect(jsonToWeights({ ai: 2, bad: 'x' })).toEqual({ ai: 2 });
    expect(jsonToWeights(null)).toBeUndefined();
    expect(jsonToWeights(['ai'])).toBeUndefined();
  });

  it('treats a missing slug as 0', () => {
    expect(weightsDiffer({ ai: 0 }, {})).toBe(false);
    expect(weightsDiffer({ ai: 2 }, { ai: 2.00001 })).toBe(false);
    expect(weightsDiffer({ ai: 2 }, {})).toBe(true);
  });
});
