import { connectorMatchClause } from './connector-match.util';

function sqlText(clause: ReturnType<typeof connectorMatchClause>): string {
  const raw = clause as { strings?: string[]; values?: unknown[] };
  if (Array.isArray(raw.strings)) {
    return raw.strings.join('?');
  }
  return String(clause);
}

describe('connectorMatchClause', () => {
  it('matches legacy hop-chain node labels and plConnector (all)', () => {
    const sql = sqlText(connectorMatchClause(['brad holden'], []));
    expect(sql).toContain('nodes');
    expect(sql).toContain('plConnector');
  });

  it('matches people-first and org fields together for all kind', () => {
    const sql = sqlText(connectorMatchClause(['andrew milich'], []));
    expect(sql).toContain('routeNodes');
    expect(sql).toContain('contact');
    expect(sql).toContain('orgConnector');
    expect(sql).toContain('connectorTeam');
  });

  it('matches target investor name and firm for all kind', () => {
    const sql = sqlText(connectorMatchClause(['brett adcock', 'figure'], ['figure']));
    expect(sql).toContain('InvestorOutreachRecord');
    expect(sql).toContain('firstName');
    expect(sql).toContain('firm');
  });

  it('includes orgConnectors array and connectorTeam leads for all kind', () => {
    const sql = sqlText(connectorMatchClause(['coinlist'], []));
    expect(sql).toContain('orgConnectors');
    expect(sql).toContain('leads');
  });

  it('person kind omits org fields and target firm', () => {
    const sql = sqlText(connectorMatchClause(['shan aggarwal'], [], 'person'));
    expect(sql).toContain('plConnector');
    expect(sql).toContain('contact');
    expect(sql).toContain('firstName');
    expect(sql).toContain('leads');
    expect(sql).not.toContain('orgConnector');
    expect(sql).not.toContain('orgConnectors');
    expect(sql).not.toContain('orgName');
    expect(sql).not.toContain('firm');
  });

  it('org kind omits person fields and target name', () => {
    const sql = sqlText(connectorMatchClause(['coinbase'], ['coinbase'], 'org'));
    expect(sql).toContain('orgConnector');
    expect(sql).toContain('orgConnectors');
    expect(sql).toContain('orgName');
    expect(sql).toContain('firm');
    expect(sql).toContain("'org'");
    expect(sql).not.toContain('plConnector');
    expect(sql).not.toContain('contact');
    expect(sql).not.toContain('firstName');
    expect(sql).not.toContain('leads');
  });
});
