// The real collaborators pull in a module graph that overflows ts-jest's type check (TS 4.7), so they are stubbed.
jest.mock('../shared/prisma.service', () => ({ PrismaService: class {} }));
jest.mock('../shared/log.service', () => ({ LogService: class {} }));
jest.mock('../utils/cache/cache.service', () => ({ CacheService: class {} }));
jest.mock('./push/irl-gathering-push-candidates.service', () => ({ IrlGatheringPushCandidatesService: class {} }));
jest.mock('../access-control-v2/services/access-control-v2.service', () => ({ AccessControlV2Service: class {} }));

import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { PLEventSubmitBodySchema } from 'libs/contracts/src/schema/pl-event-body';
import { InMemoryPrisma, InMemoryTables } from './fixtures/in-memory-prisma';
import { eventEditorFields, eventReadAccess } from './pl-event-detail';
import { assembleEventDetails } from './pl-event-details.mapper';
import {
  deriveEventType,
  EventActor,
  eventSlug,
  resolveEventDate,
  sanitizeEventDescription,
  statusOnSubmit,
} from './pl-event-write';
import { PLEventWriteService } from './pl-event-write.service';

/** LAB-3325 / LAB-3343: the event write path. */

const FORUM_MEMBER: EventActor = { kind: 'member', memberUid: 'm-forum', trusted: true, isAdmin: false };
const PLAIN_MEMBER: EventActor = { kind: 'member', memberUid: 'm-plain', trusted: false, isAdmin: false };
const ADMIN: EventActor = { kind: 'member', memberUid: 'm-admin', trusted: false, isAdmin: true };
const PARTNER: EventActor = { kind: 'integration', teamUid: 't-curator' };

const VALID = {
  name: 'Lisbon Builders Night',
  startDate: '2026-07-24T18:00:00+01:00',
  endDate: '2026-07-24T21:00:00+01:00',
  timezone: 'Europe/Lisbon',
  format: 'IN_PERSON',
  tags: ['Networking Event'],
  hostName: 'Protocol Labs',
  address: {
    address: 'Avenida da Liberdade 10',
    city: 'Lisbon',
    country: 'Portugal',
    latitude: 38.72,
    longitude: -9.14,
  },
};

const body = (extra: Record<string, unknown> = {}) => {
  const { draft, ...fields } = PLEventSubmitBodySchema.parse({ ...VALID, ...extra });
  return fields;
};

const BASE_TABLES: InMemoryTables = {
  member: [{ uid: 'm-forum' }, { uid: 'm-plain' }, { uid: 'm-admin' }, { uid: 'm-host' }, { uid: 'm-speaker' }],
  team: [{ uid: 't-curator' }, { uid: 't-sponsor' }],
  image: [{ uid: 'img-1', url: 'https://img/1.png' }],
  teamMemberRole: [{ memberUid: 'm-host', teamUid: 't-sponsor', mainTeam: true }],
  pLEventLocation: [
    { uid: 'loc-denver', location: 'Denver, United States', timezone: 'America/Denver', isDeleted: false },
  ],
  pLEventLocationAssociation: [
    {
      uid: 'assoc-denver',
      locationUid: 'loc-denver',
      city: 'Denver',
      state: 'Colorado',
      country: 'United States',
      isDeleted: false,
      createdAt: new Date('2026-01-01'),
    },
  ],
};

function setup(tables: InMemoryTables = {}) {
  const db = new InMemoryPrisma({ ...JSON.parse(JSON.stringify(BASE_TABLES)), ...tables });
  const pushCandidates = { refreshCandidatesForEvents: jest.fn(async () => undefined) };
  const cache = { reset: jest.fn() };
  const accessControl = { hasPermission: jest.fn(async (uid: string) => ({ allowed: uid === 'm-forum' })) };
  const service = new PLEventWriteService(
    db.client() as any,
    { info: jest.fn(), error: jest.fn() } as any,
    cache as any,
    pushCandidates as any,
    accessControl as any
  );
  const event = (uid: string) => db.all('pLEvent').find((row) => row.uid === uid)!;
  const guests = (eventUid: string) => db.all('pLEventGuest').filter((row) => row.eventUid === eventUid);
  return { service, db, event, guests, pushCandidates, cache, accessControl };
}

describe('gatherings are resolved from the address (design D6)', () => {
  it('a known city reuses its gathering', async () => {
    const { service, event, db } = setup();
    const { uid } = await service.createEvent(
      body({ address: { city: 'denver', state: 'Colorado', country: 'United States' } }),
      FORUM_MEMBER
    );
    expect(event(uid)).toMatchObject({
      locationUid: 'loc-denver',
      pLEventLocationAssociationUid: 'assoc-denver',
      locationStatus: 'AUTO_MAPPED',
    });
    expect(db.all('pLEventLocation')).toHaveLength(1);
    expect(db.all('pLEventLocationAssociation')).toHaveLength(1);
  });

  it('an unknown city creates a gathering and an AUTO_MAPPED association', async () => {
    const { service, event, db } = setup();
    const { uid } = await service.createEvent(body(), FORUM_MEMBER);

    const created = db.all('pLEventLocation').find((row) => row.location === 'Lisbon, Portugal')!;
    expect(created).toMatchObject({
      country: 'Portugal',
      timezone: 'Europe/Lisbon',
      latitude: '38.72',
      longitude: '-9.14',
    });
    const association = db.all('pLEventLocationAssociation').find((row) => row.locationUid === created.uid)!;
    expect(association).toMatchObject({ city: 'Lisbon', state: null, country: 'Portugal' });
    expect(event(uid)).toMatchObject({
      locationUid: created.uid,
      pLEventLocationAssociationUid: association.uid,
      locationStatus: 'AUTO_MAPPED',
    });

    // The next event in the same city reuses both.
    const second = await service.createEvent(body({ name: 'Second' }), FORUM_MEMBER);
    expect(event(second.uid).locationUid).toBe(created.uid);
    expect(db.all('pLEventLocation').filter((row) => row.location === 'Lisbon, Portugal')).toHaveLength(1);
  });

  it('a virtual event has no gathering', async () => {
    const { service, event, db } = setup();
    const { uid } = await service.createEvent(body({ format: 'VIRTUAL' }), FORUM_MEMBER);
    expect(event(uid)).toMatchObject({
      locationUid: null,
      pLEventLocationAssociationUid: null,
      locationStatus: null,
      type: 'VIRTUAL',
    });
    expect(db.all('pLEventLocation')).toHaveLength(1);
  });

  it('an in-person event with no address is stored with no gathering', async () => {
    const { service, event } = setup();
    const { uid, status } = await service.createEvent(body({ address: undefined }), FORUM_MEMBER);
    expect(status).toBe('APPROVED');
    expect(event(uid)).toMatchObject({ locationUid: null, format: 'IN_PERSON', venueAddress: null });
  });
});

describe('type and slug', () => {
  it('derives type from access and format', () => {
    expect(deriveEventType('IN_PERSON', 'INVITE')).toBe('INVITE_ONLY');
    expect(deriveEventType('VIRTUAL', 'INVITE')).toBe('INVITE_ONLY');
    expect(deriveEventType('VIRTUAL', 'OPEN')).toBe('VIRTUAL');
    expect(deriveEventType('HYBRID', 'PAID')).toBe('IN_PERSON');
    expect(deriveEventType(null, null)).toBe('IN_PERSON');
  });

  it('stores the derived type and keeps it in step on an edit', async () => {
    const { service, event } = setup();
    const { uid } = await service.createEvent(body({ accessOption: 'INVITE' }), FORUM_MEMBER);
    expect(event(uid).type).toBe('INVITE_ONLY');
    await service.updateEvent(event(uid) as any, { accessOption: 'OPEN' }, FORUM_MEMBER);
    expect(event(uid).type).toBe('IN_PERSON');
  });

  it('gives two events with the same name different slugs', async () => {
    const { service, event } = setup();
    const first = await service.createEvent(body(), FORUM_MEMBER);
    const second = await service.createEvent(body(), FORUM_MEMBER);
    expect(event(first.uid).slugURL).toMatch(/^lisbon-builders-night-[a-z0-9]{6}$/);
    expect(event(second.uid).slugURL).toMatch(/^lisbon-builders-night-[a-z0-9]{6}$/);
    expect(event(first.uid).slugURL).not.toBe(event(second.uid).slugURL);
    expect(eventSlug('Ünïcode & Friends!!', 'abc123')).toBe('unicode-friends-abc123');
    expect(eventSlug('日本', 'abc123')).toBe('event-abc123');
  });
});

describe('the status rule (design D4)', () => {
  it('follows the actor', () => {
    expect(statusOnSubmit(FORUM_MEMBER)).toBe('APPROVED');
    expect(statusOnSubmit(ADMIN)).toBe('APPROVED');
    expect(statusOnSubmit(PLAIN_MEMBER)).toBe('PENDING');
    expect(statusOnSubmit(PARTNER)).toBe('APPROVED');
  });

  it('stamps the status, the submitter and the source for each actor', async () => {
    const { service, event } = setup();
    const forum = await service.createEvent(body(), FORUM_MEMBER);
    const plain = await service.createEvent(body(), PLAIN_MEMBER);
    const partner = await service.createEvent(body(), PARTNER, { externalId: 'evt-1' });

    expect(event(forum.uid)).toMatchObject({ status: 'APPROVED', submitterUid: 'm-forum', sourceTeamUid: null });
    expect(event(plain.uid)).toMatchObject({ status: 'PENDING', submitterUid: 'm-plain' });
    expect(event(partner.uid)).toMatchObject({
      status: 'APPROVED',
      submitterUid: null,
      sourceTeamUid: 't-curator',
      externalId: 'evt-1',
    });
  });

  it('builds the member actor from forum.write and the admin flag', async () => {
    const { service, accessControl } = setup();
    expect(await service.memberActor({ uid: 'm-forum', isDirectoryAdmin: false })).toEqual(FORUM_MEMBER);
    expect(await service.memberActor({ uid: 'm-admin', isDirectoryAdmin: true })).toEqual(ADMIN);
    expect(await service.memberActor({ uid: 'm-plain' })).toEqual(PLAIN_MEMBER);
    expect(accessControl.hasPermission).toHaveBeenCalledWith('m-forum', 'forum.write');
  });

  it('a submitter cannot choose a status: the body has no such field', () => {
    expect(body({ status: 'APPROVED' })).not.toHaveProperty('status');
  });

  it('an edit keeps the status; a directory admin can set it', async () => {
    const { service, event } = setup();
    const { uid } = await service.createEvent(body(), FORUM_MEMBER);
    const edited = await service.updateEvent(
      event(uid) as any,
      { startDate: '2026-07-25T18:00:00+01:00', endDate: '2026-07-25T21:00:00+01:00' },
      FORUM_MEMBER
    );
    expect(edited.status).toBe('APPROVED');
    expect(event(uid).startDate).toEqual(new Date('2026-07-25T17:00:00Z'));

    const hidden = await service.updateEvent(event(uid) as any, {}, ADMIN, { status: 'REJECTED' as any });
    expect(hidden.status).toBe('REJECTED');
    expect(event(uid).reviewedAt).toBeInstanceOf(Date);
  });
});

describe('guest rows of named members follow the status (design D5)', () => {
  const associations = [
    { role: 'HOST', memberUid: 'm-host' },
    { role: 'SPEAKER', memberUid: 'm-host' },
    { role: 'SPEAKER', memberUid: 'm-speaker' },
    { role: 'SPONSOR', teamUid: 't-sponsor' },
  ];

  it('an approved event gets a guest row for each named member', async () => {
    const { service, guests, db, event } = setup();
    const { uid } = await service.createEvent(body({ associations }), FORUM_MEMBER);

    expect(db.all('pLEventAssociation').filter((row) => row.eventUid === uid)).toHaveLength(4);
    const rows = guests(uid);
    expect(rows).toHaveLength(2);
    expect(rows.find((row) => row.memberUid === 'm-host')).toMatchObject({
      isHost: true,
      isSpeaker: true,
      isSponsor: false,
      teamUid: 't-sponsor',
      locationUid: event(uid).locationUid,
    });
    expect(rows.find((row) => row.memberUid === 'm-speaker')).toMatchObject({
      isHost: false,
      isSpeaker: true,
      teamUid: null,
    });
  });

  it('a pending event gets none until it is approved', async () => {
    const { service, guests, event } = setup();
    const { uid, status } = await service.createEvent(body({ associations }), PLAIN_MEMBER);
    expect(status).toBe('PENDING');
    expect(guests(uid)).toHaveLength(0);

    await service.decide(event(uid) as any, 'APPROVED' as any);
    expect(
      guests(uid)
        .map((row) => row.memberUid)
        .sort()
    ).toEqual(['m-host', 'm-speaker']);
  });

  it('an approved event loses them when it is rejected, and keeps a member who said "I\'m going"', async () => {
    const { service, guests, event, db } = setup();
    const { uid } = await service.createEvent(body({ associations }), FORUM_MEMBER);
    db.all('pLEventGuest').push({
      uid: 'g-self',
      memberUid: 'm-plain',
      eventUid: uid,
      locationUid: event(uid).locationUid,
    });

    await service.decide(event(uid) as any, 'REJECTED' as any, 'Not a PL event');
    expect(guests(uid).map((row) => row.uid)).toEqual(['g-self']);
    expect(event(uid)).toMatchObject({ status: 'REJECTED', reviewNote: 'Not a PL event' });
  });

  it('repeating a decision changes nothing', async () => {
    const { service, event } = setup();
    const { uid } = await service.createEvent(body(), PLAIN_MEMBER);
    await service.decide(event(uid) as any, 'APPROVED' as any, 'ok');
    const reviewedAt = event(uid).reviewedAt;
    const again = await service.decide(event(uid) as any, 'APPROVED' as any, 'another note');
    expect(again).toEqual({ uid, status: 'APPROVED' });
    expect(event(uid)).toMatchObject({ reviewedAt, reviewNote: 'ok' });
  });

  it('an edit replaces the links and their guest rows', async () => {
    const { service, guests, event } = setup();
    const { uid } = await service.createEvent(body({ associations }), FORUM_MEMBER);
    await service.updateEvent(
      event(uid) as any,
      { associations: [{ role: 'HOST', memberUid: 'm-speaker' }] as any },
      FORUM_MEMBER
    );
    expect(guests(uid)).toHaveLength(1);
    expect(guests(uid)[0]).toMatchObject({ memberUid: 'm-speaker', isHost: true, isSpeaker: false });
  });

  it('refuses an unknown member, team or image before anything is stored', async () => {
    const { service, db } = setup();
    await expect(
      service.createEvent(body({ associations: [{ role: 'HOST', memberUid: 'nobody' }] }), FORUM_MEMBER)
    ).rejects.toThrow(BadRequestException);
    await expect(
      service.createEvent(body({ associations: [{ role: 'SPONSOR', teamUid: 'no-team' }] }), FORUM_MEMBER)
    ).rejects.toThrow(/Unknown team: no-team/);
    await expect(service.createEvent(body({ logoUid: 'no-image' }), FORUM_MEMBER)).rejects.toThrow(/Unknown image/);
    expect(db.all('pLEvent')).toHaveLength(0);
  });
});

describe('drafts (design D12)', () => {
  const draftBody = () =>
    body({ draft: true, name: 'Draft', tags: undefined, hostName: undefined, format: undefined, address: undefined });

  it('stores a draft with a name, dates and a time zone only', async () => {
    const { service, event } = setup();
    const result = await service.createEvent(draftBody(), PLAIN_MEMBER, { draft: true });
    expect(result.status).toBe('DRAFT');
    expect(event(result.uid)).toMatchObject({
      status: 'DRAFT',
      submitterUid: 'm-plain',
      tags: [],
      hostName: null,
      format: null,
    });
  });

  it('refuses a draft from a partner key', async () => {
    const { service } = setup();
    await expect(service.createEvent(draftBody(), PARTNER, { draft: true })).rejects.toThrow(BadRequestException);
  });

  it('submitting a draft sets the status by the rule for new submissions', async () => {
    for (const [actor, status] of [
      [FORUM_MEMBER, 'APPROVED'],
      [PLAIN_MEMBER, 'PENDING'],
    ] as const) {
      const { service, event } = setup();
      const { uid } = await service.createEvent(draftBody(), actor, { draft: true });
      const result = await service.updateEvent(
        event(uid) as any,
        { tags: ['AI'], hostName: 'Protocol Labs', format: 'VIRTUAL' } as any,
        actor,
        { submit: true }
      );
      expect(result.status).toBe(status);
      expect(event(uid).reviewedAt ?? null).toBeNull();
    }
  });

  it('a draft with no host cannot be submitted and stays a draft', async () => {
    const { service, event } = setup();
    const { uid } = await service.createEvent(draftBody(), FORUM_MEMBER, { draft: true });
    await expect(
      service.updateEvent(event(uid) as any, { tags: ['AI'], format: 'VIRTUAL' } as any, FORUM_MEMBER, { submit: true })
    ).rejects.toThrow(BadRequestException);
    expect(event(uid)).toMatchObject({ status: 'DRAFT', tags: [] });
  });

  it('a draft can be saved again without the submission fields', async () => {
    const { service, event } = setup();
    const { uid } = await service.createEvent(draftBody(), PLAIN_MEMBER, { draft: true });
    const result = await service.updateEvent(event(uid) as any, { name: 'Draft 2' }, PLAIN_MEMBER);
    expect(result.status).toBe('DRAFT');
    expect(event(uid).name).toBe('Draft 2');
  });

  it('a draft is readable by its submitter only, a directory admin included', () => {
    const draft = { status: 'DRAFT', submitterUid: 'm-plain' };
    expect(eventReadAccess(draft, { uid: 'm-plain' })).toEqual({ canRead: true, isEditor: true });
    expect(eventReadAccess(draft, { uid: 'm-admin', isDirectoryAdmin: true })).toEqual({
      canRead: false,
      isEditor: false,
    });
    expect(eventReadAccess(draft, null).canRead).toBe(false);
  });
});

describe('who reads an event that is not approved', () => {
  const pending = { status: 'PENDING', submitterUid: 'm-plain' };

  it('the submitter and a directory admin do; another member and a signed-out viewer do not', () => {
    expect(eventReadAccess(pending, { uid: 'm-plain' })).toEqual({ canRead: true, isEditor: true });
    expect(eventReadAccess(pending, { uid: 'm-admin', isDirectoryAdmin: true })).toEqual({
      canRead: true,
      isEditor: true,
    });
    expect(eventReadAccess(pending, { uid: 'm-forum' })).toEqual({ canRead: false, isEditor: false });
    expect(eventReadAccess(pending, null)).toEqual({ canRead: false, isEditor: false });
  });

  it('everyone reads an approved event; only its submitter and an admin get the edit fields', () => {
    const approved = { status: 'APPROVED', submitterUid: 'm-plain' };
    expect(eventReadAccess(approved, null)).toEqual({ canRead: true, isEditor: false });
    expect(eventReadAccess(approved, { uid: 'm-forum' })).toEqual({ canRead: true, isEditor: false });
    expect(eventReadAccess(approved, { uid: 'm-plain' }).isEditor).toBe(true);
    // An event from before approval status has no submitter: no member counts as its submitter.
    expect(eventReadAccess({ status: 'APPROVED', submitterUid: null }, { uid: 'm-forum' }).isEditor).toBe(false);
  });
});

describe('the old form fields (design D12)', () => {
  const full = () =>
    body({
      hostEmail: 'host@pl.xyz',
      coHosts: [{ name: 'Ann', email: 'ann@example.org' }, { name: 'Filecoin Foundation' }],
      websiteUrl: 'https://example.org',
      registrationUrl: 'https://lu.ma/abc',
      meetingUrl: 'https://meet.example.org/x',
      locationUrl: 'https://maps.app.goo.gl/abc',
      contactInfos: { twitter: ['https://x.com/pl'] },
      agenda: {
        sessions: [{ name: 'Opening', start_date: '2026-07-24T18:00:00Z', end_date: '2026-07-24T19:00:00Z' }],
        agendaSummary: '6pm Opening',
      },
      address: { ...VALID.address, state: 'Lisboa', locationInstructions: 'Ring the bell at door B' },
      logoUid: 'img-1',
    });

  it('stores the columns, the public details and the private contacts', async () => {
    const { service, event } = setup();
    const { uid } = await service.createEvent(full(), FORUM_MEMBER);
    const row = event(uid);

    expect(row).toMatchObject({
      websiteURL: 'https://example.org',
      registrationUrl: 'https://lu.ma/abc',
      meetingUrl: 'https://meet.example.org/x',
      venueAddress: 'Avenida da Liberdade 10',
      latitude: 38.72,
      longitude: -9.14,
      logoUid: 'img-1',
      hostName: 'Protocol Labs',
      tags: ['Networking Event'],
    });
    expect(row.resources).toEqual([
      { name: 'Registration', description: 'Registration URL', link: 'https://lu.ma/abc' },
      { name: 'Website', description: 'Website URL', link: 'https://example.org' },
    ]);

    // What every viewer reads: no email anywhere.
    const details = assembleEventDetails(row.additionalInfo, row as any);
    expect(details).toMatchObject({
      host: { name: 'Protocol Labs', logo: null },
      coHosts: [
        { name: 'Ann', logo: null },
        { name: 'Filecoin Foundation', logo: null },
      ],
      locationUrl: 'https://maps.app.goo.gl/abc',
      contactInfos: { twitter: ['https://x.com/pl'] },
      locationInstructions: 'Ring the bell at door B',
    });
    expect(details.agenda?.sessions).toHaveLength(1);
    expect(JSON.stringify(details)).not.toContain('@');

    // What the submitter and a directory admin read.
    expect(eventEditorFields(row as any)).toMatchObject({
      status: 'APPROVED',
      hostEmail: 'host@pl.xyz',
      coHosts: [
        { name: 'Ann', email: 'ann@example.org' },
        { name: 'Filecoin Foundation', email: null },
      ],
      address: {
        address: 'Avenida da Liberdade 10',
        city: 'Lisbon',
        state: 'Lisboa',
        country: 'Portugal',
        latitude: 38.72,
        longitude: -9.14,
        locationUrl: 'https://maps.app.goo.gl/abc',
        locationInstructions: 'Ring the bell at door B',
      },
      contactInfos: { twitter: ['https://x.com/pl'] },
    });
  });

  it('an edit changes what it sends, keeps the rest, and null clears a value', async () => {
    const { service, event } = setup();
    const { uid } = await service.createEvent(full(), FORUM_MEMBER);
    await service.updateEvent(
      event(uid) as any,
      { locationUrl: 'https://maps.example.org/new', meetingUrl: null, coHosts: [{ name: 'Ann' }] } as any,
      FORUM_MEMBER
    );
    const row = event(uid);
    const editor = eventEditorFields(row as any);
    expect(row.meetingUrl).toBeNull();
    expect(editor.address.locationUrl).toBe('https://maps.example.org/new');
    expect(editor.coHosts).toEqual([{ name: 'Ann', email: null }]);
    expect(editor.hostEmail).toBe('host@pl.xyz');
    expect(row.registrationUrl).toBe('https://lu.ma/abc');
  });

  it('an event with no map link reads locationUrl null', async () => {
    const { service, event } = setup();
    const { uid } = await service.createEvent(body(), FORUM_MEMBER);
    expect(assembleEventDetails(event(uid).additionalInfo, event(uid) as any).locationUrl).toBeNull();
  });

  it('a member edit that clears the tags or the host is refused; an admin may', async () => {
    const { service, event } = setup();
    const { uid } = await service.createEvent(body(), FORUM_MEMBER);
    await expect(service.updateEvent(event(uid) as any, { tags: [] }, FORUM_MEMBER)).rejects.toThrow(
      BadRequestException
    );
    await expect(service.updateEvent(event(uid) as any, { hostName: null }, FORUM_MEMBER)).rejects.toThrow(
      BadRequestException
    );
    await expect(
      service.updateEvent(event(uid) as any, { endDate: '2026-07-24T10:00:00+01:00' }, FORUM_MEMBER)
    ).rejects.toThrow(BadRequestException);
    await expect(service.updateEvent(event(uid) as any, { tags: [] }, ADMIN)).resolves.toMatchObject({
      status: 'APPROVED',
    });
  });
});

describe('the description is stored as safe HTML', () => {
  it('drops a script, an event handler and a javascript: link', () => {
    const dirty =
      '<p onclick="steal()">Hello <script>alert(1)</script><a href="javascript:alert(1)">bad</a> <a href="https://example.org" onclick="x()">good</a><img src=x onerror=alert(1)></p>';
    const clean = sanitizeEventDescription(dirty)!;
    expect(clean).not.toMatch(/script|onclick|onerror|javascript:|<img/i);
    expect(clean).toContain('<a href="https://example.org" target="_blank" rel="noopener noreferrer">good</a>');
    expect(clean).toContain('<a target="_blank" rel="noopener noreferrer">bad</a>');
  });

  it('keeps a heading, a list, text formatting and alignment', () => {
    const html =
      '<h2>Program</h2><ul><li><strong>Talks</strong></li><li><em>Demos</em> <u>and</u> <s>more</s></li></ul><p style="text-align:center;color:red">Centered<br>line</p>';
    expect(sanitizeEventDescription(html)).toBe(
      '<h2>Program</h2><ul><li><strong>Talks</strong></li><li><em>Demos</em> <u>and</u> <s>more</s></li></ul><p style="text-align:center">Centered<br />line</p>'
    );
  });

  it('sanitizes on create and on every edit; empty reads as null', async () => {
    const { service, event } = setup();
    const { uid } = await service.createEvent(body({ description: '<h2>Hi</h2><script>x</script>' }), FORUM_MEMBER);
    expect(event(uid).description).toBe('<h2>Hi</h2>');
    await service.updateEvent(event(uid) as any, { description: '<p onclick="x()">Edit</p>' }, FORUM_MEMBER);
    expect(event(uid).description).toBe('<p>Edit</p>');
    expect(sanitizeEventDescription('<script>only</script>')).toBeNull();
    expect(sanitizeEventDescription(undefined)).toBeNull();
  });
});

describe('dates and all-day events', () => {
  it('stores an all-day event as whole days in its time zone', async () => {
    const { service, event } = setup();
    const { uid } = await service.createEvent(
      body({ allDay: true, startDate: '2026-07-24', endDate: '2026-07-26' }),
      FORUM_MEMBER
    );
    // Lisbon is UTC+1 in July.
    expect(event(uid)).toMatchObject({
      isAllDay: true,
      timezone: 'Europe/Lisbon',
      startDate: new Date('2026-07-23T23:00:00.000Z'),
      endDate: new Date('2026-07-26T22:59:59.999Z'),
    });
    expect(resolveEventDate('2026-07-24', 'start', 'Asia/Tokyo')).toEqual(new Date('2026-07-23T15:00:00.000Z'));
  });

  it('a partner event with no end date and no time zone ends on its start day, in the gathering time zone or UTC', async () => {
    const { service, event } = setup();
    const inDenver = await service.createEvent(
      {
        name: 'ETHDenver',
        startDate: '2026-07-24',
        allDay: true,
        format: 'IN_PERSON',
        address: { city: 'Denver', state: 'Colorado', country: 'United States' },
      } as any,
      PARTNER,
      { externalId: 'evt-9' }
    );
    expect(event(inDenver.uid)).toMatchObject({
      timezone: 'America/Denver',
      isAllDay: true,
      description: null,
      startDate: new Date('2026-07-24T06:00:00.000Z'),
      endDate: new Date('2026-07-25T05:59:59.999Z'),
      status: 'APPROVED',
    });

    const virtual = await service.createEvent(
      { name: 'Call', startDate: '2026-07-24T10:00:00Z', format: 'VIRTUAL' } as any,
      PARTNER,
      { externalId: 'evt-10' }
    );
    expect(event(virtual.uid)).toMatchObject({
      timezone: 'UTC',
      startDate: new Date('2026-07-24T10:00:00Z'),
      endDate: new Date('2026-07-24T10:00:00Z'),
    });
  });

  it('an edit that switches to all-day needs both dates', async () => {
    const { service, event } = setup();
    const { uid } = await service.createEvent(body(), FORUM_MEMBER);
    await expect(service.updateEvent(event(uid) as any, { allDay: true }, FORUM_MEMBER)).rejects.toThrow(
      BadRequestException
    );
    await expect(service.updateEvent(event(uid) as any, { startDate: '2026-07-24' }, FORUM_MEMBER)).rejects.toThrow(
      BadRequestException
    );
    await service.updateEvent(
      event(uid) as any,
      { allDay: true, startDate: '2026-07-24', endDate: '2026-07-25' },
      FORUM_MEMBER
    );
    expect(event(uid).isAllDay).toBe(true);
  });
});

describe('who may edit and delete', () => {
  const owned = (status: string) => ({ uid: 'e', status, submitterUid: 'm-plain', sourceTeamUid: null } as any);

  it('the submitter and a directory admin edit; another member does not', () => {
    const { service } = setup();
    expect(() => service.assertCanEdit(owned('PENDING'), PLAIN_MEMBER)).not.toThrow();
    expect(() => service.assertCanEdit(owned('PENDING'), ADMIN)).not.toThrow();
    expect(() => service.assertCanEdit(owned('PENDING'), PARTNER)).not.toThrow();
    expect(() => service.assertCanEdit(owned('PENDING'), FORUM_MEMBER)).toThrow(ForbiddenException);
  });

  it('a submitter deletes their event until it is approved; an admin always', () => {
    const { service } = setup();
    expect(() => service.assertCanDelete(owned('PENDING'), PLAIN_MEMBER)).not.toThrow();
    expect(() => service.assertCanDelete(owned('DRAFT'), PLAIN_MEMBER)).not.toThrow();
    expect(() => service.assertCanDelete(owned('REJECTED'), PLAIN_MEMBER)).not.toThrow();
    expect(() => service.assertCanDelete(owned('APPROVED'), PLAIN_MEMBER)).toThrow(ForbiddenException);
    expect(() => service.assertCanDelete(owned('APPROVED'), ADMIN)).not.toThrow();
    expect(() => service.assertCanDelete(owned('PENDING'), FORUM_MEMBER)).toThrow(ForbiddenException);
  });

  it('a partner key deletes only the events its team published', () => {
    const { service } = setup();
    expect(() => service.assertCanDelete({ ...owned('APPROVED'), sourceTeamUid: 't-curator' }, PARTNER)).not.toThrow();
    expect(() => service.assertCanDelete({ ...owned('APPROVED'), sourceTeamUid: 't-other' }, PARTNER)).toThrow(
      ForbiddenException
    );
    expect(() => service.assertCanDelete(owned('PENDING'), PARTNER)).toThrow(ForbiddenException);
  });

  it('a delete marks the event deleted, removes named guests and refreshes the caches', async () => {
    const { service, event, guests, cache, pushCandidates } = setup();
    const { uid } = await service.createEvent(
      body({ associations: [{ role: 'HOST', memberUid: 'm-host' }] }),
      FORUM_MEMBER
    );
    expect(guests(uid)).toHaveLength(1);
    await service.deleteEvent(event(uid) as any);
    expect(event(uid).isDeleted).toBe(true);
    expect(guests(uid)).toHaveLength(0);
    await expect(service.findEvent(uid)).rejects.toThrow(/Event not found/);
    expect(cache.reset).toHaveBeenCalledWith({ service: 'PLEventGuest' });
    expect(pushCandidates.refreshCandidatesForEvents).toHaveBeenLastCalledWith([uid]);
  });
});
