// The real collaborators pull in a module graph that overflows ts-jest's type check (TS 4.7), so they are stubbed.
jest.mock('../shared/prisma.service', () => ({ PrismaService: class {} }));
jest.mock('../shared/log.service', () => ({ LogService: class {} }));
jest.mock('../utils/cache/cache.service', () => ({ CacheService: class {} }));
jest.mock('./push/irl-gathering-push-candidates.service', () => ({ IrlGatheringPushCandidatesService: class {} }));
jest.mock('../access-control-v2/services/access-control-v2.service', () => ({ AccessControlV2Service: class {} }));
jest.mock('../integration-keys/integration-candidates.service', () => {
  // The cursor helpers, without the service's dependencies.
  const encodeCursor = (cursor: { t: string; u: string }) =>
    Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
  const decodeCursor = (raw: string) => {
    try {
      const parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
      if (typeof parsed?.t !== 'string' || typeof parsed?.u !== 'string') throw new Error('bad shape');
      return parsed;
    } catch {
      const { BadRequestException } = jest.requireActual('@nestjs/common');
      throw new BadRequestException('Invalid cursor');
    }
  };
  return { encodeCursor, decodeCursor };
});
jest.mock('../images/images.service', () => ({ ImagesService: class {} }));
jest.mock('../integration-keys/integration-keys.service', () => ({ IntegrationKeysService: class {} }));

import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { PLEventCurationListSchema } from 'libs/contracts/src/schema/pl-event-curation';
import { INTEGRATION_SCOPES_KEY } from '../decorators/require-integration-scopes.decorator';
import { IntegrationKeyGuard } from '../guards/integration-key.guard';
import { InMemoryPrisma, InMemoryTables } from './fixtures/in-memory-prisma';
import { PLEventCurationController } from './pl-event-curation.controller';
import { PLEventCurationService } from './pl-event-curation.service';
import { eventListWhere } from './pl-event-list';
import { PLEventWriteService } from './pl-event-write.service';

/** LAB-3326: the curation API for partner apps. */

const TEAM = 't-curator';
const OTHER_TEAM = 't-other';
const MEMBER_ACTOR = { kind: 'member' as const, memberUid: 'm-plain', trusted: false, isAdmin: false };

const EVENT = {
  name: 'ETHDenver',
  startDate: '2026-07-24',
  allDay: true,
  format: 'IN_PERSON',
  address: { city: 'Denver', country: 'United States' },
};

function setup(tables: InMemoryTables = {}) {
  const db = new InMemoryPrisma({
    member: [{ uid: 'm-plain', name: 'Pat Plain', email: 'pat@example.org' }],
    team: [{ uid: TEAM }, { uid: OTHER_TEAM }],
    image: [{ uid: 'img-1', url: 'https://img/1.png' }],
    ...tables,
  });
  const write = new PLEventWriteService(
    db.client() as any,
    { info: jest.fn(), error: jest.fn() } as any,
    { reset: jest.fn() } as any,
    { refreshCandidatesForEvents: jest.fn(async () => undefined) } as any,
    { hasPermission: jest.fn(async () => ({ allowed: false })) } as any
  );
  const curation = new PLEventCurationService(db.client() as any, write);
  const event = (uid: string) => db.all('pLEvent').find((row) => row.uid === uid)!;
  /** Whether the event is in the LabOS events list right now. */
  const listed = (uid: string) =>
    db
      .findMany('pLEvent', { where: eventListWhere({ page: 1, limit: 50, from: new Date(0) }, new Date(), null) })
      .some((row) => row.uid === uid);
  const memberSubmits = async (extra: Record<string, unknown> = {}) =>
    (
      await write.createEvent(
        {
          name: 'Member Meetup',
          startDate: '2026-08-01T10:00:00Z',
          endDate: '2026-08-01T12:00:00Z',
          timezone: 'UTC',
          format: 'VIRTUAL',
          tags: ['AI'],
          hostName: 'Pat',
          ...extra,
        } as any,
        MEMBER_ACTOR
      )
    ).uid;
  return { db, write, curation, event, listed, memberSubmits };
}

const status = async (run: Promise<unknown>) => {
  try {
    await run;
    return 200;
  } catch (error) {
    return error instanceof HttpException ? error.getStatus() : 500;
  }
};

describe('reading events in every status', () => {
  it("returns the pending queue with each submitter's contact", async () => {
    const { curation, memberSubmits } = setup();
    const a = await memberSubmits();
    const b = await memberSubmits({ name: 'Second Meetup' });
    for (let i = 0; i < 5; i += 1) await curation.upsert(TEAM, `approved-${i}`, EVENT);

    const page = await curation.list(TEAM, { status: 'PENDING' });
    expect(PLEventCurationListSchema.safeParse(page).success).toBe(true);
    expect(page.items.map((item) => item.uid).sort()).toEqual([a, b].sort());
    for (const item of page.items) {
      expect(item.submitter).toEqual({ memberUid: 'm-plain', name: 'Pat Plain', email: 'pat@example.org' });
    }
    expect(page.nextCursor).toBeNull();
  });

  it("carries the event fields, the status, the external id and whether the key's team created it", async () => {
    const { curation } = setup();
    const mine = await curation.upsert(TEAM, 'evt-1', {
      ...EVENT,
      hostName: 'PL',
      hostEmail: 'host@pl.xyz',
      tags: ['FA1'],
      logoUid: 'img-1',
      locationUrl: 'https://maps.example.org/x',
    });
    const theirs = await curation.upsert(OTHER_TEAM, 'evt-1', EVENT);

    const { items } = await curation.list(TEAM, {});
    const item = items.find((row) => row.uid === mine.uid)!;
    expect(item).toMatchObject({
      status: 'APPROVED',
      externalId: 'evt-1',
      createdByYourTeam: true,
      submitter: null,
      name: 'ETHDenver',
      allDay: true,
      format: 'IN_PERSON',
      tags: ['FA1'],
      hostName: 'PL',
      hostEmail: 'host@pl.xyz',
      locationUrl: 'https://maps.example.org/x',
      logoUid: 'img-1',
      logo: 'https://img/1.png',
      address: { city: 'Denver', country: 'United States' },
      gathering: { uid: expect.any(String), name: 'Denver, United States' },
    });
    expect(items.find((row) => row.uid === theirs.uid)!.createdByYourTeam).toBe(false);
  });

  it('filters by several statuses and leaves drafts and deleted events out', async () => {
    const { curation, memberSubmits, write, event } = setup();
    const pending = await memberSubmits();
    const rejected = await memberSubmits();
    await curation.decide(rejected, 'REJECTED', null);
    const approved = (await curation.upsert(TEAM, 'evt-1', EVENT)).uid;
    const draft = (
      await write.createEvent(
        { name: 'Draft', startDate: '2026-08-01T10:00:00Z', endDate: '2026-08-01T11:00:00Z', timezone: 'UTC' } as any,
        MEMBER_ACTOR,
        { draft: true }
      )
    ).uid;
    const deleted = (await curation.upsert(TEAM, 'evt-2', EVENT)).uid;
    await curation.delete(TEAM, deleted);

    const all = (await curation.list(TEAM, {})).items.map((item) => item.uid).sort();
    expect(all).toEqual([pending, rejected, approved].sort());
    expect(all).not.toContain(draft);
    const two = await curation.list(TEAM, { status: ['PENDING', 'REJECTED'] });
    expect(two.items.map((item) => item.uid).sort()).toEqual([pending, rejected].sort());
    expect((await curation.list(TEAM, { status: 'PENDING,REJECTED' })).items).toHaveLength(2);
    await expect(curation.list(TEAM, { status: 'DRAFT' })).rejects.toBeInstanceOf(BadRequestException);
    expect(event(draft).status).toBe('DRAFT');
  });

  it('returns only what changed since a time', async () => {
    const { curation, db } = setup();
    const older = (await curation.upsert(TEAM, 'old', EVENT)).uid;
    const newer = (await curation.upsert(TEAM, 'new', EVENT)).uid;
    db.all('pLEvent').find((row) => row.uid === older)!.updatedAt = new Date('2026-01-01T00:00:00Z');
    db.all('pLEvent').find((row) => row.uid === newer)!.updatedAt = new Date('2026-06-01T00:00:00Z');

    const since = await curation.list(TEAM, { updatedSince: '2026-03-01T00:00:00Z' });
    expect(since.items.map((item) => item.uid)).toEqual([newer]);
    await expect(curation.list(TEAM, { updatedSince: 'yesterday' })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('pages to the end and delivers every event exactly once, oldest change first', async () => {
    const { curation, db } = setup();
    for (let i = 0; i < 23; i += 1) await curation.upsert(TEAM, `evt-${i}`, { ...EVENT, name: `Event ${i}` });
    // Several events share one change time: the uid breaks the tie.
    db.all('pLEvent').forEach((row, i) => {
      row.updatedAt = new Date(Date.UTC(2026, 0, 1, 0, 0, Math.floor(i / 4)));
    });

    const seen: string[] = [];
    const times: string[] = [];
    let cursor: string | null | undefined;
    let pages = 0;
    do {
      const page = await curation.list(TEAM, { limit: '5', ...(cursor ? { cursor } : {}) });
      seen.push(...page.items.map((item) => item.uid));
      times.push(...page.items.map((item) => item.updatedAt));
      cursor = page.nextCursor;
      pages += 1;
    } while (cursor && pages < 20);

    expect(pages).toBe(5);
    expect(seen).toHaveLength(23);
    expect(new Set(seen).size).toBe(23);
    expect([...times].sort()).toEqual(times);
    await expect(curation.list(TEAM, { limit: '101' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(curation.list(TEAM, { cursor: 'not-a-cursor' })).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('decisions', () => {
  it('approves a pending submission: it is in the events list at once, with its named hosts going', async () => {
    const { curation, memberSubmits, listed, event, db } = setup();
    const uid = await memberSubmits({
      format: 'IN_PERSON',
      address: { city: 'Lisbon', country: 'Portugal' },
      associations: [{ role: 'HOST', memberUid: 'm-plain' }],
    });
    expect(listed(uid)).toBe(false);
    expect(db.all('pLEventGuest')).toHaveLength(0);

    await curation.decide(uid, 'APPROVED', null);

    expect(listed(uid)).toBe(true);
    expect(event(uid).reviewedAt).toBeInstanceOf(Date);
    expect(db.all('pLEventGuest')).toEqual([
      expect.objectContaining({ eventUid: uid, memberUid: 'm-plain', isHost: true }),
    ]);
  });

  it('rejects a pending submission with a note', async () => {
    const { curation, memberSubmits, listed, event } = setup();
    const uid = await memberSubmits();
    await curation.decide(uid, 'REJECTED', 'Not a PL event');
    expect(listed(uid)).toBe(false);
    expect(event(uid)).toMatchObject({ status: 'REJECTED', reviewNote: 'Not a PL event' });
    expect((await curation.item(uid, TEAM)).reviewNote).toBe('Not a PL event');
  });

  it('hides an approved event by rejecting it, and brings it back with a second decision', async () => {
    const { curation, write, listed } = setup();
    const { uid } = await write.createEvent(
      {
        name: 'Forum Event',
        startDate: '2026-08-01T10:00:00Z',
        endDate: '2026-08-01T12:00:00Z',
        timezone: 'UTC',
        format: 'VIRTUAL',
        tags: ['AI'],
        hostName: 'F',
      } as any,
      { kind: 'member', memberUid: 'm-plain', trusted: true, isAdmin: false }
    );
    expect(listed(uid)).toBe(true);
    await curation.decide(uid, 'REJECTED', null);
    expect(listed(uid)).toBe(false);
    await curation.decide(uid, 'APPROVED', null);
    expect(listed(uid)).toBe(true);
  });

  it('repeating a decision succeeds and changes nothing', async () => {
    const { curation, memberSubmits, event } = setup();
    const uid = await memberSubmits();
    await curation.decide(uid, 'APPROVED', 'first');
    const before = { ...event(uid) };
    await expect(curation.decide(uid, 'APPROVED', 'second')).resolves.toEqual({ uid, status: 'APPROVED' });
    expect(event(uid)).toEqual(before);
  });

  it('answers 404 for an unknown, a deleted and a draft event', async () => {
    const { curation, write } = setup();
    const own = (await curation.upsert(TEAM, 'evt-1', EVENT)).uid;
    await curation.delete(TEAM, own);
    const draft = (
      await write.createEvent(
        { name: 'Draft', startDate: '2026-08-01T10:00:00Z', endDate: '2026-08-01T11:00:00Z', timezone: 'UTC' } as any,
        MEMBER_ACTOR,
        { draft: true }
      )
    ).uid;
    for (const uid of ['nope', own, draft]) {
      await expect(curation.decide(uid, 'APPROVED', null)).rejects.toBeInstanceOf(NotFoundException);
    }
  });
});

describe('publishing by external id', () => {
  it('creates on the first push and updates on the second, with one event and the same uid', async () => {
    const { curation, db, listed } = setup();
    const first = await curation.upsert(TEAM, 'evt-1', EVENT);
    expect(first).toEqual({ uid: expect.any(String), externalId: 'evt-1', result: 'created', status: 'APPROVED' });
    expect(listed(first.uid)).toBe(true);
    expect(db.all('pLEvent')[0]).toMatchObject({ sourceTeamUid: TEAM, externalId: 'evt-1', submitterUid: null });

    const second = await curation.upsert(TEAM, 'evt-1', { ...EVENT, name: 'ETHDenver 2026' });
    expect(second).toEqual({ uid: first.uid, externalId: 'evt-1', result: 'updated', status: 'APPROVED' });
    expect(db.all('pLEvent')).toHaveLength(1);
    expect(db.all('pLEvent')[0].name).toBe('ETHDenver 2026');
  });

  it('keeps two teams with the same external id apart', async () => {
    const { curation, db } = setup();
    const a = await curation.upsert(TEAM, 'evt-1', EVENT);
    const b = await curation.upsert(OTHER_TEAM, 'evt-1', EVENT);
    expect(b.result).toBe('created');
    expect(b.uid).not.toBe(a.uid);
    expect(db.all('pLEvent')).toHaveLength(2);
  });

  it('answers 422 for an invalid event and stores nothing', async () => {
    const { curation, db } = setup();
    for (const bad of [
      { ...EVENT, endDate: '2026-07-23' },
      { ...EVENT, format: undefined },
      { ...EVENT, name: '' },
      { ...EVENT, locationUrl: 'javascript:alert(1)' },
      { ...EVENT, associations: [{ role: 'HOST', memberUid: 'nobody' }] },
      { ...EVENT, startDate: '2026-07-24', allDay: false },
    ]) {
      await expect(curation.upsert(TEAM, 'evt-1', bad)).rejects.toBeInstanceOf(UnprocessableEntityException);
    }
    await expect(curation.upsert(TEAM, ' ', EVENT)).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(db.all('pLEvent')).toHaveLength(0);
  });

  it('restores a deleted event on the next push, with the same uid', async () => {
    const { curation, listed, event } = setup();
    const { uid } = await curation.upsert(TEAM, 'evt-1', EVENT);
    await curation.delete(TEAM, uid);
    expect(listed(uid)).toBe(false);

    const again = await curation.upsert(TEAM, 'evt-1', EVENT);
    expect(again).toMatchObject({ uid, result: 'updated', status: 'APPROVED' });
    expect(event(uid).isDeleted).toBe(false);
    expect(listed(uid)).toBe(true);
  });

  it('takes a date-only event with no description, end date or time zone', async () => {
    const { curation, event } = setup({
      pLEventLocation: [
        { uid: 'loc-lisbon', location: 'Lisbon, Portugal', timezone: 'Europe/Lisbon', isDeleted: false },
      ],
      pLEventLocationAssociation: [
        { uid: 'a-lisbon', locationUid: 'loc-lisbon', city: 'Lisbon', country: 'Portugal', isDeleted: false },
      ],
    });
    const { uid } = await curation.upsert(TEAM, 'conf', {
      name: 'Conference',
      startDate: '2026-07-24',
      allDay: true,
      format: 'IN_PERSON',
      address: { city: 'Lisbon', country: 'Portugal' },
    });
    expect(event(uid)).toMatchObject({
      isAllDay: true,
      description: null,
      timezone: 'Europe/Lisbon',
      locationUid: 'loc-lisbon',
      startDate: new Date('2026-07-23T23:00:00.000Z'),
      endDate: new Date('2026-07-24T22:59:59.999Z'),
    });

    const virtual = await curation.upsert(TEAM, 'call', {
      name: 'Call',
      startDate: '2026-07-24T10:00:00Z',
      format: 'VIRTUAL',
    });
    expect(event(virtual.uid).timezone).toBe('UTC');
  });

  it('a batch stores the good events and reports the bad one, in order', async () => {
    const { curation, db } = setup();
    const results = await curation.upsertBatch(TEAM, [
      { externalId: 'a', ...EVENT },
      { externalId: 'b', ...EVENT, name: '' },
      { externalId: 'c', ...EVENT, name: 'Third' },
      { ...EVENT },
    ]);
    expect(results).toEqual([
      { uid: expect.any(String), externalId: 'a', result: 'created', status: 'APPROVED' },
      { externalId: 'b', result: 'error', error: expect.stringContaining('name') },
      { uid: expect.any(String), externalId: 'c', result: 'created', status: 'APPROVED' },
      { externalId: null, result: 'error', error: expect.stringContaining('externalId') },
    ]);
    expect(db.all('pLEvent').map((row) => row.externalId)).toEqual(['a', 'c']);

    const again = await curation.upsertBatch(TEAM, [{ externalId: 'a', ...EVENT, name: 'Renamed' }]);
    expect(again[0]).toMatchObject({ result: 'updated' });
  });
});

describe('correcting any event, deleting its own', () => {
  it("patches a member's pending submission and keeps its status and submitter", async () => {
    const { curation, memberSubmits, event } = setup();
    const uid = await memberSubmits();
    await curation.patch(TEAM, uid, { name: 'Member Meetup (fixed)' });
    expect(event(uid)).toMatchObject({
      name: 'Member Meetup (fixed)',
      status: 'PENDING',
      submitterUid: 'm-plain',
      sourceTeamUid: null,
    });
  });

  it('answers 422 for an invalid patch and 404 for an unknown event', async () => {
    const { curation, memberSubmits } = setup();
    const uid = await memberSubmits();
    await expect(curation.patch(TEAM, uid, { websiteUrl: 'ftp://x' })).rejects.toBeInstanceOf(
      UnprocessableEntityException
    );
    await expect(curation.patch(TEAM, uid, { endDate: '2026-07-01T00:00:00Z' })).rejects.toBeInstanceOf(
      UnprocessableEntityException
    );
    await expect(curation.patch(TEAM, 'nope', { name: 'x' })).rejects.toBeInstanceOf(NotFoundException);
  });

  it("refuses to delete a member's event and another team's event, and deletes its own", async () => {
    const { curation, memberSubmits, event, listed } = setup();
    const members = await memberSubmits();
    const theirs = (await curation.upsert(OTHER_TEAM, 'evt-1', EVENT)).uid;
    const own = (await curation.upsert(TEAM, 'evt-1', EVENT)).uid;

    await expect(curation.delete(TEAM, members)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(curation.delete(TEAM, theirs)).rejects.toBeInstanceOf(ForbiddenException);
    expect(event(members).isDeleted).toBe(false);
    expect(event(theirs).isDeleted).toBe(false);

    await curation.delete(TEAM, own);
    expect(listed(own)).toBe(false);
    await expect(curation.delete(TEAM, own)).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('the curation controller', () => {
  const routes = PLEventCurationController.prototype;
  const scopesOf = (handler: unknown) => Reflect.getMetadata(INTEGRATION_SCOPES_KEY, handler as object);

  it('every route sits behind the integration key guard, outside the member rate limiter and the cache', () => {
    expect(Reflect.getMetadata('__guards__', PLEventCurationController)).toEqual([IntegrationKeyGuard]);
    expect(Reflect.getMetadata('path', PLEventCurationController)).toBe('v1/integrations/events');
    expect(Reflect.getMetadata('THROTTLER:SKIP', PLEventCurationController)).toBe(true);
    expect(Reflect.getMetadata('ignoreCaching', PLEventCurationController)).toBe(true);
  });

  it('reads need events:read and writes need events:write', () => {
    expect(scopesOf(routes.list)).toEqual(['events:read']);
    for (const handler of [
      routes.batch,
      routes.uploadImage,
      routes.upsert,
      routes.decide,
      routes.patch,
      routes.delete,
    ]) {
      expect(scopesOf(handler)).toEqual(['events:write']);
    }
    // No route is left without a scope.
    const handlers = Object.getOwnPropertyNames(routes).filter((name) => name !== 'constructor');
    expect(handlers.sort()).toEqual(['batch', 'decide', 'delete', 'list', 'patch', 'uploadImage', 'upsert']);
  });

  it('declares the static paths before the uid routes', () => {
    const order = Object.getOwnPropertyNames(routes).filter((name) => name !== 'constructor');
    expect(order.indexOf('batch')).toBeLessThan(order.indexOf('decide'));
    expect(order.indexOf('uploadImage')).toBeLessThan(order.indexOf('decide'));
  });

  function controller() {
    const { curation } = setup();
    const images = {
      upload: jest.fn(async (file: { mimetype: string }) => {
        if (file.mimetype !== 'image/png') throw new HttpException('Invalid file type', 400);
        return { image: { uid: 'img-9', url: 'https://img/9.png', thumbnails: [] } };
      }),
    };
    return { api: new PLEventCurationController(curation, images as any), images };
  }
  const req = {
    integrationKey: {
      uid: 'k1',
      teamUid: TEAM,
      scopes: ['events:read', 'events:write'],
      name: 'PL Infra Events',
      keyPrefix: 'plk_',
    },
  } as any;

  it('answers 422 for more than 100 events, for no events and for a bad decision', async () => {
    const { api } = controller();
    expect(
      await status(
        api.batch({ events: Array.from({ length: 101 }, (_, i) => ({ externalId: `e${i}`, ...EVENT })) }, req)
      )
    ).toBe(422);
    expect(await status(api.batch({ events: [] }, req))).toBe(422);
    expect(await status(api.batch({}, req))).toBe(422);
    expect(await status(api.decide('x', { status: 'PENDING' }, req))).toBe(422);
    expect(
      (await api.batch({ events: Array.from({ length: 100 }, (_, i) => ({ externalId: `e${i}`, ...EVENT })) }, req))
        .results
    ).toHaveLength(100);
  });

  it('a decision answers the event as the curator reads it', async () => {
    const { api } = controller();
    const created = await api.upsert('evt-1', EVENT, req);
    const decided = await api.decide(created.uid, { status: 'REJECTED', note: 'duplicate' }, req);
    expect(decided).toMatchObject({
      uid: created.uid,
      status: 'REJECTED',
      reviewNote: 'duplicate',
      createdByYourTeam: true,
    });
  });

  it('uploads an image and refuses another file type with 400', async () => {
    const { api } = controller();
    await expect(api.uploadImage({ mimetype: 'image/png' } as any)).resolves.toEqual({
      uid: 'img-9',
      url: 'https://img/9.png',
    });
    expect(await status(api.uploadImage({ mimetype: 'text/plain' } as any))).toBe(400);
    expect(await status(api.uploadImage(undefined as any))).toBe(422);
  });
});
