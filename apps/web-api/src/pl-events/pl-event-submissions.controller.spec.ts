// Loading the real services and guards makes ts-jest's type check overflow the stack (TS 4.7), so they are stubbed,
// as in pl-events.routes.spec.ts. The controllers, Nest's router, the body parsing and PLEventWriteService are real.
// The guards read the member from a test header instead of a token. The classes are built inside the factories,
// which jest hoists above every other statement of this file.
jest.mock('../guards/user-token-check.guard', () => {
  class FromTestHeader {
    canActivate(context: any) {
      const request = context.switchToHttp().getRequest();
      const email = request.headers['x-test-email'];
      if (email) request.userEmail = email;
      return true;
    }
  }
  return { UserTokenCheckGuard: FromTestHeader, OptionalUserTokenCheckGuard: FromTestHeader };
});
jest.mock('../guards/user-token-validation.guard', () => {
  const { UnauthorizedException } = jest.requireActual('@nestjs/common');
  class RequireTestHeader {
    canActivate(context: any) {
      const request = context.switchToHttp().getRequest();
      const email = request.headers['x-test-email'];
      if (!email) throw new UnauthorizedException();
      request.userEmail = email;
      return true;
    }
  }
  return { UserTokenValidation: RequireTestHeader };
});
const allow = () =>
  class {
    canActivate() {
      return true;
    }
  };
jest.mock('../guards/user-auth-validate.guard', () => ({ UserAuthValidateGuard: allow() }));
jest.mock('../guards/admin-auth.guard', () => ({ AdminAuthGuard: allow() }));
jest.mock('../guards/auth.guard', () => ({ InternalAuthGuard: allow() }));
jest.mock('../rbac/rbac.guard', () => ({ RbacGuard: allow() }));
jest.mock('../members/members.service', () => ({ MembersService: class {} }));
jest.mock('../teams/teams.service', () => ({ TeamsService: class {} }));
jest.mock('./pl-event-sync.service', () => ({ PLEventSyncService: class {} }));
jest.mock('./pl-event-locations.service', () => ({ PLEventLocationsService: class {} }));
jest.mock('./pl-event-guests.service', () => ({ PLEventGuestsService: class {} }));
jest.mock('../notifications/notifications.service', () => ({ NotificationService: class {} }));
jest.mock('../events/events-tooling.service', () => ({ EventsToolingService: class {} }));
jest.mock('../utils/cache/cache.service', () => ({ CacheService: class {} }));
jest.mock('./push/irl-gathering-push-candidates.service', () => ({ IrlGatheringPushCandidatesService: class {} }));
jest.mock('../shared/prisma.service', () => ({ PrismaService: class {} }));
jest.mock('../shared/log.service', () => ({ LogService: class {} }));
jest.mock('../access-control-v2/services/access-control-v2.service', () => ({ AccessControlV2Service: class {} }));

import { INestApplication, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import request from 'supertest';
import { MembersService } from '../members/members.service';
import { TeamsService } from '../teams/teams.service';
import { InMemoryPrisma } from './fixtures/in-memory-prisma';
import { PLEventGuestsService } from './pl-event-guests.service';
import { PLEventLocationsService } from './pl-event-locations.service';
import { PLEventSubmissionsController } from './pl-event-submissions.controller';
import { PLEventSyncService } from './pl-event-sync.service';
import { PLEventWriteService } from './pl-event-write.service';
import { PLEventsController } from './pl-events.controller';
import { PLEventsService } from './pl-events.service';

/** LAB-3325 / LAB-3343: `POST /v1/irl/events`, `GET /mine`, `PATCH` and `DELETE /:uid`, and the owner's read. */

const MEMBERS: Record<string, { uid: string; isDirectoryAdmin: boolean }> = {
  'forum@pl.xyz': { uid: 'm-forum', isDirectoryAdmin: false },
  'plain@pl.xyz': { uid: 'm-plain', isDirectoryAdmin: false },
  'other@pl.xyz': { uid: 'm-other', isDirectoryAdmin: false },
  'admin@pl.xyz': { uid: 'm-admin', isDirectoryAdmin: true },
};
const as = (email: string) => ({ 'x-test-email': email });

const VALID = {
  name: 'Lisbon Builders Night',
  startDate: '2026-07-24T18:00:00+01:00',
  endDate: '2026-07-24T21:00:00+01:00',
  timezone: 'Europe/Lisbon',
  format: 'IN_PERSON',
  tags: ['Networking Event'],
  hostName: 'Protocol Labs',
  address: { address: 'Avenida da Liberdade 10', city: 'Lisbon', country: 'Portugal' },
};

describe('event submission routes', () => {
  let app: INestApplication;
  let db: InMemoryPrisma;
  const flag = process.env.EVENTS_LOCAL_SUBMIT_ENABLED;

  const http = () => request(app.getHttpServer());
  const stored = (uid: string) => db.all('pLEvent').find((row) => row.uid === uid)!;
  const submit = async (email: string | null, body: Record<string, unknown> = {}) => {
    const call = http().post('/v1/irl/events');
    if (email) call.set(as(email));
    return call.send({ ...VALID, ...body });
  };

  beforeEach(async () => {
    process.env.EVENTS_LOCAL_SUBMIT_ENABLED = 'true';
    db = new InMemoryPrisma({
      member: Object.values(MEMBERS).map((member) => ({ uid: member.uid, name: member.uid, image: null })),
      team: [{ uid: 't-1' }],
    });
    const prisma = db.client();
    const logger = { info: jest.fn(), error: jest.fn() };
    const guestService = {
      filterEventsByAttendanceAndAdminStatus: jest.fn(async (_uids: unknown, events: unknown[]) => events),
    };
    const eventsService = new PLEventsService(
      prisma as any,
      logger as any,
      guestService as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any
    );
    const writeService = new PLEventWriteService(
      prisma as any,
      logger as any,
      { reset: jest.fn() } as any,
      { refreshCandidatesForEvents: jest.fn(async () => undefined) } as any,
      { hasPermission: jest.fn(async (uid: string) => ({ allowed: uid === 'm-forum' })) } as any
    );

    // NestFactory, not @nestjs/testing: the installed @nestjs/testing (9.0) does not match @nestjs/core (9.4).
    @Module({
      // The order of pl-events.module.ts: the submissions controller first.
      controllers: [PLEventSubmissionsController, PLEventsController],
      providers: [
        {
          provide: MembersService,
          useValue: { findMemberByEmail: jest.fn(async (email: string) => MEMBERS[email] ?? null) },
        },
        { provide: PLEventsService, useValue: eventsService },
        { provide: PLEventWriteService, useValue: writeService },
        { provide: PLEventLocationsService, useValue: {} },
        { provide: PLEventGuestsService, useValue: guestService },
        { provide: PLEventSyncService, useValue: {} },
        { provide: TeamsService, useValue: {} },
      ],
    })
    class SubmissionsTestModule {}
    app = await NestFactory.create(SubmissionsTestModule, { logger: false });
    await app.init();
  });

  afterEach(async () => {
    await app?.close();
    process.env.EVENTS_LOCAL_SUBMIT_ENABLED = flag;
  });

  describe('POST /v1/irl/events', () => {
    it('a forum member is published at once: 201 with the uid and APPROVED', async () => {
      const res = await submit('forum@pl.xyz');
      expect(res.status).toBe(201);
      expect(res.body).toEqual({ uid: expect.any(String), status: 'APPROVED' });
      expect(stored(res.body.uid)).toMatchObject({ submitterUid: 'm-forum', status: 'APPROVED', name: VALID.name });
    });

    it('a member without forum access waits for approval, whatever status they send', async () => {
      const res = await submit('plain@pl.xyz', { status: 'APPROVED' });
      expect(res.status).toBe(201);
      expect(res.body.status).toBe('PENDING');
      expect(stored(res.body.uid).status).toBe('PENDING');
    });

    it('a directory admin is published at once', async () => {
      expect((await submit('admin@pl.xyz')).body.status).toBe('APPROVED');
    });

    it('answers 401 with no session, and stores nothing', async () => {
      const res = await submit(null, { contactEmail: 'guest@example.org' });
      expect(res.status).toBe(401);
      expect(db.all('pLEvent')).toHaveLength(0);
    });

    it('answers 400 and stores nothing for an invalid body', async () => {
      for (const bad of [
        { endDate: '2026-07-24T17:00:00+01:00' },
        { tags: [] },
        { hostName: '' },
        { locationUrl: 'javascript:alert(1)' },
        { coHosts: [{ email: 'a@b.co' }] },
        { hostEmail: 'not-an-email' },
        { associations: [{ role: 'HOST', teamUid: 'no-such-team' }] },
        { name: '' },
      ]) {
        const res = await submit('forum@pl.xyz', bad);
        expect([JSON.stringify(bad), res.status]).toEqual([JSON.stringify(bad), 400]);
      }
      expect(db.all('pLEvent')).toHaveLength(0);
    });

    it('an in-person event with no address is accepted with no gathering', async () => {
      const res = await submit('forum@pl.xyz', { address: undefined });
      expect(res.status).toBe(201);
      expect(stored(res.body.uid).locationUid).toBeNull();
    });

    it('stores a map link on submit and on edit; no link reads null', async () => {
      const withLink = await submit('forum@pl.xyz', { locationUrl: 'https://maps.app.goo.gl/abc' });
      const read = await http().get(`/v1/irl/events/${withLink.body.uid}`).set(as('forum@pl.xyz'));
      expect(read.body.details.locationUrl).toBe('https://maps.app.goo.gl/abc');

      await http()
        .patch(`/v1/irl/events/${withLink.body.uid}`)
        .set(as('forum@pl.xyz'))
        .send({ locationUrl: 'https://maps.example.org/new' })
        .expect(200);
      expect((await http().get(`/v1/irl/events/${withLink.body.uid}`)).body.details.locationUrl).toBe(
        'https://maps.example.org/new'
      );

      const noLink = await submit('forum@pl.xyz');
      expect((await http().get(`/v1/irl/events/${noLink.body.uid}`)).body.details.locationUrl).toBeNull();
    });

    it('a member saves a draft; a draft with no session answers 401', async () => {
      const draft = { draft: true, name: 'Draft', startDate: VALID.startDate, endDate: VALID.endDate, timezone: 'UTC' };
      const res = await http().post('/v1/irl/events').set(as('plain@pl.xyz')).send(draft);
      expect(res.status).toBe(201);
      expect(res.body.status).toBe('DRAFT');

      await http().post('/v1/irl/events').send(draft).expect(401);
    });

    it('answers 404 while the flag is off', async () => {
      process.env.EVENTS_LOCAL_SUBMIT_ENABLED = 'false';
      expect((await submit('forum@pl.xyz')).status).toBe(404);
      await http().get('/v1/irl/events/mine').set(as('forum@pl.xyz')).expect(404);
      await http().patch('/v1/irl/events/x').set(as('forum@pl.xyz')).send({}).expect(404);
      await http().delete('/v1/irl/events/x').set(as('forum@pl.xyz')).expect(404);
      expect(db.all('pLEvent')).toHaveLength(0);
    });
  });

  describe('GET /v1/irl/events/mine', () => {
    it("lists the member's own submissions in every status, and is not swallowed by /:uid", async () => {
      const approved = await submit('plain@pl.xyz');
      await submit('forum@pl.xyz');
      db.update('pLEvent', { where: { uid: approved.body.uid }, data: { status: 'APPROVED' } });
      const pending = await submit('plain@pl.xyz', { name: 'Second' });

      const res = await http().get('/v1/irl/events/mine').set(as('plain@pl.xyz')).expect(200);
      expect(res.body.map((row: any) => [row.uid, row.status]).sort()).toEqual(
        [
          [approved.body.uid, 'APPROVED'],
          [pending.body.uid, 'PENDING'],
        ].sort()
      );
      expect(res.body[0]).toEqual(
        expect.objectContaining({
          name: expect.any(String),
          startDate: expect.any(String),
          reviewNote: null,
          allDay: false,
        })
      );
    });

    it('answers 401 with no user token', async () => {
      await http().get('/v1/irl/events/mine').expect(401);
    });
  });

  describe('PATCH and DELETE /v1/irl/events/:uid', () => {
    it('the submitter fixes the date and the status stays', async () => {
      const { body } = await submit('forum@pl.xyz');
      const res = await http()
        .patch(`/v1/irl/events/${body.uid}`)
        .set(as('forum@pl.xyz'))
        .send({ startDate: '2026-07-25T18:00:00+01:00', endDate: '2026-07-25T21:00:00+01:00', status: 'REJECTED' })
        .expect(200);
      expect(res.body).toEqual({ uid: body.uid, status: 'APPROVED' });
      const read = await http().get(`/v1/irl/events/${body.uid}`).expect(200);
      expect(read.body.startDate).toBe('2026-07-25T17:00:00.000Z');
    });

    it('another member gets 403 on edit and on delete', async () => {
      const { body } = await submit('plain@pl.xyz');
      await http().patch(`/v1/irl/events/${body.uid}`).set(as('other@pl.xyz')).send({ name: 'Mine now' }).expect(403);
      await http().delete(`/v1/irl/events/${body.uid}`).set(as('other@pl.xyz')).expect(403);
      expect(stored(body.uid)).toMatchObject({ name: VALID.name, isDeleted: false });
    });

    it('a directory admin hides an event with a status change', async () => {
      const { body } = await submit('forum@pl.xyz');
      const res = await http()
        .patch(`/v1/irl/events/${body.uid}`)
        .set(as('admin@pl.xyz'))
        .send({ status: 'REJECTED' })
        .expect(200);
      expect(res.body.status).toBe('REJECTED');
      await http().get(`/v1/irl/events/${body.uid}`).set(as('other@pl.xyz')).expect(404);
      expect((await http().get('/v1/irl/events')).body.items).toEqual([]);
    });

    it('an invalid edit answers 400', async () => {
      const { body } = await submit('forum@pl.xyz');
      await http()
        .patch(`/v1/irl/events/${body.uid}`)
        .set(as('forum@pl.xyz'))
        .send({ locationUrl: 'ftp://x' })
        .expect(400);
      await http().patch(`/v1/irl/events/${body.uid}`).set(as('forum@pl.xyz')).send({ tags: [] }).expect(400);
    });

    it('a submitter deletes their pending event, and it is gone', async () => {
      const { body } = await submit('plain@pl.xyz');
      await http().delete(`/v1/irl/events/${body.uid}`).set(as('plain@pl.xyz')).expect(200);
      await http().get(`/v1/irl/events/${body.uid}`).set(as('plain@pl.xyz')).expect(404);
      await http().delete(`/v1/irl/events/${body.uid}`).set(as('plain@pl.xyz')).expect(404);
    });

    it('a submitter cannot delete their approved event; a directory admin can', async () => {
      const { body } = await submit('forum@pl.xyz');
      await http().delete(`/v1/irl/events/${body.uid}`).set(as('forum@pl.xyz')).expect(403);
      expect(stored(body.uid).isDeleted).toBe(false);
      await http().delete(`/v1/irl/events/${body.uid}`).set(as('admin@pl.xyz')).expect(200);
      expect(stored(body.uid).isDeleted).toBe(true);
    });

    it('a draft is submitted with submit: true; without a host it stays a draft', async () => {
      const draft = { draft: true, name: 'Draft', startDate: VALID.startDate, endDate: VALID.endDate, timezone: 'UTC' };
      const { body } = await http().post('/v1/irl/events').set(as('forum@pl.xyz')).send(draft);

      await http()
        .patch(`/v1/irl/events/${body.uid}`)
        .set(as('forum@pl.xyz'))
        .send({ submit: true, tags: ['AI'], format: 'VIRTUAL' })
        .expect(400);
      expect(stored(body.uid).status).toBe('DRAFT');

      const res = await http()
        .patch(`/v1/irl/events/${body.uid}`)
        .set(as('forum@pl.xyz'))
        .send({ submit: true, tags: ['AI'], format: 'VIRTUAL', hostName: 'Protocol Labs' })
        .expect(200);
      expect(res.body.status).toBe('APPROVED');
    });

    it('a draft does not exist for a directory admin', async () => {
      const draft = { draft: true, name: 'Draft', startDate: VALID.startDate, endDate: VALID.endDate, timezone: 'UTC' };
      const { body } = await http().post('/v1/irl/events').set(as('plain@pl.xyz')).send(draft);
      await http().get(`/v1/irl/events/${body.uid}`).set(as('admin@pl.xyz')).expect(404);
      await http().patch(`/v1/irl/events/${body.uid}`).set(as('admin@pl.xyz')).send({ name: 'x' }).expect(404);
      await http().delete(`/v1/irl/events/${body.uid}`).set(as('admin@pl.xyz')).expect(404);
      expect((await http().get(`/v1/irl/events/${body.uid}`).set(as('plain@pl.xyz')).expect(200)).body.status).toBe(
        'DRAFT'
      );
      expect((await http().get('/v1/irl/events')).body.total).toBe(0);
    });
  });

  describe('what the submit form sends', () => {
    // The form always sends the whole body, with empty values spelled out.
    const FULL_EMPTY = {
      hostEmail: null,
      websiteUrl: null,
      registrationUrl: null,
      meetingUrl: null,
      locationUrl: null,
      logoUid: null,
      agenda: null,
      address: null,
      description: '',
      coHosts: [],
      contactInfos: {},
      allDay: false,
    };

    it('accepts a full body with explicit empty values on submit and on edit, and null clears', async () => {
      const created = await submit('forum@pl.xyz', {
        ...FULL_EMPTY,
        description: '<p>Hello</p>',
        registrationUrl: 'https://lu.ma/abc',
        coHosts: [{ name: 'Ann', email: null }],
        address: VALID.address,
      });
      expect(created.status).toBe(201);
      expect(stored(created.body.uid)).toMatchObject({
        registrationUrl: 'https://lu.ma/abc',
        description: '<p>Hello</p>',
      });
      expect(stored(created.body.uid).locationUid).toBeTruthy();

      await http()
        .patch(`/v1/irl/events/${created.body.uid}`)
        .set(as('forum@pl.xyz'))
        .send({ ...VALID, ...FULL_EMPTY })
        .expect(200);
      expect(stored(created.body.uid)).toMatchObject({
        registrationUrl: null,
        description: null,
        venueAddress: null,
        locationUid: null,
        resources: [],
        status: 'APPROVED',
      });
      const read = await http().get(`/v1/irl/events/${created.body.uid}`).set(as('forum@pl.xyz')).expect(200);
      expect(read.body.coHosts).toEqual([]);
      expect(read.body.contactInfos).toBeNull();
    });

    it('saves a draft with no host and no tags again and again', async () => {
      const draft = {
        ...FULL_EMPTY,
        draft: true,
        name: 'Draft',
        startDate: VALID.startDate,
        endDate: VALID.endDate,
        timezone: 'UTC',
        hostName: null,
        tags: [],
      };
      const { body } = await http().post('/v1/irl/events').set(as('plain@pl.xyz')).send(draft);
      expect(body.status).toBe('DRAFT');
      const { draft: _draft, ...patch } = draft;
      const res = await http()
        .patch(`/v1/irl/events/${body.uid}`)
        .set(as('plain@pl.xyz'))
        .send({ ...patch, name: 'Draft 2' })
        .expect(200);
      expect(res.body.status).toBe('DRAFT');
    });

    it('a directory admin saves an all-day partner event as a timed one', async () => {
      const allDay = await submit('forum@pl.xyz', { allDay: true, startDate: '2026-07-24', endDate: '2026-07-26' });
      expect(stored(allDay.body.uid).isAllDay).toBe(true);
      await http()
        .patch(`/v1/irl/events/${allDay.body.uid}`)
        .set(as('admin@pl.xyz'))
        .send({ ...VALID, ...FULL_EMPTY, startDate: '2026-07-24T09:00:00.000Z', endDate: '2026-07-26T17:00:00.000Z' })
        .expect(200);
      expect(stored(allDay.body.uid)).toMatchObject({
        isAllDay: false,
        startDate: new Date('2026-07-24T09:00:00.000Z'),
        endDate: new Date('2026-07-26T17:00:00.000Z'),
      });
    });

    it('keeps agenda sessions as the parser returned them', async () => {
      const agenda = {
        sessions: [
          {
            name: 'Opening',
            description: '',
            start_date: '2026-07-24T17:00:00.000Z',
            end_date: '2026-07-24T18:00:00.000Z',
            timezone: 'Europe/Lisbon',
          },
        ],
        agendaSummary: '6pm Opening',
      };
      const { body } = await submit('forum@pl.xyz', { agenda });
      const read = await http().get(`/v1/irl/events/${body.uid}`).set(as('forum@pl.xyz')).expect(200);
      expect(read.body.agenda).toEqual(agenda);
      expect(read.body.details.agenda).toEqual(agenda);
    });
  });

  describe('reading a non-approved event', () => {
    it('the submitter and an admin read a pending event with its status; another member gets 404', async () => {
      const { body } = await submit('plain@pl.xyz', {
        hostEmail: 'host@pl.xyz',
        coHosts: [{ name: 'Ann', email: 'ann@example.org' }],
      });

      const own = await http().get(`/v1/irl/events/${body.uid}`).set(as('plain@pl.xyz')).expect(200);
      expect(own.body).toMatchObject({
        status: 'PENDING',
        timezone: 'Europe/Lisbon',
        allDay: false,
        hostEmail: 'host@pl.xyz',
        coHosts: [{ name: 'Ann', email: 'ann@example.org' }],
        address: { address: 'Avenida da Liberdade 10', city: 'Lisbon', country: 'Portugal' },
      });
      expect((await http().get(`/v1/irl/events/${body.uid}`).set(as('admin@pl.xyz')).expect(200)).body.status).toBe(
        'PENDING'
      );
      await http().get(`/v1/irl/events/${body.uid}`).set(as('other@pl.xyz')).expect(404);
      await http().get(`/v1/irl/events/${body.uid}`).expect(404);
    });

    it('another member reads an approved event with the co-hosts and no email', async () => {
      const { body } = await submit('forum@pl.xyz', {
        hostEmail: 'host@pl.xyz',
        coHosts: [{ name: 'Ann', email: 'ann@example.org' }],
      });
      const res = await http().get(`/v1/irl/events/${body.uid}`).set(as('other@pl.xyz')).expect(200);
      expect(res.body.details.host).toEqual({ name: 'Protocol Labs', logo: null });
      expect(res.body.details.coHosts).toEqual([{ name: 'Ann', logo: null }]);
      expect(res.body).not.toHaveProperty('status');
      expect(JSON.stringify(res.body)).not.toContain('@');
    });
  });
});
