import { ForbiddenException } from '@nestjs/common';
import {
  enforceTeamPublicVisibility,
  isTeamHiddenFromPublic,
  PUBLICLY_VISIBLE_TEAM_WHERE,
  toTeamCrawlIndex,
} from './team-public-visibility';

describe('isTeamHiddenFromPublic', () => {
  it('hides L0 teams only', () => {
    expect(isTeamHiddenFromPublic('L0')).toBe(true);
    for (const level of ['L1', 'L2', 'L3', 'L4', 'L5', 'L6']) {
      expect(isTeamHiddenFromPublic(level)).toBe(false);
    }
  });

  it('treats a team with no access level as public, as findTeamByUid does', () => {
    expect(isTeamHiddenFromPublic(null)).toBe(false);
    expect(isTeamHiddenFromPublic(undefined)).toBe(false);
  });
});

describe('PUBLICLY_VISIBLE_TEAM_WHERE', () => {
  it('excludes L0 and keeps null access levels, which `not: L0` alone would drop in SQL', () => {
    expect(PUBLICLY_VISIBLE_TEAM_WHERE).toEqual({
      OR: [{ accessLevel: null }, { accessLevel: { not: 'L0' } }],
    });
  });
});

describe('toTeamCrawlIndex', () => {
  it('maps rows to uid and ISO updatedAt, in order', () => {
    expect(
      toTeamCrawlIndex([
        { uid: 'b', updatedAt: new Date('2026-11-02T10:00:00.000Z') },
        { uid: 'a', updatedAt: new Date('2026-01-01T00:00:00.000Z') },
      ])
    ).toEqual({
      teams: [
        { uid: 'b', updatedAt: '2026-11-02T10:00:00.000Z' },
        { uid: 'a', updatedAt: '2026-01-01T00:00:00.000Z' },
      ],
    });
  });

  it('returns an empty list for no rows', () => {
    expect(toTeamCrawlIndex([])).toEqual({ teams: [] });
  });
});

describe('enforceTeamPublicVisibility (GET /v1/teams/:uid and GET /v1/teams/:uid/events)', () => {
  it('refuses a signed-out viewer of an L0 team with 403 "Team is inactive"', async () => {
    const validate = jest.fn();
    const result = enforceTeamPublicVisibility({ uid: 't1', accessLevel: 'L0' }, undefined, validate);
    await expect(result).rejects.toBeInstanceOf(ForbiddenException);
    await expect(enforceTeamPublicVisibility({ uid: 't1', accessLevel: 'L0' }, undefined, validate)).rejects.toThrow(
      'Team is inactive'
    );
    expect(validate).not.toHaveBeenCalled();
  });

  it('sends a signed-in viewer of an L0 team through the requestor check', async () => {
    const validate = jest.fn(async () => {
      throw new ForbiddenException('Requestor does not have permission');
    });
    await expect(enforceTeamPublicVisibility({ uid: 't1', accessLevel: 'L0' }, 'a@b.c', validate)).rejects.toThrow(
      'Requestor does not have permission'
    );
    expect(validate).toHaveBeenCalledWith('a@b.c', 't1');
  });

  it('lets anyone through for other access levels, or none', async () => {
    const validate = jest.fn();
    for (const accessLevel of ['L1', 'L4', null, undefined]) {
      await expect(
        enforceTeamPublicVisibility({ uid: 't1', accessLevel }, undefined, validate)
      ).resolves.toBeUndefined();
    }
    expect(validate).not.toHaveBeenCalled();
  });
});
