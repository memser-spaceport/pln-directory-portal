/**
 * One APPROVED event as the PL events service sends it (`GET <EVENT_SERVICE_URL>/events`
 * and the `events` SQS queue), trimmed to what the Directory reads.
 *
 * PROVENANCE: INFERRED, not captured. On 2026-11-11 the dev events service was not
 * reachable from a workstation (`EVENT_SERVICE_URL` lives in SSM; the public dev hosts
 * tried returned nothing). The field names and shapes come from the PL events app's own
 * reader of the same API (memser-spaceport/pln-events, `service/events.service.ts`,
 * `getAllEvents`: `tags`, `access_type`, `access_option`, `format`, `host`, `host_logo`,
 * `co_hosts[].name/logo`, `sponsors`, `agenda.sessions[]`) and its detail components
 * (`tags.tsx` renders tags as plain strings; `event-hosts.tsx` reads `{ name, logo }`).
 * The values are made up and name organisations only, no people.
 *
 * `location_url` (LAB-3332) is named in the events service's own Mongoose schema
 * (memser-spaceport/events-service, `src/schemas/event.schema.ts`) and is read as
 * `event.location_url` by the PL events app (`service/events.service.ts`).
 *
 * `timezone`, `meeting_link` and `address_info` are the old submission form's payload keys
 * (pl-events-submission, `add-event-form.tsx`); the typed columns read them (LAB-3281).
 * The details also keep `timezone` (LAB-3403).
 *
 * The QUEUE does not send all of it: on prod, 2026-11-24, every event it had written kept `format` only (LAB-3403).
 *
 * Replace it with a trimmed real payload once one is captured (LAB-3211 task 4.1 checks
 * the stored details on the feature env against PL Events).
 */
export const EVENTS_SERVICE_EVENT = {
  event_id: 'evt-fixture-001',
  event_name: 'Fixture Summit',
  description: 'A two-day summit used as a test fixture.',
  website_link: 'https://example.org/summit',
  registration_link: 'https://example.org/summit/register',
  is_featured: false,
  start_date: '2026-12-01T09:00:00.000Z',
  end_date: '2026-12-02T18:00:00.000Z',
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-11-01T00:00:00.000Z',
  event_logo: null,
  format: 'IN_PERSON',
  timezone: 'Europe/Lisbon',
  meeting_link: 'https://meet.example.org/summit',
  address_info: {
    address: 'Fixture Venue, Avenida da Liberdade 10',
    city: 'Lisbon',
    country: 'Portugal',
    latitude: 38.7205,
    longitude: -9.1453,
  },
  location_url: 'https://maps.example.org/?q=Fixture+Venue',
  access_type: 'Free',
  access_option: 'Free w/ RSVP',
  tags: ['DeSci', 'AI'],
  host: 'Protocol Labs',
  host_logo: 'https://example.org/logos/pl.png',
  co_hosts: [{ name: 'Filecoin Foundation', logo: 'https://example.org/logos/ff.png' }],
  sponsors: [{ name: 'Example Sponsor', logo: null }],
  agenda: {
    title: 'Program',
    sessions: [
      {
        name: 'Opening',
        start_date: '2026-12-01T09:00:00.000Z',
        end_date: '2026-12-01T10:00:00.000Z',
        description: 'Welcome and agenda.',
      },
      {
        name: 'Workshops',
        start_date: '2026-12-01T10:30:00.000Z',
        end_date: '2026-12-01T12:30:00.000Z',
        description: '',
      },
    ],
  },
};
