import { Prisma } from '@prisma/client';
import { hasPathSourceFilter, parsePathSource, pathSourceMatchClause } from './path-source-match.util';

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

describe('path-source-match.util', () => {
  describe('parsePathSource', () => {
    it('returns null when absent or blank', () => {
      expect(parsePathSource(undefined)).toBeNull();
      expect(parsePathSource(null)).toBeNull();
      expect(parsePathSource('')).toBeNull();
      expect(parsePathSource('  ')).toBeNull();
    });

    it('normalizes affinity and linkedin', () => {
      expect(parsePathSource('affinity')).toBe('affinity');
      expect(parsePathSource('Affinity')).toBe('affinity');
      expect(parsePathSource('LINKEDIN')).toBe('linkedin');
      expect(parsePathSource(' linkedin ')).toBe('linkedin');
    });

    it('rejects unknown values', () => {
      expect(parsePathSource('twitter')).toBeNull();
      expect(parsePathSource('affinity,linkedin')).toBeNull();
    });
  });

  describe('hasPathSourceFilter', () => {
    it('is false for null and true for a parsed source', () => {
      expect(hasPathSourceFilter(null)).toBe(false);
      expect(hasPathSourceFilter('affinity')).toBe(true);
      expect(hasPathSourceFilter('linkedin')).toBe(true);
    });
  });

  describe('pathSourceMatchClause', () => {
    it('matches Affinity via attributionLines source', () => {
      const text = sqlText(pathSourceMatchClause('affinity'));
      expect(text).toContain('attributionLines');
      expect(text).toContain('Affinity');
      expect(text).not.toContain('socialOverlap');
    });

    it('matches LinkedIn via attributionLines or socialOverlap', () => {
      const text = sqlText(pathSourceMatchClause('linkedin'));
      expect(text).toContain('attributionLines');
      expect(text).toContain('LinkedIn');
      expect(text).toContain('socialOverlap');
    });
  });
});
