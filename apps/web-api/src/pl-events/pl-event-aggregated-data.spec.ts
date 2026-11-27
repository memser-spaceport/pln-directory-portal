import { presentAggregatedData } from './pl-event-aggregated-data';

const subscriber = {
  uid: 'sub-1',
  memberUid: 'member-1',
  entityUid: 'loc-1',
  member: {
    uid: 'member-1',
    name: 'Ada Lovelace',
    image: { url: 'https://cdn.example/ada.jpg' },
  },
};

const guest = {
  member: {
    uid: 'guest-1',
    name: 'Grace Hopper',
    image: { url: 'https://cdn.example/grace.jpg' },
  },
  team: { uid: 'team-1', name: 'Protocol Labs' },
  isHost: true,
};

const payload = () => ({
  events: [{ uid: 'event-1', name: 'Open event', eventGuests: [guest] }],
  members: [{ uid: 'featured-1', name: 'Featured Member' }],
  locations: [
    {
      uid: 'loc-1',
      location: 'Lisbon, Portugal',
      subscribers: [subscriber, { ...subscriber, uid: 'sub-2', memberUid: 'member-2' }],
      events: [{ uid: 'ev-1', name: 'Summit', eventGuests: [guest] }],
      pastEvents: [{ uid: 'ev-2', name: 'Old summit', eventGuests: [guest] }],
      upcomingEvents: [{ uid: 'ev-3', name: 'Next summit', eventGuests: [guest] }],
    },
    { uid: 'loc-2', location: 'Berlin, Germany', subscribers: [], events: [], pastEvents: [], upcomingEvents: [] },
  ],
});

describe('presentAggregatedData (LAB-3463)', () => {
  it('gives a signed-out request empty subscribers and no guest members inside locations', () => {
    const source = payload();
    const result = presentAggregatedData(source, null);
    const [lisbon, berlin] = result.locations;

    expect(lisbon.subscribers).toEqual([]);
    expect(berlin.subscribers).toEqual([]);
    expect(lisbon.events[0].eventGuests).toEqual([]);
    expect(lisbon.pastEvents[0].eventGuests).toEqual([]);
    expect(lisbon.upcomingEvents[0].eventGuests).toEqual([]);
    expect(lisbon.events[0].name).toBe('Summit');
    expect(lisbon.uid).toBe('loc-1');
    expect(result.events).toBe(source.events);
    expect(result.members).toEqual([{ uid: 'featured-1', name: 'Featured Member' }]);

    const serialized = JSON.stringify(result.locations);
    expect(serialized).not.toContain('member-1');
    expect(serialized).not.toContain('member-2');
    expect(serialized).not.toContain('Ada Lovelace');
    expect(serialized).not.toContain('ada.jpg');
    expect(serialized).not.toContain('guest-1');
    expect(serialized).not.toContain('Grace Hopper');
    expect(serialized).not.toContain('grace.jpg');
    expect(serialized).not.toContain('memberUid');
    expect(serialized).not.toContain('"member"');
  });

  it('keeps subscriber members and guest members for a signed-in request', () => {
    const data = payload();
    const result = presentAggregatedData(data, { uid: 'member-9' });
    expect(result).toBe(data);
    expect(result.locations[0].subscribers[0].member.name).toBe('Ada Lovelace');
    expect(result.locations[0].events[0].eventGuests[0].member.name).toBe('Grace Hopper');
  });

  it('returns a missing payload unchanged', () => {
    expect(presentAggregatedData(undefined, null)).toBeUndefined();
    expect(presentAggregatedData(null, null)).toBeNull();
  });
});
