import { selectForYouNewsItems } from './select-for-you-news-items';

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
