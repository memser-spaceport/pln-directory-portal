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

const payload = () => ({
  events: [{ uid: 'event-1', name: 'Open event' }],
  locations: [
    {
      uid: 'loc-1',
      location: 'Lisbon, Portugal',
      subscribers: [subscriber, { ...subscriber, uid: 'sub-2', memberUid: 'member-2' }],
    },
    { uid: 'loc-2', location: 'Berlin, Germany', subscribers: [] },
  ],
});

describe('presentAggregatedData (LAB-3463)', () => {
  it('passes through an unavailable result from the aggregation service', () => {
    expect(presentAggregatedData(undefined, null)).toBeUndefined();
  });

  it('gives a signed-out request the subscriber count and no member uid, name or photo', () => {
    const result = presentAggregatedData(payload(), null);
    const [lisbon, berlin] = result.locations;

    expect(lisbon.subscribers).toHaveLength(2);
    expect(berlin.subscribers).toEqual([]);
    expect(lisbon.uid).toBe('loc-1');
    expect(result.events).toEqual([{ uid: 'event-1', name: 'Open event' }]);

    const serialized = JSON.stringify(result.locations);
    expect(serialized).not.toContain('member-1');
    expect(serialized).not.toContain('member-2');
    expect(serialized).not.toContain('Ada Lovelace');
    expect(serialized).not.toContain('ada.jpg');
    expect(serialized).not.toContain('memberUid');
    expect(serialized).not.toContain('sub-1');
  });

  it('keeps the subscriber members a signed-in request already returns', () => {
    const data = payload();
    const result = presentAggregatedData(data, { uid: 'member-9' });
    expect(result).toBe(data);
    expect(result.locations[0].subscribers[0].member.name).toBe('Ada Lovelace');
  });
});
