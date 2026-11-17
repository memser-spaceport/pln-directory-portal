
// Loading the real collaborators makes ts-jest's type check overflow the stack (TS 4.7), so they are stubbed here,
// as in pl-event-attendance.spec.ts. Only applySorting is under test.
jest.mock('../members/members.service', () => ({ MembersService: class {} }));
jest.mock('../teams/teams.service', () => ({ TeamsService: class {} }));
jest.mock('./pl-events.service', () => ({ PLEventsService: class {} }));
jest.mock('./pl-event-sync.service', () => ({ PLEventSyncService: class {} }));
jest.mock('./pl-event-locations.service', () => ({ PLEventLocationsService: class {} }));
jest.mock('../utils/aws/aws.service', () => ({ AwsService: class {} }));
jest.mock('./push/irl-gathering-push-candidates.service', () => ({ IrlGatheringPushCandidatesService: class {} }));
jest.mock('../utils/cache/cache.service', () => ({ CacheService: class {} }));
jest.mock('../shared/prisma.service', () => ({ PrismaService: class {} }));
jest.mock('../shared/log.service', () => ({ LogService: class {} }));

import { PLEventGuestsService } from './pl-event-guests.service';

const applySorting = (sortBy: string, dir: any, uid: string): string =>
  PLEventGuestsService.prototype.applySorting.call(null, sortBy, dir, uid);

describe('PLEventGuestsService.applySorting SQL injection hardening', () => {
  const evil = 'asc; SELECT pg_sleep(5)--';

  it('member: junk direction becomes asc', () => {
    expect(applySorting('member', evil, '')).toBe('ORDER BY m."name" asc');
  });

  it('team: junk direction becomes asc', () => {
    expect(applySorting('team', evil, '')).toBe('ORDER BY tm."name" asc');
  });

  it('default: junk direction becomes asc, nothing injected', () => {
    const sql = applySorting('other', evil, '');
    expect(sql).toContain('m."name" asc');
    expect(sql).not.toContain('pg_sleep');
  });

  it('accepts desc case-insensitively and arrays', () => {
    expect(applySorting('member', 'DESC', '')).toBe('ORDER BY m."name" desc');
    expect(applySorting('member', ['asc', 'desc'], '')).toBe('ORDER BY m."name" desc');
    expect(applySorting('member', ['desc', ''], '')).toBe('ORDER BY m."name" desc');
  });

  it('uid with quote is dropped, valid uid kept', () => {
    expect(applySorting('x', 'asc', "a' OR 1=1--")).not.toContain('OR 1=1');
    expect(applySorting('x', 'asc', 'clabc123')).toContain(`pg."memberUid" = 'clabc123'`);
  });
});
