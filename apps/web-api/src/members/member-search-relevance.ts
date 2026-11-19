/**
 * The search rank tiers of LAB-1277, shared by the member search (`MembersService.searchMembers`) and the LabOS agent
 * mention picker (LAB-3318, contract 10.2.1).
 *
 * - 100: the name is the search term (case-insensitive).
 * - 80: the name starts with the term.
 * - 60: a word in the name starts with the term (e.g. "John RG Smith" matches "RG").
 * - 40: the name contains the term.
 * - 20: one of the extra names (for example a team name) contains the term.
 * - 0: no match.
 *
 * The term is escaped before it goes into the word-prefix regular expression.
 */
export function searchRelevanceScore(
  text: string | null | undefined,
  searchTerm: string,
  extraNames: Array<string | null | undefined> = []
): number {
  const search = searchTerm.toLowerCase();
  const name = (text || '').toLowerCase();

  if (name === search) return 100;
  if (name.startsWith(search)) return 80;

  const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const wordBoundaryRegex = new RegExp(`\\b${escapedSearch}`, 'i');
  if (wordBoundaryRegex.test(text || '')) return 60;

  if (name.includes(search)) return 40;

  const others = extraNames.map((item) => item?.toLowerCase() || '');
  if (others.some((item) => item.includes(search))) return 20;

  return 0;
}
