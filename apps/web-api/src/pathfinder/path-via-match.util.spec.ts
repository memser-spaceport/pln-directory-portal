import { Prisma } from '@prisma/client';
import {
  directOnlyPathClause,
  hasPathViaFilters,
  pathViaMatchClause,
  type PathViaFilterInput,
} from './path-via-match.util';

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

describe('path-via-match.util', () => {
  describe('hasPathViaFilters', () => {
    const empty: PathViaFilterInput = {
      plMembers: [],
      founderUids: [],
      founderNames: [],
      anyFounder: false,
      directOnly: false,
    };

    it('returns false when no filters are active', () => {
      expect(hasPathViaFilters(empty)).toBe(false);
    });

    it('returns true when any filter is active', () => {
      expect(hasPathViaFilters({ ...empty, plMembers: ['brad holden'] })).toBe(true);
      expect(hasPathViaFilters({ ...empty, founderUids: ['alice'] })).toBe(true);
      expect(hasPathViaFilters({ ...empty, founderNames: ['temasek'] })).toBe(true);
      expect(hasPathViaFilters({ ...empty, anyFounder: true })).toBe(true);
      expect(hasPathViaFilters({ ...empty, directOnly: true })).toBe(true);
    });
  });

  describe('pathViaMatchClause', () => {
    it('matches PL member names on plConnector only', () => {
      const clause = pathViaMatchClause({
        plMembers: ['brad holden', 'marc johnson'],
        founderUids: [],
        founderNames: [],
        anyFounder: false,
        directOnly: false,
      });
      const text = sqlText(clause);
      expect(text).toContain('plConnector');
      expect(text).toContain('brad holden');
    });

    it('matches specific founder uids on connectorType F', () => {
      const clause = pathViaMatchClause({
        plMembers: [],
        founderUids: ['alicia-mer'],
        founderNames: [],
        anyFounder: false,
        directOnly: false,
      });
      const text = sqlText(clause);
      expect(text).toContain('connectorType');
      expect(text).toContain('F');
      expect(text).toContain('memberUid');
      expect(text).toContain('alicia-mer');
    });

    it('matches specific founder names on contact.name', () => {
      const clause = pathViaMatchClause({
        plMembers: [],
        founderUids: [],
        founderNames: ['temasek'],
        anyFounder: false,
        directOnly: false,
      });
      const text = sqlText(clause);
      expect(text).toContain('connectorType');
      expect(text).toContain("'nodes'");
      expect(text).toContain('temasek');
    });

    it('OR-composes multiple active filters', () => {
      const clause = pathViaMatchClause({
        plMembers: ['brad holden'],
        founderUids: [],
        founderNames: [],
        anyFounder: true,
        directOnly: false,
      });
      const text = sqlText(clause);
      expect(text).toContain('plConnector');
      expect(text).toContain('connectorType');
    });

    it('throws when no filters are active', () => {
      expect(() =>
        pathViaMatchClause({
          plMembers: [],
          founderUids: [],
          founderNames: [],
          anyFounder: false,
          directOnly: false,
        })
      ).toThrow();
    });
  });

  describe('directOnlyPathClause', () => {
    it('matches PL 1-hop paths and 2-node routeNodes chains', () => {
      const text = sqlText(directOnlyPathClause());
      expect(text).toContain('routeNodes');
      expect(text).toContain('connectorType');
      expect(text).toContain('hops');
      expect(text).toContain('= 2');
      expect(text).toContain('= 1');
      expect(text).toContain('plConnector');
    });
  });
});
