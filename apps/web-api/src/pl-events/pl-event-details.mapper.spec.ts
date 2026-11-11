import { emptyPLEventDetails, SyncPLEventsBodySchema } from 'libs/contracts/src/schema/pl-event-details';
import { mapEventDetails, readEventDetails, withEventDetails } from './pl-event-details.mapper';
import { EVENTS_SERVICE_EVENT } from './fixtures/events-service-event.fixture';

describe('mapEventDetails (LAB-3214)', () => {
  it('maps tags, access, format, hosts, sponsors and agenda from an events-service event', () => {
    const onInvalid = jest.fn();

    expect(mapEventDetails(EVENTS_SERVICE_EVENT, onInvalid)).toEqual({
      tags: [
        { name: 'DeSci', color: null },
        { name: 'AI', color: null },
      ],
      accessType: 'Free',
      accessOption: 'Free w/ RSVP',
      format: 'IN_PERSON',
      host: { name: 'Protocol Labs', logo: 'https://example.org/logos/pl.png' },
      coHosts: [{ name: 'Filecoin Foundation', logo: 'https://example.org/logos/ff.png' }],
      sponsors: [{ name: 'Example Sponsor', logo: null }],
      agenda: {
        title: 'Program',
        sessions: EVENTS_SERVICE_EVENT.agenda.sessions,
      },
    });
    expect(onInvalid).not.toHaveBeenCalled();
  });

  it('gives empty values for an event that sends none of the fields', () => {
    const onInvalid = jest.fn();

    expect(mapEventDetails({ event_id: 'e1', event_name: 'Bare' }, onInvalid)).toEqual(emptyPLEventDetails());
    expect(mapEventDetails(null)).toEqual(emptyPLEventDetails());
    expect(onInvalid).not.toHaveBeenCalled();
  });

  it('stores a malformed agenda as null and reports it', () => {
    const onInvalid = jest.fn();

    const details = mapEventDetails({ ...EVENTS_SERVICE_EVENT, agenda: 'see website' }, onInvalid);

    expect(details.agenda).toBeNull();
    expect(details.tags).toHaveLength(2);
    expect(onInvalid).toHaveBeenCalledWith('agenda', 'expected an object, got string');
  });

  it('keeps an agenda without a sessions array, with empty sessions', () => {
    const onInvalid = jest.fn();

    expect(mapEventDetails({ agenda: { title: 'TBA' } }, onInvalid).agenda).toEqual({ title: 'TBA', sessions: [] });
    expect(mapEventDetails({ agenda: { sessions: 'later' } }, onInvalid).agenda).toEqual({ sessions: [] });
    expect(onInvalid).toHaveBeenCalledTimes(1);
  });

  it('empties a field of the wrong type without touching the others', () => {
    const onInvalid = jest.fn();

    const details = mapEventDetails(
      { ...EVENTS_SERVICE_EVENT, tags: 'DeSci', co_hosts: { name: 'x' }, access_type: 3 },
      onInvalid
    );

    expect(details.tags).toEqual([]);
    expect(details.coHosts).toEqual([]);
    expect(details.accessType).toBeNull();
    expect(details.sponsors).toEqual([{ name: 'Example Sponsor', logo: null }]);
    expect(onInvalid.mock.calls.map(([field]) => field)).toEqual(['tags', 'accessType', 'coHosts']);
  });

  it('skips unreadable list items and keeps tag objects that carry a colour', () => {
    const onInvalid = jest.fn();

    const details = mapEventDetails(
      { tags: ['', { name: 'Web3', color: '#123456' }, 42], sponsors: ['Acme', { logo: 'x' }] },
      onInvalid
    );

    expect(details.tags).toEqual([{ name: 'Web3', color: '#123456' }]);
    expect(details.sponsors).toEqual([{ name: 'Acme', logo: null }]);
    expect(onInvalid).toHaveBeenCalledWith('tags', 'skipped 2 unreadable tag(s)');
    expect(onInvalid).toHaveBeenCalledWith('sponsors', 'skipped 1 unreadable item(s)');
  });

  it('treats an empty host name as no host', () => {
    expect(mapEventDetails({ host: '  ', host_logo: 'https://example.org/x.png' }).host).toBeNull();
  });
});

describe('readEventDetails (LAB-3214)', () => {
  it('reads an event that was never synced with details as empty', () => {
    expect(readEventDetails(null)).toEqual(emptyPLEventDetails());
    expect(readEventDetails({})).toEqual(emptyPLEventDetails());
    expect(readEventDetails({ irlLink: 'https://example.org' })).toEqual(emptyPLEventDetails());
    expect(readEventDetails({ details: 'broken' })).toEqual(emptyPLEventDetails());
  });

  it('reads back what the sync stored', () => {
    const details = mapEventDetails(EVENTS_SERVICE_EVENT);

    expect(readEventDetails(withEventDetails({ irlLink: 'x' }, details))).toEqual(details);
  });

  it('fills fields missing from an older stored shape with empty values', () => {
    expect(readEventDetails({ details: { tags: [{ name: 'AI', color: null }] } })).toEqual({
      ...emptyPLEventDetails(),
      tags: [{ name: 'AI', color: null }],
    });
  });
});

describe('withEventDetails (LAB-3214)', () => {
  it('replaces details and keeps every other additionalInfo key', () => {
    const details = mapEventDetails(EVENTS_SERVICE_EVENT);

    expect(withEventDetails({ irlLink: 'x', details: { tags: ['old'] } }, details)).toEqual({
      irlLink: 'x',
      details,
    });
  });

  it('starts a fresh object when additionalInfo is empty or not an object', () => {
    const details = emptyPLEventDetails();

    expect(withEventDetails(null, details)).toEqual({ details });
    expect(withEventDetails(['x'], details)).toEqual({ details });
  });
});

describe('SyncPLEventsBodySchema (LAB-3214)', () => {
  it('accepts the full sync, a selection and the details-only backfill', () => {
    expect(SyncPLEventsBodySchema.safeParse({}).success).toBe(true);
    expect(SyncPLEventsBodySchema.safeParse({ selectedEventUids: ['a'] }).success).toBe(true);
    expect(SyncPLEventsBodySchema.safeParse({ detailsOnly: true }).success).toBe(true);
  });

  it('rejects a details-only flag that is not a boolean', () => {
    expect(SyncPLEventsBodySchema.safeParse({ detailsOnly: 'yes' }).success).toBe(false);
    expect(SyncPLEventsBodySchema.safeParse({ selectedEventUids: 'a' }).success).toBe(false);
  });
});
