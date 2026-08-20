import { PROTOCOL_LABS_TEAM_UID } from '../team-news/team-news-public-list.config';
import { isProtocolLabsTeam, pinProtocolLabsThenPage } from './pin-protocol-labs-team';

describe('isProtocolLabsTeam', () => {
  it('matches the canonical Protocol Labs uid', () => {
    expect(isProtocolLabsTeam({ teamUid: PROTOCOL_LABS_TEAM_UID, name: 'Other' })).toBe(true);
  });

  it('matches the Protocol Labs name case-insensitively', () => {
    expect(isProtocolLabsTeam({ teamUid: 'other', name: 'Protocol Labs' })).toBe(true);
    expect(isProtocolLabsTeam({ teamUid: 'other', name: ' protocol labs ' })).toBe(true);
  });

  it('does not match similarly named teams', () => {
    expect(isProtocolLabsTeam({ teamUid: 'other', name: 'Protocol Labs Research' })).toBe(false);
  });
});

describe('pinProtocolLabsThenPage', () => {
  const rows = [
    { teamUid: 'a', name: 'Alpha' },
    { teamUid: 'b', name: 'Beta' },
    { teamUid: PROTOCOL_LABS_TEAM_UID, name: 'Protocol Labs' },
    { teamUid: 'c', name: 'Gamma' },
  ];

  it('puts Protocol Labs first on page 1', () => {
    expect(pinProtocolLabsThenPage(rows, 1, 2).map((r) => r.teamUid)).toEqual([PROTOCOL_LABS_TEAM_UID, 'a']);
  });

  it('does not repeat Protocol Labs on later pages', () => {
    expect(pinProtocolLabsThenPage(rows, 2, 2).map((r) => r.teamUid)).toEqual(['b', 'c']);
  });

  it('leaves order unchanged when Protocol Labs is absent', () => {
    const withoutPl = rows.filter((r) => r.teamUid !== PROTOCOL_LABS_TEAM_UID);
    expect(pinProtocolLabsThenPage(withoutPl, 1, 2).map((r) => r.name)).toEqual(['Alpha', 'Beta']);
  });

  it('keeps Protocol Labs first when it is already first', () => {
    const alreadyFirst = [
      { teamUid: PROTOCOL_LABS_TEAM_UID, name: 'Protocol Labs' },
      { teamUid: 'a', name: 'Alpha' },
    ];
    expect(pinProtocolLabsThenPage(alreadyFirst, 1, 2).map((r) => r.teamUid)).toEqual([
      PROTOCOL_LABS_TEAM_UID,
      'a',
    ]);
  });
});
