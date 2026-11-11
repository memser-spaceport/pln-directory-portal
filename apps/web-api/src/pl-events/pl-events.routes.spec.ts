// Loading the real services and guards makes ts-jest's type check overflow the stack (TS 4.7), so they are stubbed
// here, as in team-hiring.service.spec.ts. The controller and Nest's router are real.
const allow = () =>
  class {
    canActivate() {
      return true;
    }
  };
jest.mock('../guards/user-token-check.guard', () => ({
  UserTokenCheckGuard: allow(),
  OptionalUserTokenCheckGuard: allow(),
}));
jest.mock('../guards/user-token-validation.guard', () => ({ UserTokenValidation: allow() }));
jest.mock('../guards/user-auth-validate.guard', () => ({ UserAuthValidateGuard: allow() }));
jest.mock('../guards/admin-auth.guard', () => ({ AdminAuthGuard: allow() }));
jest.mock('../guards/auth.guard', () => ({ InternalAuthGuard: allow() }));
jest.mock('../rbac/rbac.guard', () => ({ RbacGuard: allow() }));
jest.mock('../members/members.service', () => ({ MembersService: class {} }));
jest.mock('../teams/teams.service', () => ({ TeamsService: class {} }));
jest.mock('./pl-events.service', () => ({ PLEventsService: class {} }));
jest.mock('./pl-event-sync.service', () => ({ PLEventSyncService: class {} }));
jest.mock('./pl-event-locations.service', () => ({ PLEventLocationsService: class {} }));
jest.mock('./pl-event-guests.service', () => ({ PLEventGuestsService: class {} }));

import { INestApplication, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import request from 'supertest';
import { MembersService } from '../members/members.service';
import { TeamsService } from '../teams/teams.service';
import { PLEventGuestsService } from './pl-event-guests.service';
import { PLEventLocationsService } from './pl-event-locations.service';
import { PLEventSyncService } from './pl-event-sync.service';
import { PLEventsController } from './pl-events.controller';
import { PLEventsService } from './pl-events.service';

/**
 * LAB-3213: `GET /v1/irl/events/:uid` sits next to static `/v1/irl/events/*` paths. These requests go through Nest's
 * router, so they fail if the parameter route ever starts swallowing `upcoming` or `contributors`.
 */
describe('/v1/irl/events routes (LAB-3213)', () => {
  let app: INestApplication;
  const eventService = {
    listUpcomingPLEvents: jest.fn(async () => ({ items: [{ uid: 'up-1' }], total: 1 })),
    getPLEventDetail: jest.fn(async (uid: string) => ({ uid, from: 'detail' })),
  };
  const teamService = { getAllPLEventContibutors: jest.fn(async () => [{ uid: 'team-1' }]) };
  const memberService = { findMemberByEmail: jest.fn(async () => null) };

  beforeAll(async () => {
    // NestFactory, not @nestjs/testing: the installed @nestjs/testing (9.0) does not match @nestjs/core (9.4).
    @Module({
      controllers: [PLEventsController],
      providers: [
        { provide: MembersService, useValue: memberService },
        { provide: PLEventsService, useValue: eventService },
        { provide: PLEventLocationsService, useValue: {} },
        { provide: PLEventGuestsService, useValue: {} },
        { provide: PLEventSyncService, useValue: {} },
        { provide: TeamsService, useValue: teamService },
      ],
    })
    class RoutesTestModule {}
    app = await NestFactory.create(RoutesTestModule, { logger: false });
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  beforeEach(() => jest.clearAllMocks());

  it('/v1/irl/events/upcoming still reaches the upcoming handler', async () => {
    const res = await request(app.getHttpServer()).get('/v1/irl/events/upcoming').expect(200);
    expect(res.body).toEqual([{ uid: 'up-1' }]);
    expect(eventService.listUpcomingPLEvents).toHaveBeenCalledTimes(1);
    expect(eventService.getPLEventDetail).not.toHaveBeenCalled();
  });

  it('/v1/irl/events/contributors still reaches the contributors handler', async () => {
    const res = await request(app.getHttpServer()).get('/v1/irl/events/contributors').expect(200);
    expect(res.body).toEqual([{ uid: 'team-1' }]);
    expect(teamService.getAllPLEventContibutors).toHaveBeenCalledTimes(1);
    expect(eventService.getPLEventDetail).not.toHaveBeenCalled();
  });

  it('/v1/irl/events/:uid reaches the event detail handler', async () => {
    const res = await request(app.getHttpServer()).get('/v1/irl/events/ev-1').expect(200);
    expect(res.body).toEqual({ uid: 'ev-1', from: 'detail' });
    expect(eventService.getPLEventDetail).toHaveBeenCalledWith('ev-1', null);
  });
});
