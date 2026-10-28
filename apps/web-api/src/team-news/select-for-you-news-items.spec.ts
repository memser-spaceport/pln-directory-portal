import { selectForYouNewsItems, selectNewsItemsByTagsAndTeams } from './select-for-you-news-items';

const makeItem = (uid: string, teamUid: string, overrides: Partial<{ eventDate: string; createdAt: string }> = {}) => ({
  uid,
  teamUid,
  eventDate: overrides.eventDate ?? '2026-05-01T12:00:00.000Z',
  createdAt: overrides.createdAt ?? '2026-05-01T12:00:00.000Z',
});

describe('selectForYouNewsItems', () => {
  it('returns nothing when the team set is empty', () => {
    expect(selectForYouNewsItems([makeItem('a', 'team-a')], new Set())).toEqual([]);
  });

  it('drops teams that are not in the set', () => {
    const kept = makeItem('keep', 'team-keep');
    const dropped = makeItem('drop', 'team-drop');

    expect(selectForYouNewsItems([kept, dropped], new Set(['team-keep'])).map((i) => i.uid)).toEqual(['keep']);
  });

  it('keeps the latest item per team by eventDate then createdAt', () => {
    const olderDay = makeItem('old-day', 'team-a', { eventDate: '2026-04-01T12:00:00.000Z' });
    const sameDayEarlier = makeItem('same-early', 'team-a', { createdAt: '2026-05-01T10:00:00.000Z' });
    const sameDayLater = makeItem('same-late', 'team-a', { createdAt: '2026-05-01T18:00:00.000Z' });
    const otherTeam = makeItem('other', 'team-b');

    const selected = selectForYouNewsItems(
      [olderDay, sameDayEarlier, otherTeam, sameDayLater],
      new Set(['team-a', 'team-b'])
    );

    expect(selected.map((i) => i.uid)).toEqual(['same-late', 'other']);
  });
});

describe('selectNewsItemsByTagsAndTeams (LAB-2999)', () => {
  const item = (uid: string, teamUid: string, tags: string[], eventDate = '2026-05-01T12:00:00.000Z') => ({
    uid,
    teamUid,
    tags,
    eventDate,
    createdAt: eventDate,
  });

  it("keeps an own team's story with no matching tag, and a tag match from any team", () => {
    const picked = selectNewsItemsByTagsAndTeams(
      [item('own', 'team-own', ['launch']), item('ai', 'team-x', ['ai']), item('other', 'team-y', ['desci'])],
      new Set(['team-own']),
      new Set(['ai'])
    );
    expect(picked.map((i) => i.uid).sort()).toEqual(['ai', 'own']);
  });

  it('never matches on a legacy verb tag', () => {
    expect(selectNewsItemsByTagsAndTeams([item('v', 'team-x', ['launch'])], new Set(), new Set(['ai']))).toEqual([]);
  });

  it('keeps the latest story per team, newest first', () => {
    const picked = selectNewsItemsByTagsAndTeams(
      [
        item('old-x', 'team-x', ['ai'], '2026-05-01T10:00:00.000Z'),
        item('new-x', 'team-x', ['ai'], '2026-05-01T18:00:00.000Z'),
        item('y', 'team-y', ['ai'], '2026-05-01T14:00:00.000Z'),
      ],
      new Set(),
      new Set(['ai'])
    );
    expect(picked.map((i) => i.uid)).toEqual(['new-x', 'y']);
  });

  it('matches tags case-insensitively and ignores stray spaces', () => {
    expect(selectNewsItemsByTagsAndTeams([item('a', 'team-x', [' AI '])], new Set(), new Set(['ai']))).toHaveLength(1);
  });

  it('picks nothing with no own teams and no tags', () => {
    expect(selectNewsItemsByTagsAndTeams([item('a', 'team-x', ['ai'])], new Set(), new Set())).toEqual([]);
  });
});
