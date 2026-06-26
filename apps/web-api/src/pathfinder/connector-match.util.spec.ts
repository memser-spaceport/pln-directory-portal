import { connectorMatchClause } from './connector-match.util';

function sqlText(clause: ReturnType<typeof connectorMatchClause>): string {
  const raw = clause as { strings?: string[]; values?: unknown[] };
  if (Array.isArray(raw.strings)) {
    return raw.strings.join('?');
  }
  return String(clause);
}

describe('connectorMatchClause', () => {
  it('matches legacy hop-chain node labels and plConnector', () => {
    const sql = sqlText(connectorMatchClause(['brad holden'], []));
    expect(sql).toContain('nodes');
    expect(sql).toContain('plConnector');
  });

  it('matches people-first routeNodes and contact fields (task 06)', () => {
    const sql = sqlText(connectorMatchClause(['andrew milich'], []));
    expect(sql).toContain('routeNodes');
    expect(sql).toContain('contact');
    expect(sql).toContain('orgConnector');
    expect(sql).toContain('connectorTeam');
  });

  it('matches target investor name and firm', () => {
    const sql = sqlText(connectorMatchClause(['brett adcock', 'figure'], ['figure']));
    expect(sql).toContain('InvestorOutreachRecord');
    expect(sql).toContain('firstName');
    expect(sql).toContain('firm');
  });

  it('includes orgConnectors array and connectorTeam leads', () => {
    const sql = sqlText(connectorMatchClause(['coinlist'], []));
    expect(sql).toContain('orgConnectors');
    expect(sql).toContain('leads');
  });
});
