import { applyChoice, storyFocusTags, undoChoice } from './labos-digest-choice.util';

/** LAB-3263: More / Less like this on the digest page, and Undo. */
describe('storyFocusTags', () => {
  it('keeps focus-area slugs only, lower-cased and de-duplicated', () => {
    const known = new Set(['ai', 'desci']);
    expect(storyFocusTags(['AI', 'funding', 'ai', ' desci '], (s) => known.has(s))).toEqual(['ai', 'desci']);
    expect(storyFocusTags(null, () => true)).toEqual([]);
  });
});

describe('applyChoice', () => {
  it('More adds the story tags to the saved tags and unmutes them', () => {
    const { after, delta, changed } = applyChoice({ newsTags: ['desci'], muted: ['ai', 'web3'] }, [], ['ai'], 'more');
    expect(after).toEqual({ newsTags: ['desci', 'ai'], muted: ['web3'] });
    expect(delta).toEqual({ addedTags: ['ai'], removedTags: [], mutedAdded: [], mutedRemoved: ['ai'] });
    expect(changed).toBe(true);
  });

  it('Less removes the story tags from the saved tags and mutes them', () => {
    const { after, delta } = applyChoice({ newsTags: ['ai', 'desci'], muted: undefined }, [], ['ai'], 'less');
    expect(after).toEqual({ newsTags: ['desci'], muted: ['ai'] });
    expect(delta).toEqual({ addedTags: [], removedTags: ['ai'], mutedAdded: ['ai'], mutedRemoved: [] });
  });

  it('starts from the starting tags, minus muted, for a member with no saved tags', () => {
    const { after } = applyChoice({ newsTags: undefined, muted: ['web3'] }, ['ai', 'web3', 'desci'], ['ai'], 'less');
    expect(after).toEqual({ newsTags: ['desci'], muted: ['web3', 'ai'] });
  });

  it('treats a saved empty list like no saved tags (LAB-3243)', () => {
    const { after } = applyChoice({ newsTags: [], muted: undefined }, ['desci'], ['ai'], 'more');
    expect(after.newsTags).toEqual(['desci', 'ai']);
  });

  it('reports no change for a story with no focus-area tag on an already explicit list', () => {
    expect(applyChoice({ newsTags: ['ai'], muted: [] }, [], [], 'less').changed).toBe(false);
  });
});

describe('undoChoice', () => {
  it('restores the lists from before, absent keys included, when nothing changed since', () => {
    const before = { newsTags: undefined, muted: undefined };
    const applied = applyChoice(before, ['ai', 'desci'], ['ai'], 'less');
    expect(undoChoice(applied.after, { before, ...applied })).toEqual(before);
  });

  it('reverts only its own delta when the lists changed since, keeping later changes', () => {
    const before = { newsTags: ['ai', 'desci'], muted: [] };
    const applied = applyChoice(before, [], ['ai'], 'less');
    // Later the member adds web3 on News preferences.
    const current = { newsTags: ['desci', 'web3'], muted: ['ai'] };
    expect(undoChoice(current, { before, ...applied })).toEqual({ newsTags: ['desci', 'web3', 'ai'], muted: [] });
  });

  it('switching More to Less on the same story ends with Less only', () => {
    const before = { newsTags: ['desci'], muted: [] };
    const more = applyChoice(before, [], ['ai'], 'more');
    const reverted = undoChoice(more.after, { before, ...more });
    const less = applyChoice(reverted, [], ['ai'], 'less');
    expect(less.after).toEqual({ newsTags: ['desci'], muted: ['ai'] });
  });
});
