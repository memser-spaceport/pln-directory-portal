import { Prisma } from '@prisma/client';
import { pathKeywordMatchClause, pathKeywordTokenClause, tokenizeKeywordQuery } from './path-keyword-search.util';

function sqlText(fragment: Prisma.Sql): string {
  const parts: string[] = [];
  const walk = (sql: Prisma.Sql) => {
    const strings = (sql as { strings?: string[] }).strings ?? [];
    const values = (sql as { values?: unknown[] }).values ?? [];
    strings.forEach((s, i) => {
      parts.push(s);
      const v = values[i];
      if (v && typeof v === 'object' && 'strings' in v) walk(v as Prisma.Sql);
      else if (v != null) parts.push(String(v));
    });
  };
  walk(fragment);
  return parts.join('');
}

describe('path-keyword-search.util', () => {
  describe('tokenizeKeywordQuery', () => {
    it('splits on whitespace and lowercases', () => {
      expect(tokenizeKeywordQuery('  Alicia   Mer  ')).toEqual(['alicia', 'mer']);
    });

    it('returns empty for blank input', () => {
      expect(tokenizeKeywordQuery('   ')).toEqual([]);
    });
  });

  describe('pathKeywordTokenClause', () => {
    it('matches contact name and team names', () => {
      const text = sqlText(pathKeywordTokenClause('modular'));
      expect(text).toContain('contact');
      expect(text).toContain('teams');
      expect(text).toContain('%modular%');
    });
  });

  describe('pathKeywordMatchClause', () => {
    it('AND-composes multiple tokens', () => {
      const text = sqlText(pathKeywordMatchClause(['alicia', 'mer']));
      expect(text).toContain('alicia');
      expect(text).toContain('mer');
    });

    it('throws for empty token list', () => {
      expect(() => pathKeywordMatchClause([])).toThrow();
    });
  });
});
