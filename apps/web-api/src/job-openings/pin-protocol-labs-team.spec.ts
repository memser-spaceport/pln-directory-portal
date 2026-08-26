import { PROTOCOL_LABS_TEAM_UID } from '../team-news/team-news-public-list.config';
import { isInAppApplyAvailable, isProtocolLabsTeam, pinProtocolLabsThenPage } from './pin-protocol-labs-team';

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

describe('isInAppApplyAvailable', () => {
  it('is false for Protocol Labs without a job-refer email', () => {
    expect(isInAppApplyAvailable({ teamUid: PROTOCOL_LABS_TEAM_UID, name: 'Protocol Labs' })).toBe(false);
    expect(isInAppApplyAvailable({ teamUid: PROTOCOL_LABS_TEAM_UID, name: 'Protocol Labs', jobReferEmail: null })).toBe(
      false
    );
    expect(isInAppApplyAvailable({ teamUid: PROTOCOL_LABS_TEAM_UID, name: 'Protocol Labs', jobReferEmail: '  ' })).toBe(
      false
    );
  });

  it('is true for Protocol Labs once a job-refer email is set', () => {
    expect(
      isInAppApplyAvailable({
        teamUid: PROTOCOL_LABS_TEAM_UID,
        name: 'Protocol Labs',
        jobReferEmail: 'jobs@protocol.ai',
      })
    ).toBe(true);
  });

  it('is true for every other team, including those with a job-refer email', () => {
    expect(isInAppApplyAvailable({ teamUid: 'other', name: 'Airship' })).toBe(true);
    expect(isInAppApplyAvailable({ teamUid: 'other', name: 'Airship', jobReferEmail: 'jobs@airship.com' })).toBe(true);
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
    expect(pinProtocolLabsThenPage(alreadyFirst, 1, 2).map((r) => r.teamUid)).toEqual([PROTOCOL_LABS_TEAM_UID, 'a']);
  });
});
