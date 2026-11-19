import { searchRelevanceScore } from './member-search-relevance';

// S6-C19 (LAB-3318): the LAB-1277 tiers, moved from MembersService.calculateSearchRelevanceScore with no change.
describe('searchRelevanceScore (LAB-1277 tiers)', () => {
  it.each([
    ['exact, case-insensitive', 'ADA', 'ada', [], 100],
    ['name prefix', 'Adams', 'ada', [], 80],
    ['word prefix', 'Grace Ada Hopper', 'ada', [], 60],
    ['contains', 'Nadal', 'ada', [], 40],
    ['extra name contains', 'Zed', 'ada', ['Adalab'], 20],
    ['no match', 'Zed', 'ada', ['Acme'], 0],
  ])('%s gives %s', (_name, text, term, extra, score) => {
    expect(searchRelevanceScore(text, term, extra as string[])).toBe(score);
  });

  it('escapes the term for the word-prefix regular expression', () => {
    expect(() => searchRelevanceScore('Ann (C++) Lee', '(c++')).not.toThrow();
    expect(searchRelevanceScore('Ann (C++) Lee', '(c++)')).toBe(40);
    expect(searchRelevanceScore('a.b', '.')).toBe(60);
    expect(searchRelevanceScore('axb', '.')).toBe(0);
  });

  it('treats a null name and null extra names as empty', () => {
    expect(searchRelevanceScore(null, 'ada', [null, undefined])).toBe(0);
    expect(searchRelevanceScore(undefined, 'ada', [null, 'Ada team'])).toBe(20);
  });

  it('a name tier wins over the extra-name tier', () => {
    expect(searchRelevanceScore('Ada', 'ada', ['Ada team'])).toBe(100);
  });

  it('gives the same score as the old MembersService.calculateSearchRelevanceScore', () => {
    // A copy of the code before LAB-3318, to prove that the members search order did not change.
    const oldScore = (
      member: { name?: string; teamMemberRoles?: Array<{ team?: { name?: string } }> },
      term: string
    ) => {
      const search = term.toLowerCase();
      const name = (member.name || '').toLowerCase();
      if (name === search) return 100;
      if (name.startsWith(search)) return 80;
      const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (new RegExp(`\\b${escapedSearch}`, 'i').test(member.name || '')) return 60;
      if (name.includes(search)) return 40;
      const teamNames = member.teamMemberRoles?.map((t) => t.team?.name?.toLowerCase() || '') || [];
      if (teamNames.some((tn) => tn.includes(search))) return 20;
      return 0;
    };
    const names = ['Ada', 'Ada Lovelace', 'Grace Ada', 'Nadal', 'Zed', '', 'a.b', 'Ann (C++) Lee'];
    const terms = ['ada', 'ADA', 'zed', 'lab', '.', '(c++', 'a'];
    const teams = [undefined, [], [{ team: { name: 'Ada Lab' } }], [{ team: {} }, { team: { name: 'Zed Co' } }]];
    for (const name of names) {
      for (const term of terms) {
        for (const teamMemberRoles of teams) {
          const member = { name, teamMemberRoles };
          expect(
            searchRelevanceScore(
              member.name,
              term,
              teamMemberRoles?.map((t) => t.team?.name)
            )
          ).toBe(oldScore(member, term));
        }
      }
    }
  });
});
