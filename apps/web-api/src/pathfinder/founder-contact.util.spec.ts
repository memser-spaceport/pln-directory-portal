import { Prisma } from '@prisma/client';
import {
  founderBrokerNameSql,
  founderBrokerPresentClause,
  founderIdentityMatchClause,
} from './founder-contact.util';

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

describe('founder-contact.util', () => {
  it('extracts broker name from f_* hop nodes before connectorTeam', () => {
    const text = sqlText(founderBrokerNameSql());
    expect(text).toContain("'nodes'");
    expect(text).toContain("LIKE 'f_%'");
    expect(text).toContain('connectorTeam');
  });

  it('matches founder names on broker label not contact.name', () => {
    const text = sqlText(founderIdentityMatchClause([], ['henri stern']));
    expect(text).toContain('henri stern');
    expect(text).not.toContain("->'contact'");
  });

  it('requires a resolvable broker for founder filter presence', () => {
    const text = sqlText(founderBrokerPresentClause());
    expect(text).toContain("'nodes'");
    expect(text).toContain('connectorTeam');
  });
});
