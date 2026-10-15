// nestjs-zod ships ESM this jest config can't parse; its `z` is plain zod and DTO classes aren't used here.
jest.mock('nestjs-zod/z', () => require('zod'));
jest.mock('nestjs-zod', () => ({ createZodDto: () => class {} }));

import { syncTeamLocations } from './team-locations';
import { ParticipantRequestTeamSchema } from '../../../../libs/contracts/src/schema/participants-request';

const txWithLocations = (locations: string[] | null) => {
  const findUnique = jest.fn().mockResolvedValue(locations === null ? null : { locations });
  return { tx: { team: { findUnique } } as any, findUnique };
};

describe('syncTeamLocations', () => {
  it('makes the first sent location the HQ, trimming and dropping blanks and repeats', async () => {
    const { tx, findUnique } = txWithLocations(['Old']);

    const data = await syncTeamLocations({
      tx,
      teamUid: 'team-1',
      data: { name: 'Acme', locations: ['  Varna ', '', 'Sofia', 'varna', 'Berlin'] },
    });

    expect(data).toEqual({ name: 'Acme', locations: ['Varna', 'Sofia', 'Berlin'], location: 'Varna' });
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('clears the HQ when the list is emptied', async () => {
    const { tx } = txWithLocations(['Varna']);

    expect(await syncTeamLocations({ tx, teamUid: 'team-1', data: { locations: [] } })).toEqual({
      locations: [],
      location: null,
    });
  });

  it('wins over a stale single location sent alongside the list', async () => {
    const { tx } = txWithLocations([]);

    const data = await syncTeamLocations({
      tx,
      teamUid: 'team-1',
      data: { location: 'Varna', locations: ['Sofia', 'Varna'] },
    });

    expect(data).toEqual({ location: 'Sofia', locations: ['Sofia', 'Varna'] });
  });

  it('replaces only the HQ when a write sends just the single location', async () => {
    const { tx } = txWithLocations(['Varna', 'Sofia', 'Berlin']);

    expect(await syncTeamLocations({ tx, teamUid: 'team-1', data: { location: ' Lisbon ' } })).toEqual({
      location: 'Lisbon',
      locations: ['Lisbon', 'Sofia', 'Berlin'],
    });
  });

  it('does not repeat a place that is already one of the other locations', async () => {
    const { tx } = txWithLocations(['Varna', 'Sofia']);

    expect(await syncTeamLocations({ tx, teamUid: 'team-1', data: { location: 'sofia' } })).toEqual({
      location: 'sofia',
      locations: ['sofia'],
    });
  });

  it('promotes the next location when the single location is cleared', async () => {
    const { tx } = txWithLocations(['Varna', 'Sofia']);

    expect(await syncTeamLocations({ tx, teamUid: 'team-1', data: { location: null } })).toEqual({
      location: 'Sofia',
      locations: ['Sofia'],
    });
  });

  it('starts the list for a new team from its single location', async () => {
    const { tx, findUnique } = txWithLocations(null);

    expect(await syncTeamLocations({ tx, teamUid: null, data: { location: 'Varna' } })).toEqual({
      location: 'Varna',
      locations: ['Varna'],
    });
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('leaves a write without either field untouched', async () => {
    const { tx, findUnique } = txWithLocations(['Varna']);
    const data: { name: string; location?: string } = { name: 'Acme' };

    expect(await syncTeamLocations({ tx, teamUid: 'team-1', data })).toBe(data);
    expect(findUnique).not.toHaveBeenCalled();
  });
});

describe('team locations in a team update request', () => {
  const request = (locations: unknown) => ({
    participantType: 'TEAM',
    referenceUid: 'team-1',
    uniqueIdentifier: 'Acme',
    newData: { name: 'Acme', locations },
  });

  it('accepts up to 10 distinct locations', () => {
    const locations = Array.from({ length: 10 }, (_, index) => `City ${index}`);

    expect(ParticipantRequestTeamSchema.safeParse(request(locations)).success).toBe(true);
  });

  it('rejects an 11th location', () => {
    const locations = Array.from({ length: 11 }, (_, index) => `City ${index}`);

    expect(ParticipantRequestTeamSchema.safeParse(request(locations)).success).toBe(false);
  });

  it('rejects the same place twice, ignoring case and spaces', () => {
    expect(ParticipantRequestTeamSchema.safeParse(request(['Varna', ' varna'])).success).toBe(false);
  });

  it('rejects a blank location', () => {
    expect(ParticipantRequestTeamSchema.safeParse(request(['Varna', '  '])).success).toBe(false);
  });
});
